package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agents"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/httpapi"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/importers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/objects"
	orcaadapter "github.com/songconmaisaix31-design/Astrocyte/internal/adapters/orca"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	attentionapp "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

func composeOrcaExecution(db *sqlite.DB, projects interface {
	workspaceapp.LocalProjects
	ConfigureExternalCLIRegistry(workspaceapp.ExternalCLIRegistry) error
}) (workspaceapp.OrcaExecution, error) {
	root := os.Getenv("SWA_INSTALL_ROOT")
	if root == "" {
		if os.Getenv("SWA_DATA_DIR") != "" {
			return nil, errors.New("SWA_DATA_DIR requires the explicit installed runtime root")
		}
		return nil, nil
	}
	runtime, err := orcaadapter.New(orcaadapter.Config{
		InstallRoot: root, DataRoot: os.Getenv("SWA_DATA_DIR"),
		NodeExecutable:        filepath.Join(root, "node", "node.exe"),
		ClientEntry:           filepath.Join(root, "runtime", "client.cjs"),
		AgentProfile:          os.Getenv("SWA_AGENT_PROFILE"),
		DiscoveryHome:         os.Getenv("SWA_DISCOVERY_HOME"),
		DiscoveryAppData:      os.Getenv("SWA_DISCOVERY_APPDATA"),
		DiscoveryLocalAppData: os.Getenv("SWA_DISCOVERY_LOCALAPPDATA"),
		DiscoveryCodexHome:    os.Getenv("SWA_DISCOVERY_CODEX_HOME"),
		DiscoveryClaudeHome:   os.Getenv("SWA_DISCOVERY_CLAUDE_HOME"),
		DiscoveryPiHome:       os.Getenv("SWA_DISCOVERY_PI_HOME"),
		ProtectedRoots:        filepath.SplitList(os.Getenv("SWA_PROTECTED_ROOTS")),
		OwnerCapability:       os.Getenv("SWA_OWNER_CAPABILITY"),
	})
	if err != nil {
		return nil, err
	}
	if err := projects.ConfigureExternalCLIRegistry(runtime); err != nil {
		return nil, err
	}
	return workspaceapp.NewOrcaExecutionService(db, agents.ProjectFiles{}, projects, runtime, db)
}

func runOrcaProduct(parent context.Context, logger *slog.Logger) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	if os.Getenv("SWA_LIFECYCLE_STDIN") != "1" {
		return errors.New("the private SWA service requires its owning lifecycle pipe")
	}
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		cancel()
	}()
	root := os.Getenv("SWA_DATA_DIR")
	if !filepath.IsAbs(root) {
		return errors.New("the private SWA data root must be absolute")
	}
	port, err := strconv.Atoi(os.Getenv("ASTROCYTE_PORT"))
	if err != nil || port < 1 || port > 65535 {
		return errors.New("the private SWA HTTP port must be explicit")
	}
	state := filepath.Join(root, "workspace")
	if err := os.MkdirAll(state, 0o700); err != nil {
		return err
	}
	db, err := sqlite.Open(filepath.Join(state, "state.sqlite"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		return err
	}
	version, err := db.SchemaVersion(ctx)
	if err != nil {
		return err
	}
	storage, err := objects.New(filepath.Join(state, "objects"))
	if err != nil {
		return err
	}
	attention := attentionapp.NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader([]string{state}), storage, attentionapp.ServiceOptions{})
	projects := workspaceapp.NewLocalProjectService(db, &projectReferenceBridge{attention: attention}, agents.ProjectFiles{}, agents.NewRegistry(filepath.Join(state, "native-sessions")))
	execution, err := composeOrcaExecution(db, projects)
	if err != nil {
		return err
	}
	ownerCapability := os.Getenv("SWA_OWNER_CAPABILITY")
	if len(ownerCapability) != 64 {
		return errors.New("SWA private delivery admission requires its actual owner capability")
	}
	if err := os.Unsetenv("SWA_OWNER_CAPABILITY"); err != nil {
		return err
	}
	server := httpapi.NewServer(httpapi.Config{Port: port, Logger: logger, SWAOwnerCapability: ownerCapability, Services: httpapi.Services{OrcaExecution: execution, LocalProjects: projects, Attention: attention, Foundation: foundation.NewAttentionService(version)}})
	listener, err := bindHTTPListener(port)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := announceHTTPListener(os.Stdout, listener); err != nil {
		return err
	}
	result := make(chan error, 1)
	go func() { result <- server.Serve(listener) }()
	select {
	case err := <-result:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("private SWA HTTP service: %w", err)
		}
		return nil
	case <-ctx.Done():
		stopCtx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		return server.Shutdown(stopCtx)
	}
}
