package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound = errors.New("agent not found")
	ErrInvalid  = errors.New("invalid request")
)

type Service struct {
	reg *Registry
}

func NewService(reg *Registry) *Service {
	return &Service{reg: reg}
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (Agent, error) {
	req.AgentID = strings.TrimSpace(req.AgentID)
	req.Role = strings.TrimSpace(req.Role)
	req.SquadID = strings.TrimSpace(req.SquadID)
	req.RuntimeType = strings.TrimSpace(req.RuntimeType)
	req.HerdrSessionID = strings.TrimSpace(req.HerdrSessionID)
	req.SpaceID = strings.TrimSpace(req.SpaceID)
	req.PaneID = strings.TrimSpace(req.PaneID)
	req.RuntimeSessionID = strings.TrimSpace(req.RuntimeSessionID)

	if req.AgentID == "" || req.Role == "" || req.SquadID == "" {
		return Agent{}, fmt.Errorf("%w: agent_id, role, and squad_id are required", ErrInvalid)
	}
	if req.RuntimeType == "" {
		req.RuntimeType = RuntimePi
	}
	return s.reg.Upsert(ctx, req)
}

func (s *Service) Heartbeat(ctx context.Context, req HeartbeatRequest) (Agent, error) {
	req.AgentID = strings.TrimSpace(req.AgentID)
	req.RuntimeSessionID = strings.TrimSpace(req.RuntimeSessionID)
	if req.AgentID == "" {
		return Agent{}, fmt.Errorf("%w: agent_id is required", ErrInvalid)
	}
	return s.reg.Heartbeat(ctx, req)
}

func (s *Service) Get(ctx context.Context, agentID string) (Agent, error) {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return Agent{}, fmt.Errorf("%w: agent_id is required", ErrInvalid)
	}
	return s.reg.Get(ctx, agentID)
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]Agent, error) {
	filter.AgentID = strings.TrimSpace(filter.AgentID)
	filter.Role = strings.TrimSpace(filter.Role)
	filter.SquadID = strings.TrimSpace(filter.SquadID)
	filter.Status = strings.TrimSpace(filter.Status)
	if filter.Status != "" && filter.Status != StatusOnline && filter.Status != StatusOffline {
		return nil, fmt.Errorf("%w: status must be online or offline", ErrInvalid)
	}
	return s.reg.List(ctx, filter)
}
