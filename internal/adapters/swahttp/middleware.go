package swahttp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
)

type contextKey string

const requestIDKey contextKey = "request_id"
const callerKey contextKey = "workspace_caller"

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = randomToken()
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func loggingMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(writer, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", writer.status, "request_id", r.Context().Value(requestIDKey))
	})
}
func reject(w http.ResponseWriter, r *http.Request, message string) {
	writeError(w, r, http.StatusForbidden, &apierrors.ServiceError{Code: apierrors.ScopeDenied, Message: message, RequiredAction: "establish_local_session_and_use_allowed_origin"})
}
func loopbackMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if host == "" {
			host = r.RemoteAddr
		}
		if !isLoopbackHost(host) {
			reject(w, r, "non-loopback host rejected")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || origin != parsed.Scheme+"://"+parsed.Host || !isLoopbackHost(parsed.Host) {
				reject(w, r, "non-loopback origin rejected")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
