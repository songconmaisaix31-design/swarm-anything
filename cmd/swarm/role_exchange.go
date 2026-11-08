package main

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"gopkg.in/yaml.v3"
)

const dossierVersion = "personal-agent-dossier/1.0"

var (
	portableRoleName = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	roleID           = regexp.MustCompile(`^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$`)
	sensitiveRole    = regexp.MustCompile(`(?i)[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_-]+\.[\p{L}\p{N}_.-]+|\b0\d{1,3}-\d{3,4}-\d{4}\b|\b\d{16}\b|sk-[a-z0-9]{10,}|ghp_\w+|(?:password|passwd|密码)\s*[:：=]\s*\S+`)
)

type roleMarkdown struct {
	Name        string            `yaml:"name"`
	Description string            `yaml:"description"`
	Metadata    map[string]string `yaml:"metadata,omitempty"`
	Tools       *[]string         `yaml:"tools,omitempty"`
	PromptMode  string            `yaml:"promptMode,omitempty"`
}

type roleDossier struct {
	Spec        string   `yaml:"spec"`
	ID          string   `yaml:"id"`
	Name        string   `yaml:"name"`
	Title       string   `yaml:"title,omitempty"`
	Status      string   `yaml:"status"`
	ExportedAt  string   `yaml:"exported_at"`
	Source      string   `yaml:"source"`
	Fingerprint string   `yaml:"fingerprint"`
	Role        string   `yaml:"role"`
	AntiJobs    []string `yaml:"anti_jobs,omitempty"`
	Routines    any      `yaml:"routines"`
	Memory      any      `yaml:"memory"`
	Excluded    string   `yaml:"excluded,omitempty"`
}

func executeRoleExchange(args []string, stdin io.Reader, stdout io.Writer) error {
	if len(args) < 2 || strings.HasPrefix(args[1], "--") {
		return fmt.Errorf("roles import/export 需要明确的文件路径或 -")
	}
	action, path := args[0], args[1]
	flags := flag.NewFlagSet("roles "+action, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var format, id, name, description string
	if action == "import" {
		flags.StringVar(&format, "from", "", "源角色格式")
		flags.StringVar(&id, "id", "", "SWA 角色 ID")
		flags.StringVar(&name, "name", "", "SWA 角色名称")
		flags.StringVar(&description, "description", "", "SWA 角色描述")
	} else {
		flags.StringVar(&format, "to", "", "目标角色格式")
	}
	if err := flags.Parse(args[2:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("存在多余参数: %s", strings.Join(flags.Args(), " "))
	}
	if format != "skill" && format != "grok-build" && format != "dossier" && format != "text" {
		return fmt.Errorf("角色交换格式必须为 skill、grok-build、dossier 或 text")
	}
	data, err := readCard(path, stdin)
	if err != nil {
		return err
	}
	if !utf8.Valid(data) {
		return fmt.Errorf("角色文件必须为 UTF-8")
	}
	catalog, err := rolecards.New()
	if err != nil {
		return err
	}
	if action == "import" {
		role, err := importRole(format, data)
		if err != nil {
			return err
		}
		if id != "" {
			role.ID = id
		}
		if name != "" {
			role.Name = name
		}
		if description != "" {
			role.Description = description
		}
		data, err = marshalImportedRole(role, catalog)
		if err != nil {
			return err
		}
	} else {
		role, err := catalog.ParseRole(data)
		if err != nil {
			return err
		}
		data, err = exportRole(format, role)
		if err != nil {
			return err
		}
	}
	_, err = stdout.Write(data)
	return err
}

func importRole(format string, data []byte) (domain.RoleCard, error) {
	if format == "text" {
		return domain.RoleCard{Identity: strings.TrimSuffix(string(data), "\n")}, nil
	}
	if format == "dossier" {
		return importRoleDossier(data)
	}
	header, body, err := splitRoleMarkdown(data)
	if err != nil {
		return domain.RoleCard{}, err
	}
	var source map[string]any
	if err := yaml.Unmarshal(header, &source); err != nil {
		return domain.RoleCard{}, fmt.Errorf("解析 Markdown 角色字段: %w", err)
	}
	name, _ := source["name"].(string)
	description, _ := source["description"].(string)
	if err := validateRoleMarkdown(format, name, description); err != nil {
		return domain.RoleCard{}, err
	}
	if format == "grok-build" && source["promptMode"] == "full" && (strings.Contains(body, "${{") || strings.Contains(body, "${%")) {
		return domain.RoleCard{}, fmt.Errorf("请先把 Grok Build 的动态提示词渲染为普通文本")
	}
	role := domain.RoleCard{ID: "imported." + name, Name: name, Description: description, Identity: body}
	if format == "skill" {
		metadata, _ := source["metadata"].(map[string]any)
		if id, _ := metadata["swa-role-id"].(string); id != "" {
			role.ID = id
		}
		if name, _ := metadata["swa-role-name"].(string); name != "" {
			role.Name = name
		}
	}
	return role, nil
}

func marshalImportedRole(role domain.RoleCard, catalog *rolecards.Catalog) ([]byte, error) {
	role.SchemaVersion = "0.1"
	role.Tools = &[]string{}
	role.Budget = role.EffectiveBudget()
	role.HandoffPolicy.Emit = []string{}
	role.HandoffPolicy.AutoHandoff = []string{}
	encoded, err := json.Marshal(role)
	if err != nil {
		return nil, err
	}
	if _, err := catalog.ParseRole(encoded); err != nil {
		return nil, err
	}
	var yamlRole map[string]any
	if err := json.Unmarshal(encoded, &yamlRole); err != nil {
		return nil, err
	}
	return yaml.Marshal(yamlRole)
}

func exportRole(format string, role domain.RoleCard) ([]byte, error) {
	if format == "text" {
		return []byte(role.Identity + "\n"), nil
	}
	if format == "dossier" {
		return exportRoleDossier(role)
	}
	name := strings.Trim(strings.NewReplacer(".", "-", "_", "-").Replace(role.ID), "-")
	name = strings.Join(strings.FieldsFunc(name, func(r rune) bool { return r == '-' }), "-")
	description := role.Description
	if strings.TrimSpace(description) == "" {
		description = role.Name
	}
	if err := validateRoleMarkdown(format, name, description); err != nil {
		return nil, err
	}
	header := roleMarkdown{Name: name, Description: description}
	if format == "skill" {
		header.Metadata = map[string]string{"swa-role-id": role.ID, "swa-role-name": role.Name}
	} else {
		header.Tools = &[]string{}
		header.PromptMode = "extend"
	}
	return encodeRoleMarkdown(header, role.Identity)
}

func validateRoleMarkdown(format, name, description string) error {
	if !portableRoleName.MatchString(name) || (format == "skill" && len(name) > 64) {
		return fmt.Errorf("%s 的 name 必须为以短横线分隔的小写字母和数字；skill 最长 64 个字符", format)
	}
	if strings.TrimSpace(description) == "" || (format == "skill" && utf8.RuneCountInString(description) > 1024) {
		return fmt.Errorf("%s 需要非空 description；skill 最长 1024 个字符", format)
	}
	return nil
}

func splitRoleMarkdown(data []byte) ([]byte, string, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	data = bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n"))
	opening, rest, found := bytes.Cut(data, []byte("\n"))
	if !found || string(opening) != "---" {
		return nil, "", fmt.Errorf("角色 Markdown 需要以 --- 开始的 YAML front matter")
	}
	header, body, found := bytes.Cut(rest, []byte("\n---\n"))
	if !found && bytes.HasSuffix(rest, []byte("\n---")) {
		return bytes.TrimSuffix(rest, []byte("\n---")), "", nil
	}
	if !found {
		return nil, "", fmt.Errorf("角色 Markdown 的 YAML front matter 缺少结束标记 ---")
	}
	return header, strings.TrimSuffix(string(body), "\n"), nil
}

func encodeRoleMarkdown(header any, body string) ([]byte, error) {
	data, err := yaml.Marshal(header)
	if err != nil {
		return nil, err
	}
	return []byte("---\n" + string(data) + "---\n" + body + "\n"), nil
}

func importRoleDossier(data []byte) (domain.RoleCard, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if bytes.HasPrefix(data, []byte("---\n")) || bytes.HasPrefix(data, []byte("---\r\n")) {
		header, _, err := splitRoleMarkdown(data)
		if err != nil {
			return domain.RoleCard{}, err
		}
		data = header
	}
	var source roleDossier
	if err := yaml.Unmarshal(data, &source); err != nil {
		return domain.RoleCard{}, fmt.Errorf("解析 dossier: %w", err)
	}
	if source.Spec != dossierVersion || strings.TrimSpace(source.ID) == "" || strings.TrimSpace(source.Role) == "" {
		return domain.RoleCard{}, fmt.Errorf("需要包含 id 和 role 的 %s 角色档案", dossierVersion)
	}
	if dossierFingerprint(source.Name, source.Title, source.Role) != source.Fingerprint {
		return domain.RoleCard{}, fmt.Errorf("dossier 指纹与 name、title、role 字段不一致")
	}
	identity := source.Role
	if len(source.AntiJobs) > 0 {
		identity += "\n\n## Role boundaries\n\n- " + strings.Join(source.AntiJobs, "\n- ")
	}
	if sensitiveRole.MatchString(identity) {
		return domain.RoleCard{}, fmt.Errorf("dossier 角色正文包含个人信息或凭据模式，请审阅原文件")
	}
	id := source.ID
	if !roleID.MatchString(id) {
		id = "imported." + strings.ToLower(id)
	}
	return domain.RoleCard{ID: id, Name: source.Name, Description: source.Title, Identity: identity}, nil
}

func exportRoleDossier(role domain.RoleCard) ([]byte, error) {
	if sensitiveRole.MatchString(role.Identity) {
		return nil, fmt.Errorf("dossier 角色正文包含个人信息或凭据模式，请审阅原文件")
	}
	return encodeRoleMarkdown(roleDossier{
		Spec: dossierVersion, ID: role.ID, Name: role.Name, Title: role.Description,
		Status: "active", ExportedAt: time.Now().Format(time.DateOnly), Source: "swarm-anything",
		Fingerprint: dossierFingerprint(role.Name, role.Description, role.Identity), Role: role.Identity,
		Excluded: "Role only. Routines, memory, tool grants and credentials are outside this export.",
	}, "")
}

func dossierFingerprint(name, title, role string) string {
	normalize := func(value string) string {
		return strings.TrimSpace(strings.ReplaceAll(value, "\r\n", "\n"))
	}
	// SHA-1 用于与 dossier 规范的内容指纹互通。
	digest := sha1.Sum([]byte(normalize(name) + "|" + normalize(title) + "|" + normalize(role)))
	return hex.EncodeToString(digest[:6])
}
