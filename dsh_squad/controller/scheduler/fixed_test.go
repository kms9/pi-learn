package scheduler

import (
	"strings"
	"testing"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// A Team in leader mode "fixed": the workflow runs without any Leader step.
func fixedHarness(t *testing.T) (*harness, string) {
	return fixedHarnessWith(t, "")
}

// fixedHarnessWith is fixedHarness with the team's workflow replaced by workflow, unless it is empty.
func fixedHarnessWith(t *testing.T, workflow string) (*harness, string) {
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
	edits := []project.ConfigEdit{
		{Path: "roles/checker/role.md", Content: roleDoc("checker")},
		{Path: "roles/checker/agents.md", Content: "Check.\n"},
		{Path: "teams/math/team.json", Content: team, ExpectedHash: hash["teams/math/team.json"]},
	}
	if workflow != "" {
		edits = append(edits, project.ConfigEdit{Path: "teams/math/workflows/lesson.json", Content: workflow, ExpectedHash: hash["teams/math/workflows/lesson.json"]})
	}
	if _, err := project.ApplyConfigEdits(h.svc.Project.Root, edits, false); err != nil {
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

// A step that waits for a rejected step's acceptance waits for the rework that replaces it
// (EXP-01 P1: the builder waited forever on a rejected design). The rework's acceptance
// moves the dependency, so the dependent runs on the accepted version.
func TestFixedFlowADependentRunsOnTheAcceptedReworkOfItsInput(t *testing.T) {
	workflow := `{"schema_version":1,"workflow_id":"lesson","steps":[` +
		`{"id":"design","title":"design","role_ref":"builder","kind":"execute","goal":"design the lesson","depends_on":[]},` +
		`{"id":"build","title":"build","role_ref":"builder","kind":"execute","goal":"build the lesson","depends_on":[{"step":"design","condition":"acceptance_accepted"}]}]}`
	h, runID := fixedHarnessWith(t, workflow)
	h.drive(runID, func([]task.Contract, []string) bool { return false })
	if r := h.runOf(runID); r.Phase != "completed" {
		t.Fatalf("phase %q, want completed", r.Phase)
	}
	var design, rework, build task.Contract
	for _, c := range h.runTasks(runID) {
		switch {
		case c.Kind != "execute":
		case c.ReworkOf != "":
			rework = c
		case c.Title == "design":
			design = c
		case c.Title == "build":
			build = c
		}
	}
	if rework.ID == "" || rework.ReworkOf != design.ID || design.SupersededBy != rework.ID {
		t.Fatalf("the design was not reworked: design=%s rework=%+v", design.ID, rework.ID)
	}
	if len(build.Dependencies) != 1 || build.Dependencies[0].TaskID != rework.ID {
		t.Fatalf("the build still waits for the rejected design: %+v", build.Dependencies)
	}
	if build.State != "completed" {
		t.Fatalf("build state %q, want completed", build.State)
	}
}

// A step with a review chain is accepted only by its last reviewer. The first version is
// rejected by the first reviewer; the rework goes through the whole chain again (reviewer,
// then checker), and the dependent step runs on the version the chain accepted.
func TestFixedFlowAReviewChainAcceptsOnlyAfterItsLastReviewer(t *testing.T) {
	workflow := `{"schema_version":1,"workflow_id":"lesson","steps":[` +
		`{"id":"design","title":"design","role_ref":"builder","kind":"execute","goal":"design the lesson","depends_on":[],"reviewers":["reviewer","checker"]},` +
		`{"id":"build","title":"build","role_ref":"builder","kind":"execute","goal":"build the lesson","depends_on":[{"step":"design","condition":"acceptance_accepted"}]}]}`
	h, runID := fixedHarnessWith(t, workflow)
	h.drive(runID, func([]task.Contract, []string) bool { return false })
	if r := h.runOf(runID); r.Phase != "completed" {
		t.Fatalf("phase %q, want completed", r.Phase)
	}
	tasks := h.runTasks(runID)
	var design, rework, build task.Contract
	for _, c := range tasks {
		switch {
		case c.Kind != "execute":
		case c.ReworkOf != "":
			rework = c
		case c.Title == "design":
			design = c
		case c.Title == "build":
			build = c
		}
	}
	if rework.ID == "" || design.SupersededBy != rework.ID {
		t.Fatalf("the design was not reworked: design=%s rework=%+v", design.ID, rework.ID)
	}
	if rework.Acceptance == nil || rework.Acceptance.Decision != "accepted" {
		t.Fatalf("the rework is not accepted: %+v", rework.Acceptance)
	}
	var reviewers []string
	for _, c := range tasks {
		if c.Kind == "review" && dependsOn(c, rework.ID) {
			reviewers = append(reviewers, c.RoleID)
		}
	}
	if len(reviewers) != 2 || !(reviewers[0] == "reviewer" && reviewers[1] == "checker" || reviewers[0] == "checker" && reviewers[1] == "reviewer") {
		t.Fatalf("the rework was not reviewed by the whole chain: %v", reviewers)
	}
	if len(build.Dependencies) != 1 || build.Dependencies[0].TaskID != rework.ID || build.State != "completed" {
		t.Fatalf("the build did not run on the accepted rework: deps=%+v state=%q", build.Dependencies, build.State)
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
