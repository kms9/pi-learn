package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type AttemptEvent struct {
	Uninjected       bool         `json:"uninjected"`
	Answer           string       `json:"answer,omitempty"`
	RequestID        string       `json:"request_id"`
	ExpectedRevision int64        `json:"expected_revision"`
	Segment          int64        `json:"segment_id"`
	FencingToken     int64        `json:"fencing_token"`
	ControllerEpoch  int64        `json:"controller_epoch"`
	Type             string       `json:"type"`
	Idle             bool         `json:"idle"`
	Pending          bool         `json:"pending"`
	Outcome          string       `json:"outcome,omitempty"`
	Result           *task.Result `json:"result,omitempty"`
}

func (s *Service) AttemptEvent(ctx context.Context, p Principal, id string, q AttemptEvent) (task.Attempt, error) {
	var out task.Attempt
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		prior, err := replay(tx, p, "attempt_event:"+id, q.RequestID, q)
		if err != nil {
			return err
		}
		if prior != "" {
			out, err = task.LoadAttempt(tx, prior)
			return err
		}
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		if p.Operator || !task.SameBinding(p.Binding, a.Target) || q.ControllerEpoch != s.Epoch || a.ControllerEpoch != s.Epoch || q.Segment != a.Segment || q.FencingToken != a.FencingToken {
			return task.Reject("STALE_EXECUTION", "binding/epoch/segment mismatch")
		}
		if err := task.CAS(a.Revision, q.ExpectedRevision); err != nil {
			return err
		}
		if fault.Now().After(a.LeaseExpiresAt) || a.Cleanup == "released" || a.State == "needs_review" || task.Terminal(a.State) {
			return task.Reject("EXECUTION_QUARANTINED", "explicit reconciliation required")
		}
		switch q.Type {
		case "adapter_received":
			if a.Receipt != "dispatch_intent" {
				return task.Reject("INVALID_RECEIPT", a.Receipt)
			}
			a.Receipt = q.Type
		case "injection_requested":
			if a.Receipt != "adapter_received" {
				return task.Reject("INVALID_RECEIPT", a.Receipt)
			}
			a.Receipt = q.Type
		case "input_observed":
			if a.Receipt != "injection_requested" {
				return task.Reject("INVALID_RECEIPT", a.Receipt)
			}
			a.Receipt = q.Type
			a.State = "running"
			c.State = "running"
		case "renew":
			if a.State != "running" && a.State != "admitted" && a.State != "result_proposed" {
				return task.Reject("INVALID_LEASE_STATE", a.State)
			}
			a.LeaseExpiresAt = fault.Now().Add(s.Config.LeaseTTL)
			if _, err := tx.Exec(`UPDATE execution_leases SET expires_at=? WHERE attempt_id=? AND fencing=?`, a.LeaseExpiresAt.Format(time.RFC3339Nano), id, a.FencingToken); err != nil {
				return err
			}
		case "clarification_answer":
			if a.Mode != "response_only" || a.ClarificationID == "" || q.Answer == "" {
				return task.Reject("INVALID_CLARIFICATION", "response-only answer required")
			}
			if _, err := tx.Exec(`UPDATE clarifications SET answer=? WHERE id=? AND state='answering'`, q.Answer, a.ClarificationID); err != nil {
				return err
			}
		case "yield":
			if c.Kind == "ask" || a.Mode == "response_only" || a.State != "running" || len(c.Dependencies) == 0 {
				return task.Reject("INVALID_YIELD", "running with dependencies required")
			}
			a.YieldRequested = true
		case "result_proposed":
			if a.Mode == "response_only" || q.Result == nil || a.State != "running" || q.Result.GoalRevision != c.AppliedRevision {
				return task.Reject("INVALID_RESULT", "result revision mismatch")
			}
			if c.Kind == "ask" {
				var answer struct {
					Answer string `json:"answer"`
				}
				if err := project.DecodeStrict(q.Result.Value, &answer); err != nil || answer.Answer == "" {
					return task.Reject("INVALID_ASK_REPLY", "only nonempty answer is allowed")
				}
			}
			r := *q.Result
			if err := pinResultInputs(c, &r); err != nil {
				return err
			}
			if err := s.normalizeResult(tx, &r); err != nil {
				return err
			}
			schema, err := project.ParseOutputSchema(c.ExpectedOutput)
			if err != nil {
				return err
			}
			if schema != nil {
				var value any
				if err := json.Unmarshal(r.Value, &value); err != nil {
					return err
				}
				if err := schema.Check(value); err != nil {
					return task.Reject("RESULT_SCHEMA_INVALID", err.Error())
				}
			}
			if err := s.validateResultRefs(tx, c, r); err != nil {
				return err
			}
			if err := s.validateArtifacts(c, r); err != nil {
				return err
			}
			if !json.Valid(r.Value) {
				return task.Reject("INVALID_RESULT", "valid JSON value required")
			}
			r.AttemptID = a.ID
			r.AgentID = a.Target.AgentID
			r.Revision = c.Revision + 1
			r.Hash = ""
			r.Hash = bodyHash(r)
			a.ResultProposed = &r
			a.State = "result_proposed"
			c.State = "result_proposed"
		case "settled":
			if !q.Idle || q.Pending {
				return task.Reject("NOT_SETTLED", "Pi must be idle without pending work")
			}
			if q.Outcome != "completed" {
				a.State = "interrupted"
				a.Error = q.Outcome
				c.State = "interrupted"
				a.Cleanup = "released"
				if err := releaseAttempt(tx, a); err != nil {
					return err
				}
				if err := s.failAncestors(tx, c, q.Outcome); err != nil {
					return err
				}
			} else if a.Mode == "response_only" {
				var answer string
				if err := tx.QueryRow(`SELECT answer FROM clarifications WHERE id=?`, a.ClarificationID).Scan(&answer); err != nil {
					return err
				}
				if answer == "" {
					return task.Reject("RESULT_MISSING", "clarification answer required")
				}
				if _, err := tx.Exec(`UPDATE clarifications SET state='answered' WHERE id=?`, a.ClarificationID); err != nil {
					return err
				}
				a.State = "suspended"
				a.Mode = ""
				a.ClarificationID = ""
				a.ClarificationText = ""
				c.State = "waiting_dependency"
				if _, err := tx.Exec(`DELETE FROM execution_leases WHERE attempt_id=?`, a.ID); err != nil {
					return err
				}
			} else if a.YieldRequested {
				a.State = "suspended"
				c.State = "waiting_dependency"
				if _, err := tx.Exec(`DELETE FROM execution_leases WHERE attempt_id=?`, a.ID); err != nil {
					return err
				}
			} else if a.ResultProposed == nil {
				a.State = "needs_review"
				a.Error = "RESULT_MISSING"
				c.State = "needs_review"
				if _, err := tx.Exec(`DELETE FROM execution_leases WHERE attempt_id=?`, a.ID); err != nil {
					return err
				}
				if err := s.failAncestors(tx, c, "RESULT_MISSING"); err != nil {
					return err
				}
			} else if c.GoalRevision != c.AppliedRevision {
				// A pending amendment supersedes this proposal, not its history.
				body, err := json.Marshal(a.ResultProposed)
				if err != nil {
					return err
				}
				if _, err := tx.Exec(`INSERT INTO result_history VALUES(?,?,?,?)`, c.ID, a.ResultProposed.Revision, a.ResultProposed.Hash, string(body)); err != nil {
					return err
				}
				if err := task.EventTx(tx, "result_superseded_by_amend", c.ID, c.Revision, map[string]any{"result_hash": a.ResultProposed.Hash, "applied_revision": c.AppliedRevision, "goal_revision": c.GoalRevision}); err != nil {
					return err
				}
				a.State = "suspended"
				c.State = "waiting_dependency"
				if _, err := tx.Exec(`DELETE FROM execution_leases WHERE attempt_id=?`, a.ID); err != nil {
					return err
				}
			} else {
				a.State = "settled"
				a.Cleanup = "released"
				c.State = "completed"
				c.Result = a.ResultProposed
				b, err := json.Marshal(c.Result)
				if err != nil {
					return err
				}
				if _, err := tx.Exec(`INSERT INTO result_history VALUES(?,?,?,?)`, c.ID, c.Result.Revision, c.Result.Hash, string(b)); err != nil {
					return err
				}
				if err := releaseAttempt(tx, a); err != nil {
					return err
				}
			}
		case "deferred":
			if !q.Uninjected || (a.Receipt != "dispatch_intent" && a.Receipt != "adapter_received" && a.Receipt != "injection_requested") {
				return task.Reject("OUTCOME_UNKNOWN", "adapter must prove input API was never called")
			}
			a.State = "suspended"
			a.Error = "adapter_deferred"
			c.State = "waiting_dependency"
			// Keep affinity and write ownership, release only model capacity.
			// A proven non-injection resumes the same Attempt with a fresh fence.
			if _, err := tx.Exec(`DELETE FROM execution_leases WHERE attempt_id=?`, a.ID); err != nil {
				return err
			}
		default:
			return task.Reject("INVALID_EVENT", q.Type)
		}
		a.Revision++
		c.Revision++
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		// Log the observed lifecycle fact before its derived acceptance/release
		// events. All of them still commit atomically in this transaction.
		if err := task.EventTx(tx, q.Type, id, a.Revision, map[string]any{"task_id": c.ID, "segment": a.Segment}); err != nil {
			return err
		}
		if q.Type == "settled" {
			if err := s.afterCompletion(tx, c, a); err != nil {
				return err
			}
		}
		if err := remember(tx, p, "attempt_event:"+id, q.RequestID, id, q); err != nil {
			return err
		}
		out = a
		return nil
	})

	if err != nil && q.Result != nil && !p.Operator {
		payload, _ := json.Marshal(q)
		evidenceErr := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
			a, loadErr := task.LoadAttempt(tx, id)
			if loadErr != nil {
				return loadErr
			}
			if p.Binding.AgentID != a.Target.AgentID {
				return task.Reject("FORBIDDEN", "unrelated evidence")
			}
			_, saveErr := tx.Exec(`INSERT INTO attempt_evidence(attempt_id,source,disposition,body,at) VALUES(?,?,?,?,?)`, id, p.Binding.AgentID, "rejected_late_or_stale", string(payload), fault.Now().Format(time.RFC3339Nano))
			return saveErr
		})
		if evidenceErr != nil {
			return out, fmt.Errorf("event rejected: %v; evidence persistence failed: %w", err, evidenceErr)
		}
	}
	return out, err
}
func releaseAttempt(tx *sql.Tx, a task.Attempt) error {
	for _, q := range []string{`DELETE FROM execution_leases WHERE attempt_id=?`, `DELETE FROM write_reservations WHERE attempt_id=?`, `DELETE FROM agent_reservations WHERE attempt_id=?`} {
		if _, err := tx.Exec(q, a.ID); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) Dispatches(ctx context.Context, p Principal) ([]map[string]any, error) {
	out := []map[string]any{}
	if p.Operator {
		return out, task.Reject("FORBIDDEN", "runtime only")
	}
	err := s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		var id string
		err := tx.QueryRow(`SELECT attempt_id FROM agent_reservations WHERE agent_id=?`, p.Binding.AgentID).Scan(&id)
		if err == sql.ErrNoRows {
			return nil
		}
		if err != nil {
			return err
		}
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		if !task.SameBinding(p.Binding, a.Target) {
			return task.Reject("BINDING_CHANGED", "dispatch binding mismatch")
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		out = append(out, map[string]any{"attempt": a, "task": c, "protocol_version": project.Protocol})
		return nil
	})
	return out, err
}
