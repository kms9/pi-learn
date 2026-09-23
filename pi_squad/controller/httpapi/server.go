package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
)

type Server struct {
	svc *agent.Service
}

func New(svc *agent.Service) *Server {
	return &Server{svc: svc}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /agents/register", s.handleRegister)
	mux.HandleFunc("POST /agents/heartbeat", s.handleHeartbeat)
	mux.HandleFunc("GET /agents/{id}", s.handleGet)
	mux.HandleFunc("GET /agents", s.handleList)
	mux.HandleFunc("GET /health", s.handleHealth)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req agent.RegisterRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	a, err := s.svc.Register(r.Context(), req)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	log.Printf("register agent_id=%s role=%s squad_id=%s status=%s", a.AgentID, a.Role, a.SquadID, a.Status)
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	var req agent.HeartbeatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	a, err := s.svc.Heartbeat(r.Context(), req)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	log.Printf("heartbeat agent_id=%s status=%s", a.AgentID, a.Status)
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a, err := s.svc.Get(r.Context(), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	agents, err := s.svc.List(r.Context(), agent.ListFilter{
		AgentID: q.Get("agent_id"),
		Role:    q.Get("role"),
		SquadID: q.Get("squad_id"),
		Status:  q.Get("status"),
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if agents == nil {
		agents = []agent.Agent{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

func decodeJSON(r *http.Request, dest any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dest); err != nil {
		return err
	}
	return nil
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
