package rolecards

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"sort"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/songconmaisaix31-design/Astrocyte/contracts"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"github.com/songconmaisaix31-design/Astrocyte/roles"
	"gopkg.in/yaml.v3"
)

type Catalog struct {
	roleSchema    *jsonschema.Resolved
	handoffSchema *jsonschema.Resolved
	roles         map[string]domain.RoleCard
}

func New() (*Catalog, error) {
	catalog := &Catalog{roles: map[string]domain.RoleCard{}}
	for _, name := range []string{"role-card", "handoff-card"} {
		data, err := contracts.CardSchemas.ReadFile(name + ".schema.json")
		if err != nil {
			return nil, err
		}
		var schema jsonschema.Schema
		if err := json.Unmarshal(data, &schema); err != nil {
			return nil, fmt.Errorf("读取 %s Schema: %w", name, err)
		}
		resolved, err := schema.Resolve(&jsonschema.ResolveOptions{ValidateDefaults: true})
		if err != nil {
			return nil, fmt.Errorf("解析 %s Schema: %w", name, err)
		}
		if name == "role-card" {
			catalog.roleSchema = resolved
		} else {
			catalog.handoffSchema = resolved
		}
	}
	if err := catalog.Load(roles.Files, "builtin/*.yaml"); err != nil {
		return nil, err
	}
	return catalog, nil
}

func (c *Catalog) Load(source fs.FS, pattern string) error {
	paths, err := fs.Glob(source, pattern)
	if err != nil {
		return err
	}
	loaded := make(map[string]domain.RoleCard, len(paths))
	for _, path := range paths {
		data, err := fs.ReadFile(source, path)
		if err != nil {
			return err
		}
		role, err := c.ParseRole(data)
		if err != nil {
			return fmt.Errorf("角色 %s: %w", path, err)
		}
		if _, exists := c.roles[role.ID]; exists {
			return fmt.Errorf("角色 ID 重复: %s", role.ID)
		}
		if _, exists := loaded[role.ID]; exists {
			return fmt.Errorf("角色 ID 重复: %s", role.ID)
		}
		loaded[role.ID] = role
	}
	for id, role := range loaded {
		c.roles[id] = role
	}
	return nil
}

func (c *Catalog) List() []domain.RoleCard {
	items := make([]domain.RoleCard, 0, len(c.roles))
	for _, role := range c.roles {
		items = append(items, role)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	return items
}

func (c *Catalog) Find(id string) (domain.RoleCard, error) {
	role, exists := c.roles[id]
	if !exists {
		return domain.RoleCard{}, fmt.Errorf("角色不存在: %s", id)
	}
	return role, nil
}

func (c *Catalog) ParseRole(data []byte) (domain.RoleCard, error) {
	var role domain.RoleCard
	if err := decodeCard(data, c.roleSchema, &role); err != nil {
		return role, err
	}
	role.Budget = role.EffectiveBudget()
	if role.HandoffPolicy.Emit == nil {
		role.HandoffPolicy.Emit = []string{}
	}
	if role.HandoffPolicy.AutoHandoff == nil {
		role.HandoffPolicy.AutoHandoff = []string{}
	}
	return role, nil
}

func (c *Catalog) ParseHandoff(data []byte) (domain.HandoffCard, error) {
	var card domain.HandoffCard
	if err := decodeCard(data, c.handoffSchema, &card); err != nil {
		return card, err
	}
	if _, err := time.Parse(time.RFC3339Nano, card.At); err != nil {
		return card, fmt.Errorf("交接时间必须为 RFC3339: %w", err)
	}
	if err := card.Card.ValidateTrace(); err != nil {
		return card, err
	}
	return card, nil
}

func decodeCard(data []byte, schema *jsonschema.Resolved, target any) error {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("解析角色或交接数据: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err != nil {
			return fmt.Errorf("解析数据末尾: %w", err)
		}
		return fmt.Errorf("一个文件只能包含一张卡片")
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	var instance any
	if err := json.Unmarshal(encoded, &instance); err != nil {
		return err
	}
	if err := schema.Validate(instance); err != nil {
		return fmt.Errorf("卡片格式错误: %w", err)
	}
	return json.Unmarshal(encoded, target)
}
