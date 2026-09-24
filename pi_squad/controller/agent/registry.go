package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Registry is a SQLite-backed agent store. Status is derived from last_seen
// plus the configured heartbeat timeout so a process restart cannot leave
// stale "online" rows without a new heartbeat.
type Registry struct {
	mu       sync.Mutex
	watchers map[string]*InboxWatch
	db       *sql.DB
	timeout  time.Duration
	now      func() time.Time
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
	r.mu.Lock()
	defer r.mu.Unlock()
	for id := range r.watchers {
		r.closeWatchLocked(id)
	}
	return r.db.Close()
}

func (r *Registry) migrate() error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`CREATE TABLE IF NOT EXISTS agents (
 agent_id TEXT PRIMARY KEY, role TEXT NOT NULL, squad_id TEXT NOT NULL,
 runtime_type TEXT NOT NULL, herdr_session_id TEXT, space_id TEXT, pane_id TEXT,
 runtime_session_id TEXT, last_seen TEXT NOT NULL
 )`); err != nil {
		return err
	}
	rows, err := tx.Query(`PRAGMA table_info(agents)`)
	if err != nil {
		return err
	}
	columns := map[string]bool{}
	for rows.Next() {
		var cid, notNull, pk int
		var name, kind string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &kind, &notNull, &defaultValue, &pk); err != nil {
			rows.Close()
			return err
		}
		columns[name] = true
	}
	scanErr := rows.Err()
	rows.Close()
	if scanErr != nil {
		return scanErr
	}
	// Additive migration preserves existing identities; missing historical data stays NULL.
	for _, name := range []string{"cwd", "runtime_id", "role_description"} {
		if !columns[name] {
			if _, err := tx.Exec("ALTER TABLE agents ADD COLUMN " + name + " TEXT"); err != nil {
				return err
			}
		}
	}
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS owners (agent_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS revoked_runtimes (runtime_id TEXT PRIMARY KEY)`,
		`CREATE TABLE IF NOT EXISTS messages (message_id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, request_body TEXT NOT NULL, envelope TEXT NOT NULL, status TEXT NOT NULL)`,
	} {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *Registry) Upsert(ctx context.Context, req RegisterRequest) (Agent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var revoked int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM revoked_runtimes WHERE runtime_id = ?", req.RuntimeID).Scan(&revoked); err != nil {
		return Agent{}, err
	}
	if revoked != 0 {
		return Agent{}, fmt.Errorf("%w: runtime revoked", ErrConflict)
	}
	existing, err := r.getRaw(ctx, req.AgentID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Agent{}, err
	}
	if err == nil {
		if existing.RuntimeID != req.RuntimeID {
			return Agent{}, fmt.Errorf("%w: agent_id already owned; explicit release required", ErrConflict)
		}
		if err := r.checkToken(ctx, req.AgentID, req.RuntimeToken); err != nil {
			return Agent{}, err
		}
		if existing.RuntimeSessionID != req.RuntimeSessionID && existing.RuntimeSessionID != req.PreviousSessionID {
			return Agent{}, fmt.Errorf("%w: previous session does not match", ErrConflict)
		}
	}
	if err == nil {
		if existing.RuntimeSessionID != req.RuntimeSessionID {
			if err := r.invalidatePending(ctx, existing, "session_changed"); err != nil {
				return Agent{}, err
			}
		} else if r.withStatus(existing).Status == StatusOffline {
			if err := r.invalidatePending(ctx, existing, "offline"); err != nil {
				return Agent{}, err
			}
		}
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Agent{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "INSERT INTO owners(agent_id, token_hash) VALUES(?,?) ON CONFLICT(agent_id) DO NOTHING", req.AgentID, tokenHash(req.RuntimeToken)); err != nil {
		return Agent{}, err
	}
	now := r.now()
	_, err = tx.ExecContext(ctx, `
INSERT INTO agents (
  agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, cwd, runtime_id, role_description, last_seen
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_id) DO UPDATE SET
  role = excluded.role,
  squad_id = excluded.squad_id,
  runtime_type = excluded.runtime_type,
  herdr_session_id = excluded.herdr_session_id,
  space_id = excluded.space_id,
  pane_id = excluded.pane_id,
  runtime_session_id = excluded.runtime_session_id,
  cwd = excluded.cwd,
  runtime_id = excluded.runtime_id,
  role_description = excluded.role_description,
  last_seen = excluded.last_seen
`, req.AgentID, req.Role, req.SquadID, req.RuntimeType, nullIfEmpty(req.HerdrSessionID),
		nullIfEmpty(req.SpaceID), nullIfEmpty(req.PaneID), nullIfEmpty(req.RuntimeSessionID),
		nullIfEmpty(req.Cwd), nullIfEmpty(req.RuntimeID), nullIfEmpty(req.RoleDescription),
		now.Format(time.RFC3339Nano))
	if err != nil {
		return Agent{}, err
	}
	if err := tx.Commit(); err != nil {
		return Agent{}, err
	}
	if existing.RuntimeSessionID != req.RuntimeSessionID {
		r.closeWatchLocked(req.AgentID)
	}
	return r.Get(ctx, req.AgentID)
}

func (r *Registry) Heartbeat(ctx context.Context, req HeartbeatRequest) (Agent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	binding := Binding{AgentID: req.AgentID, RuntimeID: req.RuntimeID, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: req.RuntimeToken}
	a, err := r.checkBinding(ctx, binding, false)
	if err != nil {
		return Agent{}, err
	}
	if a.Status == StatusOffline {
		if err := r.invalidatePending(ctx, a, "offline"); err != nil {
			return Agent{}, err
		}
	}
	_, err = r.db.ExecContext(ctx, "UPDATE agents SET last_seen = ? WHERE agent_id = ?", r.now().Format(time.RFC3339Nano), req.AgentID)
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
SELECT agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, cwd, runtime_id, role_description, last_seen
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
SELECT agent_id, role, squad_id, runtime_type, herdr_session_id, space_id, pane_id, runtime_session_id, cwd, runtime_id, role_description, last_seen
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
		a                                                                     Agent
		herdr, space, pane, runtimeSession, cwd, runtimeID, description, seen sql.NullString
	)
	err := row.Scan(
		&a.AgentID, &a.Role, &a.SquadID, &a.RuntimeType,
		&herdr, &space, &pane, &runtimeSession, &cwd, &runtimeID, &description, &seen,
	)
	if err != nil {
		return Agent{}, err
	}
	a.HerdrSessionID = herdr.String
	a.SpaceID = space.String
	a.PaneID = pane.String
	a.RuntimeSessionID = runtimeSession.String
	a.Cwd = cwd.String
	a.RuntimeID = runtimeID.String
	a.RoleDescription = description.String
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
