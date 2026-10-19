package main

import (
  "net/http"
  "net/http/httptest"
  "strings"
  "testing"
)

func TestLoopbackOnly(t *testing.T) {
  for _, origin := range []string{"https://example.org:11522", "http://localhost:11522/api", "file:///tmp"} {
    if _, err := newClient(origin, "demo-key"); err == nil {
      t.Fatalf("expected invalid origin: %s", origin)
    }
  }
  if _, err := newClient("http://localhost:11522", "demo-key"); err != nil {
    t.Fatal(err)
  }
}

func TestReadOnlyGET(t *testing.T) {
  server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.Method != "GET" || r.URL.Path != "/api/app/state" {
      t.Errorf("incorrect method or path")
    }
    if r.Header.Get("Authorization") != "Bearer demo-key" {
      t.Error("Bearer key not sent")
    }
    w.Header().Set("Content-Type", "application/json")
    _, _ = w.Write([]byte("{\"currentBrainId\":\"sandbox-id\",\"tabs\":[]}"))
  }))
  defer server.Close()
  c, err := newClient(server.URL, "demo-key")
  if err != nil {
    t.Fatal(err)
  }
  response, err := c.get("/api/app/state")
  if err != nil {
    t.Fatal(err)
  }
  if !strings.Contains(string(response), "sandbox-id") {
    t.Errorf("unexpected body: %s", response)
  }
}

func TestForbiddenDoesNotLeakResponse(t *testing.T) {
  server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusForbidden)
    _, _ = w.Write([]byte("private-response"))
  }))
  defer server.Close()
  c, err := newClient(server.URL, "demo-key")
  if err != nil {
    t.Fatal(err)
  }
  _, err = c.get("/api/app/state")
  if err == nil || !strings.Contains(err.Error(), "403") {
    t.Fatalf("expected 403 error, got %v", err)
  }
  if strings.Contains(err.Error(), "private-response") {
    t.Fatal("private response included in error")
  }
}
