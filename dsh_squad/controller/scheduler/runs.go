package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/dsh_squad/controller/fault"
	"strings"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

type CreateRun struct {
	RequestID  string `json:"request_id"`
	TeamID     string `json:"team_id"`
	Goal       string `json:"goal"`
	WorkflowID string `json:"workflow_id,omitempty"`
}

func (s *Service) CreateRun(ctx context.Context, p Principal, q CreateRun) (task.Run, error) {
	var out task.Run
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		id, err := replay(tx, p, "create_run", q.RequestID, q)
		if err != nil {
			return err
		}
		if id != "" {
			out, err = task.LoadRun(tx, id)
			return err
		}
		snapshot, err := project.Load(s.Project.Root)
		if err != nil {
			return err
		}
		if err := task.FreezeConfigTx(tx, snapshot); err != nil {
			return err
		}
		cfg, ok := snapshot.Teams[q.TeamID]
		if !ok || q.Goal == "" {
			return task.Reject("INVALID_RUN", "unknown Team or empty goal")
		}
		leader, err := s.leader(tx, q.TeamID)
		if err != nil {
			return err
		}
		if !p.Operator && (!task.SameBinding(p.Binding, leader.Binding) || p.Binding.AgentID != cfg.Config.Leader.AgentRef) {
			return task.Reject("FORBIDDEN", "only operator or configured Leader can create Run")
		}
		if !p.Operator {
			var n int
			if err := tx.QueryRow(`SELECT count(*) FROM runs WHERE team_id=? AND admitted=1 AND cleanup!='released'`, q.TeamID).Scan(&n); err != nil {
				return err
			}
			if n != 0 {
				return task.Reject("ACTIVE_RUN_EXISTS", "use current Run guidance")
			}
		}
		id, err = project.RandomID("run-")
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE controller_state SET queue_seq=queue_seq+1`); err != nil {
			return err
		}
		var seq int64
		if err := tx.QueryRow(`SELECT queue_seq FROM controller_state`).Scan(&seq); err != nil {
			return err
		}
		out = task.Run{ID: id, TeamID: q.TeamID, Goal: q.Goal, Source: sourceOf(p), Config: cfg, Leader: leader.Binding, QueueSeq: seq, Phase: "queued_run", Revision: 1, Cleanup: "pending", CreatedAt: fault.Now(), Blockers: []task.Blocker{}, Guidance: []string{}}
		out.Source.InputID = q.RequestID
		if err := task.SaveRun(tx, out); err != nil {
			return err
		}
		workflow := q.WorkflowID
		if workflow == "" {
			workflow = cfg.Config.DefaultWorkflow
		}
		if workflow != "" {
			w, ok := cfg.Workflows[workflow]
			if !ok {
				return task.Reject("WORKFLOW_NOT_FOUND", workflow)
			}
			if err := s.materialize(tx, out, w, task.Origin{Kind: "workflow", By: out.ID}); err != nil {
				return err
			}
		}
		if err := s.admitRuns(tx); err != nil {
			return err
		}
		out, err = task.LoadRun(tx, id)
		if err != nil {
			return err
		}
		if err := remember(tx, p, "create_run", q.RequestID, id, q); err != nil {
			return err
		}
		return task.EventTx(tx, "run_created", id, out.Revision, map[string]any{"phase": out.Phase})
	})
	return out, err
}
func sourceOf(p Principal) task.Source {
	v := task.Source{Origin: p.Origin}
	if p.Binding.AgentID != "" {
		b := p.Binding
		v.Binding = &b
	}
	return v
}
func readRuns(tx *sql.Tx) ([]task.Run, error) {
	rows, err := tx.Query(`SELECT body FROM runs ORDER BY queue_seq`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []task.Run{}
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		var r task.Run
		if err := json.Unmarshal([]byte(b), &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func roleSet(r task.Run) map[string]bool {
	set := map[string]bool{}
	for _, m := range r.Config.Config.Members {
		set[m.RoleRef] = true
	}
	return set
}
func intersect(a, b task.Run) bool {
	set := roleSet(a)
	for _, m := range b.Config.Config.Members {
		if set[m.RoleRef] {
			return true
		}
	}
	return false
}
func (s *Service) admitRuns(tx *sql.Tx) error {
	runs, err := readRuns(tx)
	if err != nil {
		return err
	}
	earlier := []task.Run{}
	for _, r := range runs {
		if r.Admitted || task.Terminal(r.Phase) {
			continue
		}
		r.Blockers = []task.Blocker{}
		r.WaitingRoles = []task.WaitingRole{}
		block := func(kind, res, owner string, rev int64) {
			r.Blockers = append(r.Blockers, task.Blocker{Kind: kind, Resource: res, Owner: owner, Revision: rev, Since: fault.Now()})
		}
		if r.RecoveryHold {
			block("recovery_hold", r.ID, "", r.Revision)
		}
		leader, err := s.leader(tx, r.TeamID)
		if err != nil {
			block("leader_offline", r.TeamID, "", r.Revision)
		} else if !task.SameBinding(leader.Binding, r.Leader) {
			block("binding_changed", r.TeamID, "", r.Revision)
		}
		for _, prev := range earlier {
			if intersect(prev, r) || prev.TeamID == r.TeamID {
				block("earlier_run", prev.ID, prev.ID, prev.Revision)
			}
		}
		var active string
		err = tx.QueryRow(`SELECT run_id FROM runs WHERE team_id=? AND admitted=1 AND cleanup!='released'`, r.TeamID).Scan(&active)
		if err == nil {
			block("active_run", r.TeamID, active, 0)
		} else if err != sql.ErrNoRows {
			return err
		}
		for role := range roleSet(r) {
			var owner, ownerTeam string
			var revision int64
			err := tx.QueryRow(`SELECT run_id,team_id,revision FROM role_ownership WHERE role_id=?`, role).Scan(&owner, &ownerTeam, &revision)
			if err == nil {
				block("role_busy", role, owner, revision)
				r.WaitingRoles = append(r.WaitingRoles, task.WaitingRole{RoleID: role, OwnerTeamID: ownerTeam, OwnerRunID: owner, OwnershipRevision: revision})
			} else if err != sql.ErrNoRows {
				return err
			}
		}
		if len(r.Blockers) > 0 {
			if err := saveScheduledRun(tx, &r); err != nil {
				return err
			}
			earlier = append(earlier, r)
			continue
		}
		for role := range roleSet(r) {
			if err := fault.Point("ownership_acquire_each"); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO role_ownership VALUES(?,?,?,?,?)`, role, r.TeamID, r.ID, r.Revision, fault.Now().Format(time.RFC3339Nano)); err != nil {
				return err
			}
			if err := fault.Point("ownership_after_acquire_each"); err != nil {
				return err
			}
		}
		for role := range roleSet(r) {
			if err := s.primaryForTeam(tx, role, r.TeamID); err != nil {
				return err
			}
		}
		r.Admitted = true
		r.Phase = "planning"
		r.Revision++
		if err := task.SaveRun(tx, r); err != nil {
			return err
		}
		if err := task.EventTx(tx, "run_admitted", r.ID, r.Revision, nil); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) materialize(tx *sql.Tx, r task.Run, w project.Workflow, origin task.Origin) error {
	ids := map[string]string{}
	for _, step := range w.Steps {
		id, err := project.RandomID("task-")
		if err != nil {
			return err
		}
		ids[step.ID] = id
	}
	for _, step := range w.Steps {
		c := baseTask(ids[step.ID], step.Kind, step.Goal, r.Config.Config.Policy)
		c.Scope = "team"
		c.RunID = &r.ID
		c.TeamID = &r.TeamID
		c.RoleID = step.RoleRef
		c.Source = r.Source
		c.ReworkOf = resolveStep(ids, step.ReworkOf)
		c.Title = strings.TrimSpace(step.Title)
		c.Origin = &task.Origin{Kind: origin.Kind, By: origin.By}
		if c.ReworkOf != "" {
			c.Origin = &task.Origin{Kind: "rework", By: c.ReworkOf}
			if _, local := ids[step.ReworkOf]; !local {
				if err := s.reworkable(tx, c); err != nil {
					return err
				}
			}
		}
		c.Dependencies = []task.Dependency{}
		c.ExpectedOutput = step.ExpectedOutput
		c.AcceptanceCriteria = step.Acceptance
		c.Refs = append([]project.ResultRef{}, step.Refs...)
		for index := range c.Refs {
			c.Refs[index].TaskID = resolveStep(ids, c.Refs[index].TaskID)
		}
		c.WriteSet = step.WriteSet
		for _, d := range step.DependsOn {
			c.Dependencies = append(c.Dependencies, task.Dependency{TaskID: resolveStep(ids, d.Step), Condition: d.Condition})
		}
		if step.Kind == "review" {
			c.AcceptancePolicy = nil
			c.Goal += "\n提交结构化审查 value={decision:accepted|rejected,reason:string,candidates:[{task_id,result_revision,hash}]}；所有候选必须为本任务 execution_completed 依赖的精确结果。"
		}
		if step.Kind == "ask" {
			if len(c.WriteSet) > 0 {
				return task.Reject("READ_ONLY", "ask cannot write")
			}
			c.AllowedTools = []string{}
		}
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
	}
	return nil
}

// reworkable says whether a planned rework may replace its task: one a review rejected,
// or one built on a version that was replaced since (Q41). The Leader choosing to redo
// such a task is what a person does with 「用新版本重做」: the old version is marked
// replaced now, so the redo can be accepted later. Anything else is refused at plan
// time with a reason, instead of a redo that could never be accepted.
func (s *Service) reworkable(tx *sql.Tx, c task.Contract) error {
	old, err := task.LoadTask(tx, c.ReworkOf)
	if err != nil {
		return task.Reject("INVALID_REWORK", "unknown task "+c.ReworkOf)
	}
	if !sameScope(c, old) {
		return task.Reject("INVALID_REWORK", "a task of another Run")
	}
	if old.Acceptance != nil && old.Acceptance.Decision == "rejected" {
		return nil
	}
	stale, err := staleInputs(tx, old)
	if err != nil {
		return err
	}
	if old.State != "completed" || old.Result == nil || len(stale) == 0 {
		return task.Reject("INVALID_REWORK", "only a rejected task, or a finished one built on a replaced version, can be reworked: "+old.ID)
	}
	if err := saveAcceptance(tx, &old, task.Acceptance{Decision: "rejected", Mode: "rebase", ResultHash: old.Result.Hash, GoalRevision: old.GoalRevision, Reason: "Leader 改用新版本重做"}); err != nil {
		return err
	}
	return task.EventTx(tx, "task_rebased", old.ID, old.Revision, map[string]string{"by": "leader"})
}

func baseTask(id, kind, goal string, p project.Policy) task.Contract {
	a := p.Acceptance
	return task.Contract{ID: id, RootID: id, Scope: "standalone", Kind: kind, Goal: goal, GoalRevision: 1, AppliedRevision: 1, Revision: 1, State: "planned", Policy: p, AcceptancePolicy: &a, AllowedTools: append([]string{}, p.AllowedTools...), WriteSet: []string{}, Refs: []project.ResultRef{}, Dependencies: []task.Dependency{}, Blockers: []task.Blocker{}, AttemptIDs: []string{}, Amendments: []string{}, CreatedAt: fault.Now()}
}

func resolveStep(ids map[string]string, id string) string {
	if resolved, ok := ids[id]; ok {
		return resolved
	}
	return id
}

// primaryForTeam makes the runtime that serves this Team the role's Primary while the
// Team's Run owns the role (M4-1). A role shared by two Teams is one Bot with a Session
// in each Team's group; the Run admitted for a Team works in that Team's group. The Run
// owns the role exclusively, so no other Run's work is moved; an old Primary that
// still holds an execution keeps the role.
func (s *Service) primaryForTeam(tx *sql.Tx, role, team string) error {
	rows, err := tx.Query(`SELECT agent_id FROM instances WHERE mode='role' AND role_id=? AND team_id=? AND revoked=0`, role, team)
	if err != nil {
		return err
	}
	var candidates []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		candidates = append(candidates, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	var target *Instance
	for _, id := range candidates {
		i, err := loadInstance(tx, id)
		if err != nil {
			return err
		}
		if s.Online(i) {
			target = &i
			break
		}
	}
	if target == nil {
		return nil
	}
	var owner sql.NullString
	var epoch int64
	if err := tx.QueryRow(`SELECT agent_id,epoch FROM primary_bindings WHERE role_id=?`, role).Scan(&owner, &epoch); err != nil && err != sql.ErrNoRows {
		return err
	}
	if owner.String == target.Binding.AgentID {
		return nil
	}
	if owner.Valid && owner.String != "" {
		var busy int
		if err := tx.QueryRow(`SELECT count(*) FROM attempts WHERE agent_id=? AND cleanup!='released'`, owner.String).Scan(&busy); err != nil {
			return err
		}
		if busy > 0 {
			return nil
		}
		old, err := loadInstance(tx, owner.String)
		if err != nil {
			return err
		}
		old.Binding.PrimaryEpoch = 0
		old.Binding.BindingEpoch++
		var hash string
		if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, owner.String).Scan(&hash); err != nil {
			return err
		}
		if err := saveInstance(tx, old, hash); err != nil {
			return err
		}
	}
	history, _ := json.Marshal(map[string]any{"agent_id": owner.String, "epoch": epoch, "reason": "team_run_admitted", "team_id": team})
	if _, err := tx.Exec(`INSERT INTO binding_history(kind,entity_id,body,at) VALUES('role',?,?,?)`, role, string(history), fault.Now().Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO primary_bindings VALUES(?,?,1,1) ON CONFLICT(role_id) DO UPDATE SET agent_id=excluded.agent_id,epoch=primary_bindings.epoch+1,revision=primary_bindings.revision+1`, role, target.Binding.AgentID); err != nil {
		return err
	}
	if err := tx.QueryRow(`SELECT epoch FROM primary_bindings WHERE role_id=?`, role).Scan(&epoch); err != nil {
		return err
	}
	target.Binding.PrimaryEpoch = epoch
	target.Binding.BindingEpoch++
	var hash string
	if err := tx.QueryRow(`SELECT token_hash FROM instances WHERE agent_id=?`, target.Binding.AgentID).Scan(&hash); err != nil {
		return err
	}
	if err := saveInstance(tx, *target, hash); err != nil {
		return err
	}
	return task.EventTx(tx, "primary_switched", role, epoch, map[string]string{"agent_id": target.Binding.AgentID, "team_id": team, "previous": owner.String})
}
