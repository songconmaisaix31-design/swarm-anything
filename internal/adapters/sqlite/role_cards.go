package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
)

func (r *SwarmRepository) ListRoleCards(ctx context.Context) ([]swarmapp.RoleCardRecord, error) {
	executor, err := r.executor(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := executor.QueryContext(ctx, "SELECT data FROM swarm_role_cards ORDER BY id")
	if err != nil {
		return nil, err
	}
	return swarmRows[swarmapp.RoleCardRecord](rows)
}

func (r *SwarmRepository) LoadRoleCard(ctx context.Context, id string) (swarmapp.RoleCardRecord, bool, error) {
	executor, err := r.executor(ctx)
	if err != nil {
		return swarmapp.RoleCardRecord{}, false, err
	}
	return loadRoleCard(ctx, executor, id)
}

func (r *SwarmRepository) WithinRoleCards(ctx context.Context, fn func(swarmapp.RoleCardTransaction) error) error {
	return r.Within(ctx, func(tx swarmapp.Transaction) error {
		return fn(tx.(*swarmTransaction))
	})
}

func (t *swarmTransaction) LoadRoleCard(id string) (swarmapp.RoleCardRecord, bool, error) {
	return loadRoleCard(t.ctx, t.exec, id)
}

func loadRoleCard(ctx context.Context, executor SwarmSQLExecutor, id string) (swarmapp.RoleCardRecord, bool, error) {
	var record swarmapp.RoleCardRecord
	var data string
	err := executor.QueryRowContext(ctx, "SELECT data FROM swarm_role_cards WHERE id=?", id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return record, false, nil
	}
	if err != nil {
		return record, false, err
	}
	if err := json.Unmarshal([]byte(data), &record); err != nil {
		return record, false, err
	}
	return record, true, nil
}

func (t *swarmTransaction) SaveRoleCard(record swarmapp.RoleCardRecord, expected int) error {
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if expected == 0 {
		return swarmCAS(t.exec.ExecContext(t.ctx, "INSERT INTO swarm_role_cards(id,version,data) VALUES(?,?,?)", record.Role.ID, record.Version, string(data)))
	}
	return swarmCAS(t.exec.ExecContext(t.ctx, "UPDATE swarm_role_cards SET version=?,data=? WHERE id=? AND version=?", record.Version, string(data), record.Role.ID, expected))
}
