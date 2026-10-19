package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/fault"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// HeldInput is one input the adapter's gate kept from a managed Session because
// no admission covered it (Q36). The Controller keeps it so it survives a host
// restart; deciding whether it becomes Run Guidance, a clarification answer, a
// new Task or is dropped is an operator or Leader decision (M2).
type HeldInput struct {
	RequestID   string       `json:"request_id"`
	Binding     task.Binding `json:"binding"`
	InputID     string       `json:"input_id"`
	Wake        string       `json:"wake"`
	Why         string       `json:"why"`
	Text        string       `json:"text"`
	HeldAt      time.Time    `json:"held_at"`
	Disposition string       `json:"disposition,omitempty"`
}

const maxHeldText = 16 * 1024

func (s *Service) Hold(ctx context.Context, p Principal, q HeldInput) (HeldInput, error) {
	if p.Operator || !task.SameBinding(p.Binding, q.Binding) {
		return q, task.Reject("BINDING_CHANGED", "held input binding mismatch")
	}
	if strings.TrimSpace(q.InputID) == "" || len(q.InputID) > 256 || strings.TrimSpace(q.Wake) == "" || strings.TrimSpace(q.Why) == "" {
		return q, task.Reject("INVALID_HELD_INPUT", "input_id, wake and why required")
	}
	if len(q.Text) > maxHeldText {
		q.Text = q.Text[:maxHeldText]
	}
	q.Disposition = "pending"
	if q.HeldAt.IsZero() {
		q.HeldAt = fault.Now()
	}
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "hold", q.RequestID, q)
		if err != nil || prior != "" {
			return err
		}
		body, err := json.Marshal(q)
		if err != nil {
			return err
		}
		// The same input held twice (a rewake, a retried report) is kept once.
		res, err := tx.Exec(`INSERT OR IGNORE INTO held_inputs VALUES(?,?,?,?,?)`, q.InputID, q.Binding.AgentID, q.Disposition, string(body), q.HeldAt.Format(time.RFC3339Nano))
		if err != nil {
			return err
		}
		if err := remember(tx, p, "hold", q.RequestID, q.InputID, q); err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil
		}
		return task.EventTx(tx, "input_held", q.InputID, 1, map[string]string{"agent_id": q.Binding.AgentID, "wake": q.Wake, "why": q.Why})
	})
	return q, err
}
