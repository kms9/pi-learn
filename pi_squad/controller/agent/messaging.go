package agent

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// RuntimeToken is a process-held credential, never part of public registry metadata.
type Binding struct {
	AgentID          string `json:"agent_id"`
	RuntimeID        string `json:"runtime_id"`
	RuntimeSessionID string `json:"runtime_session_id"`
	RuntimeToken     string `json:"runtime_token,omitempty"`
}
type ReleaseRequest struct {
	AgentID           string `json:"agent_id"`
	ExpectedRuntimeID string `json:"expected_runtime_id"`
}
type MessageRequest struct {
	Binding
	RequestID       string `json:"request_id"`
	ToAgentID       string `json:"to_agent_id"`
	TargetRuntimeID string `json:"target_runtime_id"`
	TargetSessionID string `json:"target_session_id"`
	Kind            string `json:"kind"`
	Text            string `json:"text"`
	ReplyTo         string `json:"reply_to,omitempty"`
}
type Message struct {
	MessageID string    `json:"message_id"`
	RequestID string    `json:"request_id"`
	From      Binding   `json:"from"`
	To        Binding   `json:"to"`
	Kind      string    `json:"kind"`
	Text      string    `json:"text"`
	ReplyTo   string    `json:"reply_to,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Status    string    `json:"status"`
}
type ReceiptRequest struct {
	Binding
	MessageID string `json:"message_id"`
	Status    string `json:"status"`
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func (r *Registry) checkToken(ctx context.Context, id, token string) error {
	var hash string
	if err := r.db.QueryRowContext(ctx, "SELECT token_hash FROM owners WHERE agent_id = ?", id).Scan(&hash); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("%w: legacy identity requires explicit release", ErrConflict)
		}
		return err
	}
	if len(token) < 32 || subtle.ConstantTimeCompare([]byte(hash), []byte(tokenHash(token))) != 1 {
		return fmt.Errorf("%w: runtime credential mismatch", ErrConflict)
	}
	return nil
}
func (r *Registry) checkBinding(ctx context.Context, b Binding, online bool) (Agent, error) {
	a, err := r.Get(ctx, b.AgentID)
	if err != nil {
		return Agent{}, err
	}
	if b.RuntimeID == "" || b.RuntimeSessionID == "" || a.RuntimeID != b.RuntimeID || a.RuntimeSessionID != b.RuntimeSessionID {
		return Agent{}, fmt.Errorf("%w: runtime/session changed", ErrConflict)
	}
	if err := r.checkToken(ctx, b.AgentID, b.RuntimeToken); err != nil {
		return Agent{}, err
	}
	if online && a.Status != StatusOnline {
		return Agent{}, ErrOffline
	}
	return a, nil
}

// Release is an explicit operator CAS action, not an agent/model tool or timeout action.
// The HTTP service is a local cooperative controller, not a multi-user security boundary.
func (s *Service) Release(ctx context.Context, req ReleaseRequest) error {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	a, err := r.Get(ctx, req.AgentID)
	if err != nil {
		return err
	}
	if a.RuntimeID != req.ExpectedRuntimeID {
		return fmt.Errorf("%w: expected runtime differs", ErrConflict)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if a.RuntimeID != "" {
		if _, err = tx.ExecContext(ctx, "INSERT OR IGNORE INTO revoked_runtimes(runtime_id) VALUES(?)", a.RuntimeID); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM owners WHERE agent_id = ?", a.AgentID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM agents WHERE agent_id = ?", a.AgentID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.closeWatchLocked(a.AgentID)
	return nil
}
func publicBinding(a Agent) Binding {
	return Binding{AgentID: a.AgentID, RuntimeID: a.RuntimeID, RuntimeSessionID: a.RuntimeSessionID}
}
func sameBinding(a, b Binding) bool {
	return a.AgentID == b.AgentID && a.RuntimeID == b.RuntimeID && a.RuntimeSessionID == b.RuntimeSessionID
}
func (r *Registry) loadMessage(ctx context.Context, id string) (Message, error) {
	var raw, status string
	err := r.db.QueryRowContext(ctx, "SELECT envelope, status FROM messages WHERE message_id = ?", id).Scan(&raw, &status)
	if err == sql.ErrNoRows {
		return Message{}, ErrNotFound
	}
	if err != nil {
		return Message{}, err
	}
	var m Message
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return m, err
	}
	m.Status = status
	return m, nil
}
func (s *Service) SendMessage(ctx context.Context, req MessageRequest) (Message, error) {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	sender, err := r.checkBinding(ctx, req.Binding, true)
	if err != nil {
		return Message{}, err
	}
	if len(req.RequestID) == 0 || len(req.RequestID) > 128 || len(req.Text) > 65536 || strings.TrimSpace(req.Text) == "" {
		return Message{}, fmt.Errorf("%w: request_id required (max 128), text required (max 64 KiB)", ErrInvalid)
	}
	if req.Kind != "notice" && req.Kind != "ask" && req.Kind != "reply" {
		return Message{}, fmt.Errorf("%w: kind must be notice, ask or reply", ErrInvalid)
	}
	if (req.Kind == "reply") != (req.ReplyTo != "") {
		return Message{}, fmt.Errorf("%w: reply requires reply_to; other kinds must omit it", ErrInvalid)
	}
	// Idempotency includes original parameters, but never serializes the credential.
	safe := req
	safe.RuntimeToken = ""
	fingerprint, _ := json.Marshal(safe)
	keyBytes, _ := json.Marshal([]string{req.AgentID, req.RuntimeID, req.RuntimeSessionID, req.RequestID})
	key := string(keyBytes)
	var existingID, existingBody string
	err = r.db.QueryRowContext(ctx, "SELECT message_id, request_body FROM messages WHERE request_key = ?", key).Scan(&existingID, &existingBody)
	if err == nil {
		if existingBody != string(fingerprint) {
			return Message{}, fmt.Errorf("%w: IDEMPOTENCY_CONFLICT", ErrConflict)
		}
		return r.loadMessage(ctx, existingID)
	}
	if err != sql.ErrNoRows {
		return Message{}, err
	}
	target, err := r.Get(ctx, req.ToAgentID)
	if err != nil {
		return Message{}, err
	}
	if req.TargetRuntimeID == "" || req.TargetSessionID == "" || target.RuntimeID != req.TargetRuntimeID || target.RuntimeSessionID != req.TargetSessionID {
		return Message{}, fmt.Errorf("%w: target runtime/session changed; rediscover explicitly", ErrConflict)
	}
	if sender.SquadID != target.SquadID {
		return Message{}, fmt.Errorf("%w: cross-squad messaging is not enabled", ErrInvalid)
	}
	if req.Kind == "reply" {
		original, err := r.loadMessage(ctx, req.ReplyTo)
		if err != nil {
			return Message{}, err
		}
		if (original.Status == "replied" || original.Status == "interrupted" || original.Status == "session_changed" || original.Status == "offline" || original.Status == "stored") || original.Kind == "reply" || !sameBinding(original.To, publicBinding(sender)) || !sameBinding(original.From, publicBinding(target)) {
			return Message{}, fmt.Errorf("%w: reply does not match original participants", ErrConflict)
		}
	}
	if _, err := r.db.ExecContext(ctx, `UPDATE messages SET status='expired' WHERE status IN ('stored','received') AND julianday(json_extract(envelope,'$.expires_at')) < julianday(?)`, r.now().Format(time.RFC3339Nano)); err != nil {
		return Message{}, err
	}
	var queued int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM messages WHERE json_extract(envelope,'$.to.agent_id')=? AND json_extract(envelope,'$.to.runtime_id')=? AND json_extract(envelope,'$.to.runtime_session_id')=? AND status IN ('stored','received')`, target.AgentID, target.RuntimeID, target.RuntimeSessionID).Scan(&queued); err != nil {
		return Message{}, err
	}
	if queued >= 32 {
		return Message{}, fmt.Errorf("%w: target queue full (32)", ErrConflict)
	}
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return Message{}, err
	}
	now := r.now()
	m := Message{MessageID: hex.EncodeToString(bytes), RequestID: req.RequestID, From: publicBinding(sender), To: publicBinding(target), Kind: req.Kind, Text: req.Text, ReplyTo: req.ReplyTo, CreatedAt: now, ExpiresAt: now.Add(10 * time.Minute), Status: "stored"}
	if target.Status != StatusOnline {
		m.Status = "offline"
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return Message{}, err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Message{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, "INSERT INTO messages(message_id,request_key,request_body,envelope,status) VALUES(?,?,?,?,?)", m.MessageID, key, string(fingerprint), string(raw), m.Status)
	if err != nil {
		return Message{}, err
	}
	if req.Kind == "reply" && m.Status != "offline" {
		if _, err = tx.ExecContext(ctx, "UPDATE messages SET status='replied' WHERE message_id=?", req.ReplyTo); err != nil {
			return Message{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Message{}, err
	}
	if m.Status == "stored" {
		r.notifyInboxLocked(m.To)
	}
	return m, nil
}
func pending(status string) bool { return status == "stored" || status == "received" }
func (r *Registry) refreshMessage(ctx context.Context, m Message) (Message, error) {
	if !pending(m.Status) {
		return m, nil
	}
	target, err := r.Get(ctx, m.To.AgentID)
	if err != nil && err != ErrNotFound {
		return m, err
	}
	switch {
	case err == ErrNotFound || !sameBinding(m.To, publicBinding(target)):
		m.Status = "session_changed"
	case r.now().After(m.ExpiresAt):
		m.Status = "expired"
	case target.Status != StatusOnline:
		m.Status = "offline"
	}
	if !pending(m.Status) {
		_, err = r.db.ExecContext(ctx, "UPDATE messages SET status=? WHERE message_id=?", m.Status, m.MessageID)
	}
	return m, err
}

// Inbox returns only this binding's messages. Outgoing status is queried by ID.
func (s *Service) Inbox(ctx context.Context, b Binding, pendingOnly bool) ([]Message, error) {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := r.checkBinding(ctx, b, true); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT envelope,status FROM messages WHERE json_extract(envelope,'$.to.agent_id')=? AND json_extract(envelope,'$.to.runtime_id')=? AND json_extract(envelope,'$.to.runtime_session_id')=? AND (? = 0 OR status IN ('stored','received')) ORDER BY rowid DESC LIMIT 100`, b.AgentID, b.RuntimeID, b.RuntimeSessionID, pendingOnly)
	if err != nil {
		return nil, err
	}
	result := []Message{}
	for rows.Next() {
		var raw, status string
		if err := rows.Scan(&raw, &status); err != nil {
			rows.Close()
			return nil, err
		}
		var m Message
		if err := json.Unmarshal([]byte(raw), &m); err != nil {
			rows.Close()
			return nil, err
		}
		m.Status = status
		result = append(result, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for i := range result {
		result[i], err = r.refreshMessage(ctx, result[i])
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}
func (s *Service) GetMessage(ctx context.Context, b Binding, id string) (Message, error) {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := r.checkBinding(ctx, b, true); err != nil {
		return Message{}, err
	}
	m, err := r.loadMessage(ctx, id)
	if err != nil {
		return m, err
	}
	if !sameBinding(b, m.From) && !sameBinding(b, m.To) {
		return Message{}, fmt.Errorf("%w: message belongs to another binding", ErrConflict)
	}
	return r.refreshMessage(ctx, m)
}
func (s *Service) Receipt(ctx context.Context, req ReceiptRequest) (Message, error) {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := r.checkBinding(ctx, req.Binding, true); err != nil {
		return Message{}, err
	}
	m, err := r.loadMessage(ctx, req.MessageID)
	if err != nil {
		return m, err
	}
	if !sameBinding(req.Binding, m.To) {
		return Message{}, fmt.Errorf("%w: only target can acknowledge", ErrConflict)
	}
	m, err = r.refreshMessage(ctx, m)
	if err != nil {
		return m, err
	}
	// The receiver may return a claimed ask to the queue only when it has not
	// called Pi's injection API (e.g. local input won the final idle check).
	if req.Status == "deferred" && m.Kind == "ask" {
		if m.Status == "received" {
			return m, nil
		}
		if m.Status != "injection_requested" {
			return Message{}, fmt.Errorf("%w: only an uninjected claim can be deferred", ErrConflict)
		}
		_, err = r.db.ExecContext(ctx, "UPDATE messages SET status='received' WHERE message_id=?", m.MessageID)
		m.Status = "received"
		return m, err
	}
	if req.Status == m.Status {
		return m, nil
	}
	allowed := (req.Status == "received" && m.Status == "stored") || (req.Status == "recorded" && m.Status == "received" && m.Kind != "ask") || (req.Status == "injection_requested" && m.Status == "received" && m.Kind == "ask") || (req.Status == "interrupted" && (m.Status == "received" || m.Status == "injection_requested"))
	if !allowed {
		return Message{}, fmt.Errorf("%w: invalid receipt transition %s -> %s", ErrConflict, m.Status, req.Status)
	}
	_, err = r.db.ExecContext(ctx, "UPDATE messages SET status=? WHERE message_id=?", req.Status, m.MessageID)
	m.Status = req.Status
	return m, err
}

// Invalidate queued delivery before a known offline binding is renewed or a session changes.
func (r *Registry) invalidatePending(ctx context.Context, a Agent, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE messages SET status=? WHERE status IN ('stored','received','recorded','injection_requested') AND (
 (json_extract(envelope,'$.to.agent_id')=? AND json_extract(envelope,'$.to.runtime_id')=? AND json_extract(envelope,'$.to.runtime_session_id')=?) OR
 (json_extract(envelope,'$.from.agent_id')=? AND json_extract(envelope,'$.from.runtime_id')=? AND json_extract(envelope,'$.from.runtime_session_id')=?))`, status, a.AgentID, a.RuntimeID, a.RuntimeSessionID, a.AgentID, a.RuntimeID, a.RuntimeSessionID)
	return err
}
