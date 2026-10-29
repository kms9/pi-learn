package scheduler

import (
	"database/sql"
	"encoding/json"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
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
		chain := reviewChain(c.AcceptancePolicy)
		next := nextReviewer(all, c, chain)
		if next < 0 {
			continue
		}
		reviewer := chain[next]
		if reviewer == c.RoleID {
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
		review.RoleID = reviewer
		review.Origin = &task.Origin{Kind: "review", By: c.ID}
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
// reviewChain is the reviewers of a result in the order they review it: the team's single
// reviewer, or a step's chain (D6).
func reviewChain(p *project.AcceptancePolicy) []string {
	if len(p.ReviewerRefs) > 0 {
		return p.ReviewerRefs
	}
	return []string{p.ReviewerRef}
}

// nextReviewer is the index in chain of the reviewer whose review of c is due, or -1 when
// none is due: a review is still running, one rejected c, or every reviewer has accepted.
// Reviews of c come one after the other, so the number of accepted reviews is the stage.
func nextReviewer(all []task.Contract, c task.Contract, chain []string) int {
	done := 0
	for _, review := range all {
		if review.Kind != "review" || review.State == "cancelled" || !dependsOn(review, c.ID) {
			continue
		}
		if review.State != "completed" || reviewDecision(review) != "accepted" {
			return -1
		}
		done++
	}
	if done >= len(chain) {
		return -1
	}
	return done
}

// acceptedReviews counts the completed reviews of c that accepted it, leaving out except
// (the review whose verdict is being applied).
func acceptedReviews(all []task.Contract, c task.Contract, except string) int {
	n := 0
	for _, review := range all {
		if review.Kind == "review" && review.ID != except && review.State == "completed" && dependsOn(review, c.ID) && reviewDecision(review) == "accepted" {
			n++
		}
	}
	return n
}

// dependsOn says whether the task has an edge to id.
func dependsOn(c task.Contract, id string) bool {
	for _, d := range c.Dependencies {
		if d.TaskID == id {
			return true
		}
	}
	return false
}

// reviewDecision is the verdict a completed review gave, or "" when it has none.
func reviewDecision(review task.Contract) string {
	if review.Result == nil {
		return ""
	}
	var verdict struct {
		Decision string `json:"decision"`
	}
	if err := json.Unmarshal(review.Result.Value, &verdict); err != nil {
		return ""
	}
	return verdict.Decision
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
