package cli

import (
	"fmt"
	"net/url"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/spf13/cobra"
)

func newAgentsCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "agents", Short: "Inspect the discovered Project controller"}
	cmd.AddCommand(newAgentsListCommand(), newAgentsGetCommand(), newAgentsReleaseCommand())
	return cmd
}
func newAgentsListCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "list", Short: "List agents from one consistent snapshot", RunE: func(cmd *cobra.Command, _ []string) error {
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		snapshot, err := c.Snapshot(cmd.Context())
		if err != nil {
			return err
		}
		id, _ := cmd.Flags().GetString("agent-id")
		role, _ := cmd.Flags().GetString("role")
		team, _ := cmd.Flags().GetString("squad-id")
		presence, _ := cmd.Flags().GetString("status")
		agents := []map[string]any{}
		for _, a := range snapshot.Views["agents"] {
			binding, _ := a["binding"].(map[string]any)
			if id != "" && binding["agent_id"] != id {
				continue
			}
			if role != "" && a["role_id"] != role {
				continue
			}
			if team != "" && a["team_id"] != team {
				continue
			}
			if presence != "" && a["presence"] != presence {
				continue
			}
			agents = append(agents, a)
		}
		return printJSON(cmd, map[string]any{"agents": agents, "revision": snapshot.Revision, "observed_at": snapshot.ObservedAt, "controller_epoch": snapshot.Epoch})
	}}
	cmd.Flags().String("agent-id", "", "exact agent_id")
	cmd.Flags().String("role", "", "Role ID")
	cmd.Flags().String("squad-id", "", "Team ID (Leader instances)")
	cmd.Flags().String("status", "", "online, suspect, or offline")
	return cmd
}
func newAgentsGetCommand() *cobra.Command {
	return &cobra.Command{Use: "get <agent-id>", Short: "Read one current Agent binding", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		snapshot, err := c.Snapshot(cmd.Context())
		if err != nil {
			return err
		}
		for _, a := range snapshot.Views["agents"] {
			binding, _ := a["binding"].(map[string]any)
			if binding["agent_id"] == args[0] {
				return printJSON(cmd, a)
			}
		}
		return fmt.Errorf("AGENT_NOT_FOUND: %s", args[0])
	}}
}
func newAgentsReleaseCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "release <agent-id>", Short: "Explicitly release an exact runtime after cleanup", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		c, err := projectClient(cmd)
		if err != nil {
			return err
		}
		runtime, _ := cmd.Flags().GetString("expected-runtime-id")
		revision, _ := cmd.Flags().GetInt64("expected-revision")
		note, _ := cmd.Flags().GetString("note")
		request, err := project.RandomID("request-")
		if err != nil {
			return err
		}
		q := scheduler.Operation{RequestID: request, ExpectedRuntime: runtime, ExpectedRevision: revision, Note: note}
		preview, _ := cmd.Flags().GetBool("preview")
		route := "/v2/agents/" + url.PathEscape(args[0]) + "/release"
		if preview {
			return printJSON(cmd, map[string]any{"path": route, "body": q, "submitted": false})
		}
		var out any
		if err := c.Operator(cmd.Context(), route, q, &out); err != nil {
			return err
		}
		return printJSON(cmd, out)
	}}
	cmd.Flags().String("expected-runtime-id", "", "exact current runtime ID")
	cmd.Flags().Int64("expected-revision", 0, "current binding_epoch")
	cmd.Flags().String("note", "", "reason for release")
	cmd.Flags().Bool("preview", false, "print request without sending")
	_ = cmd.MarkFlagRequired("expected-runtime-id")
	_ = cmd.MarkFlagRequired("expected-revision")
	_ = cmd.MarkFlagRequired("note")
	return cmd
}
