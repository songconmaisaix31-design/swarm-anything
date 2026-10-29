// Command server starts the Astrocyte API server.
//
// It assembles application services, opens the SQLite database,
// runs migrations and starts the HTTP server. On SIGINT/SIGTERM
// it performs a graceful shutdown.
//
// Environment variables:
//
//	ASTROCYTE_PORT      - HTTP listen port (default: 8787; invalid value fails startup)
//	ASTROCYTE_DATA_DIR  - Data directory for state.sqlite (default: system data dir)
//	ASTROCYTE_WEB_DIR   - Optional directory for static file serving (SPA fallback)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agents"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/distillers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/events"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/httpapi"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/importers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/objects"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/worksscan"
	attentionapp "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	workspacedomain "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(logger); err != nil {
		logger.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) (runErr error) {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	halfLife, weights, err := resolveAttentionPolicy()
	if err != nil {
		return err
	}
	importRoots, err := resolveImportRoots()
	if err != nil {
		return err
	}
	sourceReader, err := resolveSourceReader(importRoots)
	if err != nil {
		return err
	}
	listingPython, err := resolveListingPython()
	if err != nil {
		return err
	}
	origins, err := resolveAllowedOrigins()
	if err != nil {
		return err
	}
	concurrency, err := configuredPositiveInt("ASTROCYTE_JOB_CONCURRENCY", 2, 32)
	if err != nil {
		return err
	}
	maxAttempts, err := configuredPositiveInt("ASTROCYTE_JOB_MAX_ATTEMPTS", 3, 100)
	if err != nil {
		return err
	}
	jobSeconds, err := configuredPositiveInt("ASTROCYTE_JOB_TIMEOUT_SECONDS", defaultJobTimeoutSeconds, 86400)
	if err != nil {
		return err
	}
	protectedSources, err := workbenchProtectedSources()
	if err != nil {
		return err
	}
	// Resolve data directory.
	dataDir, err := resolveDataDir()
	if err != nil {
		return fmt.Errorf("resolve data dir: %w", err)
	}
	dataDir, err = resolveRelayDataDir(dataDir)
	if err != nil {
		return err
	}
	accessEnabled, e := relayEnabled()
	if e != nil {
		return e
	}
	if accessEnabled {
		dataDir, err = guardWorkbenchExplicitDataDir(dataDir)
	} else {
		dataDir, err = guardWorkbenchDataDir(dataDir)
	}
	if err != nil {
		return err
	}
	repositoryConfig, err := resolveRepositoryContextConfig(ctx, dataDir)
	if err != nil {
		return err
	}
	judgmentConfig, err := resolveRelayJudgmentConfig()
	if err != nil {
		return err
	}
	distiller, processingSourceKeys, err := resolveDistiller(ctx, dataDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return fmt.Errorf("create data dir %q: %w", dataDir, err)
	}
	logger.Info("data directory", "path", dataDir)

	// Open database.
	dbPath := filepath.Join(dataDir, "state.sqlite")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()
	logger.Info("database opened", "path", dbPath)

	// Run embedded migrations.
	if err := db.RunMigrations(context.Background(), migrations.FS); err != nil {
		return fmt.Errorf("run migrations (startup aborted): %w", err)
	}
	logger.Info("migrations applied")

	// Read schema version for foundation service.
	schemaVersion, err := db.SchemaVersion(context.Background())
	if err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}

	objectStore, err := objects.New(filepath.Join(dataDir, "objects"))
	if err != nil {
		return fmt.Errorf("open objects: %w", err)
	}
	listingReader := importers.NewPublicListingReader(listingPython)
	browserConfig, err := resolveSelectedBrowserConfig(dataDir)
	if err != nil {
		return fmt.Errorf("configure selected Douyin browser: %w", err)
	}
	if browserConfig != nil {
		listingReader.Douyin = &importers.DouyinBrowser{
			Bridge:  importers.NewOpenCLISelectedFolderBridge(browserConfig.NodePath, browserConfig.CLIMain, browserConfig.Profile, browserConfig.Session),
			OwnerID: browserConfig.OwnerID, FolderIDs: browserConfig.FolderIDs,
		}
	}
	nativeRoot, err := filepath.Abs(filepath.Join(dataDir, "native-sessions"))
	if err != nil {
		return fmt.Errorf("resolve native state directory: %w", err)
	}
	registry := agents.NewRegistry(nativeRoot)
	projectReferences := &projectReferenceBridge{}
	localProjects := workspaceapp.NewLocalProjectService(db, projectReferences, agents.ProjectFiles{}, registry).
		WithNativeMessageObjects(objectStore).WithOwnedNativeSessions(registry)
	projectDiscovery, err := resolveProjectDiscovery()
	if err != nil {
		return fmt.Errorf("configure project discovery: %w", err)
	}
	localProjects.ConfigureRegisteredDiscovery(db, projectDiscovery)
	textProcessor := &selectedTextBridge{projects: localProjects, processor: registry}
	processingTimeout := min(time.Duration(jobSeconds)*time.Second, 30*time.Minute)
	attention := attentionapp.NewAttentionService(sqlite.NewAttentionRepository(db), sourceReader, objectStore, attentionapp.ServiceOptions{
		WorkerConcurrency: concurrency, MaxAttempts: maxAttempts, JobTimeout: time.Duration(jobSeconds) * time.Second,
		AttentionHalfLife: halfLife, AttentionWeights: weights, Distiller: distiller, AllowedProcessingSourceKeys: processingSourceKeys,
		ListingReader: listingReader, CollectionReader: listingReader,
		ListingRecommender: distillers.NewListingRecommender(textProcessor, processingTimeout),
		ProjectDistillers:  distillers.NewSelectedTextFactory(textProcessor, processingTimeout),
		ScholarSearcher:    importers.NewScholar(),
	})
	projectReferences.attention = attention
	vikingGateway, err := resolveOpenViking()
	if err != nil {
		return fmt.Errorf("configure OpenViking: %w", err)
	}
	vikingService, err := attentionapp.NewOpenVikingService(ctx, attention, db, vikingGateway)
	if err != nil {
		return fmt.Errorf("initialize OpenViking: %w", err)
	}
	// This defer also covers a later startup error. It runs before the existing
	// db.Close defer; absence on a later restart never counts as a confirmed exit.
	nativeShutdownDone := false
	shutdownNative := func() error {
		if nativeShutdownDone {
			return nil
		}
		nativeShutdownDone = true
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return localProjects.Shutdown(shutdownCtx)
	}
	defer func() {
		if err := shutdownNative(); err != nil {
			logger.Error("native shutdown incomplete; unconfirmed state retained", "error", err)
		}
	}()
	// Discover only public CLI version/help once at startup. Total bounded time
	// keeps existing readiness checks responsive; GET reads the resulting cache.
	// No configuration, private sessions, projects or native operations are read.
	inventory := agents.NewInventory()
	probeCtx, cancelProbe := context.WithTimeout(ctx, 10*time.Second)
	probeErr := inventory.RefreshCLI(probeCtx)
	cancelProbe()
	if ctx.Err() != nil {
		return nil
	}
	if probeErr != nil {
		logger.Warn("local CLI discovery incomplete; cached partial observations retained")
	}

	readerRoot, err := workbenchReaderRoot()
	if err != nil {
		return err
	}
	// 组装现有 S1 服务和 S2 提案命令，原生执行由原控制器接口负责。
	services := httpapi.Services{
		OpenViking:           vikingService,
		RepositoryContext:    &httpapi.RepositoryContextServices{},
		WorkspaceS2:          workspaceapp.NewS2Service(sqlite.NewWorkspaceRepository(db), agents.ProjectFiles{}, projectReferences),
		Workbench:            sqlite.NewWorkbenchReader(readerRoot, protectedSources...),
		GitHubRepositories:   workspaceapp.NewGitHubRepositoryService(db, db, agents.NewPublicGitHubSource(), agents.NewManagedRepositoryCloner(filepath.Join(dataDir, "repositories")), &repositorySpaceBridge{attention: attention}),
		Tracking:             attention,
		LocalProjects:        localProjects,
		RegisteredProjects:   localProjects,
		Attention:            attention,
		Foundation:           foundation.NewAttentionService(schemaVersion),
		Materials:            attention,
		Opportunities:        attention,
		Projects:             workspaceapp.NewProjectService(),
		LocalAgents:          workspaceapp.NewLocalAgentService(inventory, registry),
		Proposals:            workspaceapp.NewProposalService(),
		Sessions:             workspaceapp.NewSessionService(),
		Missions:             swarmapp.NewMissionService(),
		PaperSearch:          attention,
		Progress:             workspaceapp.NewProjectProgressService(db, db, agents.ProjectFiles{}, registry, registry),
		Works:                workspaceapp.NewWorksService(db, worksscan.NewScanner(), worksscan.Delivery{}, events.NewWorksEventSink(attentionapp.NewPendingEventService(sqlite.NewEventRepository(db)), nil), workspaceapp.WorksServiceOptions{}),
		KnowledgeGovernance:  attentionapp.NewKnowledgeService(sqlite.NewKnowledgeRepository(sqlite.NewEngineRepository(db)), attentionapp.KnowledgeServiceOptions{}),
		ExperienceGovernance: &experienceHTTPBridge{db: db, events: sqlite.NewEventRepository(db), projects: localProjects, registered: localProjects},
		ConflictGate:         attentionapp.NewDynamicsEngine(sqlite.NewDynamicsRepository(db), attentionapp.DynamicsOptions{}),
	}
	if automatic, ok := any(attention).(attentionapp.AutomaticDistillationService); ok {
		services.Automatic = automatic
	}
	if profile, ok := any(attention).(attentionapp.RankingProfileService); ok {
		services.RankingProfile = profile
	}
	if err := assembleSwarmLedger(&services, db, registry, objectStore); err != nil {
		return err
	}
	repositoryProvider, err := assembleConfiguredRepositoryContext(&services, db, objectStore, repositoryConfig, registry)
	if err != nil {
		return err
	}
	var snapshots workspaceapp.ProjectSnapshotProvider
	if repositoryProvider != nil {
		if err := localProjects.ConfigureRepositoryCleanup(repositoryProvider); err != nil {
			return err
		}
		snapshots = repositoryProvider
	}
	judgmentCtx, cancelJudgment := context.WithCancel(context.Background())
	defer cancelJudgment()
	closeJudgment, err := assembleRelayJudgment(judgmentCtx, &services, db, projectReferences, snapshots, attention, judgmentConfig)
	if err != nil {
		return err
	}
	defer func() {
		runErr = errors.Join(runErr, closeJudgment())
	}()
	launchContexts, err := relayPublicLaunchContexts(localProjects)
	if err != nil {
		return err
	}
	closeRelay, err := assembleRelay(&services, db, registry, objectStore, launchContexts...)
	if err != nil {
		return err
	}
	defer func() {
		if closeRelay() != nil {
			logger.Error("relay shutdown incomplete; unconfirmed state retained")
		}
	}()
	if err := assembleRelayCompletionSource(&services); err != nil {
		return err
	}
	if err := assembleRelayCompletionInterpreter(&services, registry, launchContexts...); err != nil {
		return err
	}

	// Resolve port — invalid value fails startup.
	port, err := resolvePort()
	if err != nil {
		return fmt.Errorf("invalid ASTROCYTE_PORT: %w", err)
	}
	logger.Info("configuring server", "port", port)

	// Resolve optional web dir for static serving.
	webDir := os.Getenv("ASTROCYTE_WEB_DIR")
	if webDir != "" {
		info, err := os.Stat(webDir)
		if err != nil || !info.IsDir() {
			return fmt.Errorf("ASTROCYTE_WEB_DIR %q is not a valid directory", webDir)
		}
		logger.Info("static file serving enabled", "dir", webDir)
	}

	listener, err := bindHTTPListener(port)
	if err != nil {
		return fmt.Errorf("bind HTTP listener: %w", err)
	}
	defer listener.Close()
	actualPort := listener.Addr().(*net.TCPAddr).Port
	// Create and start HTTP server.
	srv := httpapi.NewServer(httpapi.Config{
		AgentToken:     os.Getenv("ASTROCYTE_AGENT_TOKEN"),
		AllowedOrigins: origins,
		Port:           actualPort,
		Logger:         logger,
		Services:       services,
		WebDir:         webDir,
	})
	if err := announceHTTPListener(os.Stdout, listener); err != nil {
		return fmt.Errorf("announce HTTP listener: %w", err)
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	swarmLifecycleErrors, stopSwarmLifecycle := startSwarmLifecycle(workerCtx, services.SwarmS3)
	defer stopSwarmLifecycle()
	var repositoryCleanupErrors <-chan error
	if repositoryProvider != nil {
		var stopRepositoryCleanup func() error
		repositoryCleanupErrors, stopRepositoryCleanup = startRelayRepositoryCleanup(workerCtx, repositoryProvider, repositoryConfig.CleanupMaxGenerations)
		defer func() {
			runErr = errors.Join(runErr, stopRepositoryCleanup())
		}()
	}
	stopRelayObserver := startRelayObserver(workerCtx, services.Relay, logger)
	defer stopRelayObserver()
	workerErrors := make(chan error, 1)
	go func() { workerErrors <- attention.Run(workerCtx) }()
	// One fixed discovery run per service start. Health remains responsive while
	// the bounded source observes registered roots; GET serves the durable cache.
	// This startup identity only collects observations and never grants control.
	discoveryDone := make(chan struct{})
	go func() {
		defer close(discoveryDone)
		snapshot, err := localProjects.RefreshRegisteredProjects(workerCtx, workspacedomain.Caller{Kind: "human", ID: "local-startup"})
		if err != nil {
			if workerCtx.Err() == nil {
				logger.Warn("registered project discovery failed; prior cache retained")
			}
			return
		}
		logger.Info("registered project observations cached", "status", snapshot.Status, "projects", len(snapshot.Projects), "failures", len(snapshot.Failures))
	}()

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Serve(listener)
	}()

	var runError error
	workersStopped := false
	select {
	case err := <-errCh:
		if err != nil && err.Error() != "http: Server closed" {
			runError = fmt.Errorf("http server: %w", err)
		}
	case err := <-workerErrors:
		workersStopped = true
		if err != nil {
			runError = fmt.Errorf("attention workers: %w", err)
		} else {
			runError = fmt.Errorf("attention workers stopped unexpectedly")
		}
	case err := <-repositoryCleanupErrors:
		if err != nil {
			runError = fmt.Errorf("repository cleanup: %w", err)
		} else {
			runError = errors.New("repository cleanup stopped unexpectedly")
		}
	case err := <-swarmLifecycleErrors:
		runError = fmt.Errorf("swarm lifecycle: %w", err)
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	// Graceful shutdown with timeout.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stopSwarmLifecycle()
	shutdownErr := srv.Shutdown(shutdownCtx)
	cancelWorkers()
	// The discovery adapter honors cancellation. Do not close SQLite while its
	// startup collector can still publish an observation.
	<-discoveryDone
	if !workersStopped {
		// Adapters honor context; wait until checkpoints are persisted before closing DB.
		if err := <-workerErrors; err != nil && runError == nil {
			runError = fmt.Errorf("stop attention workers: %w", err)
		}
	}
	if shutdownErr != nil {
		return fmt.Errorf("shutdown: %w", shutdownErr)
	}
	if err := shutdownNative(); err != nil {
		return fmt.Errorf("native shutdown: %w", err)
	}

	logger.Info("server stopped")
	return runError
}

func resolveDataDir() (string, error) {
	if dir := os.Getenv("ASTROCYTE_DATA_DIR"); dir != "" {
		return filepath.Abs(dir)
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("user config dir: %w", err)
	}
	return filepath.Join(dir, "astrocyte"), nil
}

func resolvePort() (int, error) {
	p := os.Getenv("ASTROCYTE_PORT")
	if p == "" {
		return 8787, nil
	}
	n, err := strconv.Atoi(p)
	if err != nil {
		return 0, fmt.Errorf("not a number: %w", err)
	}
	if n < 0 || n >= 65536 {
		return 0, fmt.Errorf("port %d out of range (0-65535)", n)
	}
	return n, nil
}
