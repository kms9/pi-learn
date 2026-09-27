package scheduler

import (
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

// Continuations retain the original Attempt/context/affinity; only segment and
// fencing permission change. Fault recovery is intentionally a different path.
func (s *Service) resumeReady(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for _, queued := range all {
		c, err := task.LoadTask(tx, queued.ID)
		if err != nil {
			return err
		}
		if c.State != "waiting_dependency" || len(c.AttemptIDs) == 0 {
			continue
		}
		a, err := task.LoadAttempt(tx, c.AttemptIDs[len(c.AttemptIDs)-1])
		if err != nil {
			return err
		}
		if a.State != "suspended" || a.Cleanup == "released" {
			continue
		}
		if c.RunID != nil {
			r, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return err
			}
			if !r.Admitted || r.RecoveryHold || task.Terminal(r.Phase) {
				continue
			}
		}
		if a.ClarificationID != "" {
			var status, answer string
			if err := tx.QueryRow(`SELECT state,answer FROM clarifications WHERE id=?`, a.ClarificationID).Scan(&status, &answer); err != nil {
				return err
			}
			if status != "answered" {
				continue
			}
			a.ClarificationText = answer
			a.ClarificationID = ""
		}
		ready, err := dependencyReady(tx, c)
		if err != nil {
			return err
		}
		if !ready {
			continue
		}
		if err := s.resolveTaskRefs(tx, &c); err != nil {
			c.State = "needs_review"
			c.Revision++
			blocker(&c, "result_ref_invalid", err.Error())
			if saveErr := task.SaveTask(tx, c); saveErr != nil {
				return saveErr
			}
			if holdErr := s.failAncestors(tx, c, "result_ref_invalid"); holdErr != nil {
				return holdErr
			}
			continue
		}
		i, err := loadInstance(tx, a.Target.AgentID)
		if err != nil {
			return err
		}
		if !s.Online(i) || !task.SameBinding(i.Binding, a.Target) || i.Activity != "idle" {
			continue
		}
		var count int
		if err := tx.QueryRow(`SELECT count(*) FROM execution_leases`).Scan(&count); err != nil {
			return err
		}
		if count >= s.Config.MaxParallel {
			continue
		}
		if c.TeamID != nil {
			if err := tx.QueryRow(`SELECT count(*) FROM execution_leases WHERE team_id=?`, *c.TeamID).Scan(&count); err != nil {
				return err
			}
			if count >= c.Policy.MaxParallelTasks {
				continue
			}
		}
		if _, err := tx.Exec(`UPDATE controller_state SET fencing=fencing+1`); err != nil {
			return err
		}
		if err := tx.QueryRow(`SELECT fencing FROM controller_state`).Scan(&a.FencingToken); err != nil {
			return err
		}
		if c.AppliedRevision < c.GoalRevision {
			for _, amend := range c.Amendments {
				c.Goal += "\n" + amend
			}
			c.Amendments = []string{}
			c.AppliedRevision = c.GoalRevision
		}
		a.Mode = ""
		a.Segment++
		a.ControllerEpoch = s.Epoch
		a.LeaseExpiresAt = fault.Now().Add(s.Config.LeaseTTL)
		a.Receipt = "dispatch_intent"
		a.State = "admitted"
		a.Error = ""
		a.YieldRequested = false
		a.ResultProposed = nil
		a.Revision++
		c.State = "dispatching"
		c.Blockers = []task.Blocker{}
		c.Revision++
		if _, err := tx.Exec(`INSERT INTO execution_leases VALUES(?,?,?,?,?,?)`, a.ID, a.Target.AgentID, c.TeamID, a.Segment, a.FencingToken, a.LeaseExpiresAt.Format(time.RFC3339Nano)); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE write_reservations SET fencing=? WHERE attempt_id=?`, a.FencingToken, a.ID); err != nil {
			return err
		}
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		if err := task.EventTx(tx, "continuation_ready", a.ID, a.Revision, map[string]any{"segment": a.Segment}); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) afterCompletion(tx *sql.Tx, c task.Contract, a task.Attempt) error {
	if c.State != "completed" {
		return nil
	}
	if err := s.applyAcceptance(tx, &c); err != nil {
		// Preserve the committed execution evidence even when acceptance fails.
		// Roll back partial multi-candidate verdicts, never the settled receipt.
		if _, rollbackErr := tx.Exec(`ROLLBACK TO acceptance_application`); rollbackErr != nil {
			return rollbackErr
		}
		c, loadErr := task.LoadTask(tx, c.ID)
		if loadErr != nil {
			return loadErr
		}
		c.State = "needs_review"
		c.Revision++
		blocker(&c, "acceptance_failed", err.Error())
		if saveErr := task.SaveTask(tx, c); saveErr != nil {
			return saveErr
		}
		if holdErr := s.failAncestors(tx, c, "acceptance_failed"); holdErr != nil {
			return holdErr
		}
		return task.EventTx(tx, "acceptance_failed", c.ID, c.Revision, map[string]string{"reason": err.Error()})
	}
	if err := publishAskReply(tx, c); err != nil {
		return err
	}
	if c.RunID == nil {
		return nil
	}
	r, err := task.LoadRun(tx, *c.RunID)
	if err != nil {
		return err
	}
	if c.Kind == "leader_step" {
		if r.CompletionIntent != 0 && r.CompletionIntent != r.Revision {
			// Guidance, recovery, or another Run change invalidates the old
			// completion proposal. A later LeaderStep must decide again.
			r.CompletionIntent = 0
			r.Revision++
		}
		if r.CompletionIntent != 0 && !r.RecoveryHold {
			if err := s.finalGate(tx, r, ""); err != nil {
				r.CompletionIntent = 0
				r.Revision++
				r.Phase = "needs_review"
				r.RecoveryHold = true
			} else {
				r.Phase = "completed"
				r.Revision++
				if err := s.cleanupRun(tx, &r); err != nil {
					return err
				}
			}
		}
	} else {
		r.Revision++
	}
	if err := task.SaveRun(tx, r); err != nil {
		return err
	}
	return task.EventTx(tx, "run_progress", r.ID, r.Revision, map[string]string{"task_id": c.ID})
}
