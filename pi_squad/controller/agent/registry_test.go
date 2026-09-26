package agent

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestLegacyMigrationAndRuntimeMetadata(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.sqlite")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE agents (
	 agent_id TEXT PRIMARY KEY, role TEXT NOT NULL, squad_id TEXT NOT NULL, runtime_type TEXT NOT NULL,
	 herdr_session_id TEXT, space_id TEXT, pane_id TEXT, runtime_session_id TEXT, last_seen TEXT NOT NULL);
	 INSERT INTO agents(agent_id,role,squad_id,runtime_type,last_seen)
	 VALUES('reviewer','reviewer','alpha','pi','2026-09-24T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	ctx := context.Background()
	reg, err := OpenRegistry(dbPath, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer reg.Close()
	old, err := reg.Get(ctx, "reviewer")
	if err != nil || old.Cwd != "" || old.RuntimeID != "" {
		t.Fatalf("legacy: %+v, %v", old, err)
	}
	const token = "test-private-credential-at-least-32-chars"
	req := RegisterRequest{AgentID: "reviewer", Role: "reviewer", SquadID: "alpha", Cwd: "/tmp/project space", RuntimeID: "26bcde84-55f1-43a3-8cd8-3cc040113119", RuntimeSessionID: "sess-old", RuntimeToken: token, RoleDescription: "Reviews code"}
	if _, err = NewService(reg).Register(ctx, req); !errors.Is(err, ErrConflict) {
		t.Fatalf("legacy row without UUID must require explicit release, got %v", err)
	}
	if err = NewService(reg).Release(ctx, ReleaseRequest{AgentID: "reviewer", ExpectedRuntimeID: ""}); err != nil {
		t.Fatal(err)
	}
	got, err := NewService(reg).Register(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	if got.Cwd != req.Cwd || got.RuntimeID != req.RuntimeID || got.RoleDescription != req.RoleDescription {
		t.Fatalf("metadata lost: %+v", got)
	}
	got, err = reg.Heartbeat(ctx, HeartbeatRequest{AgentID: req.AgentID, RuntimeID: req.RuntimeID, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: token})
	if err != nil || got.RuntimeSessionID != req.RuntimeSessionID {
		t.Fatalf("heartbeat: %+v, %v", got, err)
	}
	if _, err = reg.Heartbeat(ctx, HeartbeatRequest{AgentID: req.AgentID, RuntimeID: req.RuntimeID, RuntimeSessionID: "new-session", RuntimeToken: token}); !errors.Is(err, ErrConflict) {
		t.Fatalf("heartbeat must not move session, got %v", err)
	}
	other := req
	other.RuntimeID = "09935896-61d9-4c6f-b2e9-533e4ac46651"
	other.RuntimeToken = "another-private-credential-at-least-32b"
	if _, err = NewService(reg).Register(ctx, other); !errors.Is(err, ErrConflict) {
		t.Fatalf("different UUID must not overwrite owner, got %v", err)
	}
	still, err := reg.Get(ctx, "reviewer")
	if err != nil || still.RuntimeID != req.RuntimeID {
		t.Fatalf("owner changed after conflict: %+v, %v", still, err)
	}
}
