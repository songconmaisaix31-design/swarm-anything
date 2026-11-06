// Package httpapi provides the HTTP transport adapter.
//
// It maps HTTP routes to application service calls, handles request
// parsing and response serialization, and enforces loopback-only
// access. The HTTP layer never imports database/sql or executes
// queries directly.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	attentionapp "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	workbenchapp "github.com/songconmaisaix31-design/Astrocyte/internal/workbench/app"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

// Server is the HTTP server that exposes the Astrocyte API.
type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
}

// Handler exposes the actual transport chain for owner integration tests.
func (s *Server) Handler() http.Handler { return s.httpServer.Handler }

// Config holds server configuration.
type Config struct {
	AgentToken         string
	SWAOwnerCapability string
	AllowedOrigins     []string
	Port               int
	Logger             *slog.Logger
	Services           Services
	WebDir             string // Optional: directory for static file serving
}

// Services bundles all application services the HTTP layer depends on.
type Services struct {
	OpenViking            *attentionapp.OpenVikingService
	Judgment              *JudgmentServices
	SwarmS3               *swarmapp.Service
	RepositoryContext     *RepositoryContextServices
	WorkspaceS2           *workspaceapp.S2Service
	RelaySessionEvents    workbenchapp.SessionEventsReader
	Relay                 workspaceapp.RelayRuntime
	Workbench             workbenchapp.Reader
	GitHubRepositories    workspaceapp.GitHubRepositories
	Tracking              attentionapp.TrackingService
	LocalProjects         workspaceapp.LocalProjects
	OrcaExecution         workspaceapp.OrcaExecution
	RegisteredProjects    workspaceapp.RegisteredProjects
	RankingProfile        attentionapp.RankingProfileService
	Automatic             attentionapp.AutomaticDistillationService
	Attention             attentionapp.AttentionService
	Foundation            foundation.Service
	Materials             attentionapp.MaterialService
	Opportunities         attentionapp.OpportunityService
	Projects              workspaceapp.ProjectService
	LocalAgents           workspaceapp.LocalAgentInventory
	Proposals             workspaceapp.ProposalService
	Sessions              workspaceapp.SessionService
	Missions              swarmapp.MissionService
	PaperSearch           attentionapp.PaperSearchService
	Progress              workspaceapp.ProjectProgressService
	Gates                 attentionapp.EngineGates
	KnowledgeGovernance   attentionapp.KnowledgeGovernanceService
	ExperienceGovernance  attentionapp.ExperienceGovernanceService
	OpportunityAdmissions attentionapp.OpportunityAdmissions
	ConflictGate          attentionapp.ConflictGateService
	Works                 workspaceapp.Works
}

// NewServer creates a new HTTP server with the given configuration.
func NewServer(cfg Config) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.Port == 0 {
		cfg.Port = 8787
	}

	mux := http.NewServeMux()
	h := &handler{
		services: cfg.Services,
		logger:   cfg.Logger,
	}

	// Health and foundation
	mux.HandleFunc("GET /api/v1/health", h.handleHealth)
	mux.HandleFunc("GET /api/v1/foundation", h.handleFoundation)

	// List endpoints (empty reads in S0)
	mux.HandleFunc("GET /api/v1/materials", h.handleListMaterials)
	mux.HandleFunc("GET /api/v1/opportunities", h.handleListOpportunities)
	mux.HandleFunc("GET /api/v1/projects", h.handleListProjects)
	mux.HandleFunc("GET /api/v1/local-agents", h.handleListLocalAgents)
	if cfg.Services.WorkspaceS2 == nil {
		mux.HandleFunc("GET /api/v1/proposals", h.handleListProposals)
	} else {
		h.registerWorkspaceS2(mux, cfg.Services.WorkspaceS2)
	}
	mux.HandleFunc("GET /api/v1/sessions", h.handleListSessions)
	if cfg.Services.SwarmS3 == nil {
		mux.HandleFunc("GET /api/v1/missions", h.handleListMissions)
	} else {
		h.registerSwarmS3(mux, cfg.Services.SwarmS3)
	}

	// Single-resource reads
	if cfg.Services.SwarmS3 == nil {
		mux.HandleFunc("GET /api/v1/missions/{id}", h.handleGetMission)
	}
	h.registerTracking(mux)
	h.registerOpenViking(mux)
	h.registerLocalProjects(mux)
	h.registerOrcaCLI(mux)
	h.registerOrcaDeliveryAdmission(mux, cfg.SWAOwnerCapability)
	h.registerRegisteredProjects(mux)
	h.registerRepositories(mux)
	h.registerPaperSearch(mux)
	h.registerProgress(mux)
	h.registerEngineGates(mux)
	h.registerWorks(mux)
	h.registerWorkbench(mux)
	h.registerRelay(mux)
	if cfg.Services.Judgment != nil {
		h.registerRelayJudgment(mux, *cfg.Services.Judgment)
	}
	if cfg.Services.RepositoryContext != nil {
		RegisterRepositoryContextRoutes(mux, *cfg.Services.RepositoryContext)
	}
	mux.HandleFunc("/api/v1/relay/session-events", h.handleRelaySessionEvents)

	// Future write endpoints return 501 unsupported_capability
	if cfg.Services.Attention == nil {
		mux.HandleFunc("POST /api/v1/materials/imports", h.notImplemented("material_import"))
		mux.HandleFunc("POST /api/v1/opportunities/{id}/reviews", h.notImplemented("opportunity_review"))
	} else {
		h.registerAttention(mux)
	}
	h.registerAdmissions(mux, cfg.Services.OpportunityAdmissions)
	mux.HandleFunc("POST /api/v1/projects", h.notImplemented("project_create"))
	mux.HandleFunc("POST /api/v1/sessions/{id}/resume", h.notImplemented("session_resume"))
	mux.HandleFunc("POST /api/v1/sessions/{id}/handoff", h.notImplemented("session_handoff"))
	if cfg.Services.WorkspaceS2 == nil {
		mux.HandleFunc("POST /api/v1/proposals/{id}/submit", h.notImplemented("proposal_submit"))
		mux.HandleFunc("POST /api/v1/proposals/{id}/approvals", h.notImplemented("proposal_approve"))
		mux.HandleFunc("POST /api/v1/approvals/{id}/revoke", h.notImplemented("approval_revoke"))
	}
	if cfg.Services.SwarmS3 == nil {
		mux.HandleFunc("POST /api/v1/missions/{id}/pause", h.notImplemented("mission_pause"))
		mux.HandleFunc("POST /api/v1/missions/{id}/cancel", h.notImplemented("mission_cancel"))
		mux.HandleFunc("POST /api/v1/work-items/{id}/claims", h.notImplemented("workitem_claim"))
		mux.HandleFunc("POST /api/v1/work-items/{id}/artifacts", h.notImplemented("workitem_submit"))
		mux.HandleFunc("POST /api/v1/artifacts/{id}/acceptance", h.notImplemented("artifact_accept"))
	}
	mux.HandleFunc("GET /api/v1/events", h.notImplemented("events_sse"))

	// Catch-all for unknown /api/v1/* routes — always JSON 404
	mux.HandleFunc("/api/v1/", h.handleAPINotFound)
	// Bare /api and /api/v1 (no trailing slash) → JSON 404
	mux.HandleFunc("/api/v1", h.handleAPINotFound)
	mux.HandleFunc("/api", h.handleAPINotFound)

	// Build handler stack with optional static file serving
	var innerHandler http.Handler = mux

	if cfg.WebDir != "" {
		// Wrap with SPA static file serving for non-/api routes
		innerHandler = spaHandler(cfg.WebDir, mux)
	}
	if cfg.Services.OpenViking != nil || cfg.Services.OpportunityAdmissions != nil || cfg.Services.Judgment != nil || cfg.Services.SwarmS3 != nil || cfg.Services.RepositoryContext != nil || cfg.Services.WorkspaceS2 != nil || cfg.Services.RelaySessionEvents != nil || cfg.Services.Relay != nil || cfg.Services.Workbench != nil || cfg.Services.Attention != nil || cfg.Services.LocalAgents != nil || cfg.Services.LocalProjects != nil || cfg.Services.RegisteredProjects != nil || cfg.Services.Tracking != nil || cfg.Services.GitHubRepositories != nil || cfg.Services.PaperSearch != nil || cfg.Services.Progress != nil || cfg.Services.Gates != nil || cfg.Services.KnowledgeGovernance != nil || cfg.Services.ExperienceGovernance != nil || cfg.Services.ConflictGate != nil || cfg.Services.Works != nil {
		guard := newSessionGuard(cfg)
		mux.HandleFunc("GET /api/v1/auth/session", guard.bootstrap)
		innerHandler = guard.middleware(innerHandler)
	}

	// Apply middleware stack: request ID first so all responses have it
	stack := requestIDMiddleware(
		loopbackMiddleware(
			loggingMiddleware(cfg.Logger, innerHandler),
		),
	)

	return &Server{
		httpServer: &http.Server{
			Addr:              fmt.Sprintf("127.0.0.1:%d", cfg.Port),
			Handler:           stack,
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       30 * time.Second,
			// Registered discovery has a two-minute request deadline, including
			// waiting for an in-progress startup collection. Allow its result to
			// reach the browser instead of expiring the socket after 30 seconds.
			WriteTimeout: 150 * time.Second,
			IdleTimeout:  60 * time.Second,
		},
		logger: cfg.Logger,
	}
}

// ListenAndServe starts the HTTP server. It blocks until the server
// is shut down or encounters a fatal error. Returns http.ErrServerClosed
// on graceful shutdown.
func (s *Server) ListenAndServe() error {
	s.logger.Info("HTTP server starting", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

// Serve 使用调用者已绑定的同一个 loopback listener，不重新选择或绑定端口。
// 正常 Shutdown 关闭该 listener，并返回 http.ErrServerClosed。
func (s *Server) Serve(listener net.Listener) error {
	if listener == nil {
		return errors.New("HTTP listener is required")
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || !address.IP.IsLoopback() || address.Port < 1 || address.Port > 65535 {
		return errors.New("HTTP listener must be bound to a loopback TCP address")
	}
	s.logger.Info("HTTP server starting", "addr", address.String())
	return s.httpServer.Serve(listener)
}

// Shutdown gracefully shuts down the HTTP server.
func (s *Server) Shutdown(ctx context.Context) error {
	s.logger.Info("HTTP server shutting down")
	return s.httpServer.Shutdown(ctx)
}

// Addr returns the configured listen address (useful in tests).
func (s *Server) Addr() string {
	return s.httpServer.Addr
}

// spaHandler 读取实际静态文件，页面路径使用 index.html。
// API 请求优先交给 API mux；已有文件由标准 FileServer 处理。
// 缺失的构建资源返回不可缓存的404；实际目录使用页面正文，不提供目录列表。
func spaHandler(webDir string, apiHandler http.Handler) http.Handler {
	fileServer := http.FileServer(http.Dir(webDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// API routes always go to API handler (including bare /api)
		if path == "/api" || strings.HasPrefix(path, "/api/") {
			apiHandler.ServeHTTP(w, r)
			return
		}

		// Try to serve the file directly
		filePath := strings.TrimPrefix(path, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		// Check if file exists (no directory listing)
		fullPath := webDir + "/" + filePath
		info, err := os.Stat(fullPath)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			http.Error(w, "Static content unavailable", http.StatusInternalServerError)
			return
		}
		if errors.Is(err, os.ErrNotExist) && strings.HasPrefix(path, "/assets/") {
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		if errors.Is(err, os.ErrNotExist) || info.IsDir() {
			// SPA fallback: serve index.html for non-existent paths
			http.ServeFile(w, r, webDir+"/index.html")
			return
		}

		// Serve the actual file
		fileServer.ServeHTTP(w, r)
	})
}

// isLoopbackHost checks whether the request host resolves to a loopback address.
func isLoopbackHost(host string) bool {
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		h = host
	}

	switch h {
	case "localhost", "127.0.0.1", "::1", "[::1]":
		return true
	}

	// Host names that merely resolve to loopback are not trusted (DNS rebinding).
	return false
}
