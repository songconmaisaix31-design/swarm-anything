package swahttp

import (
	"context"
	"crypto/subtle"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

const sessionCookie = "astrocyte_session"

type localSession struct {
	CSRF    string
	Expires time.Time
}
type sessionGuard struct {
	mu       sync.Mutex
	sessions map[string]localSession
	origins  map[string]bool
	tokens   workspace.ScopedAgentTokens
	owner    string
}

func newSessionGuard(cfg Config) *sessionGuard {
	g := &sessionGuard{sessions: map[string]localSession{}, origins: map[string]bool{}, owner: cfg.SWAOwnerCapability}
	g.tokens, _ = cfg.Services.LocalProjects.(workspace.ScopedAgentTokens)
	for _, origin := range cfg.AllowedOrigins {
		g.origins[origin] = true
	}
	return g
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
		reject(w, r, "human session requires same-origin browser access")
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	for id, session := range g.sessions {
		if !session.Expires.After(now) {
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
			reject(w, r, "cross-origin request rejected")
			return
		}
		if r.URL.Path == orcaDeliveryAdmissionPath {
			if !validOrcaOwnerRequest(r, g.owner) {
				reject(w, r, "private runtime admission requires its owning service")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/v1/") || r.URL.Path == "/api/v1/health" || r.URL.Path == "/api/v1/foundation" || r.URL.Path == "/api/v1/auth/session" {
			next.ServeHTTP(w, r)
			return
		}
		var caller domain.Caller
		if authorization := r.Header.Get("Authorization"); authorization != "" {
			if g.tokens == nil || !strings.HasPrefix(authorization, "Bearer ") {
				reject(w, r, "invalid Agent credential")
				return
			}
			var err error
			caller, err = g.tokens.AuthenticateAgentToken(r.Context(), strings.TrimPrefix(authorization, "Bearer "))
			if err != nil || caller.Kind != "agent" || caller.ID == "" || caller.ProjectID == "" || !scopedAgentRoute(r, caller.ProjectID) {
				reject(w, r, "Agent credential requires a current human project grant and permitted operation")
				return
			}
		} else {
			cookie, err := r.Cookie(sessionCookie)
			if err != nil {
				reject(w, r, "local session required")
				return
			}
			g.mu.Lock()
			session := g.sessions[cookie.Value]
			g.mu.Unlock()
			if !session.Expires.After(time.Now()) {
				reject(w, r, "local session expired")
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(session.CSRF)) != 1 {
				reject(w, r, "CSRF token required")
				return
			}
			caller = domain.Caller{ID: "local-human", Kind: "human"}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), callerKey, caller)))
	})
}
func localCaller(r *http.Request) domain.Caller {
	caller, _ := r.Context().Value(callerKey).(domain.Caller)
	caller.OperationID = r.Header.Get("Idempotency-Key")
	return caller
}
func scopedAgentRoute(r *http.Request, projectID string) bool {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 || parts[0] != "api" || parts[1] != "v1" || parts[2] != "local-projects" || parts[3] != projectID {
		return false
	}
	return len(parts) == 5 && parts[4] == "context" && r.Method == http.MethodPost || len(parts) == 6 && parts[4] == "orca" && parts[5] == "commands" && r.Method == http.MethodPost
}
