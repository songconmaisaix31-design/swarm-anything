package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	orcaadapter "github.com/songconmaisaix31-design/Astrocyte/internal/adapters/orca"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swahttp"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swastore"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

func compatibleEnv(primary, legacy string) (string, error) {
	value, previous := os.Getenv(primary), os.Getenv(legacy)
	if value != "" && previous != "" && value != previous {
		return "", fmt.Errorf("%s conflicts with %s", primary, legacy)
	}
	if value != "" {
		return value, nil
	}
	return previous, nil
}

func composeExecution(db *swastore.DB, projects interface {
	workspace.LocalProjects
	ConfigureExternalCLIRegistry(workspace.ExternalCLIRegistry) error
}) (workspace.OrcaExecution, error) {
	root := os.Getenv("SWA_INSTALL_ROOT")
	if root == "" {
		return nil, nil
	}
	node := "node"
	if runtime.GOOS == "windows" {
		node += ".exe"
	}
	native, err := orcaadapter.New(orcaadapter.Config{
		InstallRoot: root, DataRoot: os.Getenv("SWA_DATA_DIR"),
		NodeExecutable: filepath.Join(root, "node", node), ClientEntry: filepath.Join(root, "runtime", "client.cjs"),
		AgentProfile:  os.Getenv("SWA_AGENT_PROFILE"),
		DiscoveryHome: os.Getenv("SWA_DISCOVERY_HOME"), DiscoveryAppData: os.Getenv("SWA_DISCOVERY_APPDATA"), DiscoveryLocalAppData: os.Getenv("SWA_DISCOVERY_LOCALAPPDATA"),
		DiscoveryCodexHome: os.Getenv("SWA_DISCOVERY_CODEX_HOME"), CodexAPIKeyHome: os.Getenv("SWA_CODEX_API_KEY_HOME"),
		ClaudeAPIKeyHome: os.Getenv("SWA_CLAUDE_API_KEY_HOME"), DiscoveryClaudeHome: os.Getenv("SWA_DISCOVERY_CLAUDE_HOME"), DiscoveryPiHome: os.Getenv("SWA_DISCOVERY_PI_HOME"),
		OpenCodeAPIKeyHome: os.Getenv("SWA_OPENCODE_API_KEY_HOME"),
		ProtectedRoots:     filepath.SplitList(os.Getenv("SWA_PROTECTED_ROOTS")), OwnerCapability: os.Getenv("SWA_OWNER_CAPABILITY"),
	})
	if err != nil {
		return nil, err
	}
	if err := projects.ConfigureExternalCLIRegistry(native); err != nil {
		return nil, err
	}
	return workspace.NewOrcaExecutionService(db, projectfiles.Files{}, projects, native, db)
}

func runProduct(parent context.Context, logger *slog.Logger) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	installed := os.Getenv("SWA_INSTALL_ROOT") != ""
	root := os.Getenv("SWA_DATA_DIR")
	if !filepath.IsAbs(root) {
		return errors.New("SWA_DATA_DIR must be an explicit absolute directory")
	}
	portValue, err := compatibleEnv("SWA_PORT", "ASTROCYTE_PORT")
	if err != nil {
		return err
	}
	port, err := strconv.Atoi(portValue)
	if err != nil || port < 0 || port > 65535 || installed && port == 0 {
		return errors.New("SWA HTTP port must be explicit and within range")
	}
	webDir, err := compatibleEnv("SWA_WEB_DIR", "ASTROCYTE_WEB_DIR")
	if err != nil {
		return err
	}
	owner := ""
	if installed {
		if os.Getenv("SWA_LIFECYCLE_STDIN") != "1" {
			return errors.New("the private SWA service requires its owning lifecycle pipe")
		}
		owner = os.Getenv("SWA_OWNER_CAPABILITY")
		bytes, err := hex.DecodeString(owner)
		if err != nil || len(bytes) != 32 {
			return errors.New("SWA private delivery admission requires its actual owner capability")
		}
		webDir, err = orcaadapter.InstalledWebDirectory(os.Getenv("SWA_INSTALL_ROOT"), webDir)
		if err != nil {
			return fmt.Errorf("private SWA Web assets: %w", err)
		}
		go func() { _, _ = io.Copy(io.Discard, os.Stdin); cancel() }()
	} else if webDir != "" {
		if !filepath.IsAbs(webDir) {
			return errors.New("SWA_WEB_DIR must be absolute")
		}
		info, err := os.Stat(filepath.Join(webDir, "index.html"))
		if err != nil {
			return fmt.Errorf("SWA Web index: %w", err)
		}
		if !info.Mode().IsRegular() {
			return errors.New("SWA Web index must be a regular file")
		}
	}
	state := filepath.Join(root, "workspace")
	if err := os.MkdirAll(state, 0o700); err != nil {
		return err
	}
	db, err := swastore.Open(filepath.Join(state, "state.sqlite"))
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
	spaces := workspace.NewProjectSpaceService(swastore.NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})
	projects := workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil)
	execution, err := composeExecution(db, projects)
	if err != nil {
		return err
	}
	if installed {
		if err := os.Unsetenv("SWA_OWNER_CAPABILITY"); err != nil {
			return err
		}
	}
	origins := []string{}
	if origin := os.Getenv("SWA_ALLOWED_ORIGIN"); origin != "" {
		origins = append(origins, origin)
	}
	server := swahttp.NewServer(swahttp.Config{Port: port, Logger: logger, WebDir: webDir, AllowedOrigins: origins, SWAOwnerCapability: owner, Services: swahttp.Services{Foundation: foundation.NewSWAService(version, execution != nil), LocalProjects: projects, ProjectSpaces: spaces, OrcaExecution: execution}})
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
			return fmt.Errorf("SWA HTTP service: %w", err)
		}
		return nil
	case <-ctx.Done():
		stopCtx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		return server.Shutdown(stopCtx)
	}
}
