package httpapi_test

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func TestSSEFlushWakeReplaceAndBadCredentials(t *testing.T) {
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "sse.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	svc := agent.NewService(reg)
	srv := httptest.NewServer(httpapi.New(svc).Handler())
	defer srv.Close()
	ctx := t.Context()
	token := "sse-private-credential-at-least-32-chars"
	register := func(id, uuid string) agent.Binding {
		t.Helper()
		req := agent.RegisterRequest{AgentID: id, Role: id, SquadID: "alpha", RuntimeID: uuid, RuntimeSessionID: "sess-" + id, RuntimeToken: token + id}
		if _, err := svc.Register(ctx, req); err != nil {
			t.Fatal(err)
		}
		return agent.Binding{AgentID: id, RuntimeID: uuid, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: req.RuntimeToken}
	}
	a := register("a", "11111111-1111-4111-8111-111111111111")
	b := register("b", "22222222-2222-4222-8222-222222222222")

	noAuth, err := http.Get(srv.URL + "/messages/events?agent_id=b&runtime_id=" + b.RuntimeID + "&runtime_session_id=" + b.RuntimeSessionID)
	if err != nil {
		t.Fatal(err)
	}
	noAuth.Body.Close()
	if noAuth.StatusCode != http.StatusUnauthorized {
		t.Fatalf("missing bearer: %d", noAuth.StatusCode)
	}
	badReq, err := http.NewRequest(http.MethodGet, srv.URL+"/messages/events?agent_id=b&runtime_id="+b.RuntimeID+"&runtime_session_id="+b.RuntimeSessionID, nil)
	if err != nil {
		t.Fatal(err)
	}
	badReq.Header.Set("Authorization", "Bearer wrong-token-value-which-is-32-chars!")
	bad, err := http.DefaultClient.Do(badReq)
	if err != nil {
		t.Fatal(err)
	}
	bad.Body.Close()
	if bad.StatusCode != http.StatusConflict {
		t.Fatalf("wrong token: %d", bad.StatusCode)
	}

	open := func(bind agent.Binding) *http.Response {
		t.Helper()
		req, err := http.NewRequest(http.MethodGet, srv.URL+"/messages/events?agent_id="+bind.AgentID+"&runtime_id="+bind.RuntimeID+"&runtime_session_id="+bind.RuntimeSessionID, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+bind.RuntimeToken)
		req.Header.Set("Accept", "text/event-stream")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
			t.Fatalf("sse open: %d %s", resp.StatusCode, resp.Header.Get("Content-Type"))
		}
		if strings.Contains(req.URL.RawQuery, "token") || strings.Contains(req.URL.RawQuery, bind.RuntimeToken) {
			t.Fatal("token leaked into URL")
		}
		return resp
	}
	readEvent := func(reader *bufio.Reader) string {
		t.Helper()
		var lines []string
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			lines = append(lines, line)
			if line == "\n" {
				return strings.Join(lines, "")
			}
		}
	}
	first := open(b)
	defer first.Body.Close()
	reader := bufio.NewReader(first.Body)
	if got := readEvent(reader); !strings.Contains(got, "event: inbox") {
		t.Fatalf("initial event: %q", got)
	}
	started := time.Now()
	sent, err := svc.SendMessage(ctx, agent.MessageRequest{Binding: a, RequestID: "sse-1", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "wake"})
	if err != nil {
		t.Fatal(err)
	}
	if got := readEvent(reader); !strings.Contains(got, "event: inbox") {
		t.Fatalf("wake event: %q", got)
	}
	t.Logf("send-return to SSE event observation upper bound: %s", time.Since(started))
	saved, err := svc.GetMessage(ctx, a, sent.MessageID)
	if err != nil || saved.Status != "stored" {
		t.Fatalf("SSE event must not mark received: %+v %v", saved, err)
	}

	second := open(b)
	defer second.Body.Close()
	if got := readEvent(reader); !strings.Contains(got, "event: binding_closed") && !strings.Contains(got, "inbox") {
		t.Fatalf("old stream after replace: %q", got)
	}
	if err := svc.Release(ctx, agent.ReleaseRequest{AgentID: b.AgentID, ExpectedRuntimeID: b.RuntimeID}); err != nil {
		t.Fatal(err)
	}
	replacement := bufio.NewReader(second.Body)
	if got := readEvent(replacement); !strings.Contains(got, "binding_closed") && !strings.Contains(got, "inbox") {
		t.Fatalf("stream after release: %q", got)
	}
}
