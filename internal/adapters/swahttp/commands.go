package swahttp

import (
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

const orcaDeliveryAdmissionPath = "/api/internal/swa/delivery-admission"

func validOrcaOwnerRequest(r *http.Request, capability string) bool {
	if r.Method != http.MethodPost || r.URL.RawQuery != "" || r.URL.RawPath != "" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || len(capability) != 64 || len(r.Header.Values("X-SWA-Owner-Capability")) != 1 {
		return false
	}
	expected, err := hex.DecodeString(capability)
	if err != nil || len(expected) != 32 {
		return false
	}
	actual, err := hex.DecodeString(r.Header.Get("X-SWA-Owner-Capability"))
	return err == nil && len(actual) == 32 && subtle.ConstantTimeCompare(expected, actual) == 1
}

func (h *handler) registerCommands(mux *http.ServeMux) {
	mux.HandleFunc("POST "+orcaDeliveryAdmissionPath, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if h.services.OrcaExecution == nil {
			h.result(w, r, 0, nil, &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: "the product Orca runtime is not configured", RequiredAction: "inspect_original_request"})
			return
		}
		var invocation workspace.OrcaInvocation
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*1024*1024))
		decoder.DisallowUnknownFields()
		err := decoder.Decode(&invocation)
		if err == nil && decoder.Decode(new(any)) != io.EOF {
			err = errors.New("exactly one original invocation is required")
		}
		if err != nil {
			h.result(w, r, 0, nil, invalid("invalid original delivery invocation"))
			return
		}
		value, err := h.services.OrcaExecution.AdmitOrcaDelivery(r.Context(), invocation)
		h.result(w, r, http.StatusOK, value, err)
	})
	mux.HandleFunc("POST /api/v1/local-projects/{id}/orca/commands", func(w http.ResponseWriter, r *http.Request) {
		if h.services.OrcaExecution == nil {
			h.result(w, r, 0, nil, &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: "the product Orca runtime is not configured", RequiredAction: "start_installed_swa_service"})
			return
		}
		var command workspace.OrcaCommand
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
		decoder.DisallowUnknownFields()
		err := decoder.Decode(&command)
		if err == nil && decoder.Decode(new(any)) != io.EOF {
			err = errors.New("exactly one JSON command is required")
		}
		if err != nil || (command.ProjectID != "" && command.ProjectID != r.PathValue("id")) || (command.RequestID != "" && r.Header.Get("Idempotency-Key") != command.RequestID) {
			h.result(w, r, 0, nil, invalid("invalid command, project or request header"))
			return
		}
		if command.Action == "controller.open" || command.Action == "run.submit" || command.Action == "request.show" && command.Controller == "" {
			command.ProjectID = r.PathValue("id")
		}
		caller := localCaller(r)
		if caller.Kind == "human" {
			caller.ProjectID = r.PathValue("id")
		}
		reply, err := h.services.OrcaExecution.ExecuteOrca(r.Context(), caller, command)
		if err == nil {
			writeJSON(w, http.StatusOK, reply)
			return
		}
		var native *workspace.OrcaNativeError
		if errors.As(err, &native) {
			reply.OK, reply.Error = false, native
			if reply.RequestID == "" {
				reply.RequestID = command.RequestID
			}
			writeJSON(w, http.StatusConflict, reply)
			return
		}
		h.result(w, r, 0, nil, err)
	})
}
