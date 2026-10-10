package client

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/projection"
)

type ProjectClient struct {
	http      *resty.Client
	Discovery project.Discovery
	root      string
}

func Connect(ctx context.Context, cwd, override string) (*ProjectClient, error) {
	root, err := project.Discover(cwd)
	if err != nil {
		return nil, err
	}
	d, err := project.ReadDiscovery(root)
	if err != nil {
		return nil, err
	}
	endpoint := d.Endpoint
	if override != "" {
		endpoint = override
	}
	http := resty.New().SetBaseURL(strings.TrimRight(endpoint, "/")).SetTimeout(5*time.Second).SetHeader("Accept", "application/json").SetHeader("X-Pi-Squad-Protocol", project.Protocol).SetHeader("X-Pi-Squad-Controller", d.ControllerID)
	var health project.Discovery
	resp, err := http.R().SetContext(ctx).SetResult(&health).Get("/health")
	if err != nil {
		return nil, err
	}
	if resp.IsError() {
		return nil, httpError(resp)
	}
	if health.ProjectRoot != d.ProjectRoot || health.ProtocolVersion != d.ProtocolVersion || health.ControllerID != d.ControllerID || health.ControllerEpoch != d.ControllerEpoch {
		return nil, fmt.Errorf("CONTROLLER_IDENTITY_MISMATCH")
	}
	return &ProjectClient{http: http, Discovery: d, root: root}, nil
}
func (c *ProjectClient) Get(ctx context.Context, route string, out any) error {
	resp, err := c.http.R().SetContext(ctx).SetResult(out).Get(route)
	if err != nil {
		return err
	}
	if resp.IsError() {
		return httpError(resp)
	}
	return nil
}
func (c *ProjectClient) Snapshot(ctx context.Context) (projection.Snapshot, error) {
	var out projection.Snapshot
	err := c.Get(ctx, "/v2/snapshot", &out)
	if err == nil && out.Epoch != c.Discovery.ControllerEpoch {
		return out, fmt.Errorf("CONTROLLER_EPOCH_CHANGED: rediscover required")
	}
	return out, err
}
func (c *ProjectClient) Operator(ctx context.Context, route string, body, out any) error {
	p := filepath.Join(c.root, ".agents/pisquad/.runtime/operator.token")
	st, err := os.Lstat(p)
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() || st.Mode().Perm() != 0600 {
		return fmt.Errorf("operator token must be regular 0600")
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	resp, err := c.http.R().SetContext(ctx).SetAuthToken(strings.TrimSpace(string(b))).SetBody(body).SetResult(out).Post(route)
	if err != nil {
		return err
	}
	if resp.IsError() {
		return httpError(resp)
	}
	return nil
}

// Rediscover is read-only and creates a new client; in-flight readers keep their
// original epoch and cannot mutate the replacement client's handshake.
func (c *ProjectClient) Rediscover(ctx context.Context) (*ProjectClient, error) {
	return Connect(ctx, c.root, "")
}
