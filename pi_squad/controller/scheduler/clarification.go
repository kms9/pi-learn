package scheduler

import (
	"context"
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type ClarificationRequest struct {
	RequestID        string `json:"request_id"`
	ExpectedRevision int64  `json:"expected_revision"`
	Question         string `json:"question"`
}

func (s *Service) Clarify(ctx context.Context, p Principal, id string, q ClarificationRequest) (task.Attempt, error) {
	var out task.Attempt
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "clarify:"+id, q.RequestID, q)
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
		if p.Operator || !task.SameBinding(p.Binding, a.Target) || a.State != "running" || a.ControllerEpoch != s.Epoch || fault.Now().After(a.LeaseExpiresAt) {
			return task.Reject("STALE_EXECUTION", "live child Attempt required")
		}
		if err := task.CAS(a.Revision, q.ExpectedRevision); err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		if c.Kind == "ask" || a.Mode == "response_only" || c.ParentID == "" || q.Question == "" {
			return task.Reject("INVALID_CLARIFICATION", "child and nonempty question required")
		}
		parent, err := task.LoadTask(tx, c.ParentID)
		if err != nil {
			return err
		}
		if len(parent.AttemptIDs) == 0 {
			return task.Reject("PARENT_UNAVAILABLE", parent.ID)
		}
		pa, err := task.LoadAttempt(tx, parent.AttemptIDs[len(parent.AttemptIDs)-1])
		if err != nil {
			return err
		}
		if pa.State != "suspended" || pa.Cleanup == "released" {
			return task.Reject("PARENT_UNAVAILABLE", parent.ID)
		}
		cid, err := project.RandomID("clarification-")
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO clarifications VALUES(?,?,?,?,?,'','waiting_child_settled')`, cid, a.ID, pa.ID, q.Question, c.RootID); err != nil {
			return err
		}
		a.YieldRequested = true
		a.ClarificationID = cid
		a.Revision++
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		if err := remember(tx, p, "clarify:"+id, q.RequestID, id, q); err != nil {
			return err
		}
		out = a
		return task.EventTx(tx, "clarification_requested", cid, 1, map[string]string{"child": a.ID, "parent": pa.ID})
	})
	return out, err
}
func (s *Service) startResponses(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT id,child_attempt,parent_attempt,question FROM clarifications WHERE state='waiting_child_settled'`)
	if err != nil {
		return err
	}
	type request struct{ id, child, parent, question string }
	requests := []request{}
	for rows.Next() {
		var q request
		if err := rows.Scan(&q.id, &q.child, &q.parent, &q.question); err != nil {
			rows.Close()
			return err
		}
		requests = append(requests, q)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, q := range requests {
		child, err := task.LoadAttempt(tx, q.child)
		if err != nil {
			return err
		}
		if child.State != "suspended" {
			continue
		}
		parent, err := task.LoadAttempt(tx, q.parent)
		if err != nil {
			return err
		}
		if parent.State != "suspended" || parent.Cleanup == "released" {
			continue
		}
		c, err := task.LoadTask(tx, parent.TaskID)
		if err != nil {
			return err
		}
		if c.RunID != nil {
			r, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return err
			}
			if r.RecoveryHold || !r.Admitted || task.Terminal(r.Phase) {
				continue
			}
		}
		i, err := loadInstance(tx, parent.Target.AgentID)
		if err != nil {
			return err
		}
		if !s.Online(i) || !task.SameBinding(i.Binding, parent.Target) || i.Activity != "idle" {
			continue
		}
		ok, err := s.capacityAvailable(tx, c)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		if _, err := tx.Exec(`UPDATE controller_state SET fencing=fencing+1`); err != nil {
			return err
		}
		if err := tx.QueryRow(`SELECT fencing FROM controller_state`).Scan(&parent.FencingToken); err != nil {
			return err
		}
		parent.Segment++
		parent.State = "admitted"
		parent.Mode = "response_only"
		parent.ClarificationID = q.id
		parent.ClarificationText = q.question
		parent.Receipt = "dispatch_intent"
		parent.YieldRequested = false
		parent.LeaseExpiresAt = fault.Now().Add(s.Config.LeaseTTL)
		parent.Revision++
		if _, err := tx.Exec(`INSERT INTO execution_leases VALUES(?,?,?,?,?,?)`, parent.ID, parent.Target.AgentID, c.TeamID, parent.Segment, parent.FencingToken, parent.LeaseExpiresAt.Format(time.RFC3339Nano)); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE clarifications SET state='answering' WHERE id=?`, q.id); err != nil {
			return err
		}
		if err := task.SaveAttempt(tx, parent); err != nil {
			return err
		}
		if err := task.EventTx(tx, "clarification_response_ready", parent.ID, parent.Revision, nil); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) capacityAvailable(tx *sql.Tx, c task.Contract) (bool, error) {
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM execution_leases`).Scan(&n); err != nil {
		return false, err
	}
	if n >= s.Config.MaxParallel {
		return false, nil
	}
	if c.TeamID != nil {
		if err := tx.QueryRow(`SELECT count(*) FROM execution_leases WHERE team_id=?`, *c.TeamID).Scan(&n); err != nil {
			return false, err
		}
		if n >= c.Policy.MaxParallelTasks {
			return false, nil
		}
	}
	return true, nil
}
