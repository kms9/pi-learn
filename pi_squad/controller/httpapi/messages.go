package httpapi

import (
	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"net/http"
)

func (s *Server) handleRelease(c *gin.Context) {
	var req agent.ReleaseRequest
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, 400, err.Error())
		return
	}
	if err := s.svc.Release(c.Request.Context(), req); err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, http.StatusOK, map[string]bool{"released": true})
}
func (s *Server) handleSendMessage(c *gin.Context) {
	var req agent.MessageRequest
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, 400, err.Error())
		return
	}
	m, err := s.svc.SendMessage(c.Request.Context(), req)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, 200, m)
}
func (s *Server) handleInbox(c *gin.Context) {
	var req struct {
		agent.Binding
		PendingOnly bool `json:"pending_only"`
	}
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, 400, err.Error())
		return
	}
	messages, err := s.svc.Inbox(c.Request.Context(), req.Binding, req.PendingOnly)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, 200, map[string]any{"messages": messages})
}
func (s *Server) handleMessageGet(c *gin.Context) {
	var req struct {
		agent.Binding
		MessageID string `json:"message_id"`
	}
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, 400, err.Error())
		return
	}
	m, err := s.svc.GetMessage(c.Request.Context(), req.Binding, req.MessageID)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, 200, m)
}
func (s *Server) handleReceipt(c *gin.Context) {
	var req agent.ReceiptRequest
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, 400, err.Error())
		return
	}
	m, err := s.svc.Receipt(c.Request.Context(), req)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, 200, m)
}
