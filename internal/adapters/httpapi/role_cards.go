package httpapi

import (
	"net/http"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
)

func (h *handler) registerRoleCards(mux *http.ServeMux) {
	service := h.services.RoleCards
	if service == nil {
		return
	}
	mux.HandleFunc("GET /api/v1/roles", func(w http.ResponseWriter, r *http.Request) {
		items, err := service.List(r.Context())
		h.swarmResult(w, r, localList(items), err)
	})
	mux.HandleFunc("GET /api/v1/roles/{id}", func(w http.ResponseWriter, r *http.Request) {
		record, err := service.Get(r.Context(), r.PathValue("id"))
		h.swarmResult(w, r, roleCardEnvelope(record), err)
	})
	for _, method := range []string{"POST", "PUT"} {
		path := "/api/v1/roles"
		if method == "PUT" {
			path += "/{id}"
		}
		create := method == "POST"
		mux.HandleFunc(method+" "+path, swarmCommand(h, func(command *swarmapp.RoleCardCommand) *domain.Meta { return &command.Meta }, func(r *http.Request, command swarmapp.RoleCardCommand) (any, error) {
			record, err := service.Write(r.Context(), swarmCaller(r), r.PathValue("id"), create, command)
			return roleCardEnvelope(record), err
		}))
	}
}

func roleCardEnvelope(record swarmapp.RoleCardRecord) any {
	return map[string]any{"schema_version": apierrors.SchemaVersion, "role": record.Role, "version": record.Version}
}
