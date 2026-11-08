package domain

import (
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"time"
)

const SchemaVersion = 1

var identifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

func strictFields(data []byte, value any, fields ...string) error {
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(data, &keys); err != nil {
		return err
	}
	if keys == nil {
		return errors.New("plugin contract requires an object")
	}
	for key := range keys {
		if !slices.Contains(fields, key) {
			return errors.New("unknown plugin contract field: " + key)
		}
	}
	return json.Unmarshal(data, value)
}

// Principal 只能由可信传输层建立，正文不能提供身份。
type Principal struct {
	Kind      string `json:"-"`
	ID        string `json:"-"`
	ProjectID string `json:"-"`
}

// Connection 只保存尚未解析的配置标识，不保存命令、密钥或插件正文。
type Connection struct {
	SchemaVersion    int      `json:"schema_version"`
	ProjectID        string   `json:"project_id"`
	PluginID         string   `json:"plugin_id"`
	Transport        string   `json:"transport"`
	ConfigurationRef string   `json:"configuration_ref"`
	ContractVersion  string   `json:"contract_version"`
	Scopes           []string `json:"scopes"`
	Version          int      `json:"version"`
}

func (c *Connection) UnmarshalJSON(data []byte) error {
	type plain Connection
	var value plain
	if err := strictFields(data, &value, "schema_version", "project_id", "plugin_id", "transport", "configuration_ref", "contract_version", "scopes", "version"); err != nil {
		return err
	}
	*c = Connection(value)
	return nil
}

func (c Connection) Validate() error {
	if c.SchemaVersion != SchemaVersion || !identifier.MatchString(c.ProjectID) || !identifier.MatchString(c.PluginID) || !identifier.MatchString(c.ConfigurationRef) || c.ContractVersion != "1" || c.Version < 1 {
		return errors.New("plugin connection requires v1, fixed identifiers and a positive version")
	}
	if c.Transport != "stdio" && c.Transport != "streamable-http" {
		return errors.New("unsupported plugin transport")
	}
	if c.Scopes == nil || len(c.Scopes) > 2 {
		return errors.New("plugin scopes must be an explicit list")
	}
	seen := map[string]bool{}
	for _, scope := range c.Scopes {
		if scope != "references.read" && scope != "events.record" || seen[scope] {
			return errors.New("plugin scope is unknown or repeated")
		}
		seen[scope] = true
	}
	return nil
}

func (c Connection) Allows(scope string) bool { return slices.Contains(c.Scopes, scope) }

// Reference 的正文与批准状态继续归插件所有。
type Reference struct {
	SchemaVersion int    `json:"schema_version"`
	PluginID      string `json:"plugin_id"`
	ProjectID     string `json:"project_id"`
	Kind          string `json:"kind"`
	ObjectID      string `json:"object_id"`
	Revision      int    `json:"revision"`
}

func (r *Reference) UnmarshalJSON(data []byte) error {
	type plain Reference
	var value plain
	if err := strictFields(data, &value, "schema_version", "plugin_id", "project_id", "kind", "object_id", "revision"); err != nil {
		return err
	}
	*r = Reference(value)
	return nil
}

func (r Reference) Validate() error {
	if r.SchemaVersion != SchemaVersion || !identifier.MatchString(r.PluginID) || !identifier.MatchString(r.ProjectID) || !identifier.MatchString(r.ObjectID) || r.Revision < 1 {
		return errors.New("plugin reference requires v1, fixed identifiers and a positive revision")
	}
	if !slices.Contains([]string{"material", "opportunity", "experience", "knowledge", "completion", "proposal", "event"}, r.Kind) {
		return errors.New("unknown plugin reference kind")
	}
	return nil
}

// Event 记录来源关联，不携带提案正文、经验、模型输入或执行权限。
type Event struct {
	SchemaVersion int       `json:"schema_version"`
	Source        string    `json:"source"`
	EventID       string    `json:"event_id"`
	ProjectID     string    `json:"project_id"`
	OccurredAt    time.Time `json:"occurred_at"`
	CorrelationID string    `json:"correlation_id"`
	CausationID   string    `json:"causation_id"`
	ObjectRef     Reference `json:"object_ref"`
}

func (e *Event) UnmarshalJSON(data []byte) error {
	type plain Event
	var value plain
	if err := strictFields(data, &value, "schema_version", "source", "event_id", "project_id", "occurred_at", "correlation_id", "causation_id", "object_ref"); err != nil {
		return err
	}
	*e = Event(value)
	return nil
}

func (e Event) Validate() error {
	if e.SchemaVersion != SchemaVersion || !identifier.MatchString(e.Source) || !identifier.MatchString(e.EventID) || !identifier.MatchString(e.ProjectID) || !identifier.MatchString(e.CorrelationID) || !identifier.MatchString(e.CausationID) || e.OccurredAt.IsZero() {
		return errors.New("plugin event requires v1, stable source/event identifiers and occurrence time")
	}
	if err := e.ObjectRef.Validate(); err != nil {
		return err
	}
	if e.ProjectID != e.ObjectRef.ProjectID {
		return errors.New("event reference belongs to another project")
	}
	return nil
}

type EventReceipt struct {
	SchemaVersion int    `json:"schema_version"`
	Source        string `json:"source"`
	EventID       string `json:"event_id"`
	Status        string `json:"status"`
}

type RecordedEvent struct {
	Event   Event        `json:"event"`
	Receipt EventReceipt `json:"receipt"`
}
