package agent

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestInboxWatchBindingAndCommittedDelivery(t *testing.T) {
	ctx := context.Background()
	r, err := OpenRegistry(filepath.Join(t.TempDir(), "events.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	svc := NewService(r)
	register := func(id, uuid string) Binding {
		t.Helper()
		req := RegisterRequest{AgentID: id, Role: id, SquadID: "test", RuntimeID: uuid, RuntimeSessionID: "session-" + id, RuntimeToken: "test-private-credential-at-least-32-chars"}
		if _, err := svc.Register(ctx, req); err != nil {
			t.Fatal(err)
		}
		return Binding{AgentID: id, RuntimeID: uuid, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: req.RuntimeToken}
	}
	a := register("a", "11111111-1111-4111-8111-111111111111")
	b := register("b", "22222222-2222-4222-8222-222222222222")
	c := register("c", "33333333-3333-4333-8333-333333333333")
	wrong := b
	wrong.RuntimeToken = "wrong"
	if _, _, err := svc.WatchInbox(ctx, wrong); err == nil {
		t.Fatal("wrong credential opened a stream")
	}
	wb, cancelB, err := svc.WatchInbox(ctx, b)
	if err != nil {
		t.Fatal(err)
	}
	defer cancelB()
	wc, cancelC, err := svc.WatchInbox(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	defer cancelC()
	req := MessageRequest{Binding: a, RequestID: "first", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "hello"}
	m, err := svc.SendMessage(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-wb.Changed():
	case <-time.After(time.Second):
		t.Fatal("missing target wake")
	}
	saved, err := svc.GetMessage(ctx, a, m.MessageID)
	if err != nil || saved.Status != "stored" {
		t.Fatalf("wake preceded commit or changed receipt: %v %s", err, saved.Status)
	}
	select {
	case <-wc.Changed():
		t.Fatal("unrelated recipient woke")
	default:
	}
	// Idempotent send replays the stored result, not another notification.
	if _, err := svc.SendMessage(ctx, req); err != nil {
		t.Fatal(err)
	}
	select {
	case <-wb.Changed():
		t.Fatal("idempotent replay emitted another wake")
	default:
	}
	// Replacing a stream must close the old one; its cleanup cannot close the new one.
	replacement, cancelNew, err := svc.WatchInbox(ctx, b)
	if err != nil {
		t.Fatal(err)
	}
	defer cancelNew()
	select {
	case <-wb.Closed():
	default:
		t.Fatal("old stream not closed")
	}
	cancelB()
	select {
	case <-replacement.Closed():
		t.Fatal("old cleanup closed the replacement stream")
	default:
	}
	follow := MessageRequest{Binding: a, RequestID: "after-replace", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "replacement still open"}
	sent, err := svc.SendMessage(ctx, follow)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-replacement.Changed():
	case <-time.After(time.Second):
		t.Fatal("replacement stream did not wake after old cleanup")
	}
	saved, err = svc.GetMessage(ctx, a, sent.MessageID)
	if err != nil || saved.Status != "stored" || saved.Text != follow.Text {
		t.Fatalf("replacement wake must still see the stored record: %+v %v", saved, err)
	}
	if err := svc.Release(ctx, ReleaseRequest{AgentID: b.AgentID, ExpectedRuntimeID: b.RuntimeID}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-replacement.Closed():
	default:
		t.Fatal("release did not close stream")
	}
	if _, _, err := svc.WatchInbox(ctx, b); err == nil {
		t.Fatal("released binding reconnected")
	}
}

func TestInboxWatchSessionChangeAndOfflinePresence(t *testing.T) {
	ctx := context.Background()
	r, err := OpenRegistry(filepath.Join(t.TempDir(), "sessions.sqlite"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	svc := NewService(r)
	now := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	r.now = func() time.Time { return now }
	req := RegisterRequest{AgentID: "a", Role: "a", SquadID: "test", RuntimeID: "11111111-1111-4111-8111-111111111111", RuntimeSessionID: "one", RuntimeToken: "test-private-credential-at-least-32-chars"}
	if _, err := svc.Register(ctx, req); err != nil {
		t.Fatal(err)
	}
	b := Binding{AgentID: req.AgentID, RuntimeID: req.RuntimeID, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: req.RuntimeToken}
	watch, cancel, err := svc.WatchInbox(ctx, b)
	if err != nil {
		t.Fatal(err)
	}
	defer cancel()
	now = now.Add(2 * time.Second)
	if err := svc.ValidateWatch(ctx, watch); err != nil {
		t.Fatal(err)
	}
	a, err := svc.Get(ctx, b.AgentID)
	if err != nil || a.Status != StatusOffline {
		t.Fatal("SSE renewed registry presence", err)
	}
	req.PreviousSessionID = "one"
	req.RuntimeSessionID = "two"
	if _, err := svc.Register(ctx, req); err != nil {
		t.Fatal(err)
	}
	select {
	case <-watch.Closed():
	default:
		t.Fatal("session switch did not close old stream")
	}
	if _, _, err := svc.WatchInbox(ctx, b); err == nil {
		t.Fatal("old session subscribed")
	}
}
