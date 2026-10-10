package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/agent"
)

// SSE carries only inbox invalidations. It never changes message receipts or
// presence. Credentials are headers, never URL query values or event payloads.
func (s *Server) handleMessageEvents(c *gin.Context) {
	q := c.Request.URL.Query()
	auth := c.GetHeader("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		writeError(c.Writer, http.StatusUnauthorized, "runtime credential required")
		return
	}
	b := agent.Binding{AgentID: q.Get("agent_id"), RuntimeID: q.Get("runtime_id"), RuntimeSessionID: q.Get("runtime_session_id"), RuntimeToken: strings.TrimPrefix(auth, "Bearer ")}
	watch, cancel, err := s.svc.WatchInbox(c.Request.Context(), b)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	defer cancel()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache, no-store")
	c.Header("X-Accel-Buffering", "no")
	rc := http.NewResponseController(c.Writer)
	write := func(frame string) bool {
		if err := rc.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
			return false
		}
		if _, err := fmt.Fprint(c.Writer, frame); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	// Register before this snapshot hint to avoid a subscribe/read race. No event
	// IDs: reconnect always reconciles pending DB messages, not a transient cursor.
	if !write("event: inbox\ndata: {}\n\n") {
		return
	}
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-watch.Closed():
			write("event: binding_closed\ndata: {}\n\n")
			return
		case <-watch.Changed():
			if err := s.svc.ValidateWatch(c.Request.Context(), watch); err != nil {
				write("event: binding_closed\ndata: {}\n\n")
				return
			}
			if !write("event: inbox\ndata: {}\n\n") {
				return
			}
		case <-ticker.C:
			if err := s.svc.ValidateWatch(c.Request.Context(), watch); err != nil {
				write("event: binding_closed\ndata: {}\n\n")
				return
			}
			if !write(": keepalive\n\n") {
				return
			}
		}
	}
}
