package scheduler

import (
	"database/sql"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Service) ensureReviews(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for _, c := range all {
		if c.State != "completed" || c.Result == nil || c.Acceptance != nil || c.AcceptancePolicy == nil || c.AcceptancePolicy.Mode != "review" {
			continue
		}
		if c.RunID == nil {
			return task.Reject("INVALID_POLICY", "standalone review requires explicit reviewer binding")
		}
		r, err := task.LoadRun(tx, *c.RunID)
		if err != nil {
			return err
		}
		if r.RecoveryHold || task.Terminal(r.Phase) {
			continue
		}
		existing := false
		for _, review := range all {
			if review.Kind != "review" || review.State == "cancelled" {
				continue
			}
			for _, d := range review.Dependencies {
				if d.TaskID == c.ID {
					existing = true
				}
			}
		}
		if existing {
			continue
		}
		if c.AcceptancePolicy.ReviewerRef == c.RoleID {
			c.State = "needs_review"
			c.Revision++
			blocker(&c, "self_review", c.ID)
			if err := saveScheduledTask(tx, &c); err != nil {
				return err
			}
			if err := s.failAncestors(tx, c, "self_review"); err != nil {
				return err
			}
			continue
		}
		var count int
		if err := tx.QueryRow(`SELECT count(*) FROM tasks WHERE run_id=? AND json_extract(body,'$.kind')!='leader_step'`, r.ID).Scan(&count); err != nil {
			return err
		}
		if count >= r.Config.Config.Policy.MaxTotalTasks {
			c.State = "needs_review"
			blocker(&c, "review_budget", c.ID)
			if err := saveScheduledTask(tx, &c); err != nil {
				return err
			}
			if err := s.failAncestors(tx, c, "review_budget"); err != nil {
				return err
			}
			continue
		}
		id, err := project.RandomID("task-")
		if err != nil {
			return err
		}
		review := baseTask(id, "review", "独立审查候选结果及产物。提交 value={decision:accepted|rejected,reason:string,candidates:[{task_id,result_revision,hash}]}；不自行改写候选。", r.Config.Config.Policy)
		review.Scope = "team"
		review.TeamID = c.TeamID
		review.RunID = c.RunID
		review.RoleID = c.AcceptancePolicy.ReviewerRef
		review.AcceptancePolicy = nil
		review.Dependencies = []task.Dependency{{TaskID: c.ID, Condition: "execution_completed"}}
		review.Refs = []project.ResultRef{{TaskID: c.ID, ResultRevision: c.Result.Revision, Hash: c.Result.Hash}}
		review.Source = r.Source
		if err := task.SaveTask(tx, review); err != nil {
			return err
		}
		if err := task.EventTx(tx, "review_planned", id, 1, review.Refs); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) validateResultRefs(tx *sql.Tx, c task.Contract, r task.Result) error {
	return s.validateEvidenceGraph(tx, c, r, map[string]bool{})
}
func (s *Service) validateEvidenceGraph(tx *sql.Tx, c task.Contract, r task.Result, seen map[string]bool) error {
	if seen[c.ID] {
		return task.Reject("RESULT_REF_CYCLE", c.ID)
	}
	seen[c.ID] = true
	defer delete(seen, c.ID)
	for _, ref := range r.Refs {
		v, err := task.LoadTask(tx, ref.TaskID)
		if err != nil {
			return err
		}
		if !sameScope(c, v) || v.State != "completed" || v.Result == nil || v.Result.Hash != ref.Hash || v.Result.Revision != ref.ResultRevision || v.Result.GoalRevision != v.GoalRevision || len(v.Blockers) > 0 || (ref.Length != 0 && ref.Length != int64(len(v.Result.Value))) {
			return task.Reject("RESULT_VERSION_CONFLICT", ref.TaskID)
		}
		if err := s.validateArtifacts(v, *v.Result); err != nil {
			return err
		}
		if err := s.validateEvidenceGraph(tx, v, *v.Result, seen); err != nil {
			return err
		}
	}
	return nil
}
