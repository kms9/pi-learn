package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/projection"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func NewTeam(svc *agent.Service, team *scheduler.Service, d project.Discovery) *Server {
	return &Server{svc: svc, team: team, discovery: &d}
}
func teamError(c *gin.Context, err error) {
	var e *task.Error
	if errors.As(err, &e) {
		status := http.StatusConflict
		if e.Code == "UNAUTHORIZED" {
			status = http.StatusUnauthorized
		}
		if e.Code == "FORBIDDEN" {
			status = http.StatusForbidden
		}
		c.JSON(status, e)
		return
	}
	c.JSON(http.StatusBadRequest, map[string]string{"code": "INVALID_REQUEST", "message": err.Error()})
}
func decodeTeam(c *gin.Context, out any) error {
	b, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 1024*1024))
	if err != nil {
		return err
	}
	return project.DecodeStrict(b, out)
}
func (s *Server) principal(c *gin.Context) (scheduler.Principal, error) {
	p, err := s.team.Authenticate(c.Request.Context(), strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "), c.GetHeader("X-Pi-Squad-Agent"))
	if err != nil {
		return p, err
	}
	if p.Operator && c.GetHeader("X-Pi-Squad-Agent") != "" {
		var binding task.Binding
		if err := project.DecodeStrict([]byte(c.GetHeader("X-Pi-Squad-Binding")), &binding); err != nil {
			return p, task.Reject("INVALID_SOURCE", "explicit Pi command requires current binding")
		}
		if binding.AgentID != c.GetHeader("X-Pi-Squad-Agent") || binding.RuntimeID == "" || binding.SessionID == "" {
			return p, task.Reject("INVALID_SOURCE", "source binding mismatch")
		}
		p.Binding = binding
		p.Origin = "user_command@pi"
	}
	if !p.Operator {
		var binding task.Binding
		if err := project.DecodeStrict([]byte(c.GetHeader("X-Pi-Squad-Binding")), &binding); err != nil {
			return p, task.Reject("BINDING_CHANGED", "runtime request requires its exact source binding")
		}
		if !task.SameBinding(binding, p.Binding) {
			return p, task.Reject("BINDING_CHANGED", "runtime source binding is stale")
		}
	}
	return p, nil
}
func (s *Server) teamRoutes(r *gin.Engine) {
	r.Use(func(c *gin.Context) {
		// Observers send their discovered controller identity too. Reject a
		// reused port even when the new controller happens to have the same epoch.
		// Unbound public reads and /health remain available for discovery.
		if c.Request.Method == "GET" && strings.HasPrefix(c.Request.URL.Path, "/v2/") &&
			(c.GetHeader("X-Pi-Squad-Controller") != "" || c.GetHeader("X-Pi-Squad-Protocol") != "") &&
			(c.GetHeader("X-Pi-Squad-Protocol") != project.Protocol || c.GetHeader("X-Pi-Squad-Controller") != s.discovery.ControllerID) {
			c.AbortWithStatusJSON(http.StatusConflict, map[string]string{"code": "CONTROLLER_IDENTITY_MISMATCH", "message": "rediscover before reading this Controller"})
			return
		}
		if c.Request.Method != "GET" && !strings.HasPrefix(c.Request.URL.Path, "/v2/") {
			c.AbortWithStatusJSON(409, map[string]string{"code": "PROTOCOL_MISMATCH", "message": "legacy writes disabled; use v2 authenticated operations"})
			return
		}
		if c.Request.Method != "GET" && (c.GetHeader("X-Pi-Squad-Protocol") != project.Protocol || c.GetHeader("X-Pi-Squad-Controller") != s.discovery.ControllerID) {
			c.AbortWithStatusJSON(http.StatusConflict, map[string]string{"code": "PROTOCOL_MISMATCH", "message": "pi-squad/2 handshake required"})
			return
		}
		c.Next()
	})
	v := r.Group("/v2")
	v.GET("/agents", s.handleTeamAgents)
	v.GET("/agents/:id", s.handleTeamAgents)
	s.operationRoutes(v)
	s.faultRoutes(v)
	v.GET("/teams/:id/roles", func(c *gin.Context) {
		snap, err := projection.Read(c.Request.Context(), s.team.Store.DB, s.team.Config.HeartbeatTimeout, s.team.Config.LeaseTTL)
		if err != nil {
			teamError(c, err)
			return
		}
		var config project.TeamSnapshot
		foundTeam := false
		for _, row := range snap.Views["teams"] {
			b, err := json.Marshal(row)
			if err != nil {
				teamError(c, err)
				return
			}
			var candidate project.TeamSnapshot
			if err := json.Unmarshal(b, &candidate); err != nil {
				teamError(c, err)
				return
			}
			if candidate.Config.TeamID == c.Param("id") {
				config = candidate
				foundTeam = true
				break
			}
		}
		if !foundTeam {
			teamError(c, task.Reject("TEAM_NOT_FOUND", c.Param("id")))
			return
		}
		roles := []map[string]any{}
		for _, member := range config.Config.Members {
			found := false
			for _, role := range snap.Views["roles"] {
				if role["role_id"] == member.RoleRef {
					roles = append(roles, role)
					found = true
					break
				}
			}
			if !found {
				roles = append(roles, map[string]any{"role_id": member.RoleRef, "primary_agent_id": "", "secondary_agent_ids": []string{}, "revision": 0})
			}
		}
		c.JSON(200, map[string]any{"team_id": c.Param("id"), "roles": roles, "revision": snap.Revision, "controller_epoch": snap.Epoch, "observed_at": snap.ObservedAt})
	})
	v.POST("/agents/register", func(c *gin.Context) {
		var q scheduler.Register
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Register(c.Request.Context(), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(http.StatusOK, out)
	})
	v.POST("/agents/heartbeat", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.HeartbeatRequest
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Heartbeat(c.Request.Context(), p, q.Binding, q.Activity, q.Underlying)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.GET("/snapshot", func(c *gin.Context) {
		out, err := projection.Read(c.Request.Context(), s.team.Store.DB, s.team.Config.HeartbeatTimeout, s.team.Config.LeaseTTL)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.POST("/runs", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.CreateRun
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.CreateRun(c.Request.Context(), p, q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.POST("/tasks/direct", s.handleCreateTask)
	v.POST("/runs/:id/handoffs", s.handleCreateTask)
	v.POST("/tasks/:id/children", s.handleCreateTask)
	v.GET("/dispatches", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Dispatches(c.Request.Context(), p)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]any{"dispatches": out})
	})
	attemptHandler := func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.AttemptEvent
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		expectedType := ""
		if strings.HasSuffix(c.FullPath(), "/yield") {
			expectedType = "yield"
		}
		if strings.HasSuffix(c.FullPath(), "/result") {
			expectedType = "result_proposed"
		}
		if expectedType != "" {
			if q.Type != "" && q.Type != expectedType {
				teamError(c, task.Reject("INVALID_EVENT", "event type conflicts with endpoint"))
				return
			}
			q.Type = expectedType
		}
		out, err := s.team.AttemptEvent(c.Request.Context(), p, c.Param("id"), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	}
	v.POST("/attempts/:id/events", attemptHandler)
	v.POST("/attempts/:id/yield", attemptHandler)
	v.POST("/attempts/:id/result", attemptHandler)
}
func (s *Server) handleCreateTask(c *gin.Context) {
	p, err := s.principal(c)
	if err != nil {
		teamError(c, err)
		return
	}
	var q scheduler.CreateTask
	if err := decodeTeam(c, &q); err != nil {
		teamError(c, err)
		return
	}
	switch c.FullPath() {
	case "/v2/tasks/direct":
		if q.RunID != "" || q.ParentID != "" {
			teamError(c, task.Reject("INVALID_SCOPE", "direct endpoint requires standalone root scope"))
			return
		}
	case "/v2/runs/:id/handoffs":
		if q.ParentID != "" || (q.RunID != "" && q.RunID != c.Param("id")) {
			teamError(c, task.Reject("INVALID_SCOPE", "handoff scope conflicts with endpoint"))
			return
		}
		q.RunID = c.Param("id")
	case "/v2/tasks/:id/children":
		if q.ParentID != "" && q.ParentID != c.Param("id") {
			teamError(c, task.Reject("INVALID_SCOPE", "parent conflicts with endpoint"))
			return
		}
		q.ParentID = c.Param("id")
	}
	out, err := s.team.CreateTask(c.Request.Context(), p, q)
	if err != nil {
		teamError(c, err)
		return
	}
	c.JSON(200, out)
}
