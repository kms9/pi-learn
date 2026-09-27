package cli

import (
	"fmt"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/spf13/cobra"
	"net/url"
	"strings"
)

func newTaskCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "task <agent:id|role:id> <goal>", Short: "Explicitly create a standalone Task or Run handoff", Args: cobra.ExactArgs(2), RunE: func(cmd *cobra.Command, args []string) error {
		targetKind, target, ok := strings.Cut(args[0], ":")
		if !ok || (targetKind != "agent" && targetKind != "role") {
			return fmt.Errorf("explicit agent: or role: target required")
		}
		q := scheduler.CreateTask{Target: target, Goal: args[1]}
		q.RequestID, _ = cmd.Flags().GetString("request-id")
		q.RunID, _ = cmd.Flags().GetString("run")
		q.ParentID, _ = cmd.Flags().GetString("parent")
		q.Kind, _ = cmd.Flags().GetString("kind")
		q.WriteSet, _ = cmd.Flags().GetStringArray("write")
		q.ExpectedRevision, _ = cmd.Flags().GetInt64("expected-revision")
		if q.ParentID != "" && q.ExpectedRevision < 1 {
			return fmt.Errorf("parent requires --expected-revision")
		}
		if targetKind == "role" && q.RunID == "" && q.ParentID == "" {
			return fmt.Errorf("Role target requires --run or --parent")
		}
		var err error
		if q.RequestID == "" {
			q.RequestID, err = project.RandomID("request-")
			if err != nil {
				return err
			}
		}
		route := "/v2/tasks/direct"
		if q.RunID != "" {
			route = "/v2/runs/" + url.PathEscape(q.RunID) + "/handoffs"
		}
		if q.ParentID != "" {
			route = "/v2/tasks/" + url.PathEscape(q.ParentID) + "/children"
		}
		preview, _ := cmd.Flags().GetBool("preview")
		if preview {
			return printJSON(cmd, map[string]any{"path": route, "body": q, "submitted": false})
		}
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		var out any
		if err := c.Operator(cmd.Context(), route, q, &out); err != nil {
			return fmt.Errorf("request_id=%s: %w", q.RequestID, err)
		}
		return printJSON(cmd, out)
	}}
	cmd.Flags().String("request-id", "", "stable request ID for exact replay")
	cmd.Flags().String("run", "", "explicit Run ID")
	cmd.Flags().String("parent", "", "explicit parent Task ID")
	cmd.Flags().Int64("expected-revision", 0, "expected parent revision")
	cmd.Flags().String("kind", "execute", "execute, review, rework or ask")
	cmd.Flags().StringArray("write", nil, "explicit writable path; repeat for multiple paths")
	cmd.Flags().Bool("preview", false, "print without submission")
	return cmd
}
