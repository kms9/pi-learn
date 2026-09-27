//go:build pisquad_integration

package httpapi

import (
	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
	"time"
)

func (s *Server) faultRoutes(v *gin.RouterGroup) {
	v.POST("/__integration/fault", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		if !p.Operator {
			teamError(c, task.Reject("FORBIDDEN", "operator required"))
			return
		}
		var q struct {
			Name   string     `json:"name"`
			Action string     `json:"action"`
			Now    *time.Time `json:"now"`
		}
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		if err := fault.Configure(q.Name, q.Action, q.Now); err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, fault.Status())
	})
}
