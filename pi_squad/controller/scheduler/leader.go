package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type Decision struct {
	RequestID        string         `json:"request_id"`
	ExpectedRevision int64          `json:"expected_revision"`
	AttemptID        string         `json:"attempt_id"`
	Action           string         `json:"action"`
	Tasks            []project.Step `json:"tasks"`
	Note             string         `json:"note"`
}

func (s *Service) Decide(ctx context.Context, p Principal, id string, q Decision) (task.Run, error) {
	var out task.Run
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "decide:"+id, q.RequestID, q)
		if err != nil {
			return err
		}
		if prior != "" {
			out, err = task.LoadRun(tx, id)
			return err
		}
		r, err := task.LoadRun(tx, id)
		if err != nil {
			return err
		}
		if err := task.CAS(r.Revision, q.ExpectedRevision); err != nil {
			return err
		}
		if p.Operator || !task.SameBinding(p.Binding, r.Leader) || !r.Admitted || r.RecoveryHold || task.Terminal(r.Phase) {
			return task.Reject("FORBIDDEN", "active LeaderStep required")
		}
		a, err := task.LoadAttempt(tx, q.AttemptID)
		if err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		if c.Kind != "leader_step" || c.RunID == nil || *c.RunID != id || a.State != "running" || a.ControllerEpoch != s.Epoch || fault.Now().After(a.LeaseExpiresAt) {
			return task.Reject("STALE_EXECUTION", "LeaderStep permit required")
		}
		if q.Action != "dispatch" && len(q.Tasks) > 0 {
			return task.Reject("INVALID_DECISION", "only dispatch accepts tasks")
		}
		switch q.Action {
		case "dispatch":
			if len(q.Tasks) == 0 {
				return task.Reject("EMPTY_PLAN", "tasks required")
			}
			// Reuse the strict Workflow validator before inserting any planned node.
			w := project.Workflow{SchemaVersion: 1, WorkflowID: "leader-plan", Steps: q.Tasks}
			validation := w
			validation.Steps = append([]project.Step{}, w.Steps...)
			local := map[string]bool{}
			for _, step := range w.Steps {
				local[step.ID] = true
			}
			for _, step := range w.Steps {
				for _, dep := range step.DependsOn {
					if local[dep.Step] {
						continue
					}
					existing, err := task.LoadTask(tx, dep.Step)
					if err != nil {
						return err
					}
					if existing.RunID == nil || *existing.RunID != r.ID {
						return task.Reject("INVALID_DEPENDENCY", "foreign Run")
					}
					validation.Steps = append(validation.Steps, project.Step{ID: dep.Step, RoleRef: existing.RoleID, Kind: existing.Kind, Goal: existing.Goal, DependsOn: []project.Dependency{}})
					local[dep.Step] = true
				}
			}
			validationTeam := r.Config.Config
			validationTeam.Policy.MaxTotalTasks = len(validation.Steps)
			if err := project.ValidateWorkflow(validation, validationTeam); err != nil {
				return err
			}
			var count int
			if err := tx.QueryRow(`SELECT count(*) FROM tasks WHERE run_id=? AND json_extract(body,'$.kind')!='leader_step'`, r.ID).Scan(&count); err != nil {
				return err
			}
			if count+len(q.Tasks) > r.Config.Config.Policy.MaxTotalTasks {
				return task.Reject("TASK_BUDGET_EXHAUSTED", "plan exceeds Run budget")
			}
			if err := s.materialize(tx, r, w); err != nil {
				return err
			}
			r.Phase = "running"
		case "wait":
		case "complete":
			if err := s.finalGate(tx, r, a.ID); err != nil {
				return err
			}
			r.CompletionIntent = r.Revision + 1
		default:
			return task.Reject("INVALID_DECISION", q.Action)
		}
		r.Revision++
		if c.GuidanceCount >= len(r.Guidance) {
			r.LeaderRevision = r.Revision
		}
		value, _ := json.Marshal(map[string]any{"action": q.Action, "note": q.Note})
		result := task.Result{Revision: c.Revision + 1, GoalRevision: c.GoalRevision, AttemptID: a.ID, AgentID: a.Target.AgentID, Value: value}
		result.Hash = bodyHash(result)
		a.ResultProposed = &result
		a.State = "result_proposed"
		a.Revision++
		c.State = "result_proposed"
		c.Revision++
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		if err := task.SaveRun(tx, r); err != nil {
			return err
		}
		if err := remember(tx, p, "decide:"+id, q.RequestID, id, q); err != nil {
			return err
		}
		out = r
		return task.EventTx(tx, "leader_decision", id, r.Revision, map[string]string{"action": q.Action})
	})
	return out, err
}
func (s *Service) finalGate(tx *sql.Tx, r task.Run, ownAttempt string) error {
	tasks, err := readTasks(tx)
	if err != nil {
		return err
	}
	business := 0
	for _, c := range tasks {
		if c.RunID == nil || *c.RunID != r.ID {
			continue
		}
		if c.Kind == "leader_step" {
			continue
		}
		if c.SupersededBy != "" {
			// A once-accepted replacement can later become invalid or be
			// cancelled. Its historical link cannot waive the old obligation.
			latest := c
			seen := map[string]bool{c.ID: true}
			for latest.SupersededBy != "" {
				if seen[latest.SupersededBy] {
					return task.Reject("CALL_CYCLE", "invalid rework chain")
				}
				next, err := task.LoadTask(tx, latest.SupersededBy)
				if err != nil {
					return err
				}
				if !sameScope(c, next) || next.ReworkOf != latest.ID {
					return task.Reject("INVALID_REWORK", latest.ID)
				}
				seen[next.ID] = true
				latest = next
			}
			if latest.State != "completed" || len(latest.Blockers) != 0 || latest.Result == nil || latest.Result.GoalRevision != latest.GoalRevision || latest.Acceptance == nil || latest.Acceptance.Decision != "accepted" || latest.Acceptance.ResultHash != latest.Result.Hash || latest.Acceptance.GoalRevision != latest.GoalRevision {
				return task.Reject("ACCEPTANCE_PENDING", latest.ID)
			}
			continue
		}
		// Explicit cancellation removes an obsolete node's own obligation.
		// Remaining nodes still validate dependencies/refs against it, and the
		// cleanup query below still includes every cancelled node's execution.
		if c.State == "cancelled" || (c.Kind == "review" && (c.State == "failed" || c.State == "interrupted")) {
			continue
		}
		business++
		if c.State != "completed" || c.Result == nil || len(c.Blockers) > 0 || c.Result.GoalRevision != c.GoalRevision {
			return task.Reject("GATE_NOT_READY", c.ID)
		}
		if err := s.validateArtifacts(c, *c.Result); err != nil {
			return err
		}
		if err := s.validateResultRefs(tx, c, *c.Result); err != nil {
			return err
		}
		if c.Kind != "review" {
			if c.Acceptance == nil || c.Acceptance.Decision != "accepted" || c.Acceptance.ResultHash != c.Result.Hash || c.Acceptance.GoalRevision != c.GoalRevision {
				return task.Reject("ACCEPTANCE_PENDING", c.ID)
			}
		}
		ready, err := dependencyReady(tx, c)
		if err != nil {
			return err
		}
		if !ready {
			return task.Reject("DEPENDENCY_PENDING", c.ID)
		}
	}
	if business == 0 {
		return task.Reject("GATE_NOT_READY", "no business results")
	}
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM attempts a JOIN tasks t ON t.task_id=a.task_id WHERE t.run_id=? AND a.cleanup!='released' AND a.attempt_id!=?`, r.ID, ownAttempt).Scan(&n); err != nil {
		return err
	}
	if n != 0 {
		return task.Reject("EXECUTION_UNCONFIRMED", "related executions remain")
	}
	return nil
}
func (s *Service) ensureLeaderSteps(tx *sql.Tx) error {
	runs, err := readRuns(tx)
	if err != nil {
		return err
	}
	for _, r := range runs {
		if !r.Admitted || r.RecoveryHold || task.Terminal(r.Phase) || r.LeaderRevision >= r.Revision {
			continue
		}
		var n int
		if err := tx.QueryRow(`SELECT count(*) FROM tasks WHERE run_id=? AND json_extract(body,'$.kind')='leader_step' AND state NOT IN ('completed','cancelled','failed','interrupted')`, r.ID).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			continue
		}
		target, err := s.leader(tx, r.TeamID)
		if err != nil {
			continue
		}
		if !task.SameBinding(target.Binding, r.Leader) {
			continue
		}
		id, err := project.RandomID("task-")
		if err != nil {
			return err
		}
		c := baseTask(id, "leader_step", r.Goal, r.Config.Config.Policy)
		c.GuidanceCount = len(r.Guidance)
		c.Scope = "team"
		c.RunID = &r.ID
		c.TeamID = &r.TeamID
		c.Target = &target.Binding
		c.Accepted = true
		c.State = "queued"
		c.AcceptancePolicy = nil
		c.AllowedTools = []string{"squad_decide", "squad_run_get", "agent_task_get"}
		c.Source = r.Source
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		r.LeaderRevision = r.Revision
		if err := task.SaveRun(tx, r); err != nil {
			return err
		}
		if err := task.EventTx(tx, "leader_step_planned", c.ID, c.Revision, map[string]string{"run_id": r.ID}); err != nil {
			return err
		}
	}
	return nil
}
