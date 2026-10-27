-- 原表名称、完整引用和回执继续由 Workspace 单一实现拥有。
CREATE TABLE IF NOT EXISTS attention_project_spaces (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK(version > 0),
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attention_receipts (
    caller TEXT NOT NULL, command TEXT NOT NULL, key TEXT NOT NULL,
    digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(caller, command, key)
);
CREATE TABLE IF NOT EXISTS attention_outbox (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
    aggregate_version INTEGER NOT NULL, occurred_at TEXT NOT NULL,
    correlation_id TEXT NOT NULL, causation_id TEXT NOT NULL, payload TEXT NOT NULL
);
INSERT OR IGNORE INTO foundation_schema(context, version) VALUES ('workspace', 2);
