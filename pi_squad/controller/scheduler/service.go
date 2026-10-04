// Package scheduler owns identity and atomic Run/Task admission.
package scheduler

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"strings"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type Config struct {
	MaxParallel      int
	HeartbeatTimeout time.Duration
	LeaseTTL         time.Duration
	DirectCallers    []string
	DirectTargets    []string
	DirectTools      []string
}
type Service struct {
	Store        *task.Store
	Project      project.Snapshot
	Epoch        int64
	Config       Config
	OperatorHash string
}
type Instance struct {
	UnderlyingActivity string          `json:"underlying_activity"`
	RoleSnapshot       project.Role    `json:"role_snapshot"`
	AvailableTools     []string        `json:"available_tools"`
	Binding            task.Binding    `json:"binding"`
	Mode               string          `json:"mode"`
	RoleID             string          `json:"role_id,omitempty"`
	TeamID             string          `json:"team_id,omitempty"`
	Activity           string          `json:"activity"`
	LastSeen           time.Time       `json:"last_seen"`
	Presence           string          `json:"presence"`
	Revoked            bool            `json:"revoked"`
	Capabilities       map[string]bool `json:"capabilities"`
	RoleHash           string          `json:"role_hash"`
}
type Register struct {
	AvailableTools    []string        `json:"available_tools"`
	AgentID           string          `json:"agent_id"`
	RuntimeID         string          `json:"runtime_id"`
	SessionID         string          `json:"session_id"`
	PreviousSessionID string          `json:"previous_session_id"`
	RuntimeToken      string          `json:"runtime_token"`
	Mode              string          `json:"mode"`
	RoleID            string          `json:"role_id,omitempty"`
	TeamID            string          `json:"team_id,omitempty"`
	Activity          string          `json:"activity"`
	Capabilities      map[string]bool `json:"capabilities"`
	RoleHash          string          `json:"role_hash"`
}
type Principal struct {
	Operator bool
	Binding  task.Binding
	Origin   string
}
type HeartbeatRequest struct {
	Binding    task.Binding `json:"binding"`
	Activity   string       `json:"activity"`
	Underlying string       `json:"underlying_activity"`
}

func New(ctx context.Context, store *task.Store, snapshot project.Snapshot, cfg Config, token string) (*Service, error) {
	if cfg.MaxParallel < 1 || cfg.HeartbeatTimeout <= 0 || cfg.LeaseTTL <= 0 {
		return nil, fmt.Errorf("invalid scheduler limits")
	}
	s := &Service{Store: store, Project: snapshot, Config: cfg, OperatorHash: project.Hash([]byte(token))}
	if err := store.Migrate(ctx); err != nil {
		return nil, err
	}
	if err := store.FreezeConfig(ctx, snapshot); err != nil {
		return nil, err
	}
	err := store.Transaction(ctx, func(tx *sql.Tx) error {
		if _, err := tx.Exec(`UPDATE controller_state SET epoch=epoch+1`); err != nil {
			return err
		}
		if err := tx.QueryRow(`SELECT epoch FROM controller_state`).Scan(&s.Epoch); err != nil {
			return err
		}
		rows, err := tx.Query(`SELECT body FROM runs WHERE cleanup!='released'`)
		if err != nil {
			return err
		}
		var runs []task.Run
		for rows.Next() {
			var b string
			if err := rows.Scan(&b); err != nil {
				rows.Close()
				return err
			}
			var r task.Run
			if err := json.Unmarshal([]byte(b), &r); err != nil {
				rows.Close()
				return err
			}
			runs = append(runs, r)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, r := range runs {
			r.RecoveryHold = true
			r.Revision++
			if err := task.SaveRun(tx, r); err != nil {
				return err
			}
			if err := task.EventTx(tx, "recovery_hold", r.ID, r.Revision, map[string]any{"reason": "controller_restart"}); err != nil {
				return err
			}
		}
		rows, err = tx.Query(`SELECT body FROM attempts WHERE cleanup!='released'`)
		if err != nil {
			return err
		}
		var attempts []task.Attempt
		for rows.Next() {
			var b string
			if err := rows.Scan(&b); err != nil {
				rows.Close()
				return err
			}
			var a task.Attempt
			if err := json.Unmarshal([]byte(b), &a); err != nil {
				rows.Close()
				return err
			}
			attempts = append(attempts, a)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, a := range attempts {
			a.State = "needs_review"
			a.Error = "controller_restart"
			a.Revision++
			if err := task.SaveAttempt(tx, a); err != nil {
				return err
			}
			c, err := task.LoadTask(tx, a.TaskID)
			if err != nil {
				return err
			}
			c.State = "needs_review"
			c.Revision++
			if err := task.SaveTask(tx, c); err != nil {
				return err
			}
		}
		// Accepted standalone Tasks can survive a crash before the first
		// dispatch intent commits. There is no Attempt to reconcile, but that
		// does not authorize new model input after restarting the Controller.
		// Run-scoped Tasks are already fenced by their Run recovery hold.
		rows, err = tx.Query(`SELECT body FROM tasks WHERE run_id IS NULL AND state IN ('planned','queued','waiting_dependency')`)
		if err != nil {
			return err
		}
		var uninjected []task.Contract
		for rows.Next() {
			var body string
			if err := rows.Scan(&body); err != nil {
				rows.Close()
				return err
			}
			var c task.Contract
			if err := json.Unmarshal([]byte(body), &c); err != nil {
				rows.Close()
				return err
			}
			if c.Accepted && len(c.AttemptIDs) == 0 {
				uninjected = append(uninjected, c)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, c := range uninjected {
			c.State = "needs_review"
			c.Revision++
			blocker(&c, "controller_restart", c.ID)
			if err := task.SaveTask(tx, c); err != nil {
				return err
			}
			if err := task.EventTx(tx, "task_recovery_hold", c.ID, c.Revision, map[string]string{
				"reason": "controller_restart", "input_state": "not_injected",
			}); err != nil {
				return err
			}
		}
		_, err = tx.Exec(`UPDATE instances SET last_seen='',activity='unknown'`)
		return err
	})
	return s, err
}
func (s *Service) Authenticate(ctx context.Context, token, agentID string) (Principal, error) {
	if token == "" {
		return Principal{}, task.Reject("UNAUTHORIZED", "credential required")
	}
	h := project.Hash([]byte(token))
	if subtle.ConstantTimeCompare([]byte(h), []byte(s.OperatorHash)) == 1 {
		return Principal{Operator: true, Origin: "local_operator@cli"}, nil
	}
	var expected, body string
	var revoked bool
	err := s.Store.DB.QueryRowContext(ctx, `SELECT token_hash,body,revoked FROM instances WHERE agent_id=?`, agentID).Scan(&expected, &body, &revoked)
	if err != nil || revoked || subtle.ConstantTimeCompare([]byte(h), []byte(expected)) != 1 {
		return Principal{}, task.Reject("UNAUTHORIZED", "runtime credential rejected")
	}
	var i Instance
	if err := json.Unmarshal([]byte(body), &i); err != nil {
		return Principal{}, err
	}
	return Principal{Binding: i.Binding, Origin: "model_tool@attempt"}, nil
}
func loadInstance(tx *sql.Tx, id string) (Instance, error) {
	var i Instance
	var b, last, activity string
	var revoked bool
	err := tx.QueryRow(`SELECT body,last_seen,activity,revoked FROM instances WHERE agent_id=?`, id).Scan(&b, &last, &activity, &revoked)
	if err != nil {
		return i, err
	}
	if err := json.Unmarshal([]byte(b), &i); err != nil {
		return i, err
	}
	i.LastSeen, _ = time.Parse(time.RFC3339Nano, last)
	i.Activity = activity
	i.Revoked = revoked
	return i, nil
}
func (s *Service) Online(i Instance) bool {
	return project.PresenceAt(i.LastSeen, fault.Now(), s.Config.HeartbeatTimeout, i.Revoked) == "online"
}
func saveInstance(tx *sql.Tx, i Instance, hash string) error {
	b, err := json.Marshal(i)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO instances VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET mode=excluded.mode,role_id=excluded.role_id,team_id=excluded.team_id,runtime_id=excluded.runtime_id,session_id=excluded.session_id,binding_epoch=excluded.binding_epoch,token_hash=excluded.token_hash,last_seen=excluded.last_seen,activity=excluded.activity,revoked=excluded.revoked,body=excluded.body`, i.Binding.AgentID, i.Mode, i.RoleID, i.TeamID, i.Binding.RuntimeID, i.Binding.SessionID, i.Binding.BindingEpoch, hash, i.LastSeen.Format(time.RFC3339Nano), i.Activity, i.Revoked, string(b))
	return err
}
func (s *Service) Register(ctx context.Context, q Register) (Instance, error) {
	var result Instance
	if !project.ValidID(q.AgentID) || !project.ValidRuntimeID(q.RuntimeID) || strings.TrimSpace(q.SessionID) == "" || len(q.RuntimeToken) < 32 {
		return result, task.Reject("INVALID_IDENTITY", "stable ID/runtime/session/token required")
	}
	snapshot, err := project.Load(s.Project.Root)
	if err != nil {
		return result, err
	}
	if q.Mode == "role" {
		if _, ok := snapshot.Roles[q.RoleID]; !ok || q.TeamID != "" {
			return result, task.Reject("INVALID_ROLE", "unknown role or unexpected team")
		}
	} else if q.Mode == "leader" {
		t, ok := snapshot.Teams[q.TeamID]
		if !ok || t.Config.Leader.AgentRef != q.AgentID || q.RoleID != "" {
			return result, task.Reject("INVALID_LEADER", "team leader mismatch")
		}
	} else {
		return result, task.Reject("INVALID_MODE", "leader or role required")
	}
	err = s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		if err := task.FreezeConfigTx(tx, snapshot); err != nil {
			return err
		}
		var revoked int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM revoked_runtimes WHERE runtime_id=?`, q.RuntimeID).Scan(&revoked); err != nil {
			return err
		}
		if revoked > 0 {
			return task.Reject("RUNTIME_REVOKED", "revoked runtime cannot register again")
		}
		previous, err := loadInstance(tx, q.AgentID)
		epoch := int64(1)
		hash := project.Hash([]byte(q.RuntimeToken))
		if err == nil {
			if !s.Online(previous) {
				if err := invalidateMessages(tx, previous.Binding, "offline"); err != nil {
					return err
				}
			}
			if previous.Binding.SessionID != q.SessionID || previous.Binding.RuntimeID != q.RuntimeID {
				if err := invalidateMessages(tx, previous.Binding, "session_changed"); err != nil {
					return err
				}
			}
			epoch = previous.Binding.BindingEpoch + 1
			if previous.Revoked && previous.Binding.RuntimeID == q.RuntimeID {
				return task.Reject("RUNTIME_REVOKED", "start a new runtime after explicit release")
			}
			if !previous.Revoked {
				var oldHash string
				if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, q.AgentID).Scan(&oldHash); err != nil {
					return err
				}
				if previous.Binding.RuntimeID != q.RuntimeID || oldHash != hash || previous.Mode != q.Mode || previous.RoleID != q.RoleID || previous.TeamID != q.TeamID {
					return task.Reject("IDENTITY_ALREADY_OWNED", "explicit release required")
				}
				if previous.Binding.SessionID != q.SessionID && previous.Binding.SessionID != q.PreviousSessionID {
					return task.Reject("BINDING_CHANGED", "previous session mismatch")
				}
				if previous.Binding.SessionID == q.SessionID {
					epoch = previous.Binding.BindingEpoch
				} else {
					if err := s.interruptAgent(tx, q.AgentID, "session_changed"); err != nil {
						return err
					}
				}
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		i := Instance{Binding: task.Binding{AgentID: q.AgentID, RuntimeID: q.RuntimeID, SessionID: q.SessionID, BindingEpoch: epoch}, Mode: q.Mode, RoleID: q.RoleID, TeamID: q.TeamID, Activity: q.Activity, LastSeen: fault.Now(), Presence: "online", Capabilities: q.Capabilities, RoleHash: q.RoleHash}
		i.AvailableTools = append([]string{}, q.AvailableTools...)
		if q.Mode == "role" {
			if previous.Binding.RuntimeID == q.RuntimeID && !previous.Revoked {
				i.RoleSnapshot = previous.RoleSnapshot
			} else {
				raw, err := project.ReadDocument(s.Project.Root, ".agents/pisquad/roles/"+q.RoleID+"/role.md")
				if err != nil {
					return err
				}
				role, err := project.ParseRole(raw, q.RoleID)
				if err != nil {
					return err
				}
				if role.Hash != q.RoleHash {
					return task.Reject("ROLE_SNAPSHOT_MISMATCH", "restart Pi to read the current Role definition")
				}
				i.RoleSnapshot = role
			}
		}
		if i.Activity != "idle" && i.Activity != "working" && i.Activity != "blocked" {
			i.Activity = "unknown"
		}
		if q.Mode == "leader" {
			var owner sql.NullString
			var be int64
			err := tx.QueryRow(`SELECT agent_id,epoch FROM leader_bindings WHERE team_id=?`, q.TeamID).Scan(&owner, &be)
			if err == nil && owner.Valid && owner.String != "" {
				old, err := loadInstance(tx, owner.String)
				if err != nil {
					return err
				}
				if owner.String != q.AgentID || old.Binding.RuntimeID != q.RuntimeID || old.Revoked {
					return task.Reject("TEAM_LEADER_ALREADY_ACTIVE", "explicit release required")
				}
			} else if err != nil && err != sql.ErrNoRows {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO leader_bindings VALUES(?,?,?,?,1) ON CONFLICT(team_id) DO UPDATE SET agent_id=excluded.agent_id,runtime_id=excluded.runtime_id,epoch=excluded.epoch,revision=leader_bindings.revision+1`, q.TeamID, q.AgentID, q.RuntimeID, epoch); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO primary_bindings VALUES(?, ?, 1, 1)`, q.RoleID, q.AgentID); err != nil {
				return err
			}
			var owner sql.NullString
			var pe int64
			if err := tx.QueryRow(`SELECT agent_id,epoch FROM primary_bindings WHERE role_id=?`, q.RoleID).Scan(&owner, &pe); err != nil {
				return err
			}
			if owner.String == q.AgentID {
				i.Binding.PrimaryEpoch = pe
			}
		}
		if err := saveInstance(tx, i, hash); err != nil {
			return err
		}
		result = i
		return task.EventTx(tx, "registered", q.AgentID, epoch, map[string]any{"binding": i.Binding, "mode": i.Mode})
	})
	return result, err
}
func (s *Service) Heartbeat(ctx context.Context, p Principal, b task.Binding, activity string, underlying ...string) (Instance, error) {
	var out Instance
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		i, err := loadInstance(tx, p.Binding.AgentID)
		if err != nil {
			return err
		}
		if p.Operator || i.Revoked || !task.SameBinding(i.Binding, b) || !task.SameBinding(p.Binding, b) {
			return task.Reject("BINDING_CHANGED", "heartbeat binding mismatch")
		}
		switch activity {
		case "idle", "working", "blocked", "unknown":
		default:
			return task.Reject("INVALID_ACTIVITY", "unknown activity")
		}
		if !s.Online(i) {
			if err := invalidateMessages(tx, i.Binding, "offline"); err != nil {
				return err
			}
		}
		i.LastSeen = fault.Now()
		i.Activity = activity
		i.UnderlyingActivity = activity
		if len(underlying) > 0 && (underlying[0] == "idle" || underlying[0] == "working") {
			i.UnderlyingActivity = underlying[0]
		}
		var hash string
		if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, b.AgentID).Scan(&hash); err != nil {
			return err
		}
		if err := saveInstance(tx, i, hash); err != nil {
			return err
		}
		out = i
		return task.EventTx(tx, "heartbeat", b.AgentID, b.BindingEpoch, map[string]string{"activity": activity})
	})
	return out, err
}
func (s *Service) primary(tx *sql.Tx, role string) (Instance, error) {
	var id sql.NullString
	var epoch int64
	if err := tx.QueryRow(`SELECT agent_id,epoch FROM primary_bindings WHERE role_id=?`, role).Scan(&id, &epoch); err != nil || !id.Valid || id.String == "" {
		return Instance{}, task.Reject("ROLE_NOT_SCHEDULABLE", role)
	}
	i, err := loadInstance(tx, id.String)
	if err != nil {
		return i, err
	}
	if i.Mode != "role" || i.RoleID != role {
		return i, task.Reject("ROLE_PRIMARY_MISMATCH", role)
	}
	i.Binding.PrimaryEpoch = epoch
	if !s.Online(i) {
		return i, task.Reject("ROLE_PRIMARY_OFFLINE", role)
	}
	return i, nil
}
func (s *Service) leader(tx *sql.Tx, team string) (Instance, error) {
	var id sql.NullString
	if err := tx.QueryRow(`SELECT agent_id FROM leader_bindings WHERE team_id=?`, team).Scan(&id); err != nil || !id.Valid || id.String == "" {
		return Instance{}, task.Reject("LEADER_OFFLINE", team)
	}
	i, err := loadInstance(tx, id.String)
	if err != nil {
		return i, err
	}
	if !s.Online(i) {
		return i, task.Reject("LEADER_OFFLINE", team)
	}
	return i, nil
}
func requireOperator(p Principal) error {
	if !p.Operator {
		return task.Reject("FORBIDDEN", "explicit Project operator credential required")
	}
	return nil
}
func bodyHash(v any) string { b, _ := json.Marshal(v); return project.Hash(b) }
func replay(tx *sql.Tx, p Principal, operation, request string, payload any) (string, error) {
	if p.Binding.AgentID != "" {
		current, err := loadInstance(tx, p.Binding.AgentID)
		if err != nil || current.Revoked || !task.SameBinding(current.Binding, p.Binding) {
			return "", task.Reject("BINDING_CHANGED", "runtime identity changed before transaction")
		}
	}
	if strings.TrimSpace(request) == "" || len(request) > 128 {
		return "", task.Reject("REQUEST_ID_REQUIRED", "request_id required")
	}
	source := p.Binding.AgentID
	if p.Operator {
		source = "operator"
	}
	var hash, id string
	err := tx.QueryRow(`SELECT payload_hash,entity_id FROM idempotency WHERE source=? AND operation=? AND request_id=?`, source, operation, request).Scan(&hash, &id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if hash != bodyHash(payload) {
		return "", task.Reject("REQUEST_ID_CONFLICT", "same request_id with different payload")
	}
	return id, nil
}
func remember(tx *sql.Tx, p Principal, operation, request, id string, payload any) error {
	source := p.Binding.AgentID
	if p.Operator {
		source = "operator"
	}
	_, err := tx.Exec(`INSERT INTO idempotency VALUES(?,?,?,?,?,?)`, source, operation, request, bodyHash(payload), id, "{}")
	return err
}
