package cli

import (
	"context"
	"encoding/json"
	"os"

	"github.com/spf13/cobra"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/client"
	"github.com/kms9/pi-learn/pi_squad/controller/config"
)

func newAgentsCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agents",
		Short: "Read the running controller",
	}
	cmd.AddCommand(newAgentsListCommand(), newAgentsGetCommand(), newAgentsReleaseCommand())
	return cmd
}

func newAgentsListCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List agents as JSON",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.Load(cmd)
			if err != nil {
				return fail(err)
			}
			filter := agent.ListFilter{}
			filter.AgentID, _ = cmd.Flags().GetString("agent-id")
			filter.Role, _ = cmd.Flags().GetString("role")
			filter.SquadID, _ = cmd.Flags().GetString("squad-id")
			filter.Status, _ = cmd.Flags().GetString("status")
			agents, err := client.New(cfg.URL).List(context.Background(), filter)
			if err != nil {
				return fail(err)
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			if err := enc.Encode(map[string]any{"agents": agents}); err != nil {
				return fail(err)
			}
			return nil
		},
	}
	cmd.Flags().String("agent-id", "", "exact agent_id")
	cmd.Flags().String("role", "", "registry role")
	cmd.Flags().String("squad-id", "", "squad id")
	cmd.Flags().String("status", "", "online or offline")
	return cmd
}

func newAgentsGetCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "get <agent-id>",
		Short: "Print one agent as JSON",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load(cmd)
			if err != nil {
				return fail(err)
			}
			got, err := client.New(cfg.URL).Get(context.Background(), args[0])
			if err != nil {
				return fail(err)
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			if err := enc.Encode(got); err != nil {
				return fail(err)
			}
			return nil
		},
	}
}

func newAgentsReleaseCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "release <agent-id>", Short: "Explicitly revoke an expected runtime (does not stop Pi)", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load(cmd)
		if err != nil {
			return err
		}
		expected, _ := cmd.Flags().GetString("expected-runtime-id")
		return client.New(cfg.URL).Release(cmd.Context(), agent.ReleaseRequest{AgentID: args[0], ExpectedRuntimeID: expected})
	}}
	cmd.Flags().String("expected-runtime-id", "", "exact current UUID; empty only for legacy rows")
	_ = cmd.MarkFlagRequired("expected-runtime-id")
	return cmd
}
