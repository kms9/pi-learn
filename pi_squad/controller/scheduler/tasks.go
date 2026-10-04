package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"strings"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type CreateTask struct {
	ExpectedOutput     json.RawMessage     `json:"expected_output,omitempty"`
	AcceptanceCriteria json.RawMessage     `json:"acceptance,omitempty"`
	RequestID          string              `json:"request_id"`
	RunID              string              `json:"run_id,omitempty"`
	ParentID           string              `json:"parent_id,omitempty"`
	Target             string              `json:"target"`
	Kind               string              `json:"kind"`
	Goal               string              `json:"goal"`
	WriteSet           []string            `json:"write_set"`
	Dependencies       []task.Dependency   `json:"dependencies"`
	Refs               []project.ResultRef `json:"refs"`
	ExpectedRevision   int64               `json:"expected_revision,omitempty"`
}

func contains(values []string, v string) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}
func (s *Service) CreateTask(ctx context.Context, p Principal, q CreateTask) (task.Contract, error) {
	var out task.Contract
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		id, err := replay(tx, p, "create_task", q.RequestID, q)
		if err != nil {
			return err
		}
		if id != "" {
			out, err = task.LoadTask(tx, id)
			return err
		}
		c, err := s.createTask(tx, p, q)
		if err != nil {
			return err
		}
		out = c
		if err := remember(tx, p, "create_task", q.RequestID, c.ID, q); err != nil {
			return err
		}
		return task.EventTx(tx, "task_accepted", c.ID, c.Revision, map[string]any{"run_id": c.RunID, "state": c.State})
	})
	return out, err
}
func (s *Service) createTask(tx *sql.Tx, p Principal, q CreateTask) (task.Contract, error) {
	var zero task.Contract
	if strings.TrimSpace(q.Goal) == "" || !project.ValidID(q.Target) {
		return zero, task.Reject("EMPTY_HANDOFF_TASK", "target and goal required")
	}
	if q.Kind == "" {
		q.Kind = "execute"
	}
	switch q.Kind {
	case "execute", "review", "rework", "ask":
	default:
		return zero, task.Reject("INVALID_TASK_KIND", q.Kind)
	}
	id, err := project.RandomID("task-")
	if err != nil {
		return zero, err
	}
	policy := project.Policy{MaxParallelTasks: s.Config.MaxParallel, MaxDelegateDepth: 3, MaxTotalTasks: 20, MaxAttemptsPerTask: 3, AllowedTools: s.Config.DirectTools, WritableRoots: []string{}, Acceptance: project.AcceptancePolicy{Mode: "human", ChildPolicy: "inherit_parent"}}
	var run *task.Run
	var parent *task.Contract
	if q.ParentID != "" {
		v, err := task.LoadTask(tx, q.ParentID)
		if err != nil {
			return zero, err
		}
		parent = &v
		if task.Terminal(v.State) || v.State == "needs_review" {
			return zero, task.Reject("PARENT_UNAVAILABLE", v.State)
		}
		if err := task.CAS(v.Revision, q.ExpectedRevision); err != nil {
			return zero, err
		}
		if !p.Operator && (v.Target == nil || !task.SameBinding(*v.Target, p.Binding)) {
			return zero, task.Reject("FORBIDDEN", "parent binding mismatch")
		}
		if len(v.AttemptIDs) == 0 {
			return zero, task.Reject("PARENT_UNAVAILABLE", "parent has no Attempt")
		}
		a, err := task.LoadAttempt(tx, v.AttemptIDs[len(v.AttemptIDs)-1])
		if err != nil {
			return zero, err
		}
		if !p.Operator && (a.State != "running" || a.Mode == "response_only" || v.Kind == "ask" || a.ControllerEpoch != s.Epoch || fault.Now().After(a.LeaseExpiresAt)) {
			return zero, task.Reject("STALE_EXECUTION", "active delegating work segment required")
		}
		if a.Cleanup == "released" {
			return zero, task.Reject("PARENT_UNAVAILABLE", "parent execution ended")
		}
		policy = v.Policy
		if v.RunID != nil {
			if q.RunID != "" && q.RunID != *v.RunID {
				return zero, task.Reject("INVALID_SCOPE", "child Run must match parent")
			}
			q.RunID = *v.RunID
		} else if q.RunID != "" {
			return zero, task.Reject("INVALID_SCOPE", "standalone parent cannot enter Team")
		}
	}
	if q.RunID != "" {
		v, err := task.LoadRun(tx, q.RunID)
		if err != nil {
			return zero, err
		}
		run = &v
		if task.Terminal(v.Phase) || v.RecoveryHold {
			return zero, task.Reject("RUN_UNAVAILABLE", v.Phase)
		}
		policy = v.Config.Config.Policy
		if !p.Operator && parent == nil && !task.SameBinding(p.Binding, v.Leader) {
			return zero, task.Reject("FORBIDDEN", "Run work requires Leader or parent scope")
		}
	}
	// Explicit Pi commands retain their authenticated source scope even when
	// operator credentials authorize the action. A local CLI has no Pi binding.
	if p.Binding.AgentID != "" && parent == nil {
		if run == nil {
			var teamContexts int
			if err := tx.QueryRow(`SELECT
			 (SELECT COUNT(*) FROM role_ownership o JOIN primary_bindings b ON b.role_id=o.role_id WHERE b.agent_id=?) +
			 (SELECT COUNT(*) FROM runs WHERE admitted=1 AND cleanup!='released' AND json_extract(body,'$.leader.agent_id')=? AND json_extract(body,'$.leader.runtime_id')=? AND json_extract(body,'$.leader.session_id')=?)`,
				p.Binding.AgentID, p.Binding.AgentID, p.Binding.RuntimeID, p.Binding.SessionID).Scan(&teamContexts); err != nil {
				return zero, err
			}
			if teamContexts != 0 {
				// Report a foreign target's ownership before rejecting the
				// caller's attempted standalone escape. The target may be a
				// Secondary; it never bypasses its Role's Run ownership.
				target, targetErr := loadInstance(tx, q.Target)
				if targetErr == nil {
					var sourceRun string
					if err := tx.QueryRow(`SELECT run_id FROM role_ownership o JOIN primary_bindings b ON b.role_id=o.role_id WHERE b.agent_id=? UNION ALL SELECT run_id FROM runs WHERE admitted=1 AND cleanup!='released' AND json_extract(body,'$.leader.agent_id')=? LIMIT 1`, p.Binding.AgentID, p.Binding.AgentID).Scan(&sourceRun); err != nil {
						return zero, err
					}
					if err := rejectForeignRoleOwner(tx, target.RoleID, sourceRun); err != nil {
						return zero, err
					}
				}
				return zero, task.Reject("ACTIVE_TEAM_SCOPE_CONFLICT", "active Team member cannot escape into standalone work")
			}
		}
		var occupied string
		err := tx.QueryRow(`SELECT attempt_id FROM agent_reservations WHERE agent_id=?`, p.Binding.AgentID).Scan(&occupied)
		if err == nil && run == nil {
			return zero, task.Reject("ACTIVE_TASK_SCOPE_CONFLICT", "use current parent")
		}
		if err != nil && err != sql.ErrNoRows {
			return zero, err
		}
	}
	c := baseTask(id, q.Kind, q.Goal, policy)
	if _, err := project.ParseOutputSchema(q.ExpectedOutput); err != nil {
		return zero, err
	}
	c.ExpectedOutput = q.ExpectedOutput
	c.AcceptanceCriteria = q.AcceptanceCriteria
	c.Source = sourceOf(p)
	c.Source.InputID = q.RequestID
	c.Refs = append([]project.ResultRef{}, q.Refs...)
	c.Dependencies = append([]task.Dependency{}, q.Dependencies...)
	c.WriteSet = append([]string{}, q.WriteSet...)
	if q.Kind == "ask" {
		if len(c.WriteSet) > 0 {
			return zero, task.Reject("READ_ONLY", "ask cannot write")
		}
		c.AllowedTools = []string{}
	}
	var target Instance
	if run != nil {
		c.Scope = "team"
		c.RunID = &run.ID
		c.TeamID = &run.TeamID
		c.RoleID = q.Target
		if !roleSet(*run)[q.Target] {
			if err := rejectForeignRoleOwner(tx, q.Target, run.ID); err != nil {
				return zero, err
			}
			return zero, task.Reject("ROLE_NOT_IN_TEAM", q.Target)
		}
		target, err = s.primary(tx, q.Target)
	} else {
		if len(q.WriteSet) > 0 {
			return zero, task.Reject("READ_ONLY", "standalone v1 is read-only")
		}
		if !p.Operator && parent == nil && (!contains(s.Config.DirectCallers, p.Binding.AgentID) || !contains(s.Config.DirectTargets, q.Target)) {
			return zero, task.Reject("DIRECT_NOT_AUTHORIZED", "root direct requires declared grants")
		}
		if parent != nil && !contains(s.Config.DirectTargets, q.Target) && !p.Operator {
			return zero, task.Reject("DIRECT_NOT_AUTHORIZED", "child target outside inherited grants")
		}
		target, err = loadInstance(tx, q.Target)
		if err == nil && (!s.Online(target) || target.Mode != "role") {
			return zero, task.Reject("AGENT_OFFLINE", q.Target)
		}
		c.RoleID = target.RoleID
	}
	if err != nil {
		return zero, err
	}
	allowedRun := ""
	if run != nil {
		allowedRun = run.ID
	}
	if err := rejectForeignRoleOwner(tx, target.RoleID, allowedRun); err != nil {
		// A queued Run may accept work for a member in its frozen roster, but
		// cannot allocate an Attempt until its entire roster is admitted.
		busy, isBusy := err.(*task.Error)
		if run == nil || run.Admitted || !isBusy || busy.Code != "ROLE_BUSY" {
			return zero, err
		}
	}
	if parent != nil {
		c.ParentID = parent.ID
		c.RootID = parent.RootID
		c.Depth = parent.Depth + 1
		if c.Depth > policy.MaxDelegateDepth {
			return zero, task.Reject("DEPTH_LIMIT", "delegation depth exceeded")
		}
		ancestor := *parent
		for {
			if ancestor.Target != nil && ancestor.Target.AgentID == target.Binding.AgentID {
				return zero, task.Reject("CALL_CYCLE", "cannot invoke self or ancestor")
			}
			if ancestor.ParentID == "" {
				break
			}
			ancestor, err = task.LoadTask(tx, ancestor.ParentID)
			if err != nil {
				return zero, err
			}
		}
		c.AllowedTools = intersection(c.AllowedTools, parent.AllowedTools)
		c.Source.TaskID = parent.ID
		c.Source.AttemptID = parent.AttemptIDs[len(parent.AttemptIDs)-1]
		if policy.Acceptance.ChildPolicy == "inherit_parent" {
			c.AcceptancePolicy = &project.AcceptancePolicy{Mode: "parent", ChildPolicy: "inherit_parent"}
		}
	}
	if q.Kind == "review" {
		c.AcceptancePolicy = nil
		for _, d := range q.Dependencies {
			candidate, err := task.LoadTask(tx, d.TaskID)
			if err != nil {
				return zero, err
			}
			if candidate.RoleID == c.RoleID || (candidate.Result != nil && candidate.Result.AgentID == target.Binding.AgentID) {
				return zero, task.Reject("SELF_REVIEW", "independent Agent required")
			}
		}
	}
	c.Accepted = true
	c.State = "queued"
	c.Target = &target.Binding
	var count int
	if run != nil {
		err = tx.QueryRow(`SELECT count(*) FROM tasks WHERE run_id=? AND json_extract(body,'$.kind')!='leader_step'`, run.ID).Scan(&count)
	} else {
		// Standalone budgets count descendants; the root is not one of its children.
		err = tx.QueryRow(`SELECT count(*) FROM tasks WHERE root_id=? AND task_id!=root_id`, c.RootID).Scan(&count)
	}
	if err != nil {
		return zero, err
	}
	if count >= policy.MaxTotalTasks {
		return zero, task.Reject("TASK_BUDGET_EXHAUSTED", "task budget reached")
	}
	if err := tx.QueryRow(`SELECT count(*) FROM tasks WHERE state IN ('queued','waiting_dependency') AND json_extract(body,'$.expected_target.agent_id')=?`, target.Binding.AgentID).Scan(&count); err != nil {
		return zero, err
	}
	if count >= 32 {
		return zero, task.Reject("QUEUE_FULL", "Agent queue limit 32")
	}
	seenDependencies := map[string]bool{}
	for _, d := range c.Dependencies {
		if seenDependencies[d.TaskID] {
			return zero, task.Reject("INVALID_DEPENDENCY", "duplicate dependency")
		}
		seenDependencies[d.TaskID] = true
		dep, err := task.LoadTask(tx, d.TaskID)
		if err != nil {
			return zero, err
		}
		if !sameScope(c, dep) {
			return zero, task.Reject("INVALID_DEPENDENCY", "scope mismatch")
		}
		switch d.Condition {
		case "execution_completed", "acceptance_accepted", "review_rejected":
		default:
			return zero, task.Reject("INVALID_DEPENDENCY", "unknown edge condition")
		}
	}
	if err := project.ValidateResultRefs(c.Refs); err != nil {
		return zero, task.Reject("INVALID_RESULT_REF", err.Error())
	}
	for _, ref := range c.Refs {
		source, err := task.LoadTask(tx, ref.TaskID)
		if err != nil {
			return zero, err
		}
		if !sameScope(c, source) {
			return zero, task.Reject("INVALID_RESULT_REF", "scope mismatch")
		}
	}
	if parent != nil {
		parent.Dependencies = append(parent.Dependencies, task.Dependency{TaskID: c.ID, Condition: "execution_completed"})
		parent.Revision++
		if err := task.SaveTask(tx, *parent); err != nil {
			return zero, err
		}
	}
	if err := s.validateChildWrites(tx, c); err != nil {
		return zero, err
	}
	if err := task.SaveTask(tx, c); err != nil {
		return zero, err
	}
	if err := validateDependencyGraph(tx); err != nil {
		return zero, err
	}
	return c, nil
}

func rejectForeignRoleOwner(tx *sql.Tx, roleID, allowedRun string) error {
	var owner, team string
	var primary sql.NullString
	var revision int64
	err := tx.QueryRow(`SELECT o.run_id,o.team_id,o.revision,b.agent_id FROM role_ownership o JOIN primary_bindings b ON b.role_id=o.role_id WHERE o.role_id=?`, roleID).Scan(&owner, &team, &revision, &primary)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if owner == allowedRun {
		return nil
	}
	return &task.Error{Code: "ROLE_BUSY", Message: "Role is owned by another Run", Details: map[string]any{"role_id": roleID, "primary_agent_id": primary.String, "owner_team_id": team, "owner_run_id": owner, "ownership_revision": revision}}
}
func sameScope(a, b task.Contract) bool {
	if a.Scope != b.Scope {
		return false
	}
	if a.RunID == nil || b.RunID == nil {
		return a.RunID == nil && b.RunID == nil && a.RootID == b.RootID
	}
	return *a.RunID == *b.RunID
}
func readTasks(tx *sql.Tx) ([]task.Contract, error) {
	rows, err := tx.Query(`SELECT body FROM tasks ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []task.Contract{}
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		var c task.Contract
		if err := json.Unmarshal([]byte(b), &c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func dependencyReady(tx *sql.Tx, c task.Contract) (bool, error) {
	for _, d := range c.Dependencies {
		v, err := task.LoadTask(tx, d.TaskID)
		if err != nil {
			return false, err
		}
		switch d.Condition {
		case "execution_completed":
			if v.State != "completed" || v.Result == nil || v.Result.GoalRevision != v.GoalRevision || len(v.Blockers) > 0 {
				return false, nil
			}
		case "acceptance_accepted":
			if v.State != "completed" || v.Result == nil || v.Result.GoalRevision != v.GoalRevision || len(v.Blockers) > 0 || v.Acceptance == nil || v.Acceptance.Decision != "accepted" || v.Acceptance.ResultHash != v.Result.Hash || v.Acceptance.GoalRevision != v.GoalRevision {
				return false, nil
			}
		case "review_rejected":
			if v.State != "completed" || v.Result == nil || v.Result.GoalRevision != v.GoalRevision || len(v.Blockers) > 0 {
				return false, nil
			}
			if v.Kind == "review" {
				// Review controls are not recursively accepted themselves; their
				// validated structured verdict is the outcome of this edge.
				var verdict struct {
					Decision string `json:"decision"`
				}
				if err := json.Unmarshal(v.Result.Value, &verdict); err != nil || verdict.Decision != "rejected" {
					return false, nil
				}
			} else if v.Acceptance == nil || v.Acceptance.Decision != "rejected" || v.Acceptance.ResultHash != v.Result.Hash || v.Acceptance.GoalRevision != v.GoalRevision {
				return false, nil
			}
		default:
			return false, task.Reject("INVALID_DEPENDENCY", d.Condition)
		}
	}
	return true, nil
}
func blocker(c *task.Contract, kind, res string) {
	c.Blockers = append(c.Blockers, task.Blocker{Kind: kind, Resource: res, Revision: c.Revision, Since: fault.Now()})
}

func intersection(a, b []string) []string {
	out := []string{}
	for _, v := range a {
		if contains(b, v) {
			out = append(out, v)
		}
	}
	return out
}
