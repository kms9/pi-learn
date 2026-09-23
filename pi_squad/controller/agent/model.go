package agent

import "time"

const (
	StatusOnline  = "online"
	StatusOffline = "offline"
	RuntimePi     = "pi"
)

// Agent is the P0 registry record. Identity is agent_id; process/session
// fields are attributes and may be empty when Herdr/Pi cannot supply them.
type Agent struct {
	AgentID          string    `json:"agent_id"`
	Role             string    `json:"role"`
	SquadID          string    `json:"squad_id"`
	RuntimeType      string    `json:"runtime_type"`
	HerdrSessionID   string    `json:"herdr_session_id,omitempty"`
	SpaceID          string    `json:"space_id,omitempty"`
	PaneID           string    `json:"pane_id,omitempty"`
	RuntimeSessionID string    `json:"runtime_session_id,omitempty"`
	Status           string    `json:"status"`
	LastSeen         time.Time `json:"last_seen"`
}

// RegisterRequest is the body of POST /agents/register.
type RegisterRequest struct {
	AgentID          string `json:"agent_id"`
	Role             string `json:"role"`
	SquadID          string `json:"squad_id"`
	RuntimeType      string `json:"runtime_type"`
	HerdrSessionID   string `json:"herdr_session_id"`
	SpaceID          string `json:"space_id"`
	PaneID           string `json:"pane_id"`
	RuntimeSessionID string `json:"runtime_session_id"`
}

// HeartbeatRequest is the body of POST /agents/heartbeat.
type HeartbeatRequest struct {
	AgentID          string `json:"agent_id"`
	RuntimeSessionID string `json:"runtime_session_id"`
}

// ListFilter is optional GET /agents query criteria.
type ListFilter struct {
	AgentID string
	Role    string
	SquadID string
	Status  string
}
