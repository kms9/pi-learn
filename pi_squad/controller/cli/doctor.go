package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"

	"github.com/kms9/pi-learn/pi_squad/controller/config"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
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
		capabilities := project.InspectCapabilities()
		d, discoveryErr := project.ReadDiscovery(root)
		report := map[string]any{"protocol_version": project.Protocol, "go_version": runtime.Version(), "project_root": root, "config_hash": snap.Hash, "roles": len(snap.Roles), "teams": len(snap.Teams), "pi_runtime_probe": "NOT_RUN", "formal_execution_ready": false, "capabilities": capabilities}
		report["configured_timing"] = project.Timing(cfg.HeartbeatTimeout, cfg.LeaseTTL)
		probePath, _ := cmd.Flags().GetString("probe-file")
		if probePath != "" {
			probe, err := project.ReadProbe(probePath, capabilities.PiVersion)
			if err != nil {
				return err
			}
			report["pi_runtime_probe"] = probe
			report["formal_execution_ready"] = probe["core_runtime_observed"] == true && len(capabilities.Errors) == 0
		}
		if discoveryErr != nil {
			report["discovery_error"] = discoveryErr.Error()
		} else {
			report["discovery"] = d
		}
		return printJSON(cmd, report)
	}}
	command.Flags().String("probe-file", "", "redacted report saved by the real Pi integration probe")
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
