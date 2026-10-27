package swahttp

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

type handler struct{ services Services }

func writeJSON(w http.ResponseWriter, status int, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		status = http.StatusInternalServerError
		data, err = json.Marshal(apierrors.Wrap(&apierrors.ServiceError{Code: apierrors.InternalError, Message: "response JSON encoding failed", RequestID: w.Header().Get("X-Request-ID"), RequiredAction: "report_response_encoding_failure"}))
		if err != nil {
			panic(http.ErrAbortHandler)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(append(data, '\n')); err != nil {
		panic(http.ErrAbortHandler)
	}
}

func writeError(w http.ResponseWriter, r *http.Request, status int, err *apierrors.ServiceError) {
	if err.RequestID == "" {
		err.RequestID, _ = r.Context().Value(requestIDKey).(string)
	}
	if err.RequiredAction == "" {
		err.RequiredAction = "contact_support_with_request_id"
	}
	writeJSON(w, status, apierrors.Wrap(err))
}

func invalid(message string) *apierrors.ServiceError {
	return &apierrors.ServiceError{Code: apierrors.ValidationFailed, Message: message, RequiredAction: "correct_request_and_resubmit"}
}

func (h *handler) result(w http.ResponseWriter, r *http.Request, status int, value any, err error) {
	if err == nil {
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, status, value)
		return
	}
	var failure *apierrors.ServiceError
	if !errors.As(err, &failure) {
		failure = &apierrors.ServiceError{Code: apierrors.InternalError, Message: "SWA service failed", RequiredAction: "contact_support_with_request_id"}
	}
	switch failure.Code {
	case apierrors.NotFound:
		status = http.StatusNotFound
	case apierrors.ValidationFailed, apierrors.EvidenceMissing:
		status = http.StatusBadRequest
	case apierrors.VersionConflict, apierrors.ContextStale, apierrors.DeliveryUnknown:
		status = http.StatusConflict
	case apierrors.ScopeDenied, apierrors.ApprovalRequired, apierrors.ApprovalRevoked:
		status = http.StatusForbidden
	case apierrors.UnsupportedCapability:
		status = http.StatusNotImplemented
	case apierrors.ProviderUnavailable:
		status = http.StatusServiceUnavailable
	default:
		status = http.StatusInternalServerError
	}
	writeError(w, r, status, failure)
}

func commandHandler[T any](h *handler, meta func(*T) *workspace.WorkspaceCommandMeta, status int, call func(*http.Request, T) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body T
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			h.result(w, r, 0, nil, invalid("Content-Type must be application/json"))
			return
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			h.result(w, r, 0, nil, invalid("invalid JSON command or unsupported fields"))
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			h.result(w, r, 0, nil, invalid("one JSON command is required"))
			return
		}
		m := meta(&body)
		m.IdempotencyKey = r.Header.Get("Idempotency-Key")
		if m.SchemaVersion != 1 || m.RequestID == "" || m.ExpectedVersion < 1 || m.IdempotencyKey == "" {
			h.result(w, r, 0, nil, invalid("schema_version, request_id, expected_version and Idempotency-Key are required"))
			return
		}
		value, err := call(r, body)
		h.result(w, r, status, value, err)
	}
}
