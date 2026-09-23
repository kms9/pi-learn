package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
)

type Server struct {
	svc *agent.Service
}

func New(svc *agent.Service) *Server {
	return &Server{svc: svc}
}

func (s *Server) Handler() http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.POST("/agents/register", s.handleRegister)
	r.POST("/agents/heartbeat", s.handleHeartbeat)
	r.GET("/agents", s.handleList)
	r.GET("/agents/:id", s.handleGet)
	r.GET("/health", s.handleHealth)
	return r
}

func (s *Server) handleHealth(c *gin.Context) {
	writeJSON(c.Writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRegister(c *gin.Context) {
	var req agent.RegisterRequest
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, http.StatusBadRequest, err.Error())
		return
	}
	a, err := s.svc.Register(c.Request.Context(), req)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	log.Printf("register agent_id=%s role=%s squad_id=%s status=%s", a.AgentID, a.Role, a.SquadID, a.Status)
	writeJSON(c.Writer, http.StatusOK, a)
}

func (s *Server) handleHeartbeat(c *gin.Context) {
	var req agent.HeartbeatRequest
	if err := decodeJSON(c.Request, &req); err != nil {
		writeError(c.Writer, http.StatusBadRequest, err.Error())
		return
	}
	a, err := s.svc.Heartbeat(c.Request.Context(), req)
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	log.Printf("heartbeat agent_id=%s status=%s", a.AgentID, a.Status)
	writeJSON(c.Writer, http.StatusOK, a)
}

func (s *Server) handleGet(c *gin.Context) {
	a, err := s.svc.Get(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	writeJSON(c.Writer, http.StatusOK, a)
}

func (s *Server) handleList(c *gin.Context) {
	q := c.Request.URL.Query()
	agents, err := s.svc.List(c.Request.Context(), agent.ListFilter{
		AgentID: q.Get("agent_id"),
		Role:    q.Get("role"),
		SquadID: q.Get("squad_id"),
		Status:  q.Get("status"),
	})
	if err != nil {
		writeServiceError(c.Writer, err)
		return
	}
	if agents == nil {
		agents = []agent.Agent{}
	}
	writeJSON(c.Writer, http.StatusOK, map[string]any{"agents": agents})
}

func decodeJSON(r *http.Request, dest any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dest)
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, agent.ErrInvalid):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, agent.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	default:
		log.Printf("internal error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("write json: %v", err)
	}
}

func SplitHostPortDefault(listen string) string {
	listen = strings.TrimSpace(listen)
	if listen == "" {
		return "127.0.0.1:18741"
	}
	return listen
}
