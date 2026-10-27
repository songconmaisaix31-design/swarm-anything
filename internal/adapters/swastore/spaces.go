package swastore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type ProjectSpaceRepository struct{ db *DB }

func NewProjectSpaceRepository(db *DB) *ProjectSpaceRepository {
	return &ProjectSpaceRepository{db: db}
}

func (r *ProjectSpaceRepository) WithProjectSpaceTx(ctx context.Context, fn func(workspace.ProjectSpaceTx) error) error {
	return r.db.transactions.WithTransaction(ctx, func(current context.Context, conn *sql.Conn) error {
		return fn(NewSpaceTransaction(current, conn))
	})
}

// 旧产品的跨上下文事务以已核实的同一连接显式复用唯一空间写入。
func NewSpaceTransaction(ctx context.Context, conn *sql.Conn) workspace.ProjectSpaceTx {
	return &projectSpaceTransaction{ctx: ctx, conn: conn}
}

type projectSpaceTransaction struct {
	ctx  context.Context
	conn *sql.Conn
}

func (t *projectSpaceTransaction) ListProjectSpaces() ([]domain.ProjectSpace, error) {
	rows, err := t.conn.QueryContext(t.ctx, "SELECT data FROM attention_project_spaces ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	spaces := []domain.ProjectSpace{}
	for rows.Next() {
		var data string
		var space domain.ProjectSpace
		if err = rows.Scan(&data); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(data), &space); err != nil {
			return nil, err
		}
		spaces = append(spaces, space)
	}
	return spaces, rows.Err()
}

func (t *projectSpaceTransaction) LoadProjectSpace(id string) (space domain.ProjectSpace, err error) {
	var data string
	err = t.conn.QueryRowContext(t.ctx, "SELECT data FROM attention_project_spaces WHERE id=?", id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return space, apierrors.NewNotFound("project space", id)
	}
	if err != nil {
		return space, err
	}
	err = json.Unmarshal([]byte(data), &space)
	return space, err
}

func (t *projectSpaceTransaction) SaveProjectSpace(space domain.ProjectSpace, expected int) error {
	if err := requireVersion(space.Version, expected); err != nil {
		return err
	}
	data, err := json.Marshal(space)
	if err != nil {
		return err
	}
	var result sql.Result
	if expected == 0 {
		result, err = t.conn.ExecContext(t.ctx, "INSERT INTO attention_project_spaces(id,version,data) VALUES(?,?,?)", space.ID, space.Version, string(data))
	} else {
		result, err = t.conn.ExecContext(t.ctx, "UPDATE attention_project_spaces SET version=?,data=? WHERE id=? AND version=?", space.Version, string(data), space.ID, expected)
	}
	return workspaceCAS(result, err)
}

func (t *projectSpaceTransaction) LoadProjectSpaceReceipt(caller, command, key string) (receipt workspace.WorkspaceReceipt, err error) {
	var result string
	err = t.conn.QueryRowContext(t.ctx, "SELECT digest,result FROM attention_receipts WHERE caller=? AND command=? AND key=?", caller, command, key).Scan(&receipt.Digest, &result)
	if errors.Is(err, sql.ErrNoRows) {
		return receipt, apierrors.NewNotFound("receipt", key)
	}
	receipt.Result = json.RawMessage(result)
	return receipt, err
}

func (t *projectSpaceTransaction) SaveProjectSpaceReceipt(caller, command, key string, receipt workspace.WorkspaceReceipt) error {
	if !json.Valid(receipt.Result) {
		return errors.New("receipt must contain a complete JSON result")
	}
	_, err := t.conn.ExecContext(t.ctx, "INSERT INTO attention_receipts(caller,command,key,digest,result) VALUES(?,?,?,?,?) ON CONFLICT(caller,command,key) DO NOTHING", caller, command, key, receipt.Digest, string(receipt.Result))
	if err != nil {
		return storageError(err)
	}
	stored, err := t.LoadProjectSpaceReceipt(caller, command, key)
	if err != nil {
		return err
	}
	if stored.Digest != receipt.Digest || string(stored.Result) != string(receipt.Result) {
		return conflict("idempotency key binds a different input or result")
	}
	return nil
}

func (t *projectSpaceTransaction) AppendProjectSpaceEvent(event workspace.WorkspaceEvent) error {
	_, err := t.conn.ExecContext(t.ctx, "INSERT INTO attention_outbox(id,type,aggregate_id,aggregate_version,occurred_at,correlation_id,causation_id,payload) VALUES(?,?,?,?,?,?,?,?)", event.ID, event.Type, event.AggregateID, event.AggregateVersion, event.OccurredAt.UTC().Format(time.RFC3339Nano), event.CorrelationID, event.CausationID, string(event.Payload))
	return storageError(err)
}
