package scheduler

import (
	"database/sql"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// fixedReworkLimit bounds how many times one result may be reworked after rejections
// (EXP-03 uses three). The review that follows a rework is created by ensureReviews.
const fixedReworkLimit = 3

// ensureFixedFlow runs a Run of a Team in leader mode "fixed" without an LLM Leader. The
// workflow was materialized when the Run was created. Here the Controller marks the Run
// running once it is admitted, plans one rework for each rejected result (within the
// limit), and completes the Run when the same final check a Leader's "complete" meets
// passes. Nothing is accepted that a Leader could not have accepted.
func (s *Service) ensureFixedFlow(tx *sql.Tx) error {
	runs, err := readRuns(tx)
	if err != nil {
		return err
	}
	for _, r := range runs {
		if !r.Admitted || r.RecoveryHold || task.Terminal(r.Phase) || r.Config.Config.Leader.Mode != "fixed" {
			continue
		}
		tasks, err := readTasks(tx)
		if err != nil {
			return err
		}
		if err := s.planFixedReworks(tx, r, tasks); err != nil {
			return err
		}
		if r.Phase == "planning" {
			r.Phase = "running"
			r.Revision++
			if err := task.SaveRun(tx, r); err != nil {
				return err
			}
		}
		if err := s.finalGate(tx, r, ""); err != nil {
			continue
		}
		r.Phase = "completed"
		r.Revision++
		if err := s.cleanupRun(tx, &r); err != nil {
			return err
		}
		if err := task.SaveRun(tx, r); err != nil {
			return err
		}
		if err := task.EventTx(tx, "fixed_flow_completed", r.ID, r.Revision, map[string]string{"run_id": r.ID}); err != nil {
			return err
		}
	}
	return nil
}

// planFixedReworks plans one rework for each rejected result of the Run that has no rework
// yet. The rework takes the rejected task's dependencies and refs and carries the
// reviewer's reason in its goal. The rejected result stays rejected until the rework is
// accepted, so the final check keeps refusing the Run in the meantime.
func (s *Service) planFixedReworks(tx *sql.Tx, r task.Run, tasks []task.Contract) error {
	byID := map[string]task.Contract{}
	for _, c := range tasks {
		byID[c.ID] = c
	}
	for _, c := range tasks {
		if c.RunID == nil || *c.RunID != r.ID || c.Kind == "review" || c.Kind == "leader_step" || c.Acceptance == nil || c.Acceptance.Decision != "rejected" || c.SupersededBy != "" {
			continue
		}
		if hasRework(tasks, c.ID) || reworkDepth(byID, c) >= fixedReworkLimit {
			continue
		}
		step := project.Step{
			ID: "rework", RoleRef: c.RoleID, Kind: "execute",
			Goal: c.Goal + "\n\n审核退回，意见：" + c.Acceptance.Reason, ReworkOf: c.ID,
			DependsOn: []project.Dependency{}, Refs: append([]project.ResultRef{}, c.Refs...),
		}
		// A rework of a result that a review chain judged goes through the same chain again.
		if c.AcceptancePolicy != nil && len(c.AcceptancePolicy.ReviewerRefs) > 0 {
			step.Reviewers = append([]string{}, c.AcceptancePolicy.ReviewerRefs...)
		}
		for _, d := range c.Dependencies {
			step.DependsOn = append(step.DependsOn, project.Dependency{Step: d.TaskID, Condition: d.Condition})
		}
		w := project.Workflow{SchemaVersion: 1, WorkflowID: "fixed-rework", Steps: []project.Step{step}}
		if err := s.materialize(tx, r, w, task.Origin{Kind: "rework", By: c.ID}); err != nil {
			return err
		}
		if err := task.EventTx(tx, "fixed_rework_planned", c.ID, c.Revision, map[string]string{"run_id": r.ID}); err != nil {
			return err
		}
	}
	return nil
}

// hasRework says whether a live rework already replaces the task.
func hasRework(tasks []task.Contract, id string) bool {
	for _, c := range tasks {
		if c.ReworkOf == id && c.State != "cancelled" {
			return true
		}
	}
	return false
}

// reworkDepth counts the rework links behind a task: 0 for an original result.
func reworkDepth(byID map[string]task.Contract, c task.Contract) int {
	depth := 0
	for cur := c; cur.ReworkOf != "" && depth <= len(byID); depth++ {
		next, ok := byID[cur.ReworkOf]
		if !ok {
			break
		}
		cur = next
	}
	return depth
}
