-- Migration 002: Fix foundation_idempotency table per SPEC §12.6
-- Uses caller+command_type+idempotency_key composite PK instead of single key.
-- Preserves existing records via transactional rename pattern.

-- Step 1: Create new table with correct composite PK
CREATE TABLE IF NOT EXISTS foundation_idempotency_new (
    caller          TEXT NOT NULL,
    command_type    TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_digest  TEXT NOT NULL,
    result_code     TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (caller, command_type, idempotency_key)
);

-- Step 2: Copy existing records (if any) into the new table.
-- The old table uses idempotency_key as PK; the new one uses composite PK,
-- so all existing rows are valid under the new schema.
INSERT OR IGNORE INTO foundation_idempotency_new
    (caller, command_type, idempotency_key, request_digest, result_code, created_at)
    SELECT caller, command_type, idempotency_key, request_digest, result_code, created_at
    FROM foundation_idempotency;

-- Step 3: Drop old table and rename new one into place.
DROP TABLE IF EXISTS foundation_idempotency;
ALTER TABLE foundation_idempotency_new RENAME TO foundation_idempotency;

-- Record this migration
INSERT OR IGNORE INTO _migrations (id) VALUES ('002_idempotency_fix');
