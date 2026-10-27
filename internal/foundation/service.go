// Package foundation 提供 S0 健康检查与基础能力状态。
package foundation

import "context"

// SchemaVersion 是 S0 响应版本。
const SchemaVersion = 1

// HealthResponse 是健康检查响应。
type HealthResponse struct {
	SchemaVersion int    `json:"schema_version"`
	Status        string `json:"status"`
	Service       string `json:"service"`
}

// FoundationResponse 描述当前基础能力。
type FoundationResponse struct {
	SchemaVersion int          `json:"schema_version"`
	Stage         string       `json:"stage"`
	Capabilities  Capabilities `json:"capabilities"`
	Storage       StorageInfo  `json:"storage"`
	Fixture       bool         `json:"fixture"`
}

// Capabilities 列出启用的功能。
type Capabilities struct {
	Imports      bool `json:"imports"`
	Approvals    bool `json:"approvals"`
	Execution    bool `json:"execution"`
	NativeResume bool `json:"native_resume"`
	Handoff      bool `json:"handoff"`
}

// StorageInfo 描述存储。
type StorageInfo struct {
	Engine        string `json:"engine"`
	SchemaVersion int    `json:"schema_version"`
}

// Service 提供基础状态接口。
type Service interface {
	Health(ctx context.Context) (HealthResponse, error)
	Foundation(ctx context.Context) (FoundationResponse, error)
}

type service struct {
	storageSchemaVersion int
	attention            bool
	swa                  bool
	execution            bool
}

// NewService 创建 S0 服务。
func NewService(storageSchemaVersion int) Service {
	return &service{storageSchemaVersion: storageSchemaVersion}
}

// NewAttentionService 报告已经组装的 S1 导入能力。
func NewAttentionService(storageSchemaVersion int) Service {
	return &service{storageSchemaVersion: storageSchemaVersion, attention: true}
}

// NewSWAService 描述独立 SWA 当前组装；具体 Agent 能力由项目查询提供。
func NewSWAService(storageSchemaVersion int, execution bool) Service {
	return &service{storageSchemaVersion: storageSchemaVersion, swa: true, execution: execution}
}

func (s *service) Health(ctx context.Context) (HealthResponse, error) {
	if err := ctx.Err(); err != nil {
		return HealthResponse{}, err
	}
	return HealthResponse{
		SchemaVersion: SchemaVersion,
		Status:        "ok",
		Service:       "astrocyte",
	}, nil
}

func (s *service) Foundation(ctx context.Context) (FoundationResponse, error) {
	if err := ctx.Err(); err != nil {
		return FoundationResponse{}, err
	}
	stage := "S0"
	if s.attention {
		stage = "S1"
	}
	if s.swa {
		stage = "SWA"
	}
	return FoundationResponse{
		SchemaVersion: SchemaVersion,
		Stage:         stage,
		Capabilities: Capabilities{
			Imports:      s.attention,
			Approvals:    false,
			Execution:    s.execution,
			NativeResume: false,
			Handoff:      false,
		},
		Storage: StorageInfo{
			Engine:        "sqlite",
			SchemaVersion: s.storageSchemaVersion,
		},
		Fixture: false,
	}, nil
}
