package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"strings"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type Message struct {
	ID        string       `json:"message_id"`
	RequestID string       `json:"request_id"`
	From      task.Binding `json:"from"`
	To        task.Binding `json:"to"`
	Kind      string       `json:"kind"`
	Text      string       `json:"text"`
	ReplyTo   string       `json:"reply_to,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
	ExpiresAt time.Time    `json:"expires_at"`
	Status    string       `json:"status"`
}
type SendMessage struct {
	ExpectedTarget *task.Binding `json:"expected_target,omitempty"`
	RequestID      string        `json:"request_id"`
	Target         string        `json:"target"`
	Kind           string        `json:"kind"`
	Text           string        `json:"text"`
	ReplyTo        string        `json:"reply_to,omitempty"`
}

func (s *Service) SendMessage(ctx context.Context, p Principal, q SendMessage) (Message, error) {
	var out Message
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		if q.Kind != "notice" && q.Kind != "reply" {
			return task.Reject("FORMAL_ASK_REQUIRED", "model questions must use managed kind=ask Task")
		}
		if strings.TrimSpace(q.Text) == "" || len(q.Text) > 64*1024 {
			return task.Reject("INVALID_MESSAGE", "message text required, maximum 64 KiB")
		}
		id, err := replay(tx, p, "send_message", q.RequestID, q)
		if err != nil {
			return err
		}
		if id != "" {
			out, err = loadMessage(tx, id)
			return err
		}
		target, err := loadInstance(tx, q.Target)
		if err != nil {
			return err
		}
		if q.ExpectedTarget == nil || !task.SameBinding(*q.ExpectedTarget, target.Binding) {
			return task.Reject("BINDING_CHANGED", "exact expected target binding required")
		}
		targetOnline := s.Online(target)
		if q.Kind == "reply" {
			original, err := loadMessage(tx, q.ReplyTo)
			if err != nil {
				return err
			}
			if p.Operator || !task.SameBinding(original.To, p.Binding) || !task.SameBinding(original.From, target.Binding) || original.Kind == "reply" || (original.Status != "received" && original.Status != "recorded") {
				return task.Reject("FORBIDDEN", "reply participants/status mismatch")
			}
		}
		if (q.Kind == "reply") != (q.ReplyTo != "") {
			return task.Reject("INVALID_MESSAGE", "reply_to must be present only for replies")
		}
		var queued int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM messages WHERE request_key LIKE 'v2:%' AND json_extract(envelope,'$.to.agent_id')=? AND status IN ('stored','received')`, q.Target).Scan(&queued); err != nil {
			return err
		}
		if targetOnline && queued >= 32 {
			return task.Reject("QUEUE_FULL", "target message queue limit is 32")
		}
		id, err = project.RandomID("message-")
		if err != nil {
			return err
		}
		out = Message{ID: id, RequestID: q.RequestID, From: p.Binding, To: target.Binding, Kind: q.Kind, Text: q.Text, ReplyTo: q.ReplyTo, CreatedAt: fault.Now(), ExpiresAt: fault.Now().Add(10 * time.Minute), Status: "stored"}
		if !targetOnline {
			out.Status = "offline"
		}
		body, err := json.Marshal(out)
		if err != nil {
			return err
		}
		payload, _ := json.Marshal(q)
		if _, err := tx.Exec(`INSERT INTO messages(message_id,request_key,request_body,envelope,status) VALUES(?,?,?,?,?)`, id, "v2:"+id, string(payload), string(body), out.Status); err != nil {
			return err
		}
		if q.Kind == "reply" && targetOnline {
			if _, err := tx.Exec(`UPDATE messages SET status='replied' WHERE message_id=?`, q.ReplyTo); err != nil {
				return err
			}
		}
		if err := remember(tx, p, "send_message", q.RequestID, id, q); err != nil {
			return err
		}
		return task.EventTx(tx, "notice_stored", id, 1, map[string]string{"to_agent_id": q.Target})
	})
	return out, err
}
func (s *Service) Inbox(ctx context.Context, p Principal) ([]Message, error) {
	out := []Message{}
	if p.Operator {
		return nil, task.Reject("FORBIDDEN", "runtime inbox requires binding")
	}
	rows, err := s.Store.DB.QueryContext(ctx, `SELECT envelope,status FROM messages WHERE request_key LIKE 'v2:%' AND json_extract(envelope,'$.to.agent_id')=? ORDER BY rowid DESC LIMIT 100`, p.Binding.AgentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b, status string
		if err := rows.Scan(&b, &status); err != nil {
			return nil, err
		}
		var m Message
		if err := json.Unmarshal([]byte(b), &m); err != nil {
			return nil, err
		}
		if task.SameBinding(m.To, p.Binding) {
			m.Status = status
			out = append(out, m)
		}
	}
	return out, rows.Err()
}

func loadMessage(tx *sql.Tx, id string) (Message, error) {
	var m Message
	var body, status string
	err := tx.QueryRow(`SELECT envelope,status FROM messages WHERE message_id=? AND request_key LIKE 'v2:%'`, id).Scan(&body, &status)
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		return m, err
	}
	m.Status = status
	return m, nil
}
func (s *Service) GetMessage(ctx context.Context, p Principal, id string) (Message, error) {
	var out Message
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = loadMessage(tx, id)
		if err == sql.ErrNoRows {
			c, loadErr := task.LoadTask(tx, id)
			if loadErr != nil {
				return loadErr
			}
			if c.Kind != "ask" || c.Target == nil {
				return task.Reject("MESSAGE_NOT_FOUND", id)
			}
			from := task.Binding{}
			if c.Source.Binding != nil {
				from = *c.Source.Binding
			}
			status := c.State
			if status == "completed" {
				status = "replied"
			}
			out = Message{ID: c.ID, RequestID: c.Source.InputID, From: from, To: *c.Target, Kind: "ask", Text: c.Goal, CreatedAt: c.CreatedAt, ExpiresAt: c.DeadlineAt, Status: status}
			err = nil
		}
		if err != nil {
			return err
		}
		if p.Operator || (!task.SameBinding(p.Binding, out.To) && !task.SameBinding(p.Binding, out.From)) {
			return task.Reject("FORBIDDEN", "message belongs to another binding")
		}
		return nil
	})
	return out, err
}

type MessageReceipt struct {
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
}

func (s *Service) Receipt(ctx context.Context, p Principal, id string, q MessageReceipt) (Message, error) {
	var out Message
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "message_receipt:"+id, q.RequestID, q)
		if err != nil {
			return err
		}
		out, err = loadMessage(tx, id)
		if err != nil {
			return err
		}
		if p.Operator || !task.SameBinding(p.Binding, out.To) {
			return task.Reject("FORBIDDEN", "only exact target may acknowledge")
		}
		if prior != "" {
			return nil
		}
		if !((out.Status == "stored" && q.Status == "received") || (out.Status == "received" && q.Status == "recorded") || out.Status == q.Status) {
			return task.Reject("INVALID_RECEIPT", out.Status+" -> "+q.Status)
		}
		if _, err := tx.Exec(`UPDATE messages SET status=? WHERE message_id=?`, q.Status, id); err != nil {
			return err
		}
		out.Status = q.Status
		if err := remember(tx, p, "message_receipt:"+id, q.RequestID, id, q); err != nil {
			return err
		}
		return task.EventTx(tx, "message_receipt", id, 1, map[string]string{"status": q.Status})
	})
	return out, err
}
func (s *Service) expireMessages(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT message_id FROM messages WHERE request_key LIKE 'v2:%' AND status IN ('stored','received')`)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		m, err := loadMessage(tx, id)
		if err != nil {
			return err
		}
		status := ""
		target, err := loadInstance(tx, m.To.AgentID)
		if err == sql.ErrNoRows || (err == nil && !task.SameBinding(target.Binding, m.To)) {
			status = "session_changed"
		} else if err != nil {
			return err
		} else if !s.Online(target) {
			status = "offline"
		} else if !m.ExpiresAt.IsZero() && fault.Now().After(m.ExpiresAt) {
			status = "expired"
		}
		if status != "" {
			if _, err := tx.Exec(`UPDATE messages SET status=? WHERE message_id=?`, status, id); err != nil {
				return err
			}
			if err := task.EventTx(tx, "message_invalidated", id, 1, map[string]string{"status": status}); err != nil {
				return err
			}
		}
	}
	return nil
}

func publishAskReply(tx *sql.Tx, c task.Contract) error {
	if c.Kind != "ask" || c.Result == nil || c.State != "completed" || c.Source.Binding == nil || c.Target == nil {
		return nil
	}
	var answer struct {
		Answer string `json:"answer"`
	}
	if err := json.Unmarshal(c.Result.Value, &answer); err != nil || answer.Answer == "" {
		return task.Reject("INVALID_ASK_REPLY", "nonempty answer required")
	}
	id := "reply-" + c.Result.Hash
	m := Message{ID: id, RequestID: c.Source.InputID, From: *c.Target, To: *c.Source.Binding, Kind: "reply", Text: answer.Answer, ReplyTo: c.ID, CreatedAt: fault.Now(), ExpiresAt: fault.Now().Add(10 * time.Minute), Status: "stored"}
	body, err := json.Marshal(m)
	if err != nil {
		return err
	}
	result, err := tx.Exec(`INSERT OR IGNORE INTO messages(message_id,request_key,request_body,envelope,status) VALUES(?,?,?,?,?)`, id, "v2:task-reply:"+c.ID+":"+c.Result.Hash, "{}", string(body), "stored")
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	return task.EventTx(tx, "ask_reply_stored", id, c.Revision, map[string]string{"task_id": c.ID})
}

func invalidateMessages(tx *sql.Tx, b task.Binding, status string) error {
	_, err := tx.Exec(`UPDATE messages SET status=? WHERE request_key LIKE 'v2:%' AND status IN ('stored','received') AND ((json_extract(envelope,'$.to.agent_id')=? AND json_extract(envelope,'$.to.runtime_id')=? AND json_extract(envelope,'$.to.session_id')=?) OR (json_extract(envelope,'$.from.agent_id')=? AND json_extract(envelope,'$.from.runtime_id')=? AND json_extract(envelope,'$.from.session_id')=?))`, status, b.AgentID, b.RuntimeID, b.SessionID, b.AgentID, b.RuntimeID, b.SessionID)
	return err
}
