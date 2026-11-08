package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"gopkg.in/yaml.v3"
)

var version = "development"

const usage = `swarm agents list [--probe] [--json]
swarm agents connect ID --project DIR [--json]
swarm roles list [--roles-dir DIR] [--json]
swarm roles show ID [--roles-dir DIR] [--json]
swarm roles validate FILE [--json]
swarm roles new --output FILE [--id ID --name NAME --identity TEXT] [--json]
swarm roles edit FILE [--name NAME --identity TEXT] [--json]
swarm roles import FILE --from dossier|skill|grok-build|text [--id ID --name NAME --description TEXT]
swarm roles export FILE --to dossier|skill|grok-build|text
swarm handoff validate FILE [--json]
swarm --version

FILE 使用 YAML 或 JSON；FILE 为 - 时从标准输入读取。
roles new 缺少必要信息时逐项询问；--json 模式需要明确提供全部必要信息。
roles edit 不带修改参数时逐项询问，空输入保持原值。
swarm 管理本地发现和可移植角色资产；任务执行、项目权限、运行角色与恢复沿用 swa。
角色卡不会建立项目授权，agents connect 仅进行 ACP 握手。
`

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "--version" {
		fmt.Fprintln(stdout, version)
		return 0
	}
	if len(args) == 0 || args[0] == "--help" || args[0] == "help" {
		fmt.Fprint(stdout, usage)
		return 0
	}
	if err := execute(args, stdin, stdout); err != nil {
		serviceError := &apierrors.ServiceError{Code: apierrors.ValidationFailed, Message: err.Error(), RequiredAction: "查看 swarm --help 中的命令参数"}
		var remote *apierrors.ServiceError
		if errors.As(err, &remote) {
			serviceError = remote
		}
		json.NewEncoder(stderr).Encode(apierrors.Wrap(serviceError))
		switch serviceError.Code {
		case apierrors.DeliveryUnknown:
			return 6
		case apierrors.ScopeDenied, apierrors.ApprovalRequired:
			return 3
		case apierrors.ProviderUnavailable:
			return 4
		case apierrors.InternalError:
			return 7
		default:
			return 2
		}
	}
	return 0
}

func execute(args []string, stdin io.Reader, stdout io.Writer) error {
	if len(args) >= 2 && args[0] == "agents" {
		return executeAgents(args[1:], stdout)
	}
	if len(args) >= 2 && args[0] == "roles" && (args[1] == "import" || args[1] == "export") {
		return executeRoleExchange(args[1:], stdin, stdout)
	}
	if len(args) < 2 || (args[0] != "roles" && args[0] != "handoff") {
		return fmt.Errorf("未知命令，请运行 swarm --help")
	}
	group, action, rest := args[0], args[1], args[2:]
	var target string
	if len(rest) > 0 && !strings.HasPrefix(rest[0], "--") {
		target, rest = rest[0], rest[1:]
	}
	flags := flag.NewFlagSet(group+" "+action, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	asJSON := flags.Bool("json", false, "输出 JSON")
	directory := flags.String("roles-dir", "", "额外角色目录")
	output := flags.String("output", "", "新角色文件")
	id := flags.String("id", "", "角色 ID")
	name := flags.String("name", "", "角色名称")
	identity := flags.String("identity", "", "角色提示词")
	if err := flags.Parse(rest); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("存在多余参数: %s", strings.Join(flags.Args(), " "))
	}
	catalog, err := rolecards.New()
	if err != nil {
		return err
	}
	if *directory != "" {
		info, err := os.Stat(*directory)
		if err != nil {
			return err
		}
		if !info.IsDir() {
			return fmt.Errorf("角色目录必须为文件夹")
		}
		for _, pattern := range []string{"*.yaml", "*.yml", "*.json"} {
			if err := catalog.Load(os.DirFS(*directory), pattern); err != nil {
				return err
			}
		}
	}
	encode := func(value any) error {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(value)
	}
	if group == "roles" && action == "list" {
		if target != "" {
			return fmt.Errorf("roles list 不接收角色 ID")
		}
		items := catalog.List()
		if *asJSON {
			return encode(map[string]any{"schema_version": 1, "items": items})
		}
		for _, role := range items {
			if _, err := fmt.Fprintf(stdout, "%s\t%s\t%s\n", role.ID, role.Name, role.Description); err != nil {
				return err
			}
		}
		return nil
	}
	if group == "roles" && action == "show" {
		role, err := catalog.Find(target)
		if err != nil {
			return err
		}
		return encode(role)
	}
	if action == "validate" {
		data, err := readCard(target, stdin)
		if err != nil {
			return err
		}
		var value any
		if group == "roles" {
			value, err = catalog.ParseRole(data)
		} else {
			value, err = catalog.ParseHandoff(data)
		}
		if err != nil {
			return err
		}
		return encode(map[string]any{"schema_version": 1, "valid": true, "card": value})
	}
	if group != "roles" || (action != "new" && action != "edit") {
		return fmt.Errorf("未知命令 %s %s", group, action)
	}
	var role domain.RoleCard
	path := *output
	if action == "edit" {
		if target == "" || target == "-" {
			return fmt.Errorf("roles edit 需要可以写入的角色文件路径")
		}
		if *asJSON && *name == "" && *identity == "" {
			return fmt.Errorf("JSON 模式需要提供 --name 或 --identity")
		}
		if *id != "" || *output != "" {
			return fmt.Errorf("roles edit 直接修改指定文件，角色 ID 保持原值")
		}
		data, err := readCard(target, stdin)
		if err != nil {
			return err
		}
		role, err = catalog.ParseRole(data)
		if err != nil {
			return err
		}
		path = target
	} else {
		if path == "" || target != "" {
			return fmt.Errorf("roles new 需要 --output 文件路径")
		}
		role = domain.RoleCard{SchemaVersion: "0.1", ID: *id, Name: *name, Identity: *identity}
		role.Budget = role.EffectiveBudget()
		role.HandoffPolicy.Emit = []string{}
		role.HandoffPolicy.AutoHandoff = []string{}
	}
	reader := bufio.NewReader(stdin)
	prompt := func(label, current string) (string, error) {
		if _, err := fmt.Fprintf(stdout, "%s [%s]: ", label, current); err != nil {
			return "", err
		}
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return "", err
		}
		if strings.TrimSpace(line) == "" {
			return current, nil
		}
		return strings.TrimSpace(line), nil
	}
	if action == "new" && role.ID == "" && !*asJSON {
		role.ID, err = prompt("角色 ID，例如 custom.writer", "")
		if err != nil {
			return err
		}
	}
	if *name != "" {
		role.Name = *name
	} else if !*asJSON && (action == "edit" || role.Name == "") {
		role.Name, err = prompt("角色名称", role.Name)
		if err != nil {
			return err
		}
	}
	if *identity != "" {
		role.Identity = *identity
	} else if !*asJSON && (action == "edit" || role.Identity == "") {
		role.Identity, err = prompt("角色提示词", role.Identity)
		if err != nil {
			return err
		}
	}
	data, err := json.Marshal(role)
	if err != nil {
		return err
	}
	validated, err := catalog.ParseRole(data)
	if err != nil {
		return err
	}
	if action == "new" {
		if _, err := catalog.Find(validated.ID); err == nil {
			return fmt.Errorf("角色 ID 已存在: %s", validated.ID)
		}
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	if !strings.HasSuffix(strings.ToLower(path), ".json") {
		data, err = yaml.Marshal(value)
		if err != nil {
			return err
		}
	}
	if action == "new" {
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(data)
		closeErr := file.Close()
		if writeErr != nil {
			return writeErr
		}
		if closeErr != nil {
			return closeErr
		}
	} else if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	return encode(map[string]any{"schema_version": 1, "path": path, "role": validated})
}

func readCard(path string, stdin io.Reader) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(stdin)
	}
	if path == "" {
		return nil, fmt.Errorf("需要明确的文件路径")
	}
	return os.ReadFile(path)
}
