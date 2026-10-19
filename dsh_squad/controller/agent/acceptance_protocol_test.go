package agent

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

const protoToken = "protocol-private-credential-at-least-32"

func protoRegister(t *testing.T, svc *Service, id, uuid, session, token string) Binding {
	t.Helper()
	req := RegisterRequest{AgentID: id, Role: id, SquadID: "alpha", RuntimeID: uuid, RuntimeSessionID: session, RuntimeToken: token}
	if _, err := svc.Register(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	return Binding{AgentID: id, RuntimeID: uuid, RuntimeSessionID: session, RuntimeToken: token}
}

func TestCredentialSessionAndReleaseConflicts(t *testing.T) {
	reg, err := OpenRegistry(filepath.Join(t.TempDir(), "proto.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer reg.Close()
	svc := NewService(reg)
	ctx := context.Background()
	a := protoRegister(t, svc, "a", "11111111-1111-4111-8111-111111111111", "sess-a", protoToken)
	b := protoRegister(t, svc, "b", "22222222-2222-4222-8222-222222222222", "sess-b", protoToken+"-b")

	bad := a
	bad.RuntimeToken = "wrong-token-value-which-is-32-chars!!"
	if _, err := reg.Heartbeat(ctx, HeartbeatRequest{AgentID: bad.AgentID, RuntimeID: bad.RuntimeID, RuntimeSessionID: bad.RuntimeSessionID, RuntimeToken: bad.RuntimeToken}); !errors.Is(err, ErrConflict) {
		t.Fatalf("wrong token heartbeat: %v", err)
	}
	if _, err := svc.SendMessage(ctx, MessageRequest{Binding: bad, RequestID: "x", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "no"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("wrong token send: %v", err)
	}
	oldSession := HeartbeatRequest{AgentID: a.AgentID, RuntimeID: a.RuntimeID, RuntimeSessionID: "stale-session", RuntimeToken: a.RuntimeToken}
	if _, err := reg.Heartbeat(ctx, oldSession); !errors.Is(err, ErrConflict) {
		t.Fatalf("old session heartbeat: %v", err)
	}

	rotated := RegisterRequest{AgentID: a.AgentID, Role: "a", SquadID: "alpha", RuntimeID: a.RuntimeID, RuntimeSessionID: "sess-a2", PreviousSessionID: a.RuntimeSessionID, RuntimeToken: a.RuntimeToken}
	if _, err := svc.Register(ctx, rotated); err != nil {
		t.Fatal(err)
	}
	if _, err := reg.Heartbeat(ctx, HeartbeatRequest{AgentID: a.AgentID, RuntimeID: a.RuntimeID, RuntimeSessionID: a.RuntimeSessionID, RuntimeToken: a.RuntimeToken}); !errors.Is(err, ErrConflict) {
		t.Fatalf("pre-/new session heartbeat must not revert session: %v", err)
	}
	a.RuntimeSessionID = "sess-a2"

	if err := svc.Release(ctx, ReleaseRequest{AgentID: a.AgentID, ExpectedRuntimeID: "00000000-0000-4000-8000-000000000000"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("wrong release: %v", err)
	}
	if err := svc.Release(ctx, ReleaseRequest{AgentID: a.AgentID, ExpectedRuntimeID: a.RuntimeID}); err != nil {
		t.Fatal(err)
	}
	revoked := RegisterRequest{AgentID: a.AgentID, Role: "a", SquadID: "alpha", RuntimeID: a.RuntimeID, RuntimeSessionID: "sess-again", RuntimeToken: protoToken + "-new"}
	if _, err := svc.Register(ctx, revoked); !errors.Is(err, ErrConflict) {
		t.Fatalf("revoked UUID re-register: %v", err)
	}
	fresh := revoked
	fresh.RuntimeID = "44444444-4444-4444-8444-444444444444"
	if _, err := svc.Register(ctx, fresh); err != nil {
		t.Fatalf("new process after release: %v", err)
	}
}

func TestQueueFullAndExpiry(t *testing.T) {
	reg, err := OpenRegistry(filepath.Join(t.TempDir(), "limits.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer reg.Close()
	clock := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)
	reg.now = func() time.Time { return clock }
	svc := NewService(reg)
	ctx := context.Background()
	a := protoRegister(t, svc, "a", "11111111-1111-4111-8111-111111111111", "sess-a", protoToken)
	b := protoRegister(t, svc, "b", "22222222-2222-4222-8222-222222222222", "sess-b", protoToken+"-b")
	for i := 0; i < 32; i++ {
		if _, err := svc.SendMessage(ctx, MessageRequest{Binding: a, RequestID: fmt.Sprintf("q-%d", i), ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "queued"}); err != nil {
			t.Fatalf("queue %d: %v", i, err)
		}
	}
	if _, err := svc.SendMessage(ctx, MessageRequest{Binding: a, RequestID: "q-full", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "overflow"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("queue full: %v", err)
	}
	clock = clock.Add(11 * time.Minute)
	if _, err := reg.Heartbeat(ctx, HeartbeatRequest{AgentID: b.AgentID, RuntimeID: b.RuntimeID, RuntimeSessionID: b.RuntimeSessionID, RuntimeToken: b.RuntimeToken}); err != nil {
		t.Fatal(err)
	}
	expired, err := svc.Inbox(ctx, b, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(expired) != 0 {
		t.Fatalf("expired pending must not remain deliverable: %d", len(expired))
	}
}
func TestIdempotencyOfflineAndWrongReply(t *testing.T) {
	reg, err := OpenRegistry(filepath.Join(t.TempDir(), "msg.sqlite"), 20*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	defer reg.Close()
	svc := NewService(reg)
	ctx := context.Background()
	a := protoRegister(t, svc, "a", "11111111-1111-4111-8111-111111111111", "sess-a", protoToken)
	b := protoRegister(t, svc, "b", "22222222-2222-4222-8222-222222222222", "sess-b", protoToken+"-b")
	req := MessageRequest{Binding: a, RequestID: "same", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "one"}
	first, err := svc.SendMessage(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	again, err := svc.SendMessage(ctx, req)
	if err != nil || again.MessageID != first.MessageID {
		t.Fatalf("idempotent replay: %+v %v", again, err)
	}
	changed := req
	changed.Text = "two"
	if _, err := svc.SendMessage(ctx, changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("different body same request_id: %v", err)
	}
	if _, err := svc.SendMessage(ctx, MessageRequest{Binding: b, RequestID: "bad-reply", ToAgentID: a.AgentID, TargetRuntimeID: a.RuntimeID, TargetSessionID: a.RuntimeSessionID, Kind: "reply", ReplyTo: first.MessageID, Text: "nope"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("reply from non-recipient: %v", err)
	}

	time.Sleep(40 * time.Millisecond)
	if _, err := reg.Heartbeat(ctx, HeartbeatRequest{AgentID: a.AgentID, RuntimeID: a.RuntimeID, RuntimeSessionID: a.RuntimeSessionID, RuntimeToken: a.RuntimeToken}); err != nil {
		t.Fatal(err)
	}
	offline := MessageRequest{Binding: a, RequestID: "off-1", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "late"}
	failed, err := svc.SendMessage(ctx, offline)
	if err != nil || failed.Status != "offline" {
		t.Fatalf("offline send: %+v %v", failed, err)
	}
	replay, err := svc.SendMessage(ctx, offline)
	if err != nil || replay.MessageID != failed.MessageID || replay.Status != "offline" {
		t.Fatalf("offline retry must not create a new delivery: %+v %v", replay, err)
	}
	if _, err := reg.Heartbeat(ctx, HeartbeatRequest{AgentID: b.AgentID, RuntimeID: b.RuntimeID, RuntimeSessionID: b.RuntimeSessionID, RuntimeToken: b.RuntimeToken}); err != nil {
		t.Fatal(err)
	}
	still, err := svc.GetMessage(ctx, a, failed.MessageID)
	if err != nil || still.Status != "offline" {
		t.Fatalf("coming back online must not redeliver the failed record: %+v %v", still, err)
	}
}
