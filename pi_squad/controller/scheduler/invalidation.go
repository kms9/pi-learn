package scheduler

import (
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Service) invalidateChangedResults(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for _, c := range all {
		if c.State != "completed" || c.Result == nil || c.Kind == "leader_step" {
			continue
		}
		if c.RunID != nil {
			run, err := task.LoadRun(tx, *c.RunID)
			if err != nil {
				return err
			}
			if task.Terminal(run.Phase) {
				continue
			}
		}
		invalid := s.validateArtifacts(c, *c.Result)
		if invalid == nil {
			invalid = s.validateResultRefs(tx, c, *c.Result)
		}
		if invalid == nil && c.Result.GoalRevision != c.GoalRevision {
			invalid = task.Reject("GOAL_VERSION_CHANGED", c.ID)
		}
		if invalid == nil {
			continue
		}
		c.Acceptance = nil
		c.State = "needs_review"
		c.Revision++
		blocker(&c, "result_evidence_changed", invalid.Error())
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		if err := s.failAncestors(tx, c, "result_evidence_changed"); err != nil {
			return err
		}
		if err := task.EventTx(tx, "acceptance_invalidated", c.ID, c.Revision, map[string]string{"reason": invalid.Error()}); err != nil {
			return err
		}
	}
	return s.coverChildren(tx)
}

// Outbox delivery is an idempotent wake-up hint; the same transaction performs
// a bounded delivery batch and the authoritative admission scan.
func consumeOutbox(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT o.event_seq,e.type FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE o.published=0 ORDER BY o.event_seq LIMIT 256`)
	if err != nil {
		return err
	}
	type item struct {
		seq  int64
		kind string
	}
	batch := []item{}
	for rows.Next() {
		var v item
		if err := rows.Scan(&v.seq, &v.kind); err != nil {
			rows.Close()
			return err
		}
		batch = append(batch, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, v := range batch {
		if v.kind == "roles_released" {
			if err := fault.Point("release_before_consume"); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`UPDATE outbox SET published=1 WHERE event_seq=? AND published=0`, v.seq); err != nil {
			return err
		}
	}
	return nil
}
