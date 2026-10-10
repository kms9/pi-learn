//go:build pisquad_integration

package httpapi

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
	"time"
)

func (s *Server) faultRoutes(v *gin.RouterGroup) {
	// Exercise SQLite's real SQLITE_FULL path, rather than returning a mock
	// write error. This surface is absent from the production build and is
	// restricted to an isolated integration Controller's operator.
	v.POST("/__integration/sqlite-limit", func(c *gin.Context) {
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
			MaxPages *int64 `json:"max_pages"`
		}
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		var pages int64
		if err := s.team.Store.DB.QueryRowContext(c.Request.Context(), "PRAGMA page_count").Scan(&pages); err != nil {
			teamError(c, err)
			return
		}
		limit := pages
		if q.MaxPages != nil {
			limit = *q.MaxPages
		}
		if limit < pages || limit > 4294967294 {
			teamError(c, task.Reject("INVALID_SQLITE_LIMIT", "limit must cover existing pages and fit SQLite's range"))
			return
		}
		var applied int64
		if err := s.team.Store.DB.QueryRowContext(c.Request.Context(), fmt.Sprintf("PRAGMA max_page_count=%d", limit)).Scan(&applied); err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]int64{"page_count": pages, "max_pages": applied})
	})
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
