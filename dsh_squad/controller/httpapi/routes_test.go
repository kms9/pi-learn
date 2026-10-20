package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kms9/pi-learn/dsh_squad/controller/agent"
	"github.com/kms9/pi-learn/dsh_squad/controller/httpapi"
	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/scheduler"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// Every operator operation the scheduler knows has its route: the page's Retry called
// task restart and got a 404 while the two lists differed.
func TestEveryOperationHasARoute(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	write := func(rel, body string) {
		path := filepath.Join(root, ".agents/dshsquad", rel)
		_ = os.MkdirAll(filepath.Dir(path), 0o755)
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("roles/builder/role.md", "---\nname: builder\ndescription: builds\n---\nYou build.\n")
	write("roles/builder/agents.md", "Care.\n")
	write("teams/math/team.json", `{"schema_version":1,"team_id":"math","config_version":1,"leader":{"agent_ref":"chief"},"members":[{"role_ref":"builder","responsibility":"b"}],"instructions_file":"instructions.md","policy":{"run_admission":"fifo_single_active","max_parallel_tasks":1,"max_delegate_depth":1,"max_total_tasks":5,"max_attempts_per_task":2,"allowed_tools":["read"],"writable_roots":[],"acceptance_policy":{"mode":"human","child_policy":"separate"}}}`)
	write("teams/math/instructions.md", "Do.\n")
	snap, err := project.Load(root)
	if err != nil {
		t.Fatal(err)
	}
	reg, err := agent.OpenRegistry(filepath.Join(t.TempDir(), "state.sqlite"), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reg.Close() })
	const token = "operator-token-0123456789abcdef0123456789"
	team, err := scheduler.New(t.Context(), task.NewStore(reg.Database()), snap, scheduler.Config{MaxParallel: 1, HeartbeatTimeout: time.Hour, LeaseTTL: time.Hour}, token)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpapi.NewTeam(agent.NewService(reg), team, project.Discovery{ControllerID: "ctl-test", ProtocolVersion: project.Protocol}).Handler())
	defer srv.Close()
	for kind, ops := range scheduler.Operations {
		for _, op := range ops {
			path := "/v2/" + kind + "s/nothing/" + op
			if kind == "leader" {
				path = "/v2/teams/nothing/leader/" + op
			}
			req, _ := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(`{"request_id":"r","expected_revision":1}`))
			req.Header.Set("content-type", "application/json")
			req.Header.Set("authorization", "Bearer "+token)
			req.Header.Set("x-squad-protocol", project.Protocol)
			req.Header.Set("x-squad-controller", "ctl-test")
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			if res.StatusCode == http.StatusNotFound && !strings.Contains(res.Header.Get("content-type"), "json") {
				t.Errorf("%s:%s has no route (%d)", kind, op, res.StatusCode)
			}
		}
	}
}
