package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type Operation struct {
	RequestID        string `json:"request_id"`
	ExpectedRevision int64  `json:"expected_revision"`
	ExpectedRuntime  string `json:"expected_runtime,omitempty"`
	AgentID          string `json:"agent_id,omitempty"`
	Note             string `json:"note,omitempty"`
	Evidence         string `json:"evidence,omitempty"`
	ConfirmStopped   bool   `json:"confirm_stopped,omitempty"`
	RebindCurrent    bool   `json:"rebind_current,omitempty"`
	ResultHash       string `json:"result_hash,omitempty"`
}

// ValidateOperationName is shared by operator entry points before any mutation.
func ValidateOperationName(kind, op string) error {
	allowed := map[string][]string{
		"agent":   {"release"},
		"run":     {"cancel", "resume", "guidance"},
		"task":    {"cancel", "amend", "recover", "retry", "rebind", "accept", "reject"},
		"attempt": {"reconcile"},
		"role":    {"release", "promote"},
		"leader":  {"release"},
	}
	for _, candidate := range allowed[kind] {
		if candidate == op {
			return nil
		}
	}
	return task.Reject("INVALID_OPERATION", kind+":"+op)
}

func (s *Service) Operate(ctx context.Context, p Principal, kind, id, op string, q Operation) (any, error) {
	if err := requireOperator(p); err != nil {
		return nil, err
	}
	if err := ValidateOperationName(kind, op); err != nil {
		return nil, err
	}
	var out any
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		operation := kind + ":" + id + ":" + op
		prior, err := replay(tx, p, operation, q.RequestID, q)
		if err != nil {
			return err
		}
		if prior != "" {
			out = map[string]any{"replayed": true, "target": id}
			return nil
		}
		var oldBinding, newBinding *task.Binding
		if kind == "task" && (op == "rebind" || op == "retry") {
			before, err := task.LoadTask(tx, id)
			if err != nil {
				return err
			}
			oldBinding = before.Target
		}
		if kind == "run" && op == "resume" {
			before, err := task.LoadRun(tx, id)
			if err != nil {
				return err
			}
			oldBinding = &before.Leader
		}
		switch kind {
		case "agent":
			if op != "release" {
				return task.Reject("INVALID_OPERATION", op)
			}
			out, err = s.releaseRuntime(tx, id, q)
		case "run":
			out, err = s.runOperation(tx, id, op, q)
		case "task":
			out, err = s.taskOperation(tx, id, op, q)
		case "attempt":
			out, err = s.attemptOperation(tx, id, op, q)
		case "role", "leader":
			out, err = s.bindingOperation(tx, kind, id, op, q)
		default:
			err = task.Reject("INVALID_OPERATION", kind)
		}
		if err != nil {
			return err
		}
		switch result := out.(type) {
		case task.Contract:
			if op == "rebind" || op == "retry" {
				newBinding = result.Target
			}
		case task.Run:
			if op == "resume" {
				newBinding = &result.Leader
			}
		}
		body, err := json.Marshal(map[string]any{"request": q, "source": sourceOf(p), "old_binding": oldBinding, "new_binding": newBinding})
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO recovery_actions(actor,action,target,body,at) VALUES(?,?,?,?,?)`, p.Origin, operation, id, string(body), fault.Now().Format(time.RFC3339Nano)); err != nil {
			return err
		}
		if err := remember(tx, p, operation, q.RequestID, id, q); err != nil {
			return err
		}
		return task.EventTx(tx, "operator_"+op, id, q.ExpectedRevision+1, map[string]any{"kind": kind, "note": q.Note})
	})
	return out, err
}
func (s *Service) runOperation(tx *sql.Tx, id, op string, q Operation) (any, error) {
	r, err := task.LoadRun(tx, id)
	if err != nil {
		return nil, err
	}
	if err := task.CAS(r.Revision, q.ExpectedRevision); err != nil {
		return nil, err
	}
	switch op {
	case "cancel":
		if r.Cleanup == "released" {
			return r, nil
		}
		r.Phase = "cancelled"
		r.WaitingRoles = []task.WaitingRole{}
		r.Blockers = []task.Blocker{}
		r.RecoveryHold = true
		all, err := readTasks(tx)
		if err != nil {
			return nil, err
		}
		for _, c := range all {
			if c.RunID != nil && *c.RunID == r.ID && !task.Terminal(c.State) {
				if err := s.cancelTask(tx, c); err != nil {
					return nil, err
				}
			}
		}
		if err := s.cleanupRun(tx, &r); err != nil {
			return nil, err
		}
	case "resume":
		if task.Terminal(r.Phase) {
			return nil, task.Reject("RUN_TERMINAL", r.Phase)
		}
		all, err := readTasks(tx)
		if err != nil {
			return nil, err
		}
		for _, c := range all {
			if c.RunID == nil || *c.RunID != r.ID {
				continue
			}
			for _, id := range c.AttemptIDs {
				a, err := task.LoadAttempt(tx, id)
				if err != nil {
					return nil, err
				}
				if a.Cleanup != "released" && (a.ControllerEpoch != s.Epoch || a.State == "needs_review" || task.Terminal(a.State) || (a.State != "suspended" && fault.Now().After(a.LeaseExpiresAt))) {
					return nil, task.Reject("EXECUTION_UNCONFIRMED", id)
				}
			}
			if c.State == "needs_review" || c.State == "interrupted" || c.State == "failed" {
				return nil, task.Reject("UNRESOLVED_TASK", c.ID)
			}
		}
		leader, err := s.leader(tx, r.TeamID)
		if err != nil {
			return nil, err
		}
		if !task.SameBinding(leader.Binding, r.Leader) {
			if q.ExpectedRuntime != r.Leader.RuntimeID || !q.RebindCurrent {
				return nil, task.Reject("LEADER_REBIND_REQUIRED", "confirm previous runtime and rebind-current")
			}
			r.Leader = leader.Binding
		}
		r.RecoveryHold = false
		if r.Admitted {
			r.Phase = "running"
		} else {
			r.Phase = "queued_run"
		}
		r.Blockers = []task.Blocker{}
	case "guidance":
		if task.Terminal(r.Phase) || q.Note == "" {
			return nil, task.Reject("INVALID_GUIDANCE", "active Run and text required")
		}
		r.Guidance = append(r.Guidance, q.Note)
	default:
		return nil, task.Reject("INVALID_OPERATION", op)
	}
	r.Revision++
	if err := task.SaveRun(tx, r); err != nil {
		return nil, err
	}
	if op == "cancel" {
		if err := s.coverChildren(tx); err != nil {
			return nil, err
		}
	}
	return r, nil
}
func (s *Service) cancelTask(tx *sql.Tx, c task.Contract) error {
	// A parent cancellation may already have visited this row while the caller
	// is still walking its earlier snapshot. Never write that stale revision back.
	var err error
	c, err = task.LoadTask(tx, c.ID)
	if err != nil {
		return err
	}
	if c.State == "cancelled" || c.State == "completed" {
		return nil
	}
	c.State = "cancelled"
	c.Blockers = []task.Blocker{}
	c.Revision++
	for _, id := range c.AttemptIDs {
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		if a.Cleanup == "released" {
			continue
		}
		wasSuspended := a.State == "suspended"
		a.State = "cancelled"
		a.Error = "cancel_requested"
		a.Revision++
		if a.Receipt == "dispatch_intent" || a.Receipt == "adapter_received" || wasSuspended {
			a.Cleanup = "released"
			if err := releaseAttempt(tx, a); err != nil {
				return err
			}
		}
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
	}
	if err := task.SaveTask(tx, c); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM wait_edges WHERE waiter=?`, c.ID); err != nil {
		return err
	}
	if err := task.EventTx(tx, "cancel_requested", c.ID, c.Revision, nil); err != nil {
		return err
	}
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for _, child := range all {
		if child.ParentID == c.ID && !task.Terminal(child.State) {
			if err := s.cancelTask(tx, child); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *Service) cleanupRun(tx *sql.Tx, r *task.Run) error {
	if r.Cleanup == "released" {
		return nil
	}
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM attempts a JOIN tasks t ON t.task_id=a.task_id WHERE t.run_id=? AND a.cleanup!='released'`, r.ID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		r.Cleanup = "reconciling"
		return nil
	}
	if !task.Terminal(r.Phase) {
		return nil
	}
	r.Cleanup = "released"
	if _, err := tx.Exec(`DELETE FROM role_ownership WHERE run_id=?`, r.ID); err != nil {
		return err
	}
	return task.EventTx(tx, "roles_released", r.ID, r.Revision+1, nil)
}
func (s *Service) taskOperation(tx *sql.Tx, id, op string, q Operation) (any, error) {
	c, err := task.LoadTask(tx, id)
	if err != nil {
		return nil, err
	}
	if err := task.CAS(c.Revision, q.ExpectedRevision); err != nil {
		return nil, err
	}
	switch op {
	case "cancel":
		if err := s.cancelTask(tx, c); err != nil {
			return nil, err
		}
		cancelled, err := task.LoadTask(tx, id)
		if err != nil {
			return nil, err
		}
		// A standalone suspended parent otherwise waits forever for a child
		// which can no longer satisfy its success dependency.
		if c.State != "cancelled" && cancelled.State == "cancelled" && cancelled.ParentID != "" {
			if err := s.failAncestors(tx, cancelled, "cancel_requested"); err != nil {
				return nil, err
			}
		}
		if err := s.coverChildren(tx); err != nil {
			return nil, err
		}
		return cancelled, nil
	case "amend":
		if task.Terminal(c.State) || q.Note == "" {
			return nil, task.Reject("INVALID_AMEND", "nonterminal task and text required")
		}
		c.GoalRevision++
		c.Amendments = append(c.Amendments, q.Note)
		if len(c.AttemptIDs) == 0 {
			c.Goal += "\n" + q.Note
			c.AppliedRevision = c.GoalRevision
			c.Amendments = []string{}
		}
		c.Acceptance = nil
	case "rebind", "retry":
		if c.RunID != nil {
			run, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return nil, err
			}
			if task.Terminal(run.Phase) {
				return nil, task.Reject("RUN_TERMINAL", run.ID)
			}
		}
		if !q.RebindCurrent {
			return nil, task.Reject("REBIND_CONFIRMATION_REQUIRED", "rebind_current required")
		}
		if op == "rebind" && len(c.AttemptIDs) != 0 {
			return nil, task.Reject("RETRY_REQUIRED", "task already has an Attempt")
		}
		if op == "rebind" && (!c.Accepted || c.Target == nil || task.Terminal(c.State)) {
			return nil, task.Reject("INVALID_REBIND_STATE", "only a nonterminal accepted Task with a frozen target can be rebound")
		}
		if op == "retry" && len(c.AttemptIDs) >= c.Policy.MaxAttemptsPerTask {
			return nil, task.Reject("ATTEMPT_BUDGET_EXHAUSTED", "cancel safely and create a new request")
		}
		for _, aid := range c.AttemptIDs {
			a, err := task.LoadAttempt(tx, aid)
			if err != nil {
				return nil, err
			}
			if a.Cleanup != "released" {
				return nil, task.Reject("EXECUTION_UNCONFIRMED", aid)
			}
		}
		var target Instance
		if c.Kind == "leader_step" && c.TeamID != nil {
			target, err = s.leader(tx, *c.TeamID)
		} else if c.Scope == "team" {
			target, err = s.primary(tx, c.RoleID)
		} else if c.Target != nil {
			target, err = loadInstance(tx, c.Target.AgentID)
		} else {
			return nil, task.Reject("BINDING_MISSING", id)
		}
		if err != nil {
			return nil, err
		}
		if !s.Online(target) {
			return nil, task.Reject("AGENT_OFFLINE", target.Binding.AgentID)
		}
		c.Target = &target.Binding
		c.Accepted = true
		c.State = "queued"
		c.Blockers = []task.Blocker{}
		c.Result = nil
		c.Acceptance = nil
		c.DeadlineAt = fault.Now().Add(120 * time.Second)
	case "recover":
		if q.Evidence == "" || q.Note == "" {
			return nil, task.Reject("EVIDENCE_REQUIRED", "recover records evidence and side-effect disposition without execution")
		}
		if err := s.recoverResult(tx, &c, q.Evidence); err != nil {
			return nil, err
		}
		return task.LoadTask(tx, id)
	case "accept", "reject":
		if c.State != "completed" || c.Result == nil || c.Result.Hash != q.ResultHash || c.GoalRevision != c.Result.GoalRevision {
			return nil, task.Reject("RESULT_VERSION_CONFLICT", "current completed result hash required")
		}
		if c.AcceptancePolicy == nil {
			return nil, task.Reject("CONTROL_TASK", "control tasks do not require recursive acceptance")
		}
		if c.AcceptancePolicy.Mode != "human" {
			return nil, task.Reject("ACCEPTANCE_POLICY_MISMATCH", "this Task requires its declared checker/reviewer/parent evidence")
		}
		if q.Note == "" {
			return nil, task.Reject("EVIDENCE_REQUIRED", "acceptance reason required")
		}
		decision := "accepted"
		if op == "reject" {
			decision = "rejected"
		}
		if err := s.validateArtifacts(c, *c.Result); err != nil {
			return nil, err
		}
		if err := s.validateResultRefs(tx, c, *c.Result); err != nil {
			return nil, err
		}
		if err := saveAcceptance(tx, &c, task.Acceptance{Decision: decision, Mode: "human", ResultHash: c.Result.Hash, GoalRevision: c.GoalRevision, Reason: q.Note}); err != nil {
			return nil, err
		}
		if err := s.coverChildren(tx); err != nil {
			return nil, err
		}
		if c.RunID != nil {
			run, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return nil, err
			}
			run.Revision++
			if err := task.SaveRun(tx, run); err != nil {
				return nil, err
			}
		}
		return task.LoadTask(tx, id)
	default:
		return nil, task.Reject("INVALID_OPERATION", op)
	}
	c.Revision++
	if err := task.SaveTask(tx, c); err != nil {
		return nil, err
	}
	if err := s.coverChildren(tx); err != nil {
		return nil, err
	}
	return c, nil
}
func (s *Service) attemptOperation(tx *sql.Tx, id, op string, q Operation) (any, error) {
	a, err := task.LoadAttempt(tx, id)
	if err != nil {
		return nil, err
	}
	if err := task.CAS(a.Revision, q.ExpectedRevision); err != nil {
		return nil, err
	}
	if op != "reconcile" || !q.ConfirmStopped || q.Note == "" || q.ExpectedRuntime != a.Target.RuntimeID {
		return nil, task.Reject("STOP_ATTESTATION_REQUIRED", "confirm-stopped, reason and exact old runtime required")
	}
	if a.Cleanup == "released" {
		return a, nil
	}
	a.Cleanup = "released"
	if a.State != "settled" {
		a.State = "interrupted"
	}
	a.Error = "human_attestation"
	a.Revision++
	if err := releaseAttempt(tx, a); err != nil {
		return nil, err
	}
	if err := task.SaveAttempt(tx, a); err != nil {
		return nil, err
	}
	c, err := task.LoadTask(tx, a.TaskID)
	if err != nil {
		return nil, err
	}
	if a.State == "interrupted" && !task.Terminal(c.State) {
		c.State = "interrupted"
		c.Revision++
		if err := task.SaveTask(tx, c); err != nil {
			return nil, err
		}
		if err := s.failAncestors(tx, c, "human_attestation"); err != nil {
			return nil, err
		}
	}
	if c.RunID != nil {
		r, err := task.LoadRun(tx, *c.RunID)
		if err != nil {
			return nil, err
		}
		if err := s.cleanupRun(tx, &r); err != nil {
			return nil, err
		}
		r.Revision++
		if err := task.SaveRun(tx, r); err != nil {
			return nil, err
		}
	}
	return a, nil
}
func (s *Service) bindingOperation(tx *sql.Tx, kind, id, op string, q Operation) (any, error) {
	table, col := "primary_bindings", "role_id"
	if kind == "leader" {
		table, col = "leader_bindings", "team_id"
	}
	var owner sql.NullString
	var epoch, revision int64
	if err := tx.QueryRow(`SELECT agent_id,epoch,revision FROM `+table+` WHERE `+col+`=?`, id).Scan(&owner, &epoch, &revision); err != nil {
		return nil, err
	}
	if err := task.CAS(revision, q.ExpectedRevision); err != nil {
		return nil, err
	}
	if owner.Valid && owner.String != "" {
		i, err := loadInstance(tx, owner.String)
		if err != nil {
			return nil, err
		}
		if q.ExpectedRuntime != i.Binding.RuntimeID {
			return nil, task.Reject("BINDING_CHANGED", "expected old runtime required")
		}
		var count int
		if err := tx.QueryRow(`SELECT count(*) FROM attempts WHERE agent_id=? AND cleanup!='released'`, owner.String).Scan(&count); err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, task.Reject("EXECUTION_UNCONFIRMED", owner.String)
		}
	}
	if kind == "role" && owner.Valid && owner.String != "" {
		old, err := loadInstance(tx, owner.String)
		if err != nil {
			return nil, err
		}
		old.Binding.PrimaryEpoch = 0
		old.Binding.BindingEpoch++
		var hash string
		if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, owner.String).Scan(&hash); err != nil {
			return nil, err
		}
		if err := saveInstance(tx, old, hash); err != nil {
			return nil, err
		}
	}
	history, _ := json.Marshal(map[string]any{"agent_id": owner.String, "epoch": epoch, "revision": revision})
	if _, err := tx.Exec(`INSERT INTO binding_history(kind,entity_id,body,at) VALUES(?,?,?,?)`, kind, id, string(history), fault.Now().Format(time.RFC3339Nano)); err != nil {
		return nil, err
	}
	if op == "release" {
		if _, err := tx.Exec(`UPDATE `+table+` SET agent_id=NULL,epoch=epoch+1,revision=revision+1 WHERE `+col+`=?`, id); err != nil {
			return nil, err
		}
		if owner.Valid && kind == "leader" {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO revoked_runtimes(runtime_id) VALUES(?)`, q.ExpectedRuntime); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(`UPDATE instances SET revoked=1 WHERE agent_id=?`, owner.String); err != nil {
				return nil, err
			}
		}
	} else if kind == "role" && op == "promote" {
		target, err := loadInstance(tx, q.AgentID)
		if err != nil {
			return nil, err
		}
		if target.RoleID != id || target.Mode == "leader" || q.AgentID == owner.String || !s.Online(target) {
			return nil, task.Reject("INVALID_PROMOTION", "online same-role Secondary target required")
		}
		var n int
		if err := tx.QueryRow(`SELECT count(*) FROM attempts WHERE agent_id=? AND cleanup!='released'`, q.AgentID).Scan(&n); err != nil {
			return nil, err
		}
		if n != 0 {
			return nil, task.Reject("AGENT_BUSY", q.AgentID)
		}
		if _, err := tx.Exec(`UPDATE primary_bindings SET agent_id=?,epoch=epoch+1,revision=revision+1 WHERE role_id=?`, q.AgentID, id); err != nil {
			return nil, err
		}
		target.Binding.PrimaryEpoch = epoch + 1
		target.Binding.BindingEpoch++
		var h string
		if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, q.AgentID).Scan(&h); err != nil {
			return nil, err
		}
		if err := saveInstance(tx, target, h); err != nil {
			return nil, err
		}
	} else {
		return nil, task.Reject("INVALID_OPERATION", op)
	}
	return map[string]any{"kind": kind, "id": id, "epoch": epoch + 1, "revision": revision + 1}, nil
}

func (s *Service) releaseRuntime(tx *sql.Tx, id string, q Operation) (any, error) {
	i, err := loadInstance(tx, id)
	if err != nil {
		return nil, err
	}
	if err := task.CAS(i.Binding.BindingEpoch, q.ExpectedRevision); err != nil {
		return nil, err
	}
	if q.ExpectedRuntime != i.Binding.RuntimeID {
		return nil, task.Reject("BINDING_CHANGED", "expected runtime required")
	}
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM attempts WHERE agent_id=? AND cleanup!='released'`, id).Scan(&n); err != nil {
		return nil, err
	}
	if n != 0 {
		return nil, task.Reject("EXECUTION_UNCONFIRMED", id)
	}
	if _, err := tx.Exec(`INSERT OR IGNORE INTO revoked_runtimes(runtime_id) VALUES(?)`, i.Binding.RuntimeID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE instances SET revoked=1 WHERE agent_id=?`, id); err != nil {
		return nil, err
	}
	if i.Mode == "leader" {
		if _, err := tx.Exec(`UPDATE leader_bindings SET agent_id=NULL,epoch=epoch+1,revision=revision+1 WHERE agent_id=?`, id); err != nil {
			return nil, err
		}
	}
	history, _ := json.Marshal(i.Binding)
	if _, err := tx.Exec(`INSERT INTO binding_history(kind,entity_id,body,at) VALUES('runtime',?,?,?)`, id, string(history), fault.Now().Format(time.RFC3339Nano)); err != nil {
		return nil, err
	}
	return map[string]any{"agent_id": id, "revoked_runtime": i.Binding.RuntimeID, "history_preserved": true}, nil
}
