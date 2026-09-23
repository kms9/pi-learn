package client_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/client"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func TestListAndGet(t *testing.T) {
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "agents.sqlite"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	if _, err := agent.NewService(reg).Register(context.Background(), agent.RegisterRequest{
		AgentID: "reviewer",
		Role:    "reviewer",
		SquadID: "alpha",
	}); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpapi.New(agent.NewService(reg)).Handler())
	defer srv.Close()

	c := client.New(srv.URL)
	if err := c.Health(context.Background()); err != nil {
		t.Fatal(err)
	}
	list, err := c.List(context.Background(), agent.ListFilter{Role: "reviewer"})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].AgentID != "reviewer" {
		t.Fatalf("list: %+v", list)
	}
	got, err := c.Get(context.Background(), "reviewer")
	if err != nil {
		t.Fatal(err)
	}
	if got.SquadID != "alpha" {
		t.Fatalf("get: %+v", got)
	}
	if _, err := c.Get(context.Background(), "missing"); err == nil {
		t.Fatal("expected HTTP error for missing agent")
	}
}

func TestHealthError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer srv.Close()
	if err := client.New(srv.URL).Health(context.Background()); err == nil {
		t.Fatal("expected health error")
	}
}
