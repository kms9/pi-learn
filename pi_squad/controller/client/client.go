package client

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/go-resty/resty/v2"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
)

// Client talks to a running controller. It does not open SQLite.
type Client struct {
	http *resty.Client
}

func New(baseURL string) *Client {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &Client{
		http: resty.New().
			SetBaseURL(base).
			SetHeader("Accept", "application/json"),
	}
}

func (c *Client) Health(ctx context.Context) error {
	resp, err := c.http.R().SetContext(ctx).Get("/health")
	if err != nil {
		return err
	}
	if resp.IsError() {
		return httpError(resp)
	}
	return nil
}

func (c *Client) List(ctx context.Context, filter agent.ListFilter) ([]agent.Agent, error) {
	query := url.Values{}
	if filter.AgentID != "" {
		query.Set("agent_id", filter.AgentID)
	}
	if filter.Role != "" {
		query.Set("role", filter.Role)
	}
	if filter.SquadID != "" {
		query.Set("squad_id", filter.SquadID)
	}
	if filter.Status != "" {
		query.Set("status", filter.Status)
	}
	var body struct {
		Agents []agent.Agent `json:"agents"`
	}
	resp, err := c.http.R().
		SetContext(ctx).
		SetQueryParamsFromValues(query).
		SetResult(&body).
		Get("/agents")
	if err != nil {
		return nil, err
	}
	if resp.IsError() {
		return nil, httpError(resp)
	}
	if body.Agents == nil {
		body.Agents = []agent.Agent{}
	}
	return body.Agents, nil
}

func (c *Client) Get(ctx context.Context, agentID string) (agent.Agent, error) {
	var body agent.Agent
	resp, err := c.http.R().
		SetContext(ctx).
		SetResult(&body).
		SetPathParam("id", agentID).
		Get("/agents/{id}")
	if err != nil {
		return agent.Agent{}, err
	}
	if resp.IsError() {
		return agent.Agent{}, httpError(resp)
	}
	return body, nil
}

func httpError(resp *resty.Response) error {
	return fmt.Errorf("controller HTTP %d: %s", resp.StatusCode(), strings.TrimSpace(resp.String()))
}
