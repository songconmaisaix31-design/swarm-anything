package roles

import "embed"

//go:embed builtin/*.yaml examples/*.yaml
var Files embed.FS
