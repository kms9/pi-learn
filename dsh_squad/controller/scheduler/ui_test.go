package scheduler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// UI plan C3: one Retry confirms the stop and retries, or does nothing at all.
func TestRestartConfirmsTheStopAndRetriesAtOnce(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "page"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(builder)
	if err := h.svc.Interrupt(h.ctx, builder, Interruption{RequestID: "i1", Binding: builder.Binding, Reason: "host_restart"}); err != nil {
		t.Fatal(err)
	}
	current := h.taskOf(c.ID)
	if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "restart", Operation{RequestID: "x1", ExpectedRevision: current.Revision, ExpectedRuntime: a.Target.RuntimeID, Note: "retry"}); err == nil || !strings.Contains(err.Error(), "STOP_ATTESTATION_REQUIRED") {
		t.Fatalf("a restart without confirming the stop must be refused, got %v", err)
	}
	if got, _ := h.attemptOf(a.ID); got.Cleanup == "released" {
		t.Fatal("a refused restart must change nothing")
	}
	if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "restart", Operation{RequestID: "x2", ExpectedRevision: current.Revision, ExpectedRuntime: a.Target.RuntimeID, Note: "retry", ConfirmStopped: true}); err != nil {
		t.Fatal(err)
	}
	h.tick()
	second := h.startRunning(builder)
	if second.ID == a.ID || second.RetryOf != a.ID {
		t.Fatalf("restart made %s after %s", second.ID, a.ID)
	}
}

// UI plan C5 and human acceptance in a Team: guidance about one task; a person accepts
// the result and the Leader can then complete the Run.
func TestHumanAcceptanceInATeamAndGuidanceAboutATask(t *testing.T) {
	h := newHarness(t)
	path := h.svc.Project.Root + "/.agents/dshsquad/teams/math/team.json"
	files, _ := project.ConfigFiles(h.svc.Project.Root)
	var team project.ConfigFile
	for _, f := range files {
		if f.Path == "teams/math/team.json" {
			team = f
		}
	}
	human := strings.Replace(team.Content, `"acceptance_policy":{"child_policy":"separate","mode":"review","reviewer_ref":"reviewer"}`, `"acceptance_policy":{"child_policy":"separate","mode":"human"}`, 1)
	if human == team.Content {
		t.Fatalf("fixture changed: %s", team.Content)
	}
	if _, err := project.ApplyConfigEdits(h.svc.Project.Root, []project.ConfigEdit{{Path: "teams/math/team.json", Content: human, ExpectedHash: team.Hash}}, false); err != nil {
		t.Fatal(err)
	}
	_ = path
	h.registerLeader()
	h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	var build task.Contract
	for _, c := range h.runTasks(r.ID) {
		build = c
	}
	run := h.runOf(r.ID)
	if _, err := h.svc.Operate(h.ctx, h.op, "run", r.ID, "guidance", Operation{RequestID: "g1", ExpectedRevision: run.Revision, Note: "use pizza", TaskID: build.ID}); err != nil {
		t.Fatal(err)
	}
	run = h.runOf(r.ID)
	if len(run.GuidanceNotes) != 1 || run.GuidanceNotes[0].TaskID != build.ID || !strings.HasPrefix(run.Guidance[0], "关于「") {
		t.Fatalf("guidance %v %+v", run.Guidance, run.GuidanceNotes)
	}
	accepted := false
	for round := 0; round < 30 && h.runOf(r.ID).Phase != "completed"; round++ {
		h.tick()
		for _, id := range []string{"chief", "math-builder"} {
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
			if c.Kind == "leader_step" {
				current := h.runOf(r.ID)
				action := "wait"
				if h.allAccepted(r.ID) {
					action = "complete"
				}
				if _, err := h.svc.Decide(h.ctx, p, r.ID, Decision{RequestID: "d-" + a.ID[:16], ExpectedRevision: current.Revision, AttemptID: a.ID, Action: action, Note: action}); err != nil {
					t.Fatal(err)
				}
				a, _ = h.attemptOf(a.ID)
			} else {
				a = h.must(h.event(p, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: json.RawMessage(`{"answer":"lesson"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
			}
			h.must(h.event(p, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
		}
		done := h.taskOf(build.ID)
		if !accepted && done.State == "completed" && done.Acceptance == nil {
			if _, err := h.svc.RecordAcceptance(h.ctx, h.op, build.ID, AcceptanceRequest{RequestID: "acc", ExpectedRevision: done.Revision, Decision: "accepted", ResultHash: done.Result.Hash, Note: "looks good"}); err != nil {
				t.Fatal(err)
			}
			accepted = true
		}
	}
	if !accepted || h.runOf(r.ID).Phase != "completed" {
		t.Fatalf("accepted=%v, run %s", accepted, h.runOf(r.ID).Phase)
	}
}

// UI plan C2: the final check's refusal names the task it stopped at.
func TestGateFailureNamesTheTask(t *testing.T) {
	h := newHarness(t)
	h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "r1", Target: "builder-bot", Goal: "make the page"})
	if err != nil {
		t.Fatal(err)
	}
	var got *task.GateFailure
	_ = h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
		got = gateFailureOf(tx, task.Reject("ACCEPTANCE_PENDING", c.ID))
		return nil
	})
	if got.Code != "ACCEPTANCE_PENDING" || got.TaskID != c.ID || got.TaskGoal != "make the page" {
		t.Fatalf("gate failure %+v", got)
	}
}

// One Retry is enough: a Team Run held because its step was cut goes on after the
// restart (UI plan §4.3).
func TestRestartContinuesAHeldRun(t *testing.T) {
	h := newHarness(t)
	h.registerLeader()
	builder := h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.startRunning(h.principal("math-builder"))
	if err := h.svc.Interrupt(h.ctx, builder, Interruption{RequestID: "i1", Binding: builder.Binding, Reason: "host_restart"}); err != nil {
		t.Fatal(err)
	}
	if !h.runOf(r.ID).RecoveryHold {
		t.Fatal("the cut step should hold the Run")
	}
	c := h.taskOf(a.TaskID)
	if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "restart", Operation{RequestID: "x", ExpectedRevision: c.Revision, ExpectedRuntime: a.Target.RuntimeID, Note: "retry", ConfirmStopped: true}); err != nil {
		t.Fatal(err)
	}
	if run := h.runOf(r.ID); run.RecoveryHold || run.Phase != "running" {
		t.Fatalf("after the restart the Run is %s (hold %v)", run.Phase, run.RecoveryHold)
	}
	h.tick()
	if second := h.startRunning(h.principal("math-builder")); second.RetryOf != a.ID {
		t.Fatalf("second attempt %s retries %s", second.ID, second.RetryOf)
	}
}

// Ignoring a step that ended without a result lets its held Run go on (UI plan D1).
func TestIgnoreLetsAHeldRunGoOn(t *testing.T) {
	h := newHarness(t)
	h.registerLeader()
	h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	p := h.principal("math-builder")
	a := h.startRunning(p)
	h.must(h.event(p, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	run := h.runOf(r.ID)
	c := h.taskOf(a.TaskID)
	t.Logf("after the missing result: run %s hold %v; task %s", run.Phase, run.RecoveryHold, c.State)
	if _, err := h.svc.Operate(h.ctx, h.op, "task", c.ID, "cancel", Operation{RequestID: "ig", ExpectedRevision: c.Revision, Note: "忽略", Ignore: true}); err != nil {
		t.Fatal(err)
	}
	run = h.runOf(r.ID)
	if run.RecoveryHold {
		var why error
		_ = h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
			_, why = h.svc.runOperation(tx, r.ID, "resume", Operation{ExpectedRevision: run.Revision, Note: "probe"})
			return fmt.Errorf("rollback")
		})
		t.Fatalf("the Run is still held after ignoring its failed step (%s); resume says: %v", run.Phase, why)
	}
	if got := h.taskOf(c.ID); !got.Ignored || got.State != "cancelled" {
		t.Fatalf("task %s ignored=%v", got.State, got.Ignored)
	}
}

// A LeaderStep decides on the Run as it was dispatched. When a task finishes after
// that, its "wait" must not mark the change as seen: another step follows. With nothing
// new, a "wait" plans no further step. (Seen in ui-p5: a review accepted while the
// Leader's step waited for capacity left the Run in planning for good.)
func TestLeaderWaitOnOlderNewsPlansAnotherStep(t *testing.T) {
	h := newHarness(t)
	h.registerLeader()
	builder := h.register("math-builder", "builder", "bot-builder", "room-math", "sess-b")
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	chief := h.principal("chief")
	open := func(p Principal) (task.Attempt, task.Contract, bool) {
		out, err := h.svc.Dispatches(h.ctx, p)
		if err != nil || len(out) == 0 {
			return task.Attempt{}, task.Contract{}, false
		}
		a := out[0]["attempt"].(task.Attempt)
		for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
			a = h.must(h.event(p, a, AttemptEvent{Type: step}))
		}
		return a, out[0]["task"].(task.Contract), true
	}
	// Open LeaderSteps of this Run (runTasks leaves them out).
	pendingSteps := func() int {
		n := 0
		if err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
			return tx.QueryRow(`SELECT count(*) FROM tasks WHERE run_id=? AND json_extract(body,'$.kind')='leader_step' AND state NOT IN ('completed','cancelled','failed','interrupted')`, r.ID).Scan(&n)
		}); err != nil {
			t.Fatal(err)
		}
		return n
	}
	step, _, ok := open(chief)
	if !ok {
		t.Fatal("no LeaderStep dispatched")
	}
	// The builder finishes while the Leader's step is still open.
	work, c, ok := open(builder)
	if !ok {
		t.Fatal("no builder task dispatched")
	}
	work = h.must(h.event(builder, work, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: json.RawMessage(`{"answer":"lesson"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
	h.must(h.event(builder, work, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	if _, err := h.svc.Decide(h.ctx, chief, r.ID, Decision{RequestID: "d1", ExpectedRevision: h.runOf(r.ID).Revision, AttemptID: step.ID, Action: "wait", Note: "older news"}); err != nil {
		t.Fatal(err)
	}
	step, _ = h.attemptOf(step.ID)
	h.must(h.event(chief, step, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	h.tick()
	if pendingSteps() != 1 {
		t.Fatalf("a wait on older news planned %d more steps, want 1", pendingSteps())
	}
	// This step sees everything: its wait plans nothing more.
	step, _, ok = open(chief)
	if !ok {
		t.Fatal("the second LeaderStep was not dispatched")
	}
	if _, err := h.svc.Decide(h.ctx, chief, r.ID, Decision{RequestID: "d2", ExpectedRevision: h.runOf(r.ID).Revision, AttemptID: step.ID, Action: "wait", Note: "up to date"}); err != nil {
		t.Fatal(err)
	}
	step, _ = h.attemptOf(step.ID)
	h.must(h.event(chief, step, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
	h.tick()
	if pendingSteps() != 0 {
		t.Fatalf("an up-to-date wait planned %d more steps", pendingSteps())
	}
}

// DSH-M1-10: cancelling a running task does not free its Bot; the host reporting the
// turn ended (idle, fenced to the attempt) does, and only then is the next task sent.
func TestCancelFreesTheBotOnlyWhenTheHostConfirmsTheStop(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	first, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "t1", Target: "builder-bot", Goal: "slow work"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	out, err := h.svc.Dispatches(h.ctx, builder)
	if err != nil || len(out) != 1 {
		t.Fatalf("dispatches %v %v", out, err)
	}
	a := out[0]["attempt"].(task.Attempt)
	for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
		a = h.must(h.event(builder, a, AttemptEvent{Type: step}))
	}
	if _, err := h.svc.Operate(h.ctx, h.op, "task", first.ID, "cancel", Operation{RequestID: "c1", ExpectedRevision: h.taskOf(first.ID).Revision, Note: "stop"}); err != nil {
		t.Fatal(err)
	}
	second, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "t2", Target: "builder-bot", Goal: "next work"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	// The cancelled attempt is still listed (so the host learns of the cancel); the next task is not.
	out, _ = h.svc.Dispatches(h.ctx, builder)
	for _, d := range out {
		if d["task"].(task.Contract).ID == second.ID {
			t.Fatal("the next task went out before the stop was confirmed")
		}
	}
	// A renewal is refused: the attempt is cancelled.
	a, _ = h.attemptOf(a.ID)
	if _, err := h.event(builder, a, AttemptEvent{Type: "renew"}); err == nil {
		t.Fatal("a cancelled attempt was renewed")
	}
	if _, err := h.event(builder, a, AttemptEvent{Type: "settled", Idle: false, Outcome: "aborted"}); err == nil {
		t.Fatal("a busy host proved a stop")
	}
	a = h.must(h.event(builder, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "aborted"}))
	if a.Cleanup != "released" || h.taskOf(first.ID).State != "cancelled" {
		t.Fatalf("attempt %s/%s task %s", a.State, a.Cleanup, h.taskOf(first.ID).State)
	}
	h.tick()
	out, _ = h.svc.Dispatches(h.ctx, builder)
	if len(out) != 1 || out[0]["task"].(task.Contract).ID != second.ID {
		t.Fatalf("the next task was not sent after the stop: %v", out)
	}
}

// Q49: a Controller that was not running itself (the machine slept) gives a running
// attempt one more lease instead of expiring it at once; one that kept running still
// expires a lease nobody renewed.
func TestAPausedControllerForgivesLeasesItCouldNotWatch(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "t1", Target: "builder-bot", Goal: "long work"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	a := h.dispatched(builder)
	for _, step := range []string{"adapter_received", "injection_requested", "input_observed"} {
		a = h.must(h.event(builder, a, AttemptEvent{Type: step}))
	}
	backdate := func() {
		past := time.Now().UTC().Add(-time.Minute)
		if err := h.svc.Store.Transaction(h.ctx, func(tx *sql.Tx) error {
			a, err := task.LoadAttempt(tx, a.ID)
			if err != nil {
				return err
			}
			a.LeaseExpiresAt = past
			if err := task.SaveAttempt(tx, a); err != nil {
				return err
			}
			_, err = tx.Exec(`UPDATE execution_leases SET expires_at=? WHERE attempt_id=?`, past.Format(time.RFC3339Nano), a.ID)
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	// The lease ran out while the Controller was asleep for two leases.
	backdate()
	h.svc.lastTick = time.Now().UTC().Add(-2*h.svc.Config.LeaseTTL - time.Minute)
	h.tick()
	got, _ := h.attemptOf(a.ID)
	if got.State == "needs_review" || got.Error == "lease_expired" || !got.LeaseExpiresAt.After(time.Now()) {
		t.Fatalf("a paused Controller expired the lease: %s %s %v", got.State, got.Error, got.LeaseExpiresAt)
	}
	// The host renews as it would after waking; the attempt goes on.
	got = h.must(h.event(builder, got, AttemptEvent{Type: "renew"}))
	// Without a pause, a lease nobody renewed expires as before.
	backdate()
	h.tick()
	got, _ = h.attemptOf(a.ID)
	if got.Error != "lease_expired" || h.taskOf(c.ID).State != "needs_review" {
		t.Fatalf("an unwatched lease did not expire: %s %s", got.State, got.Error)
	}
}

// A host that does not keep DS Bot's memory review off managed Sessions gets no
// formal work (D12): the task waits with the missing capability named.
func TestNoFormalWorkWithoutTheMemoryReviewGate(t *testing.T) {
	h := newHarness(t)
	raw, _ := os.ReadFile(filepath.Join(h.svc.Project.Root, ".agents/dshsquad/roles/builder/role.md"))
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = name != "memory_review_gate"
	}
	if _, err := h.svc.Register(h.ctx, Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: "bot-builder", Place: "chat"},
		AgentID: "builder-bot", RuntimeID: "11111111-1111-4111-8111-555555555555", SessionID: "sess-1", RuntimeToken: runtimeToken("builder-bot"),
		Mode: "role", RoleID: "builder", Activity: "idle", Capabilities: caps, RoleHash: project.Hash(raw), AvailableTools: []string{"read"},
	}); err != nil {
		t.Fatal(err)
	}
	c, err := h.svc.CreateTask(h.ctx, h.op, CreateTask{RequestID: "t1", Target: "builder-bot", Goal: "work"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	got := h.taskOf(c.ID)
	if len(got.AttemptIDs) != 0 {
		t.Fatal("formal work went to a host without the memory review gate")
	}
	named := false
	for _, b := range got.Blockers {
		named = named || (b.Kind == "capability_unavailable" && b.Resource == "memory_review_gate")
	}
	if !named {
		t.Fatalf("blockers %+v", got.Blockers)
	}
}

// A heartbeat fills in the thinking level the host pinned and where the Session works;
// it never changes the frozen model.
func TestHeartbeatReportsThePinnedLevelAndTheFolder(t *testing.T) {
	h := newHarness(t)
	raw, _ := os.ReadFile(filepath.Join(h.svc.Project.Root, ".agents/dshsquad/roles/builder/role.md"))
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = true
	}
	if _, err := h.svc.Register(h.ctx, Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: "bot-builder", Place: "chat"},
		AgentID: "builder-bot", RuntimeID: "11111111-1111-4111-8111-666666666666", SessionID: "sess-1", RuntimeToken: runtimeToken("builder-bot"),
		Mode: "role", RoleID: "builder", Activity: "idle", Capabilities: caps, RoleHash: project.Hash(raw), AvailableTools: []string{"read"},
		Route: &Route{Provider: "deepseek-official", Model: "deepseek-flash"},
	}); err != nil {
		t.Fatal(err)
	}
	p, err := h.svc.Authenticate(h.ctx, runtimeToken("builder-bot"), "builder-bot")
	if err != nil {
		t.Fatal(err)
	}
	beat := func(route *Route, folder string) Instance {
		out, err := h.svc.HeartbeatWith(h.ctx, p, HeartbeatRequest{Binding: p.Binding, Activity: "idle", Route: route, Folder: folder})
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	got := beat(&Route{Provider: "deepseek-official", Model: "other-model", Effort: "low"}, "")
	if got.Route.Model != "deepseek-flash" || got.Route.Effort != "" {
		t.Fatalf("a heartbeat changed the frozen route: %+v", got.Route)
	}
	got = beat(&Route{Provider: "deepseek-official", Model: "deepseek-flash", Effort: "high"}, "/team/workspace")
	if got.Route.Effort != "high" || got.Host.Folder != "/team/workspace" {
		t.Fatalf("route %+v folder %q", got.Route, got.Host.Folder)
	}
	got = beat(&Route{Provider: "deepseek-official", Model: "deepseek-flash", Effort: "low"}, "")
	if got.Route.Effort != "high" || got.Host.Folder != "/team/workspace" {
		t.Fatalf("a pinned level changed or the folder was dropped: %+v %q", got.Route, got.Host.Folder)
	}
}

// A heartbeat that changes nothing shown writes no event; a change of activity does.
func TestQuietHeartbeatsWriteNoEvents(t *testing.T) {
	h := newHarness(t)
	builder := h.register("builder-bot", "builder", "bot-builder", "", "sess-1")
	count := func() int {
		var n int
		if err := h.svc.Store.DB.QueryRow(`SELECT count(*) FROM events WHERE type='heartbeat'`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	// The first heartbeat after registering sets what the runtime is doing.
	if _, err := h.svc.Heartbeat(h.ctx, builder, builder.Binding, "idle"); err != nil {
		t.Fatal(err)
	}
	before := count()
	for i := 0; i < 5; i++ {
		if _, err := h.svc.Heartbeat(h.ctx, builder, builder.Binding, "idle"); err != nil {
			t.Fatal(err)
		}
	}
	if got := count(); got != before {
		t.Fatalf("%d quiet heartbeats wrote events", got-before)
	}
	if _, err := h.svc.Heartbeat(h.ctx, builder, builder.Binding, "working"); err != nil {
		t.Fatal(err)
	}
	if got := count(); got != before+1 {
		t.Fatalf("a change of activity wrote %d events", got-before)
	}
}

// P1: a heartbeat's answer says whether the runtime's Team has a Run under way, so the
// host can keep the Bot's model and thinking level until it ends.
func TestHeartbeatSaysWhenTheTeamRunIsUnderWay(t *testing.T) {
	h := newHarness(t)
	h.registerLeader()
	h.registerAs("math-builder", "role", "builder", "math", "bot-builder", "room-math")
	p := h.principal("math-builder")
	beat := func() bool {
		out, err := h.svc.Heartbeat(h.ctx, p, p.Binding, "idle")
		if err != nil {
			t.Fatal(err)
		}
		return out.RunActive
	}
	if beat() {
		t.Fatal("a Run is under way before any was made")
	}
	r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run1", TeamID: "math", Goal: "teach", WorkflowID: "lesson"})
	if err != nil {
		t.Fatal(err)
	}
	h.tick()
	if !beat() {
		t.Fatal("the admitted Run is not reported")
	}
	if _, err := h.svc.Operate(h.ctx, h.op, "run", r.ID, "cancel", Operation{RequestID: "c1", ExpectedRevision: h.runOf(r.ID).Revision, Note: "stop"}); err != nil {
		t.Fatal(err)
	}
	h.tick()
	if beat() {
		t.Fatal("a cancelled Run is still reported")
	}
}
