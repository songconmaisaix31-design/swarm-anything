// Package swastore 保存 SWA 项目、授权、原生 Run 关联与开发空间。
package swastore

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlitebase"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
)

// Transactions 让旧组装显式复用其原 Workspace 事务和数据库身份。
type Transactions interface {
	Connection(context.Context) (*sql.Conn, error)
	WithTransaction(context.Context, func(context.Context, *sql.Conn) error) error
}

type DB struct {
	*sqlitebase.DB
	conn         *sql.DB
	transactions Transactions
}

func Open(path string) (*DB, error) {
	base, err := sqlitebase.Open(path)
	if err != nil {
		return nil, err
	}
	return Attach(base, &transactions{db: base.Conn()})
}

func Attach(base *sqlitebase.DB, owner Transactions) (*DB, error) {
	if base == nil || owner == nil {
		return nil, errors.New("SWA storage requires its actual connection and transaction owner")
	}
	return &DB{DB: base, conn: base.Conn(), transactions: owner}, nil
}

func WorkspaceTransaction(ctx context.Context, db *DB) (*sql.Conn, error) {
	return db.transactions.Connection(ctx)
}

func conflict(message string) error {
	return &apierrors.ServiceError{Code: apierrors.VersionConflict, Message: message, RequiredAction: "reload_current_version"}
}
func storageError(err error) error {
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "constraint") {
		return conflict("storage uniqueness or version constraint")
	}
	return err
}
func requireVersion(version, expected int) error {
	if expected < 0 || version <= 0 || version != expected+1 {
		return conflict("saved aggregate version must advance exactly once")
	}
	return nil
}
func workspaceCAS(result sql.Result, err error) error {
	if err != nil {
		return storageError(err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return conflict("workspace version changed")
	}
	return nil
}
