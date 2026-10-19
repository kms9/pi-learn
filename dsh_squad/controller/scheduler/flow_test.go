package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
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
	q.RequestID = q.Type + "-" + a.ID[:16]
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
