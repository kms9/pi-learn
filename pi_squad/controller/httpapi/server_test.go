package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func setup(t *testing.T, timeout time.Duration) *httptest.Server {
	t.Helper()
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "agents.sqlite"), timeout)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	return httptest.NewServer(httpapi.New(agent.NewService(reg)).Handler())
}

func postJSON(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(url, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func decode(t *testing.T, resp *http.Response, dest any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		t.Fatal(err)
	}
}

func TestRegisterHeartbeatListAndTimeout(t *testing.T) {
	srv := setup(t, 200*time.Millisecond)
	defer srv.Close()

	resp := postJSON(t, srv.URL+"/agents/register", map[string]string{
		"agent_id":           "backend",
		"role":               "backend",
		"squad_id":           "alpha",
		"runtime_type":       "pi",
		"space_id":           "ws-1",
		"pane_id":            "pane-1",
		"runtime_session_id": "sess-a",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("register status %d", resp.StatusCode)
	}
	var backend agent.Agent
	decode(t, resp, &backend)
	if backend.Status != agent.StatusOnline || backend.AgentID != "backend" {
		t.Fatalf("register body: %+v", backend)
	}

	resp = postJSON(t, srv.URL+"/agents/register", map[string]string{
		"agent_id": "reviewer",
		"role":     "reviewer",
		"squad_id": "alpha",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("register reviewer %d", resp.StatusCode)
	}
	resp.Body.Close()

	resp, err := http.Get(srv.URL + "/agents")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Agents []agent.Agent `json:"agents"`
	}
	decode(t, resp, &list)
	if len(list.Agents) != 2 {
		t.Fatalf("want 2 agents, got %d", len(list.Agents))
	}
	for _, a := range list.Agents {
		if a.Status != agent.StatusOnline {
			t.Fatalf("expected online: %+v", a)
		}
	}

	time.Sleep(250 * time.Millisecond)
	resp = postJSON(t, srv.URL+"/agents/heartbeat", map[string]string{"agent_id": "backend"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("heartbeat %d", resp.StatusCode)
	}
	resp.Body.Close()

	resp, err = http.Get(srv.URL + "/agents?status=offline")
	if err != nil {
		t.Fatal(err)
	}
	decode(t, resp, &list)
	if len(list.Agents) != 1 || list.Agents[0].AgentID != "reviewer" {
		t.Fatalf("offline filter: %+v", list.Agents)
	}

	resp, err = http.Get(srv.URL + "/agents/reviewer")
	if err != nil {
		t.Fatal(err)
	}
	var reviewer agent.Agent
	decode(t, resp, &reviewer)
	if reviewer.Status != agent.StatusOffline {
		t.Fatalf("reviewer should be offline: %+v", reviewer)
	}
}

func TestUpsertSameIdentity(t *testing.T) {
	srv := setup(t, time.Second)
	defer srv.Close()

	postJSON(t, srv.URL+"/agents/register", map[string]string{
		"agent_id": "reviewer",
		"role":     "reviewer",
		"squad_id": "alpha",
		"pane_id":  "old",
	}).Body.Close()

	resp := postJSON(t, srv.URL+"/agents/register", map[string]string{
		"agent_id": "reviewer",
		"role":     "reviewer",
		"squad_id": "alpha",
		"pane_id":  "new-pane",
	})
	var a agent.Agent
	decode(t, resp, &a)
	if a.PaneID != "new-pane" {
		t.Fatalf("upsert should update pane: %+v", a)
	}

	resp, err := http.Get(srv.URL + "/agents")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Agents []agent.Agent `json:"agents"`
	}
	decode(t, resp, &list)
	if len(list.Agents) != 1 {
		t.Fatalf("must not create reviewer-2: %+v", list.Agents)
	}
}

func TestPersistAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	db := filepath.Join(dir, "agents.sqlite")
	reg, err := agent.OpenRegistry(db, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	svc := agent.NewService(reg)
	if _, err := svc.Register(context.Background(), agent.RegisterRequest{
		AgentID: "tester",
		Role:    "tester",
		SquadID: "alpha",
	}); err != nil {
		t.Fatal(err)
	}
	_ = reg.Close()

	reg2, err := agent.OpenRegistry(db, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg2.Close() })
	got, err := agent.NewService(reg2).Get(context.Background(), "tester")
	if err != nil {
		t.Fatal(err)
	}
	if got.AgentID != "tester" || got.Role != "tester" {
		t.Fatalf("persist: %+v", got)
	}
}

func TestRegisterValidation(t *testing.T) {
	srv := setup(t, time.Second)
	defer srv.Close()
	resp := postJSON(t, srv.URL+"/agents/register", map[string]string{"agent_id": "x"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}
