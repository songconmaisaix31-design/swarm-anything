package swastore

import (
	"context"
	"database/sql"
	"errors"
)

type transactionKey struct{}
type transaction struct {
	db   *sql.DB
	conn *sql.Conn
}
type transactions struct{ db *sql.DB }

func (owner *transactions) Connection(ctx context.Context) (*sql.Conn, error) {
	current, ok := ctx.Value(transactionKey{}).(*transaction)
	if !ok {
		return nil, nil
	}
	if current.db != owner.db {
		return nil, errors.New("SWA transaction belongs to another database")
	}
	return current.conn, nil
}

func (owner *transactions) WithTransaction(ctx context.Context, fn func(context.Context, *sql.Conn) error) (resultErr error) {
	current, err := owner.Connection(ctx)
	if err != nil {
		return err
	}
	if current != nil {
		return fn(ctx, current)
	}
	conn, err := owner.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer func() { resultErr = errors.Join(resultErr, conn.Close()) }()
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return err
	}
	currentContext := context.WithValue(ctx, transactionKey{}, &transaction{db: owner.db, conn: conn})
	if err := fn(currentContext, conn); err != nil {
		_, rollback := conn.ExecContext(context.WithoutCancel(ctx), "ROLLBACK")
		return errors.Join(err, rollback)
	}
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		_, rollback := conn.ExecContext(context.WithoutCancel(ctx), "ROLLBACK")
		return errors.Join(err, rollback)
	}
	return nil
}
