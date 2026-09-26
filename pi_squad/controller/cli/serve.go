package cli

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/config"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func newServeCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "serve",
		Short: "Listen for register, heartbeat, and list requests",
		RunE:  serve,
	}
}

func serve(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(cmd)
	if err != nil {
		return fail(err)
	}
	absDB, err := filepath.Abs(cfg.DB)
	if err != nil {
		return fail(err)
	}
	if err := os.MkdirAll(filepath.Dir(absDB), 0o755); err != nil && !os.IsExist(err) {
		return fail(err)
	}
	reg, err := agent.OpenRegistry(absDB, cfg.HeartbeatTimeout)
	if err != nil {
		return fail(err)
	}
	defer reg.Close()

	addr := httpapi.SplitHostPortDefault(cfg.Listen)
	log.Printf("pi-squad controller listening on http://%s db=%s heartbeat-timeout=%s", addr, absDB, cfg.HeartbeatTimeout)
	log.Printf("dashboard is a separate read-only client: controller tui --url http://%s", addr)
	if err := http.ListenAndServe(addr, httpapi.New(agent.NewService(reg)).Handler()); err != nil {
		return fail(err)
	}
	return nil
}
