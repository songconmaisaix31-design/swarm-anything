package swahttp

import "testing"

func TestPluginHTTPReferencesRemainHumanScopedAndDoNotExecute(t *testing.T) {
	s := actualServer(t, "")
	s.login()
	space := s.request("POST", "/api/v1/project-spaces", command(map[string]any{"title": "plugin boundary"}), nil, 201)["space"].(map[string]any)
	project := s.request("POST", "/api/v1/local-projects", command(map[string]any{"name": "plugin project", "root": t.TempDir(), "space_id": space["id"]}), nil, 200)["project"].(map[string]any)
	id := project["id"].(string)
	base := "/api/v1/local-projects/" + id + "/plugins/astrocyte"
	connection := map[string]any{"schema_version": 1, "project_id": id, "plugin_id": "astrocyte", "transport": "stdio", "configuration_ref": "astrocyte-local", "contract_version": "1", "scopes": []string{"references.read", "events.record"}, "version": 1}
	body := map[string]any{"connection": connection, "expected_version": 0}
	s.request("PUT", base, body, map[string]string{"X-CSRF-Token": ""}, 403)
	s.request("PUT", base, body, nil, 200)
	s.request("GET", base, nil, nil, 200)
	s.request("PUT", base, body, nil, 409)
	connection["actor_kind"] = "human"
	s.request("PUT", base, body, nil, 400)
	delete(connection, "actor_kind")
	ref := map[string]any{"schema_version": 1, "project_id": id, "plugin_id": "astrocyte", "kind": "experience", "object_id": "exp-1", "revision": 1}
	s.request("POST", base+"/references", ref, nil, 200)
	ref["text"] = "this content must remain in the plugin"
	s.request("POST", base+"/references", ref, nil, 400)
	delete(ref, "text")
	event := map[string]any{"schema_version": 1, "source": "astrocyte", "event_id": "completion-1", "project_id": id, "occurred_at": "2026-11-08T12:00:00Z", "correlation_id": "run-1", "causation_id": "task-1", "object_ref": ref}
	first := s.request("POST", base+"/events", event, nil, 200)
	second := s.request("POST", base+"/events", event, nil, 200)
	if first["receipt"].(map[string]any)["status"] != "recorded" || second["receipt"].(map[string]any)["event_id"] != "completion-1" {
		t.Fatal("reference receipt was not stable")
	}
	s.request("GET", base+"/events?source=astrocyte&event_id=completion-1", nil, nil, 200)
	event["causation_id"] = "other-task"
	s.request("POST", base+"/events", event, nil, 409)
	ref["project_id"] = "other-project"
	s.request("POST", base+"/references", ref, nil, 403)
	// 引用记录不能启动运行；未组装执行运行时继续明确拒绝。
	s.request("POST", "/api/v1/local-projects/"+id+"/orca/commands", map[string]any{"schema_version": 1, "action": "run.submit", "request_id": "4f58c538-6562-4ea7-817d-78f53c16d18d", "objective": "a reference is not execution approval"}, nil, 503)
}
