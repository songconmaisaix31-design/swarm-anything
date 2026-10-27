-- Migration 001: Initial foundation tables for S0
-- Idempotent: uses IF NOT EXISTS for all objects

-- Migration bookkeeping table
CREATE TABLE IF NOT EXISTS _migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Schema version tracking per bounded context
CREATE TABLE IF NOT EXISTS foundation_schema (
    context     TEXT PRIMARY KEY,
    version     INTEGER NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Outbox for domain events (populated by future slices)
CREATE TABLE IF NOT EXISTS foundation_outbox (
    event_id        TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,
    schema_version  INTEGER NOT NULL,
    aggregate_id    TEXT NOT NULL,
    aggregate_version INTEGER NOT NULL,
    occurred_at     TEXT NOT NULL,
    correlation_id  TEXT,
    causation_id    TEXT,
    payload         TEXT NOT NULL,
    delivered       INTEGER NOT NULL DEFAULT 0
);

-- Idempotency keys for command deduplication
CREATE TABLE IF NOT EXISTS foundation_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    caller          TEXT NOT NULL,
    command_type    TEXT NOT NULL,
    request_digest  TEXT NOT NULL,
    result_code     TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Record this migration and the initial schema version
INSERT OR IGNORE INTO _migrations (id) VALUES ('001_initial');
INSERT OR IGNORE INTO foundation_schema (context, version) VALUES ('foundation', 1);
