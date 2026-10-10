package scheduler

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Service) validateArtifacts(c task.Contract, r task.Result) error {
	for _, ref := range r.Artifacts {
		p, err := project.CanonicalResource(s.Project.Root, ref.Path)
		if err != nil {
			return err
		}
		file, err := os.Open(p)
		if err != nil {
			return err
		}
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			file.Close()
			if err != nil {
				return err
			}
			return task.Reject("INVALID_ARTIFACT", "regular file required")
		}
		hash := sha256.New()
		length, err := io.Copy(hash, file)
		file.Close()
		if err != nil {
			return err
		}
		if length != ref.Length {
			return task.Reject("ARTIFACT_LENGTH_CHANGED", ref.Path)
		}
		if hex.EncodeToString(hash.Sum(nil)) != ref.SHA256 {
			return task.Reject("ARTIFACT_HASH_CHANGED", ref.Path)
		}
	}
	for _, ref := range r.Refs {
		if ref.TaskID == "" || ref.ResultRevision < 1 || len(ref.Hash) != 64 {
			return task.Reject("INVALID_RESULT_REF", ref.TaskID)
		}
	}
	return nil
}
func saveAcceptance(tx *sql.Tx, c *task.Contract, a task.Acceptance) error {
	c.Acceptance = &a
	if a.Decision == "accepted" && c.ReworkOf != "" {
		old, err := task.LoadTask(tx, c.ReworkOf)
		if err != nil {
			return err
		}
		if !sameScope(*c, old) || old.Acceptance == nil || old.Acceptance.Decision != "rejected" {
			return task.Reject("INVALID_REWORK", "rejected same-scope candidate required")
		}
		old.SupersededBy = c.ID
		old.Revision++
		if err := task.SaveTask(tx, old); err != nil {
			return err
		}
	}
	c.Revision++
	b, err := json.Marshal(a)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO acceptance_history(task_id,body) VALUES(?,?)`, c.ID, string(b)); err != nil {
		return err
	}
	if err := task.SaveTask(tx, *c); err != nil {
		return err
	}
	return task.EventTx(tx, "acceptance_"+a.Decision, c.ID, c.Revision, a)
}
func (s *Service) applyAcceptance(tx *sql.Tx, c *task.Contract) error {
	if c.Result == nil {
		return nil
	}
	if _, err := tx.Exec(`SAVEPOINT acceptance_application`); err != nil {
		return err
	}
	if err := s.validateArtifacts(*c, *c.Result); err != nil {
		return err
	}
	if err := s.validateResultRefs(tx, *c, *c.Result); err != nil {
		return err
	}
	if c.Kind == "review" {
		var verdict struct {
			Decision   string              `json:"decision"`
			Reason     string              `json:"reason"`
			Candidates []project.ResultRef `json:"candidates"`
		}
		if err := project.DecodeStrict(c.Result.Value, &verdict); err != nil {
			return task.Reject("INVALID_REVIEW", err.Error())
		}
		if verdict.Decision != "accepted" && verdict.Decision != "rejected" {
			return task.Reject("INVALID_REVIEW", "decision must be accepted or rejected")
		}
		if verdict.Reason == "" || len(verdict.Candidates) == 0 {
			return task.Reject("INVALID_REVIEW", "reason and exact candidate refs required")
		}
		if err := project.ValidateResultRefs(verdict.Candidates); err != nil {
			return task.Reject("INVALID_REVIEW", err.Error())
		}
		for _, ref := range verdict.Candidates {
			v, err := task.LoadTask(tx, ref.TaskID)
			if err != nil {
				return err
			}
			if !sameScope(*c, v) || v.Result == nil || v.State != "completed" || v.Result.Hash != ref.Hash || v.Result.Revision != ref.ResultRevision || v.GoalRevision != v.Result.GoalRevision {
				return task.Reject("RESULT_VERSION_CONFLICT", ref.TaskID)
			}
			if v.AcceptancePolicy == nil || v.AcceptancePolicy.Mode != "review" || v.AcceptancePolicy.ReviewerRef != c.RoleID {
				return task.Reject("REVIEWER_NOT_AUTHORIZED", ref.TaskID)
			}
			if v.Result.AgentID == c.Result.AgentID || v.RoleID == c.RoleID {
				return task.Reject("SELF_REVIEW", ref.TaskID)
			}
			linked := false
			for _, d := range c.Dependencies {
				if d.TaskID == v.ID && d.Condition == "execution_completed" {
					linked = true
				}
			}
			if !linked {
				return task.Reject("INVALID_REVIEW", "candidate must be an execution_completed dependency")
			}
			if err := s.validateArtifacts(v, *v.Result); err != nil {
				return err
			}
			if err := saveAcceptance(tx, &v, task.Acceptance{Decision: verdict.Decision, Mode: "review", ResultHash: v.Result.Hash, GoalRevision: v.GoalRevision, ReviewerID: c.Result.AgentID, Reason: verdict.Reason, Evidence: verdict.Candidates}); err != nil {
				return err
			}
		}
	} else if c.AcceptancePolicy != nil && c.AcceptancePolicy.Mode == "checker" {
		accepted, reason, err := s.check(c.AcceptancePolicy.CheckerRef, *c.Result)
		if err != nil {
			return err
		}
		decision := "rejected"
		if accepted {
			decision = "accepted"
		}
		if err := saveAcceptance(tx, c, task.Acceptance{Decision: decision, Mode: "checker", ResultHash: c.Result.Hash, GoalRevision: c.GoalRevision, Reason: reason}); err != nil {
			return err
		}
	}
	return s.coverChildren(tx)
}
func (s *Service) coverChildren(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for pass := 0; pass < len(all); pass++ {
		changed := false
		for _, c := range all {
			if c.ParentID == "" || c.Result == nil || c.AcceptancePolicy == nil || c.AcceptancePolicy.Mode != "parent" {
				continue
			}
			parent, err := task.LoadTask(tx, c.ParentID)
			if err != nil {
				return err
			}
			valid := c.State == "completed" && len(c.Blockers) == 0 && c.GoalRevision == c.Result.GoalRevision &&
				parent.State == "completed" && len(parent.Blockers) == 0 && parent.Result != nil && parent.Acceptance != nil &&
				parent.Acceptance.Decision == "accepted" && parent.Acceptance.ResultHash == parent.Result.Hash &&
				parent.Acceptance.GoalRevision == parent.GoalRevision && parent.GoalRevision == parent.Result.GoalRevision
			refMatch := false
			if valid {
				for _, ref := range parent.Result.Refs {
					if ref.TaskID == c.ID && ref.ResultRevision == c.Result.Revision && ref.Hash == c.Result.Hash {
						refMatch = true
					}
				}
			}
			if valid && refMatch {
				if c.Acceptance != nil && c.Acceptance.Decision == "accepted" && c.Acceptance.GoalRevision == c.GoalRevision && c.Acceptance.CoveredBy == parent.Result.Hash && c.Acceptance.ResultHash == c.Result.Hash {
					continue
				}
				if err := saveAcceptance(tx, &c, task.Acceptance{Decision: "accepted", Mode: "parent", ResultHash: c.Result.Hash, GoalRevision: c.GoalRevision, CoveredBy: parent.Result.Hash, Reason: "exact child result covered by accepted parent", Evidence: parent.Result.Refs}); err != nil {
					return err
				}
				changed = true
			} else if c.Acceptance != nil && c.Acceptance.Mode == "parent" {
				c.Acceptance = nil
				c.Revision++
				if err := task.SaveTask(tx, c); err != nil {
					return err
				}
				if err := task.EventTx(tx, "acceptance_invalidated", c.ID, c.Revision, map[string]string{"reason": "parent_coverage_changed", "parent_id": parent.ID}); err != nil {
					return err
				}
				changed = true
			}
		}
		if !changed {
			break
		}
		all, err = readTasks(tx)
		if err != nil {
			return err
		}
	}
	return nil
}

// Registered checkers are code, never arbitrary model-provided commands.
func (s *Service) check(ref string, r task.Result) (bool, string, error) {
	switch ref {
	case "numbers-count", "numbers-sum", "numbers-stats":
	default:
		return false, "", task.Reject("CHECKER_NOT_REGISTERED", ref)
	}
	if len(r.Artifacts) != 1 {
		return false, "exactly one numeric input artifact required", nil
	}
	p, err := project.CanonicalResource(s.Project.Root, r.Artifacts[0].Path)
	if err != nil {
		return false, "", err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return false, "", err
	}
	if int64(len(b)) != r.Artifacts[0].Length || project.Hash(b) != r.Artifacts[0].SHA256 {
		return false, "", task.Reject("ARTIFACT_HASH_CHANGED", r.Artifacts[0].Path)
	}
	sum := float64(0)
	parts := strings.Fields(string(b))
	for _, part := range parts {
		n, err := strconv.ParseFloat(part, 64)
		if err != nil || math.IsNaN(n) || math.IsInf(n, 0) {
			return false, "input contains nonnumeric data", nil
		}
		sum += n
		if math.IsNaN(sum) || math.IsInf(sum, 0) {
			return false, "numeric input exceeds finite sum range", nil
		}
	}
	var raw map[string]any
	if err := json.Unmarshal(r.Value, &raw); err != nil {
		return false, "result must contain numeric count/sum", nil
	}
	number := func(key string) (float64, bool) {
		v, ok := raw[key]
		if !ok {
			return 0, false
		}
		n, ok := v.(float64)
		if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, false
		}
		return n, true
	}
	ok := true
	if ref != "numbers-sum" {
		n, present := number("count")
		ok = ok && present && n == float64(len(parts))
	}
	if ref != "numbers-count" {
		n, present := number("sum")
		ok = ok && present && n == sum
	}
	if !ok {
		return false, "result must contain numeric count/sum", nil
	}
	return true, fmt.Sprintf("recomputed count=%d sum=%g from hash-checked artifact", len(parts), sum), nil
}

// Canonical immutable references are filled by the Controller, not model identity.
func (s *Service) normalizeResult(tx *sql.Tx, r *task.Result) error {
	r.Artifacts = append([]task.Artifact{}, r.Artifacts...)
	r.Refs = append([]project.ResultRef{}, r.Refs...)
	for n, ref := range r.Artifacts {
		p, err := project.CanonicalResource(s.Project.Root, ref.Path)
		if err != nil {
			return err
		}
		st, err := os.Stat(p)
		if err != nil {
			return err
		}
		if !st.Mode().IsRegular() {
			return task.Reject("INVALID_ARTIFACT", "regular file required")
		}
		if ref.Length != 0 && ref.Length != st.Size() {
			return task.Reject("ARTIFACT_LENGTH_CHANGED", ref.Path)
		}
		r.Artifacts[n].Path = p
		r.Artifacts[n].Length = st.Size()
	}
	for n, ref := range r.Refs {
		target, err := task.LoadTask(tx, ref.TaskID)
		if err != nil {
			return err
		}
		if target.Result == nil {
			return task.Reject("RESULT_MISSING", ref.TaskID)
		}
		size := int64(len(target.Result.Value))
		if ref.Length != 0 && ref.Length != size {
			return task.Reject("RESULT_LENGTH_CHANGED", ref.TaskID)
		}
		r.Refs[n].Length = size
	}
	return nil
}
