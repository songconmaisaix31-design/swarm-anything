package app

import (
	"context"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// InventoryProvider 返回 CLI 观察缓存；Snapshot 不执行命令或读取凭据及会话目录。
type InventoryProvider interface {
	Snapshot(ctx context.Context) ([]domain.LocalAgent, error)
}

// 查询只返回 Registry 已有的实际观察；安装信息独立来自 PATH。
type NativeRegistryObservations interface {
	SnapshotNative(context.Context) ([]domain.LocalAgent, error)
}

// LocalAgentInventory 查询安装与能力观察，不授予原生控制或私有状态读取权限。
type LocalAgentInventory interface {
	ListLocalAgents(ctx context.Context) (apierrors.ListResult, error)
}

type LocalProjectRepository interface {
	ListProjects(context.Context) ([]domain.LocalProject, error)
	LoadProject(context.Context, string) (domain.LocalProject, error)
	SaveProject(context.Context, domain.LocalProject, int) error
	LoadGrant(context.Context, string, string) (domain.ProjectGrant, error)
	SaveGrant(context.Context, domain.ProjectGrant) error
	ListSessions(context.Context, string) ([]domain.NativeSession, error)
	LoadSession(context.Context, string) (domain.NativeSession, error)
	SaveSession(context.Context, domain.NativeSession) error
}

// 引用经入口桥接从 Attention 读取；每次调用检查访问权限和当前空间成员关系。
type ProjectReferences interface {
	ReadSelected(context.Context, domain.Caller, string, domain.FixedReference, bool) (domain.ContextMaterial, error)
	Linked(context.Context, domain.Caller, string, domain.FixedReference) ([]domain.FixedReference, error)
}
type NativeAdapter interface {
	ID() string
	Version() string
	Capabilities() map[string]domain.CapabilityObservation
	Discover(context.Context, domain.LocalProject) ([]domain.NativeSession, error)
	ReadContext(context.Context, domain.NativeSession) ([]domain.NativeEvent, error)
	Start(context.Context, domain.NativeRequest) (domain.NativeSession, error)
	Resume(context.Context, domain.NativeRequest) (domain.NativeSession, error)
	Send(context.Context, domain.NativeSession, string) (domain.NativeObservation, error)
	Stop(context.Context, domain.NativeSession) (domain.NativeObservation, error)
	Observe(context.Context, domain.NativeSession) (domain.NativeObservation, error)
}
type NativeRegistry interface {
	Adapter(string) (NativeAdapter, error)
	List() []string
}

// ExternalCLIRegistry 只核实真实执行注册，不授予账号、工具或模型权限。
type ExternalCLIRegistry interface {
	ValidateExternalCLI(context.Context, string) error
}
type ProjectFiles interface {
	CanonicalRoot(string) (string, error)
	ValidateProjectPath(string, string) (string, error)
	ReadProjectFiles(context.Context, domain.LocalProject, []string) ([]domain.ContextFile, error)
	DiscoverProjects(context.Context, string) ([]domain.ProjectCandidate, error)
}

// RegisteredProjectSource 通过固定程序观察已注册目录；HTTP GET 使用持久化结果。
type RegisteredProjectSource interface {
	DiscoverRegistered(context.Context) (domain.ProjectDiscoverySnapshot, error)
}

type RegisteredProjectRepository interface {
	LoadRegisteredProjectDiscovery(context.Context) (domain.ProjectDiscoverySnapshot, error)
	SaveRegisteredProjectDiscovery(context.Context, domain.ProjectDiscoverySnapshot) error
}

// 人工注释独立保存；新增时 expectedRevision 为零，保存使用 CAS。
type RegisteredProjectMetadataRepository interface {
	LoadProjectMetadata(context.Context, string) (domain.ProjectHumanMetadata, error)
	SaveProjectMetadata(context.Context, string, domain.ProjectHumanMetadata, int) error
}

// 注释能力与发现能力分离，调用主体来自已认证的人工会话。
type RegisteredProjectMetadata interface {
	SetRegisteredProjectMetadata(context.Context, domain.Caller, string, domain.ProjectHumanMetadata) (domain.ProjectSummary, error)
}

// 项目发现与控制分离；仅人工可刷新，发现操作不更改空间或授权。
type RegisteredProjects interface {
	ListRegisteredProjects(context.Context, domain.Caller) (domain.ProjectDiscoverySnapshot, error)
	RefreshRegisteredProjects(context.Context, domain.Caller) (domain.ProjectDiscoverySnapshot, error)
}
type TextProcessor interface {
	ConfigurationID(context.Context, string) (string, error)
	ProcessSelectedText(context.Context, domain.TextRequest) (domain.TextResult, error)
}

// LocalProjects 与 S0 项目展示分离，原生目录不充当执行或环境身份。
type LocalProjects interface {
	ProbeNativeCLI(context.Context, domain.Caller, string, string) (domain.NativeSession, error)
	CheckProjectModel(context.Context, domain.Caller, string, string) (domain.LocalProject, error)
	Shutdown(context.Context) error
	ListProjects(context.Context, domain.Caller) ([]domain.LocalProject, error)
	DiscoverProjects(context.Context, domain.Caller, string) ([]domain.ProjectCandidate, error)
	RegisterProject(context.Context, domain.Caller, domain.RegisterProjectCommand) (domain.LocalProject, error)
	SetProjectSettings(context.Context, domain.Caller, string, domain.SettingsCommand) (domain.LocalProject, error)
	GrantProjectAgent(context.Context, domain.Caller, string, domain.ProjectGrant) (domain.ProjectGrant, error)
	RevokeProjectAgent(context.Context, domain.Caller, string, string) (domain.ProjectGrant, error)
	IssueProjectAgentToken(context.Context, domain.Caller, string, string) (domain.AgentToken, error)
	ReadProjectContext(context.Context, domain.Caller, string, domain.ContextRequest) (domain.ContextPacket, error)
	ListNativeSessions(context.Context, domain.Caller, string) ([]domain.NativeSession, error)
	DiscoverNativeSessions(context.Context, domain.Caller, string, string) ([]domain.NativeSession, error)
	ReadNativeContext(context.Context, domain.Caller, string, string) ([]domain.NativeEvent, error)
	StartNativeSession(context.Context, domain.Caller, string, domain.NativeCommand) (domain.NativeSession, error)
	ResumeNativeSession(context.Context, domain.Caller, string, string, domain.NativeCommand) (domain.NativeSession, error)
	SendNativeMessage(context.Context, domain.Caller, string, string, string) (domain.NativeObservation, error)
	StopNativeSession(context.Context, domain.Caller, string, string) (domain.NativeObservation, error)
	ObserveNativeSession(context.Context, domain.Caller, string, string) (domain.NativeObservation, error)
}

// ScopedAgentTokens 认证已有人工授权的项目主体，每次验证重新读取当前 Grant。
type ScopedAgentTokens interface {
	AuthenticateAgentToken(context.Context, string) (domain.Caller, error)
}

// 公开仓库观察不授予代码访问或 Agent 权限；GET 读取持久化缓存。
// 仅人工命令同步元数据，或放入已有顶层空间并触发受管理的 clone。
type GitHubRepositoryStore interface {
	ListGitHubRepositories(context.Context) ([]domain.GitHubRepository, error)
	LoadGitHubRepository(context.Context, string) (domain.GitHubRepository, error)
	SaveGitHubRepository(context.Context, domain.GitHubRepository, int) error
}

type PublicGitHubSource interface {
	FetchPublicRepositories(context.Context, string) ([]domain.GitHubMetadata, error)
}

type RepositoryCloner interface {
	CloneRepository(context.Context, string, string) (domain.RepositoryClone, error)
}

type RepositorySpaces interface {
	ValidateRepositorySpace(context.Context, domain.Caller, string) error
}

type GitHubRepositories interface {
	ListGitHubRepositories(context.Context, domain.Caller) ([]domain.GitHubRepository, error)
	SyncGitHubRepositories(context.Context, domain.Caller, domain.RepositorySyncCommand) ([]domain.GitHubRepository, error)
	PlaceGitHubRepository(context.Context, domain.Caller, string, domain.RepositoryPlacementCommand) (domain.GitHubRepository, error)
}
