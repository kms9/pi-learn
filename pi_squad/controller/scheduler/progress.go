package scheduler

import (
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
	"reflect"
	"sort"
)

// Preserve the start of an unchanged wait and publish changes with a revision.
func saveScheduledTask(tx *sql.Tx, c *task.Contract) error {
	old, err := task.LoadTask(tx, c.ID)
	if err != nil {
		return err
	}
	for i := range c.Blockers {
		for _, before := range old.Blockers {
			if c.Blockers[i].Kind == before.Kind && c.Blockers[i].Resource == before.Resource && c.Blockers[i].Owner == before.Owner {
				c.Blockers[i].Since = before.Since
				c.Blockers[i].Revision = before.Revision
				break
			}
		}
	}
	sort.Slice(c.Blockers, func(i, j int) bool {
		return c.Blockers[i].Kind+c.Blockers[i].Resource+c.Blockers[i].Owner < c.Blockers[j].Kind+c.Blockers[j].Resource+c.Blockers[j].Owner
	})
	if reflect.DeepEqual(*c, old) {
		return nil
	}
	if c.Revision <= old.Revision {
		c.Revision = old.Revision + 1
	}
	if err := task.SaveTask(tx, *c); err != nil {
		return err
	}
	return task.EventTx(tx, "task_progress", c.ID, c.Revision, map[string]any{"state": c.State, "blockers": c.Blockers})
}

func saveScheduledRun(tx *sql.Tx, r *task.Run) error {
	old, err := task.LoadRun(tx, r.ID)
	if err != nil {
		return err
	}
	sort.Slice(r.WaitingRoles, func(i, j int) bool { return r.WaitingRoles[i].RoleID < r.WaitingRoles[j].RoleID })
	for i := range r.Blockers {
		for _, previous := range old.Blockers {
			if r.Blockers[i].Kind == previous.Kind && r.Blockers[i].Resource == previous.Resource && r.Blockers[i].Owner == previous.Owner {
				r.Blockers[i].Since = previous.Since
				if r.Blockers[i].Owner == "" {
					r.Blockers[i].Revision = previous.Revision
				}
				break
			}
		}
	}
	sort.Slice(r.Blockers, func(i, j int) bool {
		return r.Blockers[i].Kind+r.Blockers[i].Resource+r.Blockers[i].Owner < r.Blockers[j].Kind+r.Blockers[j].Resource+r.Blockers[j].Owner
	})
	if reflect.DeepEqual(*r, old) {
		return nil
	}
	if r.Revision <= old.Revision {
		r.Revision = old.Revision + 1
	}
	if err := task.SaveRun(tx, *r); err != nil {
		return err
	}
	return task.EventTx(tx, "run_wait", r.ID, r.Revision, r.Blockers)
}
