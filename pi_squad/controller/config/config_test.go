package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/cobra"

	"github.com/kms9/pi-learn/pi_squad/controller/config"
)

func TestFlagOverridesEnv(t *testing.T) {
	t.Setenv("PI_SQUAD_LISTEN", "127.0.0.1:1")
	t.Setenv("PI_SQUAD_DB", "from-env.sqlite")
	t.Setenv("PI_SQUAD_HEARTBEAT_TIMEOUT", "2s")
	t.Setenv("PI_SQUAD_CONTROLLER_URL", "http://127.0.0.1:9")

	cmd := testCommand(t)
	if err := cmd.ParseFlags([]string{"--listen", "127.0.0.1:18799", "--heartbeat-timeout", "3s"}); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(cmd)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Listen != "127.0.0.1:18799" || cfg.HeartbeatTimeout != 3*time.Second {
		t.Fatalf("flag should win: %+v", cfg)
	}
	if cfg.DB != "from-env.sqlite" || cfg.URL != "http://127.0.0.1:9" {
		t.Fatalf("unset flags should keep env: %+v", cfg)
	}
}

func TestConfigFileFillsDefaults(t *testing.T) {
	for _, key := range []string{"PI_SQUAD_LISTEN", "PI_SQUAD_DB", "PI_SQUAD_HEARTBEAT_TIMEOUT", "PI_SQUAD_CONTROLLER_URL"} {
		os.Unsetenv(key)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "controller.json")
	if err := os.WriteFile(path, []byte(`{"listen":"127.0.0.1:18080","db":"file.sqlite","heartbeat-timeout":"4s","url":"http://127.0.0.1:18080"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := testCommand(t)
	if err := cmd.ParseFlags([]string{"--config", path}); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(cmd)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Listen != "127.0.0.1:18080" || cfg.DB != "file.sqlite" || cfg.HeartbeatTimeout != 4*time.Second || cfg.URL != "http://127.0.0.1:18080" {
		t.Fatalf("config file: %+v", cfg)
	}
}

func testCommand(t *testing.T) *cobra.Command {
	t.Helper()
	cmd := &cobra.Command{Use: "controller"}
	cmd.Flags().String("config", "", "")
	cmd.Flags().String("listen", "", "")
	cmd.Flags().String("db", "", "")
	cmd.Flags().Duration("heartbeat-timeout", 0, "")
	cmd.Flags().String("url", "", "")
	return cmd
}
