package scheduler

import (
	"database/sql"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// Q41 (UI plan §4.4, D2): a task built on a version that was later replaced (rejected
// and reworked) is stale. The final check refuses it until a person redoes it with the
// new version (task:rebase) or keeps it as it is (task:keep).

// latestOf follows a rework chain to the version that replaced the others.
func latestOf(tx *sql.Tx, id string) (task.Contract, error) {
	c, err := task.LoadTask(tx, id)
	seen := map[string]bool{}
	for err == nil && c.SupersededBy != "" && !seen[c.ID] {
		seen[c.ID] = true
		c, err = task.LoadTask(tx, c.SupersededBy)
	}
	return c, err
}

// staleInputs names the inputs of a task that were replaced since it used them.
func staleInputs(tx *sql.Tx, c task.Contract) ([]string, error) {
	if c.StaleKept || c.SupersededBy != "" || c.State == "cancelled" || c.Kind == "review" || c.Kind == "leader_step" {
		return nil, nil
	}
	ids := map[string]bool{}
	for _, d := range c.Dependencies {
		ids[d.TaskID] = true
	}
	for _, r := range c.Refs {
		ids[r.TaskID] = true
	}
	out := []string{}
	for id := range ids {
		input, err := task.LoadTask(tx, id)
		if err != nil {
			return nil, err
		}
		if input.SupersededBy != "" {
			out = append(out, id)
		}
	}
	return out, nil
}

// rebase redoes a stale task with the newest versions of its inputs: a rework under it,
// wired to them, and the old result marked rejected because its input changed, so the
// usual rework path replaces it once the redo is accepted.
func (s *Service) rebase(tx *sql.Tx, c task.Contract) (task.Contract, error) {
	if c.RunID == nil {
		return c, task.Reject("INVALID_REBASE", "only a Run's task can be redone")
	}
	r, err := task.LoadRun(tx, *c.RunID)
	if err != nil {
		return c, err
	}
	if task.Terminal(r.Phase) {
		return c, task.Reject("RUN_TERMINAL", r.Phase)
	}
	stale, err := staleInputs(tx, c)
	if err != nil {
		return c, err
	}
	if len(stale) == 0 {
		return c, task.Reject("NOT_STALE", "every input is current")
	}
	if c.State != "completed" || c.Result == nil {
		return c, task.Reject("INVALID_REBASE", "redo a finished task; retry a failed one")
	}
	replace := map[string]string{}
	for _, id := range stale {
		latest, err := latestOf(tx, id)
		if err != nil {
			return c, err
		}
		replace[id] = latest.ID
	}
	swap := func(id string) string {
		if next, ok := replace[id]; ok {
			return next
		}
		return id
	}
	id, err := project.RandomID("task-")
	if err != nil {
		return c, err
	}
	n := baseTask(id, "rework", c.Goal, c.Policy)
	n.Scope, n.RunID, n.TeamID, n.RoleID, n.Source = c.Scope, c.RunID, c.TeamID, c.RoleID, c.Source
	n.Title = c.Title
	n.ReworkOf = c.ID
	n.Origin = &task.Origin{Kind: "rework", By: c.ID}
	n.AcceptancePolicy = c.AcceptancePolicy
	n.ExpectedOutput, n.AcceptanceCriteria, n.WriteSet = c.ExpectedOutput, c.AcceptanceCriteria, append([]string{}, c.WriteSet...)
	for _, d := range c.Dependencies {
		n.Dependencies = append(n.Dependencies, task.Dependency{TaskID: swap(d.TaskID), Condition: d.Condition})
	}
	for _, ref := range c.Refs {
		if next, ok := replace[ref.TaskID]; ok {
			n.Refs = append(n.Refs, project.ResultRef{TaskID: next})
		} else {
			n.Refs = append(n.Refs, ref)
		}
	}
	if err := task.SaveTask(tx, n); err != nil {
		return c, err
	}
	if err := saveAcceptance(tx, &c, task.Acceptance{Decision: "rejected", Mode: "rebase", ResultHash: c.Result.Hash, GoalRevision: c.GoalRevision, Reason: "输入已更新：改用新版本重做"}); err != nil {
		return c, err
	}
	if err := task.EventTx(tx, "task_rebased", c.ID, c.Revision, map[string]string{"redo": n.ID}); err != nil {
		return c, err
	}
	r.Revision++
	if err := task.SaveRun(tx, r); err != nil {
		return c, err
	}
	return task.LoadTask(tx, c.ID)
}
