package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"

	"github.com/kms9/pi-learn/dsh_squad/controller/config"
	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/spf13/cobra"
)

func printJSON(cmd *cobra.Command, v any) error {
	e := json.NewEncoder(cmd.OutOrStdout())
	e.SetIndent("", "  ")
	return e.Encode(v)
}
func newDoctorCommand() *cobra.Command {
	command := &cobra.Command{Use: "doctor", Short: "Validate project configuration without starting model work", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return err
		}
		cfg, err := config.Load(cmd)
		if err != nil {
			return err
		}
		if cfg.ProjectRoot != "" {
			cwd = cfg.ProjectRoot
		}
		root, err := project.Discover(cwd)
		if err != nil {
			return err
		}
		snap, err := project.Load(root)
		if err != nil {
			return err
		}
		dshBinary, _ := cmd.Flags().GetString("dsh-binary")
		dsBotDir, _ := cmd.Flags().GetString("ds-bot-dir")
		capabilities := project.InspectCapabilities(dshBinary, dsBotDir)
		d, discoveryErr := project.ReadDiscovery(root)
		report := map[string]any{"protocol_version": project.Protocol, "host_profile": project.HostProfile, "go_version": runtime.Version(), "project_root": root, "config_hash": snap.Hash, "roles": len(snap.Roles), "teams": len(snap.Teams), "capabilities": capabilities, "formal_execution_ready": len(capabilities.Errors) == 0}
		report["configured_timing"] = project.Timing(cfg.HeartbeatTimeout, cfg.LeaseTTL)
		if discoveryErr != nil {
			report["discovery_error"] = discoveryErr.Error()
		} else {
			report["discovery"] = d
		}
		return printJSON(cmd, report)
	}}
	command.Flags().String("dsh-binary", "dsh", "DSH executable the host runs")
	command.Flags().String("ds-bot-dir", "", "patched ds-bot directory the host loads (dsh_squad/.build/ds-bot)")
	return command
}
func newMigrationCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "migrate", Short: "Inspect explicit legacy migration without writing", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return err
		}
		cfg, err := config.Load(cmd)
		if err != nil {
			return err
		}
		if cfg.ProjectRoot != "" {
			cwd = cfg.ProjectRoot
		}
		db, _ := cmd.Flags().GetString("source-db")
		dry, _ := cmd.Flags().GetBool("dry-run")
		var plan project.MigrationPlan
		if dry {
			plan, err = project.PlanMigration(cwd, db)
		} else {
			mapping, _ := cmd.Flags().GetString("mapping")
			if mapping == "" {
				return fmt.Errorf("--mapping required; explicit JSON array of TeamSnapshot, [] for standalone")
			}
			raw, readErr := os.ReadFile(mapping)
			if readErr != nil {
				return readErr
			}
			var teams []project.TeamSnapshot
			if err := project.DecodeStrict(raw, &teams); err != nil {
				return err
			}
			stopped, _ := cmd.Flags().GetBool("confirm-old-writer-stopped")
			plan, err = project.ApplyMigration(cmd.Context(), cwd, db, teams, stopped)
		}
		if err != nil {
			return err
		}
		return printJSON(cmd, plan)
	}}
	cmd.Flags().String("mapping", "", "explicit TeamSnapshot JSON array; [] for standalone")
	cmd.Flags().Bool("confirm-old-writer-stopped", false, "operator confirms old Controller writer is stopped")
	cmd.Flags().String("source-db", "", "legacy SQLite path to include in the backup plan")
	cmd.Flags().Bool("dry-run", true, "read-only migration plan (no files are modified)")
	return cmd
}
