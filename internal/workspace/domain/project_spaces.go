package domain

import "time"

// 空间归 Workspace；资料引用保留原始定位信息，由显式资料集成校验。
type ProjectSpaceReference struct {
	MaterialID string  `json:"material_id"`
	Revision   int     `json:"revision"`
	Locator    string  `json:"locator"`
	Span       *string `json:"span,omitempty"`
}

type ProjectSpace struct {
	ID           string                  `json:"id"`
	Version      int                     `json:"version"`
	Title        string                  `json:"title"`
	MaterialRefs []ProjectSpaceReference `json:"material_refs"`
	CreatedAt    time.Time               `json:"created_at"`
}
