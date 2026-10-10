package task

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
)

// Store shares the Registry connection. No client or observer opens this store.
type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }
func (s *Store) Migrate(ctx context.Context) error {
	if err := fault.Point("transaction_before_begin"); err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS controller_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL, queue_seq INTEGER NOT NULL, fencing INTEGER NOT NULL)`,
		`INSERT OR IGNORE INTO controller_state VALUES(1,0,0,0)`,
		`CREATE TABLE IF NOT EXISTS config_snapshots(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,content TEXT NOT NULL,PRIMARY KEY(kind,id,version))`,
		`CREATE TABLE IF NOT EXISTS instances(agent_id TEXT PRIMARY KEY,mode TEXT NOT NULL,role_id TEXT,team_id TEXT,runtime_id TEXT NOT NULL,session_id TEXT NOT NULL,binding_epoch INTEGER NOT NULL,token_hash TEXT NOT NULL,last_seen TEXT NOT NULL,activity TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,body TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS leader_bindings(team_id TEXT PRIMARY KEY,agent_id TEXT,runtime_id TEXT,epoch INTEGER NOT NULL,revision INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS primary_bindings(role_id TEXT PRIMARY KEY,agent_id TEXT,epoch INTEGER NOT NULL,revision INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS binding_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,entity_id TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS runs(run_id TEXT PRIMARY KEY,team_id TEXT NOT NULL,queue_seq INTEGER UNIQUE NOT NULL,admitted INTEGER NOT NULL,cleanup TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS one_active_team ON runs(team_id) WHERE admitted=1 AND cleanup!='released'`,
		`CREATE TABLE IF NOT EXISTS role_ownership(role_id TEXT PRIMARY KEY,team_id TEXT NOT NULL,run_id TEXT NOT NULL,revision INTEGER NOT NULL,acquired_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS tasks(task_id TEXT PRIMARY KEY,run_id TEXT,parent_id TEXT,root_id TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS attempts(attempt_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,agent_id TEXT NOT NULL,state TEXT NOT NULL,cleanup TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS one_agent_attempt ON attempts(agent_id) WHERE cleanup!='released'`,
		`CREATE TABLE IF NOT EXISTS agent_reservations(agent_id TEXT PRIMARY KEY,attempt_id TEXT UNIQUE NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS execution_leases(attempt_id TEXT PRIMARY KEY,agent_id TEXT UNIQUE NOT NULL,team_id TEXT,segment_id INTEGER NOT NULL,fencing INTEGER UNIQUE NOT NULL,expires_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS write_reservations(path TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,fencing INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS wait_edges(waiter TEXT NOT NULL,resource TEXT NOT NULL,owner TEXT NOT NULL,revision INTEGER NOT NULL,reason TEXT NOT NULL,since TEXT NOT NULL,PRIMARY KEY(waiter,resource,owner))`,
		`CREATE TABLE IF NOT EXISTS attempt_evidence(seq INTEGER PRIMARY KEY AUTOINCREMENT,attempt_id TEXT NOT NULL,source TEXT NOT NULL,disposition TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS result_history(task_id TEXT NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(task_id,revision))`,
		`CREATE TABLE IF NOT EXISTS acceptance_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,body TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS idempotency(source TEXT NOT NULL,operation TEXT NOT NULL,request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,entity_id TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(source,operation,request_id))`,
		`CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL,server_time TEXT NOT NULL,details TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS outbox(event_seq INTEGER PRIMARY KEY REFERENCES events(seq),published INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS clarifications(id TEXT PRIMARY KEY,child_attempt TEXT NOT NULL,parent_attempt TEXT NOT NULL,question TEXT NOT NULL,root_id TEXT NOT NULL,answer TEXT NOT NULL,state TEXT NOT NULL)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS one_child_clarification ON clarifications(child_attempt) WHERE state!='answered'`,
		`CREATE TABLE IF NOT EXISTS recovery_actions(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,body TEXT NOT NULL,at TEXT NOT NULL)`,
	} {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations VALUES(2,?)`, fault.Now().Format(time.RFC3339Nano)); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) Transaction(ctx context.Context, fn func(*sql.Tx) error) error {
	if err := fault.Point("transaction_before_begin"); err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	if err := fault.Point("transaction_before_commit"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return fault.Point("transaction_after_commit")
}
func EventTx(tx *sql.Tx, kind, id string, revision int64, details any) error {
	b, err := json.Marshal(details)
	if err != nil {
		return err
	}
	r, err := tx.Exec(`INSERT INTO events(type,entity_id,revision,server_time,details) VALUES(?,?,?,?,?)`, kind, id, revision, fault.Now().Format(time.RFC3339Nano), string(b))
	if err != nil {
		return err
	}
	seq, err := r.LastInsertId()
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO outbox(event_seq) VALUES(?)`, seq)
	return err
}
func LoadRun(tx *sql.Tx, id string) (Run, error) {
	var r Run
	var b string
	err := tx.QueryRow(`SELECT body FROM runs WHERE run_id=?`, id).Scan(&b)
	if err != nil {
		return r, err
	}
	err = json.Unmarshal([]byte(b), &r)
	return r, err
}
func SaveRun(tx *sql.Tx, r Run) error {
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO runs VALUES(?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET admitted=excluded.admitted,cleanup=excluded.cleanup,revision=excluded.revision,body=excluded.body`, r.ID, r.TeamID, r.QueueSeq, r.Admitted, r.Cleanup, r.Revision, string(b))
	return err
}
func LoadTask(tx *sql.Tx, id string) (Contract, error) {
	var c Contract
	var b string
	err := tx.QueryRow(`SELECT body FROM tasks WHERE task_id=?`, id).Scan(&b)
	if err != nil {
		return c, err
	}
	err = json.Unmarshal([]byte(b), &c)
	return c, err
}
func SaveTask(tx *sql.Tx, c Contract) error {
	if err := fault.Point("task_before_persist"); err != nil {
		return err
	}
	if err := ValidateContract(c); err != nil {
		return err
	}
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO tasks VALUES(?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,body=excluded.body`, c.ID, c.RunID, c.ParentID, c.RootID, c.State, c.Revision, string(b))
	if err != nil {
		return err
	}
	return fault.Point("task_after_persist")
}
func LoadAttempt(tx *sql.Tx, id string) (Attempt, error) {
	var a Attempt
	var b string
	err := tx.QueryRow(`SELECT body FROM attempts WHERE attempt_id=?`, id).Scan(&b)
	if err != nil {
		return a, err
	}
	err = json.Unmarshal([]byte(b), &a)
	return a, err
}
func SaveAttempt(tx *sql.Tx, a Attempt) error {
	b, err := json.Marshal(a)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO attempts VALUES(?,?,?,?,?,?,?) ON CONFLICT(attempt_id) DO UPDATE SET state=excluded.state,cleanup=excluded.cleanup,revision=excluded.revision,body=excluded.body`, a.ID, a.TaskID, a.Target.AgentID, a.State, a.Cleanup, a.Revision, string(b))
	return err
}
func CAS(actual, expected int64) error {
	if expected < 1 || actual != expected {
		return Reject("REVISION_CONFLICT", fmt.Sprintf("expected %d, current %d", expected, actual))
	}
	return nil
}
func (s *Store) FreezeConfig(ctx context.Context, snapshot project.Snapshot) error {
	return s.Transaction(ctx, func(tx *sql.Tx) error { return FreezeConfigTx(tx, snapshot) })
}
func FreezeConfigTx(tx *sql.Tx, snapshot project.Snapshot) error {
	// Role definitions have content hashes rather than user-supplied versions.
	// Retain immutable revisions for discovery without manufacturing a Primary
	// binding: the first real registration must still win that binding atomically.
	for id, role := range snapshot.Roles {
		b, err := json.Marshal(role)
		if err != nil {
			return err
		}
		hash := project.Hash(b)
		var previous string
		var version int64
		err = tx.QueryRow(`SELECT version,hash FROM config_snapshots WHERE kind='role' AND id=? ORDER BY version DESC LIMIT 1`, id).Scan(&version, &previous)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if previous == hash {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO config_snapshots VALUES('role',?,?,?,?)`, id, version+1, hash, string(b)); err != nil {
			return err
		}
	}
	for id, t := range snapshot.Teams {
		var hash string
		err := tx.QueryRow(`SELECT hash FROM config_snapshots WHERE kind='team' AND id=? AND version=?`, id, t.Config.ConfigVersion).Scan(&hash)
		if err == nil && hash != t.Hash {
			return Reject("CONFIG_VERSION_CONFLICT", id)
		}
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		b, err := json.Marshal(t)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(`INSERT OR IGNORE INTO config_snapshots VALUES('team',?,?,?,?)`, id, t.Config.ConfigVersion, t.Hash, string(b)); err != nil {
			return err
		}
	}
	return nil
}
