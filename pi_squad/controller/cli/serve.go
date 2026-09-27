package cli

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/config"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
	"github.com/spf13/cobra"
)

func newServeCommand() *cobra.Command {
	return &cobra.Command{Use: "serve", Short: "Serve the Project controller with an exclusive process lock", Args: cobra.NoArgs, RunE: serve}
}
func serve(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(cmd)
	if err != nil {
		return err
	}
	cwd := cfg.ProjectRoot
	if cwd == "" {
		cwd, err = os.Getwd()
		if err != nil {
			return err
		}
	}
	root, err := project.Discover(cwd)
	if err != nil {
		return err
	}
	snapshot, err := project.Load(root)
	if err != nil {
		return err
	}
	rt, err := project.Lock(root)
	if err != nil {
		return err
	}
	defer rt.Close()
	rotate, _ := cmd.Flags().GetBool("rotate-operator-token")
	token, err := rt.OperatorToken(rotate)
	if err != nil {
		return err
	}
	db := cfg.DB
	if db == "" {
		db = filepath.Join(rt.Directory, "state.sqlite")
	}
	absDB, err := filepath.Abs(db)
	if err != nil {
		return err
	}
	if err := project.CheckDatabaseVersion(cmd.Context(), absDB); err != nil {
		return err
	}
	reg, err := agent.OpenRegistry(absDB, cfg.HeartbeatTimeout)
	if err != nil {
		return err
	}
	defer reg.Close()
	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	team, err := scheduler.New(ctx, task.NewStore(reg.Database()), snapshot, scheduler.Config{MaxParallel: cfg.MaxParallelTasks, HeartbeatTimeout: cfg.HeartbeatTimeout, LeaseTTL: cfg.LeaseTTL, DirectCallers: cfg.DirectCallers, DirectTargets: cfg.DirectTargets, DirectTools: cfg.DirectTools}, token)
	if err != nil {
		return err
	}
	if rotate {
		if err := team.Store.Transaction(ctx, func(tx *sql.Tx) error {
			return task.EventTx(tx, "operator_credential_rotated", rt.Discovery.ControllerID, team.Epoch, map[string]string{"actor": "local_operator@startup", "token": "redacted"})
		}); err != nil {
			return err
		}
	}
	host, _, err := net.SplitHostPort(cfg.Listen)
	if err != nil || host != "127.0.0.1" {
		return fmt.Errorf("listen must be an explicit loopback 127.0.0.1 address")
	}
	ln, err := net.Listen("tcp", cfg.Listen)
	if err != nil {
		return err
	}
	defer ln.Close()
	endpoint := "http://" + ln.Addr().String()
	if err := rt.Publish(endpoint, team.Epoch); err != nil {
		return err
	}
	srv := &http.Server{Handler: httpapi.NewTeam(agent.NewService(reg), team, rt.Discovery).Handler(), ReadHeaderTimeout: 5 * time.Second}
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	log.Printf("pi-squad/2 project=%s endpoint=%s epoch=%d", root, endpoint, team.Epoch)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			return srv.Shutdown(shutdown)
		case err := <-done:
			if errors.Is(err, http.ErrServerClosed) {
				return nil
			}
			return err
		case <-ticker.C:
			if err := team.Tick(ctx); err != nil {
				log.Printf("scheduler transaction rolled back: %v", err)
			}
		}
	}
}
