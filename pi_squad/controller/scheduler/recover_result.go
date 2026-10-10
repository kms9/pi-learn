package scheduler

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

// Recover attaches previously recorded evidence. It never creates a permit or
// input, and cannot substitute evidence of a result for evidence of cleanup.
func (s *Service) recoverResult(tx *sql.Tx, c *task.Contract, ref string) error {
	if c.State != "needs_review" && c.State != "interrupted" && c.State != "failed" {
		return task.Reject("INVALID_RECOVERY_STATE", c.State)
	}
	for _, id := range c.AttemptIDs {
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		if a.Cleanup != "released" {
			return task.Reject("EXECUTION_UNCONFIRMED", id)
		}
	}
	var r *task.Result
	var sourceAttempt string
	switch {
	case strings.HasPrefix(ref, "attempt:"):
		sourceAttempt = strings.TrimPrefix(ref, "attempt:")
		a, err := task.LoadAttempt(tx, sourceAttempt)
		if err != nil {
			return err
		}
		if a.TaskID != c.ID {
			return task.Reject("EVIDENCE_SCOPE_MISMATCH", ref)
		}
		r = a.ResultProposed
	case strings.HasPrefix(ref, "evidence:"):
		id, err := strconv.ParseInt(strings.TrimPrefix(ref, "evidence:"), 10, 64)
		if err != nil {
			return task.Reject("INVALID_EVIDENCE_REF", ref)
		}
		var body string
		if err := tx.QueryRow(`SELECT attempt_id,body FROM attempt_evidence WHERE seq=?`, id).Scan(&sourceAttempt, &body); err != nil {
			return err
		}
		a, err := task.LoadAttempt(tx, sourceAttempt)
		if err != nil {
			return err
		}
		if a.TaskID != c.ID {
			return task.Reject("EVIDENCE_SCOPE_MISMATCH", ref)
		}
		var event AttemptEvent
		if err := json.Unmarshal([]byte(body), &event); err != nil {
			return err
		}
		if event.Segment != a.Segment || event.FencingToken != a.FencingToken {
			return task.Reject("STALE_EXECUTION", "evidence belongs to another segment")
		}
		r = event.Result
	default:
		return task.Reject("INVALID_EVIDENCE_REF", "use attempt:<attempt_id> or evidence:<stored_evidence_id>")
	}
	if r == nil || !json.Valid(r.Value) || r.GoalRevision != c.GoalRevision {
		return task.Reject("RESULT_VERSION_CONFLICT", "recorded result for current goal required")
	}
	a, err := task.LoadAttempt(tx, sourceAttempt)
	if err != nil {
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
	copyResult := *r
	r = &copyResult
	if err := pinResultInputs(*c, r); err != nil {
		return err
	}
	if err := s.normalizeResult(tx, r); err != nil {
		return err
	}
	if err := s.validateResultRefs(tx, *c, *r); err != nil {
		return err
	}
	if err := s.validateArtifacts(*c, *r); err != nil {
		return err
	}
	recovered := *r
	recovered.AttemptID = a.ID
	recovered.AgentID = a.Target.AgentID
	recovered.Revision = c.Revision + 1
	recovered.Hash = ""
	recovered.Hash = bodyHash(recovered)
	c.Result = &recovered
	c.Acceptance = nil
	c.State = "completed"
	c.AppliedRevision = c.GoalRevision
	c.Blockers = []task.Blocker{}
	c.Revision++
	body, err := json.Marshal(recovered)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO result_history VALUES(?,?,?,?)`, c.ID, recovered.Revision, recovered.Hash, string(body)); err != nil {
		return err
	}
	if err := task.SaveTask(tx, *c); err != nil {
		return err
	}
	if err := s.applyAcceptance(tx, c); err != nil {
		return err
	}
	return publishAskReply(tx, *c)
}
