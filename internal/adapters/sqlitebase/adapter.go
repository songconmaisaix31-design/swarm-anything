// Package sqlitebase 提供共用 SQLite 连接、备份与迁移。
//
// It uses database/sql with the modernc.org/sqlite pure-Go driver
// (no CGO). The adapter owns migration execution, connection
// management and repository implementations for each bounded context.
package sqlitebase

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite" // Pure-Go SQLite driver.
)

// DB wraps a database/sql.DB connection with migration support.
type DB struct {
	conn   *sql.DB
	dbPath string
}

// Open opens or creates the SQLite database at the given path.
// The caller must call Close when done.
func Open(dbPath string) (*DB, error) {
	// modernc.org/sqlite registers as "sqlite"
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)", dbPath)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %q: %w", dbPath, err)
	}

	// Single writer connection for SQLite.
	conn.SetMaxOpenConns(1)

	if err := conn.PingContext(context.Background()); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping sqlite %q: %w", dbPath, err)
	}

	return &DB{conn: conn, dbPath: dbPath}, nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.conn.Close()
}

// Conn returns the underlying database/sql.DB for use by repositories.
func (db *DB) Conn() *sql.DB {
	return db.conn
}

// backupPath returns the path to the backups directory (sibling to the DB file).
func (db *DB) backupPath() string {
	return filepath.Join(filepath.Dir(db.dbPath), "backups")
}

// hasExistingData checks if the database has any existing data (not a fresh creation).
func (db *DB) hasExistingData(ctx context.Context) (bool, error) {
	// Check if _migrations table has any records (not just exists).
	// A fresh DB will have the table created by ensureMigrationsTable but no rows.
	var count int
	err := db.conn.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM _migrations",
	).Scan(&count)
	if err != nil {
		// Table might not exist yet (before ensureMigrationsTable), treat as fresh.
		if strings.Contains(err.Error(), "no such table") {
			return false, nil
		}
		return false, fmt.Errorf("check migrations count: %w", err)
	}
	// If _migrations has records, DB is not fresh.
	return count > 0, nil
}

// CreateBackup creates a consistent snapshot of the database before migration.
// Uses SQLite's VACUUM INTO for a transactionally consistent copy.
// The backup is stored in the sibling backups directory with timestamp and schema version.
func (db *DB) CreateBackup(ctx context.Context) error {
	hasData, err := db.hasExistingData(ctx)
	if err != nil {
		return fmt.Errorf("check existing data: %w", err)
	}
	if !hasData {
		// Fresh database, no backup needed.
		return nil
	}

	// Get current schema version for metadata.
	schemaVersion, err := db.SchemaVersion(ctx)
	if err != nil {
		return fmt.Errorf("read schema version for backup: %w", err)
	}

	// Ensure backups directory exists.
	backupDir := db.backupPath()
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return fmt.Errorf("create backups dir: %w", err)
	}

	// Generate backup filename with timestamp (including microseconds) and schema version.
	now := time.Now().UTC()
	timestamp := now.Format("20060102_150405") + fmt.Sprintf("_%06d", now.Nanosecond()/1000)
	backupFile := fmt.Sprintf("backup_%s_v%d.sqlite", timestamp, schemaVersion)
	backupPath := filepath.Join(backupDir, backupFile)

	// Use VACUUM INTO for a consistent snapshot.
	// This creates a transactionally consistent copy of the database.
	_, err = db.conn.ExecContext(ctx, "VACUUM INTO ?", backupPath)
	if err != nil {
		return fmt.Errorf("create backup snapshot: %w", err)
	}

	return nil
}

// SchemaVersion returns the current foundation schema version.
func (db *DB) SchemaVersion(ctx context.Context) (int, error) {
	var version int
	err := db.conn.QueryRowContext(ctx,
		"SELECT version FROM foundation_schema WHERE context = 'foundation'",
	).Scan(&version)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		// Table may not exist yet (before first migration); return 0.
		if strings.Contains(err.Error(), "no such table") {
			return 0, nil
		}
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	return version, nil
}

// migrationFile represents a single migration file.
type migrationFile struct {
	id   string
	body string
}

// RunMigrations applies all pending migrations from the given filesystem.
// Before applying any pending migrations, creates a consistent backup of
// the existing database (per SPEC 14.3). Fresh databases skip backup.
// Migrations are applied atomically within transactions; if any
// migration fails, the startup must be aborted (the caller should
// treat the returned error as fatal).
func (db *DB) RunMigrations(ctx context.Context, migrationsFS fs.FS) error {
	// Read and sort migration files.
	entries, err := fs.ReadDir(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []migrationFile
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".sql")
		body, err := fs.ReadFile(migrationsFS, entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %q: %w", entry.Name(), err)
		}
		files = append(files, migrationFile{id: id, body: string(body)})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].id < files[j].id
	})

	// Ensure bookkeeping table exists before checking applied migrations.
	if err := db.ensureMigrationsTable(ctx); err != nil {
		return fmt.Errorf("ensure migrations table: %w", err)
	}

	applied, err := db.appliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("list applied migrations: %w", err)
	}

	// Check if there are pending migrations.
	hasPending := false
	for _, f := range files {
		if !applied[f.id] {
			hasPending = true
			break
		}
	}

	// Create backup before applying migrations (per SPEC 14.3).
	// Backup fails → startup aborts (no migrations applied).
	if hasPending {
		if err := db.CreateBackup(ctx); err != nil {
			return fmt.Errorf("pre-upgrade backup failed (startup aborted): %w", err)
		}
	}

	for _, f := range files {
		if applied[f.id] {
			continue
		}
		if err := db.applyMigration(ctx, f); err != nil {
			return fmt.Errorf("apply migration %q: %w", f.id, err)
		}
	}

	return nil
}

func (db *DB) ensureMigrationsTable(ctx context.Context) error {
	_, err := db.conn.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS _migrations (
			id         TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		)
	`)
	return err
}

func (db *DB) appliedMigrations(ctx context.Context) (map[string]bool, error) {
	rows, err := db.conn.QueryContext(ctx, "SELECT id FROM _migrations")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = true
	}
	return result, rows.Err()
}

func (db *DB) applyMigration(ctx context.Context, m migrationFile) error {
	tx, err := db.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	// Rollback on any error; commit only on full success.
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// Execute the migration body.
	if _, err = tx.ExecContext(ctx, m.body); err != nil {
		return fmt.Errorf("exec migration body: %w", err)
	}

	// Record the migration as applied (idempotent via INSERT OR IGNORE).
	if _, err = tx.ExecContext(ctx,
		"INSERT OR IGNORE INTO _migrations (id) VALUES (?)", m.id,
	); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit migration: %w", err)
	}

	return nil
}
