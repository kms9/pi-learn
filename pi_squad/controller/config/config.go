package config

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

const (
	DefaultListen  = "127.0.0.1:0"
	DefaultDB      = ""
	DefaultTimeout = 15 * time.Second
	DefaultURL     = ""
)

// Config is the controller process configuration.
// URL is only for Resty clients. Serve listens on Listen.
type Config struct {
	Listen           string
	DB               string
	HeartbeatTimeout time.Duration
	URL              string
	ProjectRoot      string
	MaxParallelTasks int
	LeaseTTL         time.Duration
	DirectCallers    []string
	DirectTargets    []string
	DirectTools      []string
}

// Load applies flag > env > config file > default.
// A flag counts only when the user set it, so a zero default cannot mask env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix("PI_SQUAD")
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()
	if err := v.BindEnv("url", "PI_SQUAD_CONTROLLER_URL"); err != nil {
		return Config{}, err
	}
	v.SetDefault("listen", DefaultListen)
	v.SetDefault("db", DefaultDB)
	v.SetDefault("heartbeat-timeout", DefaultTimeout.String())
	v.SetDefault("url", DefaultURL)
	v.SetDefault("project-root", "")
	v.SetDefault("max-parallel-tasks", 2)
	v.SetDefault("lease-ttl", "30s")
	v.SetDefault("direct.allowed_tools", []string{"read", "grep", "find", "ls"})

	file, err := cmd.Flags().GetString("config")
	if err != nil {
		return Config{}, err
	}
	if strings.TrimSpace(file) != "" {
		v.SetConfigFile(file)
		if err := v.ReadInConfig(); err != nil {
			return Config{}, fmt.Errorf("read config: %w", err)
		}
	}
	if err := applyChangedFlags(cmd, v); err != nil {
		return Config{}, err
	}

	timeout := v.GetDuration("heartbeat-timeout")
	if timeout <= 0 {
		return Config{}, fmt.Errorf("heartbeat-timeout must be positive")
	}
	listen := strings.TrimSpace(v.GetString("listen"))
	if listen == "" {
		listen = DefaultListen
	}
	db := strings.TrimSpace(v.GetString("db"))
	if db == "" {
		db = DefaultDB
	}
	url := strings.TrimRight(strings.TrimSpace(v.GetString("url")), "/")
	if url == "" {
		url = DefaultURL
	}
	// Viper GetInt silently truncates fractional JSON/YAML numbers. Parse the
	// merged value exactly so file, environment and flag inputs share the same
	// positive-integer capacity contract.
	capacity, err := strconv.Atoi(fmt.Sprint(v.Get("max-parallel-tasks")))
	if err != nil || capacity < 1 {
		return Config{}, fmt.Errorf("max-parallel-tasks must be a positive integer")
	}
	if v.GetDuration("lease-ttl") <= 0 {
		return Config{}, fmt.Errorf("lease-ttl must be positive")
	}
	for _, key := range []string{"direct.allowed_callers", "direct.allowed_targets"} {
		seen := map[string]bool{}
		for _, id := range v.GetStringSlice(key) {
			if !project.ValidID(id) || seen[id] {
				return Config{}, fmt.Errorf("invalid or duplicate %s entry: %s", key, id)
			}
			seen[id] = true
		}
	}
	for _, tool := range v.GetStringSlice("direct.allowed_tools") {
		if tool != "read" && tool != "grep" && tool != "find" && tool != "ls" {
			return Config{}, fmt.Errorf("standalone tool must be read-only: %s", tool)
		}
	}
	return Config{
		ProjectRoot: v.GetString("project-root"), MaxParallelTasks: capacity, LeaseTTL: v.GetDuration("lease-ttl"), DirectCallers: v.GetStringSlice("direct.allowed_callers"), DirectTargets: v.GetStringSlice("direct.allowed_targets"), DirectTools: v.GetStringSlice("direct.allowed_tools"),
		Listen:           listen,
		DB:               db,
		HeartbeatTimeout: timeout,
		URL:              url,
	}, nil
}

func applyChangedFlags(cmd *cobra.Command, v *viper.Viper) error {
	for _, name := range []string{"project-root", "max-parallel-tasks", "lease-ttl"} {
		if f := cmd.Flags().Lookup(name); f != nil && f.Changed {
			v.Set(name, f.Value.String())
		}
	}
	if cmd.Flags().Changed("listen") {
		value, err := cmd.Flags().GetString("listen")
		if err != nil {
			return err
		}
		v.Set("listen", value)
	}
	if cmd.Flags().Changed("db") {
		value, err := cmd.Flags().GetString("db")
		if err != nil {
			return err
		}
		v.Set("db", value)
	}
	if cmd.Flags().Changed("heartbeat-timeout") {
		value, err := cmd.Flags().GetDuration("heartbeat-timeout")
		if err != nil {
			return err
		}
		v.Set("heartbeat-timeout", value.String())
	}
	if cmd.Flags().Changed("url") {
		value, err := cmd.Flags().GetString("url")
		if err != nil {
			return err
		}
		v.Set("url", value)
	}
	return nil
}
