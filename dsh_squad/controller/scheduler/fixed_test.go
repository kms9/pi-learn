package scheduler

import (
	"strings"
	"testing"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// A Team in leader mode "fixed": the workflow runs without any Leader step.
func fixedHarness(t *testing.T) (*harness, string) {
	t.Helper()
	h := newHarness(t)
	files, _ := project.ConfigFiles(h.svc.Project.Root)
	hash := map[string]string{}
	content := map[string]string{}
	for _, f := range files {
		hash[f.Path], content[f.Path] = f.Hash, f.Content
	}
	team := strings.Replace(content["teams/math/team.json"], `{"responsibility":"build","role_ref":"builder"}`, `{"responsibility":"build","role_ref":"builder"},{"responsibility":"check","role_ref":"checker"}`, 1)
	team = strings.Replace(team, `"leader":{"agent_ref":"chief"}`, `"leader":{"agent_ref":"chief","mode":"fixed"}`, 1)
	if team == content["teams/math/team.json"] {
		t.Fatalf("fixture changed: %s", team)
	}
	if _, err := project.ApplyConfigEdits(h.svc.Project.Root, []project.ConfigEdit{
		{Path: "roles/checker/role.md", Content: roleDoc("checker")},
		{Path: "roles/checker/agents.md", Content: "Check.\n"},
		{Path: "teams/math/team.json", Content: team, ExpectedHash: hash["teams/math/team.json"]},
	}, false); err != nil {
		t.Fatal(err)
	}
	h.registerLeader()
	h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	h.register("math-reviewer", "reviewer", "bot-reviewer", "room-math", "sess-r")
	h.registerAs("math-checker", "role", "checker", "math", "bot-checker", "room-math")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	return h, r.ID
}

// With no Leader to pass the goal on, each step task carries the Run's task description
// in front of its own instruction (EXP-01: the author never saw the task otherwise).
func TestFixedFlowStepsCarryTheRunGoal(t *testing.T) {
	h, runID := fixedHarness(t)
	steps := 0
	for _, c := range h.runTasks(runID) {
		if c.Kind != "execute" {
			continue
		}
		steps++
		if !strings.HasPrefix(c.Goal, "teach\n\n") || !strings.Contains(c.Goal, "build the lesson") {
			t.Fatalf("step %s goal does not carry the run goal and its instruction: %q", c.ID, c.Goal)
		}
	}
	if steps == 0 {
		t.Fatal("no step task was planned")
	}
}

// The reviewer rejects the first build (drive does so), so the Controller plans one
// rework with its reason, the review of the rework is created by ensureReviews, and the
// Run completes without any Leader step.
func TestFixedFlowReworksARejectedResultAndCompletes(t *testing.T) {
	h, runID := fixedHarness(t)
	h.drive(runID, func([]task.Contract, []string) bool { return false })
	if r := h.runOf(runID); r.Phase != "completed" {
		t.Fatalf("phase %q, want completed", r.Phase)
	}
	var build, rework task.Contract
	for _, c := range h.runTasks(runID) {
		switch {
		case c.Kind == "leader_step":
			t.Fatalf("a Leader step was planned: %s", c.ID)
		case c.ReworkOf != "":
			rework = c
		case c.Kind == "execute":
			build = c
		}
	}
	if rework.ID == "" || rework.ReworkOf != build.ID {
		t.Fatalf("no rework of the rejected build: build=%+v rework=%+v", build.ID, rework.ID)
	}
	if !strings.Contains(rework.Goal, "审核退回，意见：checked") {
		t.Fatalf("the rework does not carry the reviewer's reason: %q", rework.Goal)
	}
	if build.SupersededBy != rework.ID {
		t.Fatalf("the rejected build is not superseded by its rework: %q", build.SupersededBy)
	}
}

func TestReworkDepthCountsTheChainOfReworks(t *testing.T) {
	original := task.Contract{ID: "a"}
	first := task.Contract{ID: "b", ReworkOf: "a"}
	second := task.Contract{ID: "c", ReworkOf: "b"}
	byID := map[string]task.Contract{"a": original, "b": first, "c": second}
	if got := reworkDepth(byID, original); got != 0 {
		t.Fatalf("original depth %d", got)
	}
	if got := reworkDepth(byID, second); got != 2 {
		t.Fatalf("second rework depth %d, want 2", got)
	}
}
