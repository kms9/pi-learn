package httpapi_test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func TestSSELatencySamplesAndDisconnectReconcile(t *testing.T) {
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "lat.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	svc := agent.NewService(reg)
	srv := httptest.NewServer(httpapi.New(svc).Handler())
	defer srv.Close()
	ctx := context.Background()
	token := "latency-private-credential-at-least-32"
	regOne := func(id, uuid string) agent.Binding {
		t.Helper()
		req := agent.RegisterRequest{AgentID: id, Role: id, SquadID: "alpha", RuntimeID: uuid, RuntimeSessionID: "sess-" + id, RuntimeToken: token + "-" + id}
		if _, err := svc.Register(ctx, req); err != nil {
			t.Fatal(err)
		}
		return agent.Binding{AgentID: id, RuntimeID: uuid, RuntimeSessionID: req.RuntimeSessionID, RuntimeToken: req.RuntimeToken}
	}
	a := regOne("a", "11111111-1111-4111-8111-111111111111")
	b := regOne("b", "22222222-2222-4222-8222-222222222222")
	open := func(bind agent.Binding) (*bufio.Reader, *http.Response) {
		t.Helper()
		req, err := http.NewRequest(http.MethodGet, srv.URL+"/messages/events?agent_id="+bind.AgentID+"&runtime_id="+bind.RuntimeID+"&runtime_session_id="+bind.RuntimeSessionID, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+bind.RuntimeToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return bufio.NewReader(resp.Body), resp
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
	reader, first := open(b)
	defer first.Body.Close()
	if got := readEvent(reader); !strings.Contains(got, "event: inbox") {
		t.Fatalf("initial: %q", got)
	}
	var samples []time.Duration
	for i := 0; i < 5; i++ {
		started := time.Now()
		sent, err := svc.SendMessage(ctx, agent.MessageRequest{Binding: a, RequestID: "lat-" + string(rune('a'+i)), ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "sample"})
		if err != nil {
			t.Fatal(err)
		}
		if got := readEvent(reader); !strings.Contains(got, "event: inbox") {
			t.Fatalf("sample %d wake: %q", i, got)
		}
		if _, err := svc.Receipt(ctx, agent.ReceiptRequest{Binding: b, MessageID: sent.MessageID, Status: "received"}); err != nil {
			t.Fatal(err)
		}
		samples = append(samples, time.Since(started))
	}
	t.Logf("send-start to received-receipt observation upper bounds, includes HTTP and test scheduling, not a commit timestamp: %v", samples)

	// Drop the stream, store a message, reconnect, and prove the DB row is still pending for reconcile.
	first.Body.Close()
	stored, err := svc.SendMessage(ctx, agent.MessageRequest{Binding: a, RequestID: "while-down", ToAgentID: b.AgentID, TargetRuntimeID: b.RuntimeID, TargetSessionID: b.RuntimeSessionID, Kind: "notice", Text: "during-disconnect"})
	if err != nil || stored.Status != "stored" {
		t.Fatalf("stored during disconnect: %+v %v", stored, err)
	}
	reconnected, second := open(b)
	defer second.Body.Close()
	if got := readEvent(reconnected); !strings.Contains(got, "event: inbox") {
		t.Fatalf("reconnect initial: %q", got)
	}
	pending, err := svc.Inbox(ctx, b, true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, message := range pending {
		if message.MessageID == stored.MessageID && message.Status == "stored" {
			found = true
		}
	}
	if !found {
		t.Fatalf("reconnect hint is not message recovery; pending inbox lost %s: %+v", stored.MessageID, pending)
	}
}

type deadlineWriter struct {
	mu       sync.Mutex
	deadline time.Time
	header   http.Header
	code     int
}

func (w *deadlineWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}
	return w.header
}
func (w *deadlineWriter) WriteHeader(code int) { w.code = code }
func (w *deadlineWriter) Flush()               {}
func (w *deadlineWriter) Unwrap() http.ResponseWriter { return w }
func (w *deadlineWriter) SetWriteDeadline(deadline time.Time) error {
	w.mu.Lock()
	w.deadline = deadline
	w.mu.Unlock()
	return nil
}
func (w *deadlineWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	deadline := w.deadline
	w.mu.Unlock()
	if deadline.IsZero() {
		return len(p), nil
	}
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	<-timer.C
	return 0, os.ErrDeadlineExceeded
}

func TestSSEWriteDeadlineBranch(t *testing.T) {
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "slow.sqlite"), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	svc := agent.NewService(reg)
	token := "slow-private-credential-at-least-32-chars"
	if _, err := svc.Register(context.Background(), agent.RegisterRequest{AgentID: "a", Role: "a", SquadID: "alpha", RuntimeID: "11111111-1111-4111-8111-111111111111", RuntimeSessionID: "sess-a", RuntimeToken: token + "-a"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Register(context.Background(), agent.RegisterRequest{AgentID: "b", Role: "b", SquadID: "alpha", RuntimeID: "22222222-2222-4222-8222-222222222222", RuntimeSessionID: "sess-b", RuntimeToken: token}); err != nil {
		t.Fatal(err)
	}
	writer := &deadlineWriter{}
	req := httptest.NewRequest(http.MethodGet, "/messages/events?agent_id=b&runtime_id=22222222-2222-4222-8222-222222222222&runtime_session_id=sess-b", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	done := make(chan struct{})
	go func() {
		httpapi.New(svc).Handler().ServeHTTP(writer, req)
		close(done)
	}()
	time.Sleep(200 * time.Millisecond)
	sendStarted := time.Now()
	sent, err := svc.SendMessage(context.Background(), agent.MessageRequest{
		Binding: agent.Binding{AgentID: "a", RuntimeID: "11111111-1111-4111-8111-111111111111", RuntimeSessionID: "sess-a", RuntimeToken: token + "-a"},
		RequestID: "during-block", ToAgentID: "b", TargetRuntimeID: "22222222-2222-4222-8222-222222222222", TargetSessionID: "sess-b", Kind: "notice", Text: "stored while writer blocked",
	})
	sendElapsed := time.Since(sendStarted)
	if err != nil || sent.Status != "stored" {
		t.Fatalf("send during blocked SSE write: %+v %v", sent, err)
	}
	if sendElapsed > time.Second {
		t.Fatalf("send was blocked by the slow consumer: %s", sendElapsed)
	}
	select {
	case <-done:
	case <-time.After(8 * time.Second):
		t.Fatal("deadline branch did not return")
	}
}
