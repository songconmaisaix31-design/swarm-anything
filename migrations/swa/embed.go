// Package swa 提供独立 SWA 服务的实际存储迁移。
package swa

import "embed"

//go:embed *.sql
var FS embed.FS
