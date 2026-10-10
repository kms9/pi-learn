// Package task defines the durable execution contract, independent of transport.
package task

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
)

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func (e *Error) Error() string          { return e.Code + ": " + e.Message }
func Reject(code, message string) error { return &Error{Code: code, Message: message} }

type Binding struct {
	AgentID      string `json:"agent_id"`
	RuntimeID    string `json:"runtime_id"`
	SessionID    string `json:"session_id"`
	BindingEpoch int64  `json:"binding_epoch"`
	PrimaryEpoch int64  `json:"primary_epoch"`
}
type Source struct {
	Origin    string   `json:"origin"`
	Binding   *Binding `json:"binding,omitempty"`
	TaskID    string   `json:"task_id,omitempty"`
	AttemptID string   `json:"attempt_id,omitempty"`
	InputID   string   `json:"input_id,omitempty"`
}
type Blocker struct {
	Kind     string    `json:"kind"`
	Resource string    `json:"resource"`
	Owner    string    `json:"owner,omitempty"`
	Revision int64     `json:"revision"`
	Since    time.Time `json:"since"`
}
type WaitingRole struct {
	RoleID            string `json:"role_id"`
	OwnerTeamID       string `json:"owner_team_id"`
	OwnerRunID        string `json:"owner_run_id"`
	OwnershipRevision int64  `json:"ownership_revision"`
}
type Run struct {
	ID               string               `json:"run_id"`
	TeamID           string               `json:"team_id"`
	Goal             string               `json:"goal"`
	Source           Source               `json:"source"`
	Config           project.TeamSnapshot `json:"config_snapshot"`
	Leader           Binding              `json:"leader"`
	QueueSeq         int64                `json:"queue_seq"`
	Admitted         bool                 `json:"admitted"`
	Phase            string               `json:"phase"`
	Revision         int64                `json:"revision"`
	Cleanup          string               `json:"cleanup_state"`
	RecoveryHold     bool                 `json:"recovery_hold"`
	Blockers         []Blocker            `json:"blockers"`
	WaitingRoles     []WaitingRole        `json:"waiting_roles"`
	Guidance         []string             `json:"guidance"`
	CompletionIntent int64                `json:"completion_intent,omitempty"`
	LeaderRevision   int64                `json:"leader_revision"`
	CreatedAt        time.Time            `json:"created_at"`
}
type Dependency struct {
	TaskID    string `json:"task_id"`
	Condition string `json:"condition"`
}
type Contract struct {
	AcceptanceCriteria json.RawMessage           `json:"acceptance_criteria,omitempty"`
	GuidanceCount      int                       `json:"guidance_count,omitempty"`
	ReworkOf           string                    `json:"rework_of,omitempty"`
	SupersededBy       string                    `json:"superseded_by,omitempty"`
	ID                 string                    `json:"task_id"`
	Scope              string                    `json:"scope"`
	TeamID             *string                   `json:"team_id"`
	RunID              *string                   `json:"run_id"`
	RoleID             string                    `json:"role_id"`
	Kind               string                    `json:"kind"`
	Goal               string                    `json:"goal"`
	GoalRevision       int64                     `json:"goal_revision"`
	AppliedRevision    int64                     `json:"applied_revision"`
	Revision           int64                     `json:"revision"`
	State              string                    `json:"state"`
	Accepted           bool                      `json:"accepted"`
	Source             Source                    `json:"source"`
	RootID             string                    `json:"root_id"`
	ParentID           string                    `json:"parent_id,omitempty"`
	Depth              int                       `json:"depth"`
	Target             *Binding                  `json:"expected_target"`
	Dependencies       []Dependency              `json:"dependencies"`
	Refs               []project.ResultRef       `json:"refs"`
	ExpectedOutput     json.RawMessage           `json:"expected_output"`
	AcceptancePolicy   *project.AcceptancePolicy `json:"acceptance_policy"`
	AllowedTools       []string                  `json:"allowed_tools"`
	WriteSet           []string                  `json:"write_set"`
	DeadlineAt         time.Time                 `json:"deadline_at"`
	Policy             project.Policy            `json:"policy"`
	Blockers           []Blocker                 `json:"blockers"`
	AttemptIDs         []string                  `json:"attempt_ids"`
	Amendments         []string                  `json:"amendments"`
	Result             *Result                   `json:"result,omitempty"`
	Acceptance         *Acceptance               `json:"acceptance,omitempty"`
	CreatedAt          time.Time                 `json:"created_at"`
}
type Context struct {
	Role             project.Role `json:"role"`
	TeamInstructions string       `json:"team_instructions"`
	ConfigHash       string       `json:"config_hash"`
	AllowedTools     []string     `json:"allowed_tools"`
	WriteSet         []string     `json:"write_set"`
}
type Attempt struct {
	Mode              string    `json:"segment_mode,omitempty"`
	ClarificationID   string    `json:"clarification_id,omitempty"`
	ClarificationText string    `json:"clarification_text,omitempty"`
	ID                string    `json:"attempt_id"`
	TaskID            string    `json:"task_id"`
	Number            int       `json:"attempt_no"`
	RetryOf           string    `json:"retry_of,omitempty"`
	State             string    `json:"state"`
	Cleanup           string    `json:"cleanup_state"`
	Target            Binding   `json:"target"`
	Context           Context   `json:"context"`
	Segment           int64     `json:"segment_id"`
	ControllerEpoch   int64     `json:"controller_epoch"`
	FencingToken      int64     `json:"fencing_token"`
	LeaseExpiresAt    time.Time `json:"lease_expires_at"`
	Receipt           string    `json:"receipt"`
	YieldRequested    bool      `json:"yield_requested"`
	ResultProposed    *Result   `json:"result_proposed,omitempty"`
	Error             string    `json:"error,omitempty"`
	Revision          int64     `json:"revision"`
}
type Artifact struct {
	Length int64  `json:"length"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}
type Result struct {
	Revision     int64               `json:"revision"`
	GoalRevision int64               `json:"goal_revision"`
	AttemptID    string              `json:"attempt_id"`
	AgentID      string              `json:"agent_id"`
	Value        json.RawMessage     `json:"value"`
	Artifacts    []Artifact          `json:"artifacts"`
	Refs         []project.ResultRef `json:"refs"`
	Hash         string              `json:"hash"`
}
type Acceptance struct {
	Decision     string              `json:"decision"`
	Mode         string              `json:"mode"`
	ResultHash   string              `json:"result_hash"`
	GoalRevision int64               `json:"goal_revision"`
	ReviewerID   string              `json:"reviewer_id,omitempty"`
	CoveredBy    string              `json:"covered_by,omitempty"`
	Reason       string              `json:"reason"`
	Evidence     []project.ResultRef `json:"evidence"`
}
type Event struct {
	Seq      int64           `json:"seq"`
	Type     string          `json:"type"`
	EntityID string          `json:"entity_id"`
	Revision int64           `json:"revision"`
	Time     time.Time       `json:"server_time"`
	Details  json.RawMessage `json:"details"`
}

func Terminal(state string) bool {
	return state == "completed" || state == "failed" || state == "cancelled" || state == "interrupted"
}
func SameBinding(a, b Binding) bool { return a == b }
func ValidateContract(c Contract) error {
	if c.ID == "" || c.RootID == "" || c.Goal == "" || c.Revision < 1 || c.GoalRevision < 1 || c.Depth < 0 || c.DeadlineAt.IsZero() {
		return Reject("INVALID_TASK", "missing contract fields")
	}
	if c.Scope == "team" {
		if c.TeamID == nil || c.RunID == nil {
			return Reject("INVALID_SCOPE", "Team requires team/run")
		}
	} else if c.Scope != "standalone" || c.TeamID != nil || c.RunID != nil {
		return Reject("INVALID_SCOPE", "standalone has null team/run")
	}
	switch c.Kind {
	case "execute", "review", "rework", "ask", "leader_step":
	default:
		return fmt.Errorf("invalid task kind %s", c.Kind)
	}
	if c.Accepted && c.Target == nil {
		return Reject("INVALID_BINDING", "accepted task needs target")
	}
	return nil
}
