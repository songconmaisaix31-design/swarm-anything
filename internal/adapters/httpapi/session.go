package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	attentionapp "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

const principalKey contextKey = "principal"
const sessionCookie = "astrocyte_session"

func withPrincipal(ctx context.Context, p attentionapp.Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

type localSession struct {
	CSRF    string
	Expires time.Time
}
type sessionGuard struct {
	mu                 sync.Mutex
	sessions           map[string]localSession
	agentToken         string
	origins            map[string]bool
	scopedTokens       workspaceapp.ScopedAgentTokens
	swaOwnerCapability string
}

func newSessionGuard(cfg Config) *sessionGuard {
	g := &sessionGuard{sessions: map[string]localSession{}, agentToken: cfg.AgentToken, origins: map[string]bool{}}
	g.scopedTokens, _ = cfg.Services.LocalProjects.(workspaceapp.ScopedAgentTokens)
	g.swaOwnerCapability = cfg.SWAOwnerCapability
	for _, origin := range cfg.AllowedOrigins {
		g.origins[origin] = true
	}
	return g
}
func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (g *sessionGuard) validOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		u, err := url.Parse(origin)
		if err != nil || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "http" && u.Scheme != "https") {
			return false
		}
		return origin == "http://"+r.Host || origin == "https://"+r.Host || g.origins[origin]
	}
	return true
}
func (g *sessionGuard) bootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "" || !g.validOrigin(r) {
		writeRejectionError(w, r, http.StatusForbidden, "human session requires same-origin browser access")
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	for id, s := range g.sessions {
		if !s.Expires.After(now) {
			delete(g.sessions, id)
		}
	}
	id := ""
	var session localSession
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		id = cookie.Value
		session = g.sessions[id]
	}
	if !session.Expires.After(now) {
		id = randomToken()
		session = localSession{CSRF: randomToken(), Expires: now.Add(12 * time.Hour)}
		g.sessions[id] = session
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: id, Path: "/api/v1", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60, Secure: r.TLS != nil})
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"schema_version": 1, "actor_id": "local-human", "actor_kind": "human", "csrf_token": session.CSRF})
}
func (g *sessionGuard) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !g.validOrigin(r) {
			writeRejectionError(w, r, http.StatusForbidden, "cross-origin request rejected")
			return
		}
		if r.URL.Path == orcaDeliveryAdmissionPath {
			if !validOrcaOwnerRequest(r, g.swaOwnerCapability) {
				writeRejectionError(w, r, http.StatusForbidden, "private runtime admission requires its owning service")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/v1/") || r.URL.Path == "/api/v1/health" || r.URL.Path == "/api/v1/foundation" || r.URL.Path == "/api/v1/auth/session" {
			next.ServeHTTP(w, r)
			return
		}
		p := attentionapp.Principal{}
		if authorization := r.Header.Get("Authorization"); authorization != "" {
			if g.scopedTokens != nil && strings.HasPrefix(authorization, "Bearer ") {
				caller, err := g.scopedTokens.AuthenticateAgentToken(r.Context(), strings.TrimPrefix(authorization, "Bearer "))
				if err == nil && caller.Kind == "agent" && caller.ID != "" && caller.ProjectID != "" && scopedAgentRoute(r, caller.ProjectID) {
					ctx := context.WithValue(r.Context(), workspaceCallerKey, caller)
					ctx = withPrincipal(ctx, attentionapp.Principal{ID: caller.ID, Kind: "agent"})
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				writeRejectionError(w, r, http.StatusForbidden, "Agent credential requires a current human project grant and permitted operation")
				return
			}
			if g.agentToken == "" || !strings.HasPrefix(authorization, "Bearer ") || subtle.ConstantTimeCompare([]byte(strings.TrimPrefix(authorization, "Bearer ")), []byte(g.agentToken)) != 1 {
				writeRejectionError(w, r, http.StatusForbidden, "invalid Agent credential")
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				writeRejectionError(w, r, http.StatusForbidden, "Agent credential is read-only")
				return
			}
			// 项目外资料的 Agent 授权范围仍待用户决定，当前明确拒绝。
			writeRejectionError(w, r, http.StatusForbidden, "Agent material access requires an explicit user scope")
			return
		} else {
			cookie, err := r.Cookie(sessionCookie)
			if err != nil {
				writeRejectionError(w, r, http.StatusForbidden, "local session required")
				return
			}
			g.mu.Lock()
			s := g.sessions[cookie.Value]
			g.mu.Unlock()
			if !s.Expires.After(time.Now()) {
				writeRejectionError(w, r, http.StatusForbidden, "local session expired")
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.CSRF)) != 1 {
					writeRejectionError(w, r, http.StatusForbidden, "CSRF token required")
					return
				}
			}
			p = attentionapp.Principal{ID: "local-human", Kind: "human"}
		}
		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), p)))
	})
}

// 资源范围明确的请求交给 Workspace，服务逐次读取当前操作 Grant。
// 设置、授权与 token 签发仍由人工执行。
func scopedAgentRoute(r *http.Request, projectID string) bool {
	if relayScopedWorkspaceRoute(r, projectID) {
		return true
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 || parts[0] != "api" || parts[1] != "v1" || parts[2] != "local-projects" || parts[3] != projectID {
		return false
	}
	if len(parts) == 5 {
		return (parts[4] == "context" && r.Method == http.MethodPost) ||
			(parts[4] == "sessions" && (r.Method == http.MethodGet || r.Method == http.MethodPost)) ||
			(parts[4] == "progress" && r.Method == http.MethodGet)
	}
	if len(parts) == 6 && parts[4] == "orca" && parts[5] == "commands" {
		return r.Method == http.MethodPost
	}
	if len(parts) == 6 && parts[4] == "sessions" && parts[5] == "discover" {
		return r.Method == http.MethodPost
	}
	if len(parts) != 7 || parts[4] != "sessions" || parts[5] == "" {
		return false
	}
	switch parts[6] {
	case "resume", "send", "stop":
		return r.Method == http.MethodPost
	case "observe", "context":
		return r.Method == http.MethodGet
	default:
		return false
	}
}
