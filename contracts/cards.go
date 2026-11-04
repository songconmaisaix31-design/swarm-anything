package contracts

import "embed"

//go:embed role-card.schema.json handoff-card.schema.json examples/*.yaml
var CardSchemas embed.FS
