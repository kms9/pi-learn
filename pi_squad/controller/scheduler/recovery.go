package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

// Logical interruption never treats loss of contact as proof of physical stop.
func (s *Service) interruptAgent(tx *sql.Tx, agentID, reason string) error {
	rows, err := tx.Query(`SELECT body FROM attempts WHERE agent_id=? AND cleanup!='released'`, agentID)
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
		a.State = "interrupted"
		a.Error = reason
		a.Revision++
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		c.State = "interrupted"
		c.Revision++
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		if err := s.failAncestors(tx, c, reason); err != nil {
			return err
		}
		if err := task.EventTx(tx, "attempt_interrupted", a.ID, a.Revision, map[string]string{"reason": reason}); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) failAncestors(tx *sql.Tx, c task.Contract, reason string) error {
	if c.RunID != nil {
		r, err := task.LoadRun(tx, *c.RunID)
		if err != nil {
			return err
		}
		r.RecoveryHold = true
		if !task.Terminal(r.Phase) {
			r.Phase = "needs_review"
		}
		r.Revision++
		if err := task.SaveRun(tx, r); err != nil {
			return err
		}
	}
	seen := map[string]bool{}
	for c.ParentID != "" {
		if seen[c.ParentID] {
			return task.Reject("CALL_CYCLE", "corrupt parent chain")
		}
		seen[c.ParentID] = true
		parent, err := task.LoadTask(tx, c.ParentID)
		if err != nil {
			return err
		}
		if task.Terminal(parent.State) {
			c = parent
			continue
		}
		parent.State = "needs_review"
		parent.Revision++
		parent.Blockers = append(parent.Blockers, task.Blocker{Kind: "dependency_interrupted", Resource: c.ID, Owner: reason, Revision: c.Revision})
		if err := task.SaveTask(tx, parent); err != nil {
			return err
		}
		if err := task.EventTx(tx, "dependency_interrupted", parent.ID, parent.Revision, map[string]string{"child": c.ID, "reason": reason}); err != nil {
			return err
		}
		c = parent
	}
	// Parent coverage is invalid as soon as an ancestor has an unresolved
	// interruption, not only after the next scheduler tick.
	return s.coverChildren(tx)
}

// Interruption is a binding-scoped lifecycle report, not a management release.
type Interruption struct {
	RequestID string       `json:"request_id"`
	Binding   task.Binding `json:"binding"`
	Reason    string       `json:"reason"`
}

func (s *Service) Interrupt(ctx context.Context, p Principal, q Interruption) error {
	b, reason := q.Binding, q.Reason
	if p.Operator || !task.SameBinding(p.Binding, b) {
		return task.Reject("BINDING_CHANGED", "lifecycle binding mismatch")
	}
	switch reason {
	case "manual_interference", "manual_compaction", "session_changed", "extension_reload":
	default:
		return task.Reject("INVALID_REASON", reason)
	}
	return s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "interruption", q.RequestID, q)
		if err != nil {
			return err
		}
		if prior != "" {
			return nil
		}
		current, err := loadInstance(tx, b.AgentID)
		if err != nil || current.Revoked || !task.SameBinding(current.Binding, b) {
			return task.Reject("BINDING_CHANGED", "lifecycle identity changed before transaction")
		}
		if err := s.interruptAgent(tx, b.AgentID, reason); err != nil {
			return err
		}
		return remember(tx, p, "interruption", q.RequestID, b.AgentID, q)
	})
}

type StoppedEvidence struct {
	RequestID        string       `json:"request_id"`
	ExpectedRevision int64        `json:"expected_revision"`
	Segment          int64        `json:"segment_id"`
	FencingToken     int64        `json:"fencing_token"`
	Binding          task.Binding `json:"binding"`
	Idle             bool         `json:"idle"`
	Pending          bool         `json:"pending"`
}

func (s *Service) Stopped(ctx context.Context, p Principal, id string, q StoppedEvidence) (task.Attempt, error) {
	var out task.Attempt
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "stopped:"+id, q.RequestID, q)
		if err != nil {
			return err
		}
		if prior != "" {
			out, err = task.LoadAttempt(tx, id)
			return err
		}
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		if p.Operator || p.Binding.AgentID != a.Target.AgentID || p.Binding.RuntimeID != a.Target.RuntimeID || !task.SameBinding(q.Binding, a.Target) || !q.Idle || q.Pending || q.Segment != a.Segment || q.FencingToken != a.FencingToken {
			return task.Reject("INVALID_STOP_EVIDENCE", "matching runtime and settled/no pending proof required")
		}
		if err := task.CAS(a.Revision, q.ExpectedRevision); err != nil {
			return err
		}
		if a.State != "interrupted" && a.State != "cancelled" && a.State != "needs_review" {
			return task.Reject("INVALID_STOP_STATE", a.State)
		}
		a.Cleanup = "released"
		a.Revision++
		if err := releaseAttempt(tx, a); err != nil {
			return err
		}
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		if c.RunID != nil {
			r, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return err
			}
			if err := s.cleanupRun(tx, &r); err != nil {
				return err
			}
			r.Revision++
			if err := task.SaveRun(tx, r); err != nil {
				return err
			}
		}
		if err := remember(tx, p, "stopped:"+id, q.RequestID, id, q); err != nil {
			return err
		}
		out = a
		return task.EventTx(tx, "adapter_stop_confirmed", id, a.Revision, map[string]string{"source": "adapter_lifecycle"})
	})
	return out, err
}
