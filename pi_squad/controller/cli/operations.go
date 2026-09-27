package cli

import (
	"fmt"
	"net/url"
	"os"

	"github.com/kms9/pi-learn/pi_squad/controller/client"
	"github.com/kms9/pi-learn/pi_squad/controller/config"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/spf13/cobra"
)

func projectClient(cmd *cobra.Command) (*client.ProjectClient, error) {
	cfg, err := config.Load(cmd)
	if err != nil {
		return nil, err
	}
	cwd := cfg.ProjectRoot
	if cwd == "" {
		cwd, err = os.Getwd()
		if err != nil {
			return nil, err
		}
	}
	return client.Connect(cmd.Context(), cwd, cfg.URL)
}
func newSnapshotCommand() *cobra.Command {
	return &cobra.Command{Use: "snapshot", Short: "Read a consistent Project snapshot", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		snap, err := c.Snapshot(cmd.Context())
		if err != nil {
			return err
		}
		return printJSON(cmd, snap)
	}}
}
func newRunCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "run <team-id> <goal>", Short: "Explicitly create a Team Run", Args: cobra.ExactArgs(2), RunE: func(cmd *cobra.Command, args []string) error {
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		request, _ := cmd.Flags().GetString("request-id")
		if request == "" {
			request, err = project.RandomID("request-")
			if err != nil {
				return err
			}
		}
		workflow, _ := cmd.Flags().GetString("workflow")
		var out any
		if err := c.Operator(cmd.Context(), "/v2/runs", scheduler.CreateRun{RequestID: request, TeamID: args[0], Goal: args[1], WorkflowID: workflow}, &out); err != nil {
			return fmt.Errorf("request_id=%s: %w", request, err)
		}
		return printJSON(cmd, out)
	}}
	cmd.Flags().String("request-id", "", "stable request ID for safe replay")
	cmd.Flags().String("workflow", "", "explicit workflow ID")
	return cmd
}
func newOperationCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "operate <agent|run|task|attempt|role|leader> <id> <operation>", Short: "Submit an explicit revision-checked Project operator action", Args: cobra.ExactArgs(3), RunE: func(cmd *cobra.Command, args []string) error {
		kind, id, op := args[0], args[1], args[2]
		if err := scheduler.ValidateOperationName(kind, op); err != nil {
			return err
		}
		paths := map[string]string{"agent": "agents", "run": "runs", "task": "tasks", "attempt": "attempts", "role": "roles", "leader": "teams"}
		plural, ok := paths[kind]
		if !ok {
			return fmt.Errorf("invalid target kind")
		}
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		q := scheduler.Operation{}
		q.RequestID, _ = cmd.Flags().GetString("request-id")
		if q.RequestID == "" {
			q.RequestID, err = project.RandomID("request-")
			if err != nil {
				return err
			}
		}
		q.ExpectedRevision, _ = cmd.Flags().GetInt64("expected-revision")
		q.ExpectedRuntime, _ = cmd.Flags().GetString("expected-runtime")
		q.AgentID, _ = cmd.Flags().GetString("agent-id")
		q.Note, _ = cmd.Flags().GetString("note")
		q.Evidence, _ = cmd.Flags().GetString("evidence")
		q.ResultHash, _ = cmd.Flags().GetString("result-hash")
		q.RebindCurrent, _ = cmd.Flags().GetBool("rebind-current")
		q.ConfirmStopped, _ = cmd.Flags().GetBool("confirm-stopped")
		route := "/v2/" + plural + "/" + url.PathEscape(id) + "/" + url.PathEscape(op)
		if kind == "leader" {
			route = "/v2/teams/" + url.PathEscape(id) + "/leader/" + url.PathEscape(op)
		}
		preview, _ := cmd.Flags().GetBool("preview")
		if preview {
			return printJSON(cmd, map[string]any{"method": "POST", "path": route, "body": q, "submitted": false})
		}
		var out any
		if err := c.Operator(cmd.Context(), route, q, &out); err != nil {
			return fmt.Errorf("request_id=%s: %w", q.RequestID, err)
		}
		return printJSON(cmd, out)
	}}
	cmd.Flags().String("request-id", "", "stable request ID")
	cmd.Flags().Int64("expected-revision", 0, "required current target revision")
	cmd.Flags().String("expected-runtime", "", "exact previous runtime ID")
	cmd.Flags().String("agent-id", "", "promotion target Agent")
	cmd.Flags().String("note", "", "reason and side-effect disposition")
	cmd.Flags().String("evidence", "", "evidence reference")
	cmd.Flags().String("result-hash", "", "exact result hash for acceptance")
	cmd.Flags().Bool("rebind-current", false, "explicitly use the current target binding")
	cmd.Flags().Bool("confirm-stopped", false, "attest execution and related subprocesses have stopped")
	cmd.Flags().Bool("preview", false, "print request without sending or mutating")
	_ = cmd.MarkFlagRequired("expected-revision")
	return cmd
}
