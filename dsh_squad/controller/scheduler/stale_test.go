package scheduler

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// A Team with a build step and a check that uses it; the reviewer rejects the first
// build once (Q41).
func staleHarness(t *testing.T) (*harness, string) {
	t.Helper()
	h := newHarness(t)
	files, _ := project.ConfigFiles(h.svc.Project.Root)
	hash := map[string]string{}
	content := map[string]string{}
	for _, f := range files {
		hash[f.Path], content[f.Path] = f.Hash, f.Content
	}
	team := strings.Replace(content["teams/math/team.json"], `{"responsibility":"build","role_ref":"builder"}`, `{"responsibility":"build","role_ref":"builder"},{"responsibility":"check","role_ref":"checker"}`, 1)
	if team == content["teams/math/team.json"] {
		t.Fatalf("fixture changed: %s", team)
	}
	if _, err := project.ApplyConfigEdits(h.svc.Project.Root, []project.ConfigEdit{
		{Path: "roles/checker/role.md", Content: roleDoc("checker")},
		{Path: "roles/checker/agents.md", Content: "Check.\n"},
		{Path: "teams/math/team.json", Content: team, ExpectedHash: hash["teams/math/team.json"]},
		{Path: "teams/math/workflows/two.json", Content: `{"schema_version":1,"workflow_id":"two","steps":[{"id":"build","role_ref":"builder","kind":"execute","goal":"build","depends_on":[]},{"id":"check","role_ref":"checker","kind":"execute","goal":"check","depends_on":[{"step":"build","condition":"execution_completed"}],"refs":[{"task_id":"build","result_revision":0,"hash":"","length":0}]}]}`},
	}, false); err != nil {
		t.Fatal(err)
	}
	h.registerLeader()
	h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	h.register("math-reviewer", "reviewer", "bot-reviewer", "room-math", "sess-r")
	h.registerAs("math-checker", "role", "checker", "math", "bot-checker", "room-math")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "two"})
	if err != nil {
		t.Fatal(err)
	}
	return h, r.ID
}

// drive answers every dispatch until nothing moves; person is called with the Run's
// stale tasks each round and may act on them.
func (h *harness) drive(runID string, person func(stale []task.Contract, gate []string) bool) (gateCodes []string) {
	reviews := 0
	for round := 0; round < 60; round++ {
		h.tick()
		moved := false
		for _, id := range []string{"chief", "math-builder", "math-reviewer", "math-checker"} {
			p := h.principal(id)
			out, err := h.svc.Dispatches(h.ctx, p)
			if err != nil || len(out) == 0 {
				continue
			}
			a := out[0]["attempt"].(task.Attempt)
			c := out[0]["task"].(task.Contract)
			if a.State != "admitted" {
				continue
			}
			for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
				a = h.must(h.event(p, a, AttemptEvent{Type: step}))
			}
			switch c.Kind {
			case "leader_step":
				run := h.runOf(runID)
				action, steps := "wait", []project.Step(nil)
				if rejected := h.rejectedWithoutRework(runID); rejected != "" {
					action, steps = "dispatch", []project.Step{{ID: "rework-1", RoleRef: "builder", Kind: "rework", ReworkOf: rejected, Goal: "fix", DependsOn: []project.Dependency{}}}
				} else if planned := h.planOf(runID); len(planned) > 0 {
					action, steps = "dispatch", planned
				} else if h.allAccepted(runID) {
					action = "complete"
				}
				_, err := h.svc.Decide(h.ctx, p, runID, Decision{RequestID: "d-" + a.ID[:16], ExpectedRevision: run.Revision, AttemptID: a.ID, Action: action, Tasks: steps, Note: action})
				if e, ok := err.(*task.Error); ok {
					gateCodes = append(gateCodes, e.Code)
				}
				a, _ = h.attemptOf(a.ID)
				if a.State != "result_proposed" {
					// A refused complete: the Leader waits instead.
					_, _ = h.svc.Decide(h.ctx, p, runID, Decision{RequestID: "w-" + a.ID[:16], ExpectedRevision: h.runOf(runID).Revision, AttemptID: a.ID, Action: "wait", Note: "wait"})
					a, _ = h.attemptOf(a.ID)
				}
			case "review":
				reviews++
				decision := "accepted"
				if reviews == 1 {
					decision = "rejected"
				}
				value, _ := json.Marshal(map[string]any{"decision": decision, "reason": "checked", "candidates": c.Refs})
				a = h.must(h.event(p, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: value, Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
			default:
				a = h.must(h.event(p, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: json.RawMessage(`{"answer":"ok"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
			}
			h.must(h.event(p, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
			moved = true
		}
		var stale []task.Contract
		for _, c := range h.runTasks(runID) {
			if c.State == "completed" && c.Kind != "review" && c.SupersededBy == "" && !c.StaleKept && (c.Acceptance == nil || c.Acceptance.Decision != "rejected") {
				for _, d := range c.Dependencies {
					if h.taskOf(d.TaskID).SupersededBy != "" {
						stale = append(stale, c)
						break
					}
				}
			}
		}
		if len(stale) > 0 && person(stale, gateCodes) {
			moved = true
		}
		if !moved {
			break
		}
	}
	return gateCodes
}

func TestAStaleCheckIsRedoneWithTheNewVersion(t *testing.T) {
	h, runID := staleHarness(t)
	redone := 0
	gate := h.drive(runID, func(stale []task.Contract, gate []string) bool {
		// The person acts once the final check has refused the stale check.
		if !strings.Contains(strings.Join(gate, ","), "STALE_INPUT") {
			return false
		}
		for _, c := range stale {
			if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "rebase", Operation{RequestID: "rb-" + c.ID[:12], ExpectedRevision: c.Revision, Note: "redo"}); err != nil {
				t.Fatalf("rebase: %v", err)
			}
			redone++
		}
		return true
	})
	if redone != 1 {
		t.Fatalf("%d redos, want the check once", redone)
	}
	if !strings.Contains(strings.Join(gate, ","), "STALE_INPUT") {
		t.Fatalf("the final check never refused the stale check: %v", gate)
	}
	if phase := h.runOf(runID).Phase; phase != "completed" {
		t.Fatalf("run %s", phase)
	}
	// The redo depends on the reworked build, not the rejected one.
	for _, c := range h.runTasks(runID) {
		if c.Kind == "rework" && c.RoleID == "checker" {
			dep := h.taskOf(c.Dependencies[0].TaskID)
			if dep.SupersededBy != "" || dep.Kind != "rework" {
				t.Fatalf("the redo still uses %s (%s)", dep.ID, dep.Kind)
			}
			return
		}
	}
	t.Fatal("no redo of the check")
}

func TestAStaleCheckCanBeKept(t *testing.T) {
	h, runID := staleHarness(t)
	kept := 0
	h.drive(runID, func(stale []task.Contract, _ []string) bool {
		for _, c := range stale {
			if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "keep", Operation{RequestID: "k-" + c.ID[:12], ExpectedRevision: c.Revision, Note: "keep"}); err != nil {
				t.Fatalf("keep: %v", err)
			}
			kept++
		}
		return true
	})
	if kept != 1 || h.runOf(runID).Phase != "completed" {
		t.Fatalf("kept %d, run %s", kept, h.runOf(runID).Phase)
	}
}

func (h *harness) planOf(runID string) []project.Step {
	if h.leaderPlan == nil {
		return nil
	}
	return h.leaderPlan(runID)
}

// What a real Leader did (T stage): it saw the check was built on the replaced draft
// and planned a rework of that check itself, with its own goal. The old check is then
// marked replaced at plan time, the redo is reviewed and accepted, and the Run completes.
func TestTheLeaderRedoesAStaleCheck(t *testing.T) {
	h, runID := staleHarness(t)
	planned := ""
	h.leaderPlan = func(runID string) []project.Step {
		if planned != "" {
			return nil
		}
		for _, c := range h.runTasks(runID) {
			if c.RoleID != "checker" || c.State != "completed" || c.SupersededBy != "" {
				continue
			}
			for _, d := range c.Dependencies {
				if next := h.taskOf(d.TaskID).SupersededBy; next != "" {
					planned = c.ID
					return []project.Step{{ID: "recheck", RoleRef: "checker", Kind: "rework", ReworkOf: c.ID, Goal: "check the second version", DependsOn: []project.Dependency{{Step: next, Condition: "execution_completed"}}}}
				}
			}
		}
		return nil
	}
	h.drive(runID, func([]task.Contract, []string) bool { return false })
	if planned == "" {
		t.Fatal("the Leader never saw a stale check")
	}
	old := h.taskOf(planned)
	if old.Acceptance == nil || old.Acceptance.Decision != "rejected" || old.Acceptance.Mode != "rebase" || old.SupersededBy == "" {
		t.Fatalf("the old check was not replaced: %+v superseded=%q", old.Acceptance, old.SupersededBy)
	}
	if redo := h.taskOf(old.SupersededBy); redo.Acceptance == nil || redo.Acceptance.Decision != "accepted" {
		t.Fatalf("the redo was not accepted: %+v blockers %+v", redo.Acceptance, redo.Blockers)
	}
	if phase := h.runOf(runID).Phase; phase != "completed" {
		t.Fatalf("run %s", phase)
	}
}

// A Leader cannot plan a rework of a task that was accepted and is current: the plan is
// refused with the reason, before anything is made.
func TestAReworkOfACurrentAcceptedTaskIsRefused(t *testing.T) {
	h, runID := staleHarness(t)
	var refused error
	h.leaderPlan = func(runID string) []project.Step {
		for _, c := range h.runTasks(runID) {
			if c.RoleID == "builder" && c.Acceptance != nil && c.Acceptance.Decision == "accepted" && refused == nil {
				refused = errSentinel
				return []project.Step{{ID: "again", RoleRef: "builder", Kind: "rework", ReworkOf: c.ID, Goal: "again", DependsOn: []project.Dependency{}}}
			}
		}
		return nil
	}
	h.drive(runID, func([]task.Contract, []string) bool { return false })
	for _, c := range h.runTasks(runID) {
		if c.Goal == "again" {
			t.Fatal("a rework of a current accepted task was made")
		}
	}
	if refused == nil {
		t.Fatal("the Leader never tried")
	}
}

var errSentinel = &task.Error{Code: "TRIED"}
