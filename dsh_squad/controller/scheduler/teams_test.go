package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/agent"
	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// Teams A and B share the reviewer role; Team C has its own roles (DSH-M4-01).
func multiTeamHarness(t *testing.T) *harness {
	t.Helper()
	root, _ := filepath.EvalSymlinks(t.TempDir())
	base := filepath.Join(root, ".agents/dshsquad")
	for _, role := range []string{"author", "editor", "reviewer", "maker", "auditor"} {
		writeFile(t, filepath.Join(base, "roles", role, "role.md"), roleDoc(role))
		writeFile(t, filepath.Join(base, "roles", role, "agents.md"), "Work carefully.\n")
	}
	team := func(id, lead, worker, reviewer string) {
		b, _ := json.Marshal(map[string]any{
			"schema_version": 1, "team_id": id, "config_version": 1, "leader": map[string]any{"agent_ref": lead},
			"members":           []map[string]any{{"role_ref": worker, "responsibility": "work"}, {"role_ref": reviewer, "responsibility": "review"}},
			"instructions_file": "instructions.md", "default_workflow": "one",
			"policy": map[string]any{"run_admission": "fifo_single_active", "max_parallel_tasks": 2, "max_delegate_depth": 2, "max_total_tasks": 12, "max_attempts_per_task": 3,
				"allowed_tools": []string{"read"}, "writable_roots": []string{}, "acceptance_policy": map[string]any{"mode": "review", "reviewer_ref": reviewer, "child_policy": "separate"}},
		})
		writeFile(t, filepath.Join(base, "teams", id, "team.json"), string(b))
		writeFile(t, filepath.Join(base, "teams", id, "instructions.md"), "Do it.\n")
		writeFile(t, filepath.Join(base, "teams", id, "workflows/one.json"), fmt.Sprintf(`{"schema_version":1,"workflow_id":"one","steps":[{"id":"work","role_ref":%q,"kind":"execute","goal":"the work","depends_on":[]}]}`, worker))
	}
	team("team-a", "lead-a", "author", "reviewer")
	team("team-b", "lead-b", "editor", "reviewer")
	team("team-c", "lead-c", "maker", "auditor")
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
	svc, err := New(ctx, task.NewStore(reg.Database()), snap, Config{MaxParallel: 4, HeartbeatTimeout: time.Hour, LeaseTTL: time.Hour, DirectTools: []string{"read"}}, operatorToken)
	if err != nil {
		t.Fatal(err)
	}
	op, _ := svc.Authenticate(ctx, operatorToken, "")
	return &harness{t: t, ctx: ctx, svc: svc, op: op}
}

var runtimeSeq = 0

func (h *harness) registerAs(agentID, mode, role, team, bot, room string) {
	h.t.Helper()
	runtimeSeq++
	caps := map[string]bool{}
	for _, name := range RequiredCapabilities {
		caps[name] = true
	}
	q := Register{
		Host:    Host{Profile: project.HostProfile, HostID: "host-1", BotID: bot, RoomID: room, Place: "group-member"},
		AgentID: agentID, RuntimeID: fmt.Sprintf("11111111-1111-4111-8111-%012d", runtimeSeq), SessionID: "sess-" + agentID,
		RuntimeToken: runtimeToken(agentID), Mode: mode, TeamID: team, Activity: "idle", Capabilities: caps, AvailableTools: []string{"read"},
	}
	if mode == "role" {
		raw, _ := os.ReadFile(filepath.Join(h.svc.Project.Root, ".agents/dshsquad/roles", role, "role.md"))
		q.RoleID, q.RoleHash = role, project.Hash(raw)
	}
	if _, err := h.svc.Register(h.ctx, q); err != nil {
		h.t.Fatal(err)
	}
}

// principal reads the runtime's current binding, as the adapter does after its binding
// moved on (a Primary switch raises the epoch).
func (h *harness) principal(agentID string) Principal {
	p, err := h.svc.Authenticate(h.ctx, runtimeToken(agentID), agentID)
	if err != nil {
		h.t.Fatal(err)
	}
	return p
}

func TestSharedReviewerWaitsAtomicallyAndWorksInEachTeam(t *testing.T) {
	h := multiTeamHarness(t)
	for _, team := range []string{"a", "b", "c"} {
		h.registerAs("lead-"+team, "leader", "", "team-"+team, "bot-chief", "room-"+team)
	}
	h.registerAs("a-author", "role", "author", "team-a", "bot-author", "room-a")
	h.registerAs("a-reviewer", "role", "reviewer", "team-a", "bot-reviewer", "room-a")
	h.registerAs("b-editor", "role", "editor", "team-b", "bot-editor", "room-b")
	// The same reviewer Bot, in Team B's group: another runtime of the same role.
	h.registerAs("b-reviewer", "role", "reviewer", "team-b", "bot-reviewer", "room-b")
	h.registerAs("c-maker", "role", "maker", "team-c", "bot-maker", "room-c")
	h.registerAs("c-auditor", "role", "auditor", "team-c", "bot-auditor", "room-c")

	runs := map[string]task.Run{}
	for _, team := range []string{"a", "b", "c"} {
		r, err := h.svc.CreateRun(h.ctx, h.op, CreateRun{RequestID: "run-" + team, TeamID: "team-" + team, Goal: "goal " + team})
		if err != nil {
			t.Fatal(err)
		}
		runs[team] = r
	}
	h.tick()
	if !h.runOf(runs["a"].ID).Admitted || !h.runOf(runs["c"].ID).Admitted {
		t.Fatal("A and C must be admitted at once")
	}
	b := h.runOf(runs["b"].ID)
	if b.Admitted || len(b.WaitingRoles) != 1 || b.WaitingRoles[0].RoleID != "reviewer" || b.WaitingRoles[0].OwnerRunID != runs["a"].ID {
		t.Fatalf("B must wait for reviewer held by A: admitted=%v waiting=%+v", b.Admitted, b.WaitingRoles)
	}
	// Every runtime answers its dispatches; Leaders complete when all is accepted.
	reviewedBy := map[string]string{}
	for round := 0; round < 60; round++ {
		h.tick()
		moved := false
		for _, id := range []string{"lead-a", "lead-b", "lead-c", "a-author", "a-reviewer", "b-editor", "b-reviewer", "c-maker", "c-auditor"} {
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
				run := h.runOf(*c.RunID)
				action := "wait"
				if h.allAccepted(run.ID) {
					action = "complete"
				}
				if _, err := h.svc.Decide(h.ctx, p, run.ID, Decision{RequestID: "d-" + a.ID[:16], ExpectedRevision: run.Revision, AttemptID: a.ID, Action: action, Note: action}); err != nil {
					t.Fatalf("decide: %v", err)
				}
				a, _ = h.attemptOf(a.ID)
			case "review":
				reviewedBy[*c.TeamID] = id
				value, _ := json.Marshal(map[string]any{"decision": "accepted", "reason": "ok", "candidates": c.Refs})
				a = h.must(h.event(p, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: value, Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
			default:
				a = h.must(h.event(p, a, AttemptEvent{Type: "result_proposed", Result: &task.Result{GoalRevision: c.AppliedRevision, Value: json.RawMessage(`{"answer":"done"}`), Artifacts: []task.Artifact{}, Refs: []project.ResultRef{}}}))
			}
			h.must(h.event(p, a, AttemptEvent{Type: "settled", Idle: true, Outcome: "completed"}))
			moved = true
		}
		if !moved && h.runOf(runs["b"].ID).Phase == "completed" {
			break
		}
	}
	for _, team := range []string{"a", "b", "c"} {
		if phase := h.runOf(runs[team].ID).Phase; phase != "completed" {
			t.Fatalf("run %s phase %s", team, phase)
		}
	}
	if reviewedBy["team-a"] != "a-reviewer" || reviewedBy["team-b"] != "b-reviewer" || reviewedBy["team-c"] != "c-auditor" {
		t.Fatalf("each Team's review must run in its own group: %v", reviewedBy)
	}
	var admittedA, completedA, admittedB int64
	rows, _ := h.svc.Store.DB.Query(`SELECT seq,type,entity_id FROM events WHERE type IN ('run_admitted','leader_decision') ORDER BY seq`)
	for rows.Next() {
		var seq int64
		var kind, entity string
		_ = rows.Scan(&seq, &kind, &entity)
		switch {
		case kind == "run_admitted" && entity == runs["a"].ID:
			admittedA = seq
		case kind == "run_admitted" && entity == runs["b"].ID:
			admittedB = seq
		case kind == "leader_decision" && entity == runs["a"].ID:
			completedA = seq
		}
	}
	rows.Close()
	if !(admittedA < completedA && completedA < admittedB) {
		t.Fatalf("B must be admitted after A finished: A admitted %d, A last decision %d, B admitted %d", admittedA, completedA, admittedB)
	}
}
