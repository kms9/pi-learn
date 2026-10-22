package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
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
		if err := task.EventTx(tx, "input_held", q.InputID, 1, map[string]string{"agent_id": q.Binding.AgentID, "wake": q.Wake, "why": q.Why}); err != nil {
			return err
		}
		return s.classifyHeld(tx, &q)
	})
	return q, err
}

// Wake-ups that are the user speaking to the Team (M2-2): straight to a member, or in
// the Team's group (DS Bot relays one group message to every member it addresses; the
// adapter keeps the user's lines of it). A Bot's post into the group (group-post; in
// DS Bot 0.2.0 any member may post from its own chat) is not the user: it stays pending
// for a person.
var userWakes = map[string]bool{"user": true, "group-relay": true}

// classifyHeld turns what the user says to a Team with an active Run into Run Guidance,
// once per text however many members held a copy; the Leader's next step reads it.
// Everything else stays pending for the operator: a notice, a new request, or an
// answer to a question (clarifications and Task amendments go through their own
// operations, which need an exact target and revision).
func (s *Service) classifyHeld(tx *sql.Tx, q *HeldInput) error {
	text := strings.TrimSpace(q.Text)
	if !userWakes[q.Wake] || text == "" {
		return nil
	}
	instance, err := loadInstance(tx, q.Binding.AgentID)
	if err != nil {
		return err
	}
	var runID string
	if instance.Mode == "leader" {
		err = tx.QueryRow(`SELECT run_id FROM runs WHERE team_id=? AND admitted=1 AND cleanup!='released' ORDER BY queue_seq DESC LIMIT 1`, instance.TeamID).Scan(&runID)
	} else {
		err = tx.QueryRow(`SELECT run_id FROM role_ownership WHERE role_id=?`, instance.RoleID).Scan(&runID)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	r, err := task.LoadRun(tx, runID)
	if err != nil {
		return err
	}
	if task.Terminal(r.Phase) || !r.Admitted {
		return nil
	}
	q.Disposition = "guidance:" + r.ID
	body, err := json.Marshal(q)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE held_inputs SET disposition=?, body=? WHERE input_id=?`, q.Disposition, string(body), q.InputID); err != nil {
		return err
	}
	for _, earlier := range r.Guidance {
		if earlier == text {
			return nil
		}
	}
	r.Guidance = append(r.Guidance, text)
	r.GuidanceNotes = append(r.GuidanceNotes, task.GuidanceNote{Text: text, By: "group", At: fault.Now()})
	r.Revision++
	if err := task.SaveRun(tx, r); err != nil {
		return err
	}
	return task.EventTx(tx, "run_guidance", r.ID, r.Revision, map[string]string{"source": "held_input", "input_id": q.InputID})

}

// HeldDisposal is what a person decided about a held message (UI plan C7): drop it,
// make it guidance for the Team's active Run, or note the Run it started.
type HeldDisposal struct {
	RequestID        string `json:"request_id"`
	Disposition      string `json:"disposition"`
	RunID            string `json:"run_id,omitempty"`
	ExpectedRevision int64  `json:"expected_revision,omitempty"`
}

func (s *Service) DisposeHeld(ctx context.Context, p Principal, inputID string, q HeldDisposal) (HeldInput, error) {
	var out HeldInput
	if err := requireOperator(p); err != nil {
		return out, err
	}
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "held:"+inputID, q.RequestID, q)
		if err != nil {
			return err
		}
		var body, disposition string
		if err := tx.QueryRow(`SELECT body,disposition FROM held_inputs WHERE input_id=?`, inputID).Scan(&body, &disposition); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return task.Reject("HELD_INPUT_NOT_FOUND", inputID)
			}
			return err
		}
		if err := json.Unmarshal([]byte(body), &out); err != nil {
			return err
		}
		if prior != "" {
			return nil
		}
		if disposition != "pending" {
			return task.Reject("HELD_INPUT_DISPOSED", disposition)
		}
		switch q.Disposition {
		case "dismissed":
			out.Disposition = "dismissed"
		case "started":
			if _, err := task.LoadRun(tx, q.RunID); err != nil {
				return task.Reject("INVALID_RUN", q.RunID)
			}
			out.Disposition = "started:" + q.RunID
		case "guidance":
			r, err := task.LoadRun(tx, q.RunID)
			if err != nil {
				return task.Reject("INVALID_RUN", q.RunID)
			}
			if err := task.CAS(r.Revision, q.ExpectedRevision); err != nil {
				return err
			}
			if task.Terminal(r.Phase) || strings.TrimSpace(out.Text) == "" {
				return task.Reject("INVALID_GUIDANCE", "active Run and text required")
			}
			if !slices.Contains(r.Guidance, strings.TrimSpace(out.Text)) {
				r.Guidance = append(r.Guidance, strings.TrimSpace(out.Text))
				r.GuidanceNotes = append(r.GuidanceNotes, task.GuidanceNote{Text: strings.TrimSpace(out.Text), By: "operator", At: fault.Now()})
				r.Revision++
				if err := task.SaveRun(tx, r); err != nil {
					return err
				}
			}
			out.Disposition = "guidance:" + r.ID
		default:
			return task.Reject("INVALID_DISPOSITION", q.Disposition)
		}
		copies, err := heldCopies(tx, out)
		if err != nil {
			return err
		}
		for _, held := range append(copies, out) {
			held.Disposition = out.Disposition
			next, err := json.Marshal(held)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE held_inputs SET disposition=?, body=? WHERE input_id=?`, held.Disposition, string(next), held.InputID); err != nil {
				return err
			}
		}
		if err := remember(tx, p, "held:"+inputID, q.RequestID, inputID, q); err != nil {
			return err
		}
		return task.EventTx(tx, "held_disposed", inputID, 1, map[string]string{"disposition": out.Disposition})
	})
	return out, err
}

// heldCopies are the other members' copies of one group message (DS Bot relays it to
// each member it addresses): same group, same text, held around the same time, by a
// different member. A person decides about the message once.
func heldCopies(tx *sql.Tx, q HeldInput) ([]HeldInput, error) {
	self, err := loadInstance(tx, q.Binding.AgentID)
	if err != nil || self.Host.RoomID == "" {
		return nil, nil
	}
	rows, err := tx.Query(`SELECT body FROM held_inputs WHERE disposition='pending' AND agent_id!=? AND input_id!=?`, q.Binding.AgentID, q.InputID)
	if err != nil {
		return nil, err
	}
	var found []HeldInput
	for rows.Next() {
		var body string
		var other HeldInput
		if err := rows.Scan(&body); err != nil {
			rows.Close()
			return nil, err
		}
		if json.Unmarshal([]byte(body), &other) != nil || strings.TrimSpace(other.Text) != strings.TrimSpace(q.Text) {
			continue
		}
		if gap := other.HeldAt.Sub(q.HeldAt); gap > 2*time.Minute || gap < -2*time.Minute {
			continue
		}
		found = append(found, other)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var out []HeldInput
	for _, other := range found {
		if member, err := loadInstance(tx, other.Binding.AgentID); err == nil && member.Host.RoomID == self.Host.RoomID {
			out = append(out, other)
		}
	}
	return out, nil
}
