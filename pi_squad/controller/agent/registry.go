package agent

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Registry is a SQLite-backed agent store. Status is derived from last_seen
// plus the configured heartbeat timeout so a process restart cannot leave
// stale "online" rows without a new heartbeat.
type Registry struct {
	db      *sql.DB
	timeout time.Duration
	now     func() time.Time
}

func OpenRegistry(dbPath string, timeout time.Duration) (*Registry, error) {
	if timeout <= 0 {
		return nil, fmt.Errorf("heartbeat timeout must be positive")
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("pragma: %w", err)
	}
	r := &Registry{db: db, timeout: timeout, now: func() time.Time { return time.Now().UTC() }}
	if err := r.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return r, nil
}

func (r *Registry) Close() error {
	return r.db.Close()
}

func (r *Registry) migrate() error {
	_, err := r.db.Exec(`
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  squad_id TEXT NOT NULL,
  runtime_type TEXT NOT NULL,
  herdr_session_id TEXT,
  space_id TEXT,
  pane_id TEXT,
  runtime_session_id TEXT,
  last_seen TEXT NOT NULL
);
`)
	return err
}

func (r *Registry) Upsert(ctx context.Context, req RegisterRequest) (Agent, error) {
	now := r.now()
	_, err := r.db.ExecContext(ctx, `
INSERT INTO agents (
  agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, last_seen
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_id) DO UPDATE SET
  role = excluded.role,
  squad_id = excluded.squad_id,
  runtime_type = excluded.runtime_type,
  herdr_session_id = excluded.herdr_session_id,
  space_id = excluded.space_id,
  pane_id = excluded.pane_id,
  runtime_session_id = excluded.runtime_session_id,
  last_seen = excluded.last_seen
`, req.AgentID, req.Role, req.SquadID, req.RuntimeType, nullIfEmpty(req.HerdrSessionID),
		nullIfEmpty(req.SpaceID), nullIfEmpty(req.PaneID), nullIfEmpty(req.RuntimeSessionID),
		now.Format(time.RFC3339Nano))
	if err != nil {
		return Agent{}, err
	}
	return r.Get(ctx, req.AgentID)
}

func (r *Registry) Heartbeat(ctx context.Context, req HeartbeatRequest) (Agent, error) {
	existing, err := r.getRaw(ctx, req.AgentID)
	if err != nil {
		return Agent{}, err
	}
	now := r.now()
	sessionID := existing.RuntimeSessionID
	if strings.TrimSpace(req.RuntimeSessionID) != "" {
		sessionID = strings.TrimSpace(req.RuntimeSessionID)
	}
	_, err = r.db.ExecContext(ctx, `
UPDATE agents SET last_seen = ?, runtime_session_id = ? WHERE agent_id = ?
`, now.Format(time.RFC3339Nano), nullIfEmpty(sessionID), req.AgentID)
	if err != nil {
		return Agent{}, err
	}
	return r.Get(ctx, req.AgentID)
}

func (r *Registry) Get(ctx context.Context, agentID string) (Agent, error) {
	a, err := r.getRaw(ctx, agentID)
	if err != nil {
		return Agent{}, err
	}
	return r.withStatus(a), nil
}

func (r *Registry) List(ctx context.Context, filter ListFilter) ([]Agent, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, last_seen
FROM agents
ORDER BY agent_id
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Agent
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		a = r.withStatus(a)
		if !matchFilter(a, filter) {
			continue
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Registry) getRaw(ctx context.Context, agentID string) (Agent, error) {
	row := r.db.QueryRowContext(ctx, `
SELECT agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, last_seen
FROM agents WHERE agent_id = ?
`, agentID)
	a, err := scanAgent(row)
	if err == sql.ErrNoRows {
		return Agent{}, ErrNotFound
	}
	return a, err
}

func (r *Registry) withStatus(a Agent) Agent {
	if r.now().Sub(a.LastSeen) > r.timeout {
		a.Status = StatusOffline
		return a
	}
	a.Status = StatusOnline
	return a
}

func matchFilter(a Agent, f ListFilter) bool {
	if f.AgentID != "" && a.AgentID != f.AgentID {
		return false
	}
	if f.Role != "" && a.Role != f.Role {
		return false
	}
	if f.SquadID != "" && a.SquadID != f.SquadID {
		return false
	}
	if f.Status != "" && a.Status != f.Status {
		return false
	}
	return true
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanAgent(row rowScanner) (Agent, error) {
	var (
		a                                        Agent
		herdr, space, pane, runtimeSession, seen sql.NullString
	)
	err := row.Scan(
		&a.AgentID, &a.Role, &a.SquadID, &a.RuntimeType,
		&herdr, &space, &pane, &runtimeSession, &seen,
	)
	if err != nil {
		return Agent{}, err
	}
	a.HerdrSessionID = herdr.String
	a.SpaceID = space.String
	a.PaneID = pane.String
	a.RuntimeSessionID = runtimeSession.String
	if seen.Valid {
		t, parseErr := time.Parse(time.RFC3339Nano, seen.String)
		if parseErr != nil {
			t, parseErr = time.Parse(time.RFC3339, seen.String)
		}
		if parseErr != nil {
			return Agent{}, fmt.Errorf("parse last_seen: %w", parseErr)
		}
		a.LastSeen = t.UTC()
	}
	return a, nil
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
