package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/agent"
	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

const operatorToken = "operator-token-0123456789abcdef0123456789"

func roleDoc(name string) string {
	return "---\nname: " + name + "\ndescription: " + name + " role\n---\nYou are the " + name + ".\n"
}

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// fixtureProject writes a small Project: roles builder and reviewer, Team math led by chief.
func fixtureProject(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	base := filepath.Join(root, ".agents/dshsquad")
	for _, role := range []string{"builder", "reviewer"} {
		writeFile(t, filepath.Join(base, "roles", role, "role.md"), roleDoc(role))
		writeFile(t, filepath.Join(base, "roles", role, "agents.md"), "Work carefully.\n")
	}
	team := map[string]any{
		"schema_version": 1, "team_id": "math", "config_version": 1,
		"leader":            map[string]any{"agent_ref": "chief"},
		"members":           []map[string]any{{"role_ref": "builder", "responsibility": "build"}, {"role_ref": "reviewer", "responsibility": "review"}},
		"instructions_file": "instructions.md",
		"policy": map[string]any{
			"run_admission": "fifo_single_active", "max_parallel_tasks": 2, "max_delegate_depth": 2, "max_total_tasks": 12, "max_attempts_per_task": 3,
			"allowed_tools": []string{"read"}, "writable_roots": []string{},
			"acceptance_policy": map[string]any{"mode": "review", "reviewer_ref": "reviewer", "child_policy": "separate"},
		},
	}
	b, _ := json.Marshal(team)
	writeFile(t, filepath.Join(base, "teams/math/team.json"), string(b))
	writeFile(t, filepath.Join(base, "teams/math/instructions.md"), "Teach one math idea.\n")
	writeFile(t, filepath.Join(base, "teams/math/workflows/lesson.json"), `{"schema_version":1,"workflow_id":"lesson","steps":[{"id":"build","role_ref":"builder","kind":"execute","goal":"build the lesson","depends_on":[]}]}`)
	return root
}

type harness struct {
	t   *testing.T
	ctx context.Context
	svc *Service
	op  Principal
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	root := fixtureProject(t)
	snap, err := project.Load(root)
	if err != nil {
		t.Fatal(err)
	}
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "state.sqlite"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { reg.Close() })
	ctx := context.Background()
	svc, err := New(ctx, task.NewStore(reg.Database()), snap, Config{MaxParallel: 2, HeartbeatTimeout: time.Hour, LeaseTTL: time.Hour, DirectTools: []string{"read", "grep", "find", "ls"}}, operatorToken)
	if err != nil {
		t.Fatal(err)
	}
	svc.ArtifactDir = filepath.Join(t.TempDir(), "artifacts")
	op, err := svc.Authenticate(ctx, operatorToken, "")
	if err != nil {
		t.Fatal(err)
	}
	return &harness{t: t, ctx: ctx, svc: svc, op: op}
}

func runtimeToken(agentID string) string { return "runtime-token-" + agentID + "-0123456789abcdef" }

func (h *harness) register(agentID, role, botID, roomID, session string) Principal {
	h.t.Helper()
	raw, err := os.ReadFile(filepath.Join(h.svc.Project.Root, ".agents/dshsquad/roles", role, "role.md"))
	if err != nil {
		h.t.Fatal(err)
	}
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = true
	}
	place := "group-member"
	if roomID == "" {
		place = "chat"
	}
	_, err = h.svc.Register(h.ctx, Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: botID, RoomID: roomID, Place: place},
		AgentID: agentID, RuntimeID: "11111111-1111-4111-8111-" + map[string]string{"builder": "111111111111", "reviewer": "222222222222"}[role],
		SessionID: session, RuntimeToken: runtimeToken(agentID), Mode: "role", RoleID: role, Activity: "idle",
		Capabilities: caps, RoleHash: project.Hash(raw), AvailableTools: []string{"read"},
	})
	if err != nil {
		h.t.Fatal(err)
	}
	p, err := h.svc.Authenticate(h.ctx, runtimeToken(agentID), agentID)
	if err != nil {
		h.t.Fatal(err)
	}
	return p
}

// registerLeader binds chief as the Leader of Team math, in the Team's group.
func (h *harness) registerLeader() Principal {
	h.t.Helper()
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = true
	}
	_, err := h.svc.Register(h.ctx, Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: "bot-chief", RoomID: "room-math", Place: "group-member"},
		AgentID: "chief", RuntimeID: "11111111-1111-4111-8111-999999999999", SessionID: "sess-chief", RuntimeToken: runtimeToken("chief"),
		Mode: "leader", TeamID: "math", Activity: "idle", Capabilities: caps, AvailableTools: []string{"read"},
	})
	if err != nil {
		h.t.Fatal(err)
	}
	p, err := h.svc.Authenticate(h.ctx, runtimeToken("chief"), "chief")
	if err != nil {
		h.t.Fatal(err)
	}
	return p
}

func (h *harness) tick() {
	h.t.Helper()
	if err := h.svc.Tick(h.ctx); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) dispatched(p Principal) task.Attempt {
	h.t.Helper()
	out, err := h.svc.Dispatches(h.ctx, p)
	if err != nil || len(out) != 1 {
		h.t.Fatalf("dispatches: %v %v", out, err)
	}
	return out[0]["attempt"].(task.Attempt)
}

func (h *harness) event(p Principal, a task.Attempt, q AttemptEvent) (task.Attempt, error) {
	q.RequestID = fmt.Sprintf("%s-%s-%d", q.Type, a.ID[:16], a.Segment)
	q.ExpectedRevision = a.Revision
	q.Segment = a.Segment
	q.FencingToken = a.FencingToken
	q.ControllerEpoch = a.ControllerEpoch
	return h.svc.AttemptEvent(h.ctx, p, a.ID, q)
}

func (h *harness) must(a task.Attempt, err error) task.Attempt {
	h.t.Helper()
	if err != nil {
		h.t.Fatal(err)
	}
	return a
}

// startRunning walks a dispatched attempt through the receipt chain into running.
func (h *harness) startRunning(p Principal) task.Attempt {
	a := h.dispatched(p)
	for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
		a = h.must(h.event(p, a, AttemptEvent{Type: step}))
	}
	if a.State != "running" {
		h.t.Fatalf("attempt state %s", a.State)
	}
	return a
}

func (h *harness) taskOf(id string) task.Contract {
	var c task.Contract
	if err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
		var err error
		c, err = task.LoadTask(tx, id)
		return err
	}); err != nil {
		h.t.Fatal(err)
	}
	return c
}

func TestDirectTaskRunsThroughTheReceiptChain(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "count to three"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	a = h.must(h.event(builder, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"1 2 3"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	a = h.must(h.event(builder, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	if got := h.taskOf(c.ID); got.State != "completed" || got.Result == nil {
		t.Fatalf("task %s result %v", got.State, got.Result)
	}
}

func TestNoBusinessDeadline(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "a long task"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	h.startRunning(builder)
	h.tick()
	got := h.taskOf(c.ID)
	if got.State != "running" {
		t.Fatalf("task state %s", got.State)
	}
	// The contract carries no deadline at all: only the lease and an explicit result end it.
	b, _ := json.Marshal(got)
	var fields map[string]any
	_ = json.Unmarshal(b, &fields)
	if _, ok := fields["deadline_at"]; ok {
		t.Fatal("task contract still has deadline_at")
	}
}

func TestParentCannotFinishWithOpenChild(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	reviewer := h.register("reviewer-bot", "reviewer", "bot-reviewer", "", "sess-2")
	h.svc.Config.DirectTargets = []string{"reviewer-bot"}
	parent, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "delegate"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	current := h.taskOf(parent.ID)
	if _, err := h.svc.CreateTask(h.ctx, builder, CreateTask{RequestID: "c1", ParentID: parent.ID, Target: "reviewer-bot", Goal: "check", ExpectedRevision: current.Revision}); err != nil {
		t.Fatal(err)
	}
	_, err = h.event(builder, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}})
	if e, ok := err.(*task.Error); !ok || e.Code != "CHILDREN_PENDING" {
		t.Fatalf("want CHILDREN_PENDING, got %v", err)
	}
	_ = reviewer
}

func TestOneBotPlaceIsOneRuntime(t *testing.T) {
	h := newHarness(t)
	h.register("builder-bot", "builder", "bot-builder", "room-1", "sess-1")
	raw, _ := os.ReadFile(filepath.Join(h.svc.Project.Root, ".agents/dshsquad/roles/reviewer/role.md"))
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = true
	}
	_, err := h.svc.Register(h.ctx, Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: "bot-builder", RoomID: "room-1", Place: "group-member"},
		AgentID: "other-bot", RuntimeID: "11111111-1111-4111-8111-333333333333", SessionID: "sess-9", RuntimeToken: runtimeToken("other-bot"),
		Mode: "role", RoleID: "reviewer", Activity: "idle", Capabilities: caps, RoleHash: project.Hash(raw),
	})
	if e, ok := err.(*task.Error); !ok || e.Code != "HOST_PLACE_TAKEN" {
		t.Fatalf("want HOST_PLACE_TAKEN, got %v", err)
	}
	_, err = h.svc.Register(h.ctx, Register{Host: Host{Profile: "pi-coding-agent/1.1.0", HostID: "h", BotID: "b", Place: "chat"}, AgentID: "x-bot", RuntimeID: "11111111-1111-4111-8111-444444444444", SessionID: "s", RuntimeToken: runtimeToken("x-bot"), Mode: "role", RoleID: "reviewer"})
	if e, ok := err.(*task.Error); !ok || e.Code != "INVALID_HOST" {
		t.Fatalf("want INVALID_HOST, got %v", err)
	}
}

func TestHeldInputIsKeptOnce(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "room-1", "sess-1")
	q := HeldInput{RequestID: "h1", Binding: builder.Binding, InputID: "msg-1", Wake: "group-relay", Why: "no_admission", Text: "@Builder help"}
	if _, err := h.svc.Hold(h.ctx, builder, q); err != nil {
		t.Fatal(err)
	}
	q.RequestID = "h2"
	if _, err := h.svc.Hold(h.ctx, builder, q); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := h.svc.Store.DB.QueryRow(`SELECT COUNT(*) FROM held_inputs`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("held rows %d %v", n, err)
	}
	if _, err := h.svc.Hold(h.ctx, h.op, q); err == nil {
		t.Fatal("operator must not report held inputs")
	}
}

func TestHostRestartInterruptsTheAttempt(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "work"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	h.startRunning(builder)
	if err := h.svc.Interrupt(h.ctx, builder, Interruption{RequestID: "i1", Binding: builder.Binding, Reason: "outcome_unknown"}); err != nil {
		t.Fatal(err)
	}
	if got := h.taskOf(c.ID); got.State != "interrupted" {
		t.Fatalf("task state %s", got.State)
	}
}

func TestArtifactsAreStoredByHashAndCitedByResults(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	if _, err := h.svc.StoreArtifact(h.ctx, builder, ArtifactUpload{Name: "x.html", MediaType: "text/html", Content: []byte("<p>x</p>")}); err == nil {
		t.Fatal("an upload without a running attempt must be refused")
	}
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "make a page"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	page := []byte("<!doctype html><p>1/2 + 1/4</p>")
	art, err := h.svc.StoreArtifact(h.ctx, builder, ArtifactUpload{Name: "../lesson.html", MediaType: "text/html", Content: page})
	if err != nil {
		t.Fatal(err)
	}
	if art.Path != ArtifactScheme+art.SHA256 || art.Length != int64(len(page)) || art.Name != "lesson.html" {
		t.Fatalf("artifact %+v", art)
	}
	again, err := h.svc.StoreArtifact(h.ctx, builder, ArtifactUpload{Name: "other.html", MediaType: "text/html", Content: page})
	if err != nil || again.SHA256 != art.SHA256 {
		t.Fatalf("same bytes, same artifact: %+v %v", again, err)
	}
	b, mediaType, err := h.svc.ArtifactContent(art.SHA256)
	if err != nil || string(b) != string(page) || mediaType != "text/html" {
		t.Fatalf("read back %q %s %v", b, mediaType, err)
	}
	a = h.must(h.event(builder, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"page"}`), Artifacts: []task.Artifact{art}, Refs: []project.ResultRef{}}}))
	h.must(h.event(builder, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	got := h.taskOf(c.ID)
	if got.State != "completed" || len(got.Result.Artifacts) != 1 || got.Result.Artifacts[0].Path != art.Path {
		t.Fatalf("task %s artifacts %+v", got.State, got.Result)
	}
	if _, _, err := h.svc.ArtifactContent("../../etc/passwd"); err == nil {
		t.Fatal("a non-hash name must be refused")
	}
}

// run drives every runtime's dispatch to its end, answering through answer.
func (h *harness) settleAll(runtimes map[string]Principal, answer func(name string, a task.Attempt, c task.Contract) (task.Attempt, bool)) {
	h.t.Helper()
	for round := 0; round < 40; round++ {
		h.tick()
		moved := false
		for name, p := range runtimes {
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
			a, ok := answer(name, a, c)
			if !ok {
				continue
			}
			h.must(h.event(p, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
			moved = true
		}
		if !moved {
			h.tick()
			return
		}
	}
}

func TestRunReviewRejectReworkAccept(t *testing.T) {
	h := newHarness(t)
	runtimes := map[string]Principal{
		"chief":    h.registerLeader(),
		"builder":  h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b"),
		"reviewer": h.register("math-reviewer", "reviewer", "bot-reviewer", "room-math", "sess-r"),
	}
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach fractions", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	reviews := 0
	var trace []string
	answer := func(name string, a task.Attempt, c task.Contract) (task.Attempt, bool) {
		trace = append(trace, name+":"+c.Kind)
		switch c.Kind {
		case "leader_step":
			run := h.runOf(r.ID)
			action, steps := "wait", []project.Step(nil)
			if rejected := h.rejectedWithoutRework(r.ID); rejected != "" {
				action = "dispatch"
				steps = []project.Step{{ID: "rework-1", RoleRef: "builder", Kind: "rework", ReworkOf: rejected, Goal: "fix the lesson", DependsOn: []project.Dependency{}}}
			} else if h.allAccepted(r.ID) {
				action = "complete"
			}
			if _, err := h.svc.Decide(h.ctx, runtimes["chief"], r.ID, Decision{RequestID: "d-" + a.ID[:16], ExpectedRevision: run.Revision, AttemptID: a.ID, Action: action, Tasks: steps, Note: action}); err != nil {
				t.Fatalf("decide %s: %v", action, err)
			}
			got, err := h.attemptOf(a.ID)
			return got, err == nil
		case "review":
			reviews++
			decision := "accepted"
			if reviews == 1 {
				decision = "rejected"
			}
			value, _ := json.Marshal(map[string]any{"decision": decision, "reason": "checked", "candidates": c.Refs})
			return h.must(h.event(runtimes[name], a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: value, Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}})), true
		default:
			return h.must(h.event(runtimes[name], a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: json.RawMessage(`{"answer":"lesson"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}})), true
		}
	}
	h.settleAll(runtimes, answer)
	final := h.runOf(r.ID)
	if final.Phase != "completed" {
		t.Fatalf("run phase %s after %v; blockers %+v", final.Phase, trace, final.Blockers)
	}
	if reviews != 2 {
		t.Fatalf("%d reviews, want 2 (reject then accept): %v", reviews, trace)
	}
	// Every task says what made it, so the page can draw it under that (UI plan C1).
	kinds := map[string]int{}
	for _, c := range h.runTasks(r.ID) {
		if c.Origin == nil {
			t.Fatalf("task %s (%s) has no origin", c.ID, c.Kind)
		}
		kinds[c.Origin.Kind]++
		switch c.Origin.Kind {
		case "review":
			if c.Kind != "review" || c.Origin.By != c.Dependencies[0].TaskID {
				t.Fatalf("review origin %+v", c.Origin)
			}
		case "rework":
			if c.Origin.By != c.ReworkOf {
				t.Fatalf("rework origin %+v", c.Origin)
			}
		}
	}
	if kinds["workflow"] != 1 || kinds["review"] != 2 || kinds["rework"] != 1 {
		t.Fatalf("origins %v", kinds)
	}
}

func (h *harness) runOf(id string) task.Run {
	var r task.Run
	if err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
		var err error
		r, err = task.LoadRun(tx, id)
		return err
	}); err != nil {
		h.t.Fatal(err)
	}
	return r
}

func (h *harness) attemptOf(id string) (task.Attempt, error) {
	var a task.Attempt
	err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
		var err error
		a, err = task.LoadAttempt(tx, id)
		return err
	})
	return a, err
}

func (h *harness) runTasks(runID string) []task.Contract {
	var out []task.Contract
	if err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
		all, err := readTasks(tx)
		for _, c := range all {
			if c.RunID != nil && *c.RunID == runID && c.Kind != "leader_step" {
				out = append(out, c)
			}
		}
		return err
	}); err != nil {
		h.t.Fatal(err)
	}
	return out
}

func (h *harness) rejectedWithoutRework(runID string) string {
	tasks := h.runTasks(runID)
	for _, c := range tasks {
		if c.Kind == "review" || c.Acceptance == nil || c.Acceptance.Decision != "rejected" || c.SupersededBy != "" {
			continue
		}
		pending := false
		for _, other := range tasks {
			if other.ReworkOf == c.ID {
				pending = true
			}
		}
		if !pending {
			return c.ID
		}
	}
	return ""
}

func (h *harness) allAccepted(runID string) bool {
	for _, c := range h.runTasks(runID) {
		if c.Kind == "review" || c.SupersededBy != "" {
			if c.Kind == "review" && !task.Terminal(c.State) {
				return false
			}
			continue
		}
		if c.State != "completed" || c.Acceptance == nil || c.Acceptance.Decision != "accepted" {
			return false
		}
	}
	return true
}

func TestUserMessagesBecomeRunGuidanceOnce(t *testing.T) {
	h := newHarness(t)
	h.registerLeader()
	builder := h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	reviewer := h.register("math-reviewer", "reviewer", "bot-reviewer", "room-math", "sess-r")
	before := HeldInput{RequestID: "h0", Binding: builder.Binding, InputID: "m0", Wake: "group-relay", Why: "no_admission", Text: "hello before the Run"}
	if _, err := h.svc.Hold(h.ctx, builder, before); err != nil {
		t.Fatal(err)
	}
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach fractions", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	for i, p := range []Principal{builder, reviewer} {
		q := HeldInput{RequestID: "h" + string(rune('1'+i)), Binding: p.Binding, InputID: "m" + string(rune('1'+i)), Wake: "group-relay", Why: "no_admission", Text: "please use pizza examples"}
		if _, err := h.svc.Hold(h.ctx, p, q); err != nil {
			t.Fatal(err)
		}
	}
	got := h.runOf(r.ID)
	if len(got.Guidance) != 1 || got.Guidance[0] != "please use pizza examples" {
		t.Fatalf("guidance %v", got.Guidance)
	}
	var disposition string
	if err := h.svc.Store.DB.QueryRow(`SELECT disposition FROM held_inputs WHERE input_id='m0'`).Scan(&disposition); err != nil || disposition != "pending" {
		t.Fatalf("before the Run: %s %v", disposition, err)
	}
	if err := h.svc.Store.DB.QueryRow(`SELECT disposition FROM held_inputs WHERE input_id='m2'`).Scan(&disposition); err != nil || disposition != "guidance:"+r.ID {
		t.Fatalf("during the Run: %s %v", disposition, err)
	}
}

// DSH-M2-04: an acceptance card shown for one result version cannot approve another.
func TestAcceptanceBindsTheExactResultVersion(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "a page"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	a = h.must(h.event(builder, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"v1"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	h.must(h.event(builder, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	done := h.taskOf(c.ID)
	stale := AcceptanceRequest{RequestID: "acc-1", ExpectedRevision: done.Revision, Decision: "accepted", ResultHash: strings.Repeat("0", 64), Note: "looks fine"}
	if _, err := h.svc.RecordAcceptance(h.ctx, h.op, c.ID, stale); err == nil || err.(*task.Error).Code != "RESULT_VERSION_CONFLICT" {
		t.Fatalf("an old result hash must be refused, got %v", err)
	}
	old := AcceptanceRequest{RequestID: "acc-2", ExpectedRevision: done.Revision - 1, Decision: "accepted", ResultHash: done.Result.Hash, Note: "looks fine"}
	if _, err := h.svc.RecordAcceptance(h.ctx, h.op, c.ID, old); err == nil {
		t.Fatal("a stale expected_revision must be refused")
	}
	current := AcceptanceRequest{RequestID: "acc-3", ExpectedRevision: done.Revision, Decision: "accepted", ResultHash: done.Result.Hash, Note: "looks fine"}
	if _, err := h.svc.RecordAcceptance(h.ctx, h.op, c.ID, current); err != nil {
		t.Fatal(err)
	}
	if got := h.taskOf(c.ID); got.Acceptance == nil || got.Acceptance.Decision != "accepted" || got.Acceptance.ResultHash != done.Result.Hash {
		t.Fatalf("acceptance %+v", got.Acceptance)
	}
	if _, err := h.svc.RecordAcceptance(h.ctx, builder, c.ID, current); err == nil {
		t.Fatal("a runtime cannot accept its own work")
	}
}

// DSH-M4-02: with room for one execution, a parent yields to its child and continues in
// the same Attempt afterwards, on a new segment and fence.
func TestChildYieldContinuesTheSameAttempt(t *testing.T) {
	h := newHarness(t)
	h.svc.Config.MaxParallel = 1
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	reviewer := h.register("reviewer-bot", "reviewer", "bot-reviewer", "", "sess-2")
	h.svc.Config.DirectTargets = []string{"reviewer-bot"}
	parent, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "delegate a check"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	firstSegment, firstFence := a.Segment, a.FencingToken
	current := h.taskOf(parent.ID)
	child, err := h.svc.CreateTask(h.ctx, builder, CreateTask{RequestID: "c1", ParentID: parent.ID, Target: "reviewer-bot", Goal: "check", ExpectedRevision: current.Revision})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	if out, _ := h.svc.Dispatches(h.ctx, reviewer); len(out) != 0 {
		t.Fatal("the child must wait while the parent runs (capacity 1)")
	}
	a, _ = h.attemptOf(a.ID)
	a = h.must(h.event(builder, a, AttemptEvent{Type: "yield"}))
	a = h.must(h.event(builder, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	if a.State != "suspended" {
		t.Fatalf("parent attempt %s after yield", a.State)
	}
	h.tick()
	ca := h.startRunning(reviewer)
	ca = h.must(h.event(reviewer, ca, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"fine"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	h.must(h.event(reviewer, ca, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	h.tick()
	h.tick()
	out, err := h.svc.Dispatches(h.ctx, builder)
	if err != nil || len(out) != 1 {
		t.Fatalf("parent not dispatched again: %v %v", out, err)
	}
	resumed := out[0]["attempt"].(task.Attempt)
	if resumed.ID != a.ID || resumed.Segment != firstSegment+1 || resumed.FencingToken == firstFence || resumed.State != "admitted" {
		t.Fatalf("want the same attempt on segment %d with a new fence, got %s segment %d fence %d (was %d) %s", firstSegment+1, resumed.ID, resumed.Segment, resumed.FencingToken, firstFence, resumed.State)
	}
	// An event of the old segment is stale now.
	if _, err := h.svc.AttemptEvent(h.ctx, builder, a.ID, AttemptEvent{RequestID: "old", Type: "renew", ExpectedRevision: resumed.Revision, Segment: firstSegment, FencingToken: firstFence, ControllerEpoch: resumed.ControllerEpoch}); err == nil {
		t.Fatal("an event of the old segment must be refused")
	}
	for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
		resumed = h.must(h.event(builder, resumed, AttemptEvent{Type: step}))
	}
	resumed = h.must(h.event(builder, resumed, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"checked"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	h.must(h.event(builder, resumed, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	if got := h.taskOf(parent.ID); got.State != "completed" || len(got.AttemptIDs) != 1 {
		t.Fatalf("parent %s with %d attempts", got.State, len(got.AttemptIDs))
	}
	if got := h.taskOf(child.ID); got.State != "completed" {
		t.Fatalf("child %s", got.State)
	}
}

// DSH-M4-03: the Controller crashes mid-attempt. The restart holds the work; the old
// attempt's late result is refused and kept as evidence; after the operator confirms the
// stop, one task adopts the late result and another is retried on a new attempt.
func TestControllerCrashRecovery(t *testing.T) {
	h := newHarness(t)
	h.svc.Config.MaxParallel = 2
	h.svc.Config.DirectTargets = []string{"builder-bot", "reviewer-bot"}
	h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	h.register("reviewer-bot", "reviewer", "bot-reviewer", "", "sess-2")
	adopt, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "page"})
	if err != nil {
		t.Fatal(err)
	}
	again, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r2", Target: "reviewer-bot", Goal: "check"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a1 := h.startRunning(h.principal("builder-bot"))
	a2 := h.startRunning(h.principal("reviewer-bot"))

	// The crash: a new Controller process on the same database.
	restarted, err := New(h.ctx, h.svc.Store, h.svc.Project, h.svc.Config, operatorToken)
	if err != nil {
		t.Fatal(err)
	}
	restarted.ArtifactDir = h.svc.ArtifactDir
	h.svc = restarted
	if got := h.taskOf(adopt.ID); got.State != "needs_review" {
		t.Fatalf("after the restart the task is %s, want needs_review", got.State)
	}
	// The runtimes come back (heartbeat), and the old attempt's result arrives late.
	for _, id := range []string{"builder-bot", "reviewer-bot"} {
		p := h.principal(id)
		if _, err := h.svc.Heartbeat(h.ctx, p, p.Binding, "idle"); err != nil {
			t.Fatal(err)
		}
	}
	builder := h.principal("builder-bot")
	_, err = h.svc.AttemptEvent(h.ctx, builder, a1.ID, AttemptEvent{RequestID: "late", Type: "result_proposed", ExpectedRevision: a1.Revision, Segment: a1.Segment, FencingToken: a1.FencingToken, ControllerEpoch: a1.ControllerEpoch,
		Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"late page"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}})
	if err == nil {
		t.Fatal("a result from before the restart must be refused")
	}
	var evidence int64
	if err := h.svc.Store.DB.QueryRow(`SELECT seq FROM attempt_evidence WHERE attempt_id=? AND disposition='rejected_late_or_stale'`, a1.ID).Scan(&evidence); err != nil {
		t.Fatalf("the late result was not kept: %v", err)
	}
	// The operator confirms both executions stopped.
	for _, a := range []task.Attempt{a1, a2} {
		current, _ := h.attemptOf(a.ID)
		if _, err := h.svc.Operate(h.ctx, h.op, "attempt", a.ID, "reconcile", Operation{RequestID: "rec-" + a.ID[:12], ExpectedRevision: current.Revision, ExpectedRuntime: current.Target.RuntimeID, Note: "the host was checked", ConfirmStopped: true}); err != nil {
			t.Fatalf("reconcile: %v", err)
		}
	}
	// One task adopts the late result it already produced.
	c := h.taskOf(adopt.ID)
	if _, err := h.svc.Operate(h.ctx, h.op, "task", adopt.ID, "recover", Operation{RequestID: "recover-1", ExpectedRevision: c.Revision, Evidence: fmt.Sprintf("evidence:%d", evidence), Note: "the page was finished before the crash"}); err != nil {
		t.Fatalf("recover: %v", err)
	}
	if got := h.taskOf(adopt.ID); got.Result == nil || string(got.Result.Value) != `{"answer":"late page"}` {
		t.Fatalf("recovered result %+v (state %s)", got.Result, got.State)
	}
	// The other is retried: a new attempt, and it completes.
	c = h.taskOf(again.ID)
	if _, err := h.svc.Operate(h.ctx, h.op, "task", again.ID, "retry", Operation{RequestID: "retry-1", ExpectedRevision: c.Revision, RebindCurrent: true, Note: "run it again"}); err != nil {
		t.Fatalf("retry: %v", err)
	}
	h.tick()
	reviewer := h.principal("reviewer-bot")
	a3 := h.startRunning(reviewer)
	if a3.ID == a2.ID || a3.RetryOf != a2.ID {
		t.Fatalf("retry made %s (retry of %s), want a new attempt after %s", a3.ID, a3.RetryOf, a2.ID)
	}
	a3 = h.must(h.event(reviewer, a3, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: 1, Value: json.RawMessage(`{"answer":"checked"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	h.must(h.event(reviewer, a3, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	if got := h.taskOf(again.ID); got.State != "completed" || len(got.AttemptIDs) != 2 {
		t.Fatalf("retried task %s with %d attempts", got.State, len(got.AttemptIDs))
	}
}
