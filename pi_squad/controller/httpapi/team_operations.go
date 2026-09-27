package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Server) operationRoutes(v *gin.RouterGroup) {
	v.GET("/requests/:id", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		source := p.Binding.AgentID
		if p.Operator {
			source = "operator"
		}
		rows, err := s.team.Store.DB.QueryContext(c.Request.Context(), `SELECT operation,entity_id FROM idempotency WHERE source=? AND request_id=?`, source, c.Param("id"))
		if err != nil {
			teamError(c, err)
			return
		}
		defer rows.Close()
		result := []map[string]string{}
		for rows.Next() {
			var operation, entity string
			if err := rows.Scan(&operation, &entity); err != nil {
				teamError(c, err)
				return
			}
			result = append(result, map[string]string{"operation": operation, "entity_id": entity})
		}
		if err := rows.Err(); err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]any{"request_id": c.Param("id"), "records": result})
	})

	v.GET("/messages/:id", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.GetMessage(c.Request.Context(), p, c.Param("id"))
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.POST("/messages/:id/receipt", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.MessageReceipt
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Receipt(c.Request.Context(), p, c.Param("id"), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})

	v.POST("/attempts/:id/stopped", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.StoppedEvidence
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Stopped(c.Request.Context(), p, c.Param("id"), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.POST("/attempts/:id/clarify", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.ClarificationRequest
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Clarify(c.Request.Context(), p, c.Param("id"), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.POST("/messages/send", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.SendMessage
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.SendMessage(c.Request.Context(), p, q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.GET("/messages/inbox", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Inbox(c.Request.Context(), p)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]any{"messages": out})
	})

	v.POST("/agents/interruption", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.Interruption
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		if err := s.team.Interrupt(c.Request.Context(), p, q); err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]string{"state": "interrupted"})
	})
	v.POST("/runs/:id/decisions", func(c *gin.Context) {
		p, err := s.principal(c)
		if err != nil {
			teamError(c, err)
			return
		}
		var q scheduler.Decision
		if err := decodeTeam(c, &q); err != nil {
			teamError(c, err)
			return
		}
		out, err := s.team.Decide(c.Request.Context(), p, c.Param("id"), q)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	for _, entry := range []struct{ kind, path string }{{"agent", "agents"}, {"run", "runs"}, {"task", "tasks"}, {"attempt", "attempts"}, {"role", "roles"}, {"leader", "teams"}} {
		kind, path := entry.kind, entry.path
		ops := map[string][]string{"agent": {"release"}, "run": {"cancel", "resume", "guidance"}, "task": {"cancel", "amend", "recover", "retry", "rebind", "accept", "reject"}, "attempt": {"reconcile"}, "role": {"release", "promote"}, "leader": {"release"}}[kind]
		for _, operation := range ops {
			op := operation
			route := "/" + path + "/:id/" + op
			if kind == "leader" {
				route = "/teams/:id/leader/" + op
			}
			v.POST(route, func(c *gin.Context) {
				p, err := s.principal(c)
				if err != nil {
					teamError(c, err)
					return
				}
				var q scheduler.Operation
				if err := decodeTeam(c, &q); err != nil {
					teamError(c, err)
					return
				}
				out, err := s.team.Operate(c.Request.Context(), p, kind, c.Param("id"), op, q)
				if err != nil {
					teamError(c, err)
					return
				}
				c.JSON(200, out)
			})
		}
	}
	v.GET("/tasks/:id", func(c *gin.Context) {
		var out task.Contract
		err := s.team.Store.Transaction(c.Request.Context(), func(tx *sql.Tx) error { var err error; out, err = task.LoadTask(tx, c.Param("id")); return err })
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.GET("/runs/:id", func(c *gin.Context) {
		var out task.Run
		err := s.team.Store.Transaction(c.Request.Context(), func(tx *sql.Tx) error { var err error; out, err = task.LoadRun(tx, c.Param("id")); return err })
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.GET("/attempts/:id", func(c *gin.Context) {
		var out task.Attempt
		err := s.team.Store.Transaction(c.Request.Context(), func(tx *sql.Tx) error { var err error; out, err = task.LoadAttempt(tx, c.Param("id")); return err })
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, out)
	})
	v.GET("/events", s.handleTeamEvents)
}
func (s *Server) events(ctx context.Context, after int64) ([]task.Event, error) {
	rows, err := s.team.Store.DB.QueryContext(ctx, `SELECT seq,type,entity_id,revision,server_time,details FROM events WHERE seq>? ORDER BY seq LIMIT 256`, after)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []task.Event{}
	for rows.Next() {
		var e task.Event
		var when, details string
		if err := rows.Scan(&e.Seq, &e.Type, &e.EntityID, &e.Revision, &when, &details); err != nil {
			return nil, err
		}
		e.Time, _ = time.Parse(time.RFC3339Nano, when)
		e.Details = json.RawMessage(details)
		out = append(out, e)
	}
	return out, rows.Err()
}
func (s *Server) handleTeamEvents(c *gin.Context) {
	after, err := strconv.ParseInt(c.DefaultQuery("after", "0"), 10, 64)
	if err != nil || after < 0 {
		teamError(c, task.Reject("INVALID_CURSOR", "after must be nonnegative"))
		return
	}
	if c.GetHeader("Accept") != "text/event-stream" {
		events, err := s.events(c.Request.Context(), after)
		if err != nil {
			teamError(c, err)
			return
		}
		c.JSON(200, map[string]any{"controller_epoch": s.team.Epoch, "events": events})
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Status(200)
	c.Writer.Flush()
	writer := http.NewResponseController(c.Writer)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		events, err := s.events(c.Request.Context(), after)
		if err != nil {
			return
		}
		for _, e := range events {
			if err := writer.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
				return
			}
			b, err := json.Marshal(map[string]any{"controller_epoch": s.team.Epoch, "seq": e.Seq, "entity_id": e.EntityID, "revision": e.Revision})
			if err != nil {
				return
			}
			if _, err := fmt.Fprintf(c.Writer, "id: %d\nevent: invalidate\ndata: %s\n\n", e.Seq, b); err != nil {
				return
			}
			after = e.Seq
		}
		if err := writer.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
			return
		}
		if _, err := fmt.Fprint(c.Writer, ": keepalive\n\n"); err != nil {
			return
		}
		c.Writer.Flush()
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
		}
	}
}
