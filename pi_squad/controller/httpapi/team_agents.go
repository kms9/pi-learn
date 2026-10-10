package httpapi

import (
	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/projection"
)

// Legacy read aliases and v2 readers share the authoritative projection.
func (s *Server) handleTeamAgents(c *gin.Context) {
	snap, err := projection.Read(c.Request.Context(), s.team.Store.DB, s.team.Config.HeartbeatTimeout, s.team.Config.LeaseTTL)
	if err != nil {
		teamError(c, err)
		return
	}
	agents := []map[string]any{}
	for _, row := range snap.Views["agents"] {
		binding, _ := row["binding"].(map[string]any)
		row["agent_id"] = binding["agent_id"]
		row["runtime_id"] = binding["runtime_id"]
		row["runtime_session_id"] = binding["session_id"]
		row["role"] = row["role_id"]
		row["squad_id"] = row["team_id"]
		row["status"] = row["presence"]
		row["runtime_type"] = "pi"
		if c.Param("id") != "" {
			if row["agent_id"] == c.Param("id") {
				c.JSON(200, row)
				return
			}
			continue
		}
		match := true
		for _, key := range []string{"agent_id", "role", "squad_id", "status", "role_id", "team_id", "presence", "activity"} {
			if value := c.Query(key); value != "" && row[key] != value {
				match = false
				break
			}
		}
		if match {
			agents = append(agents, row)
		}
	}
	if c.Param("id") != "" {
		c.JSON(404, map[string]string{"code": "AGENT_NOT_FOUND", "message": c.Param("id")})
		return
	}
	c.JSON(200, map[string]any{"agents": agents, "revision": snap.Revision, "controller_epoch": snap.Epoch, "observed_at": snap.ObservedAt})
}
