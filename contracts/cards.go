package contracts

import "embed"

//go:embed role-card.schema.json handoff-card.schema.json
var CardSchemas embed.FS
