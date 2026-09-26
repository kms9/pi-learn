package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

const (
	DefaultListen  = "127.0.0.1:18741"
	DefaultDB      = "pi_squad.sqlite"
	DefaultTimeout = 15 * time.Second
	DefaultURL     = "http://127.0.0.1:18741"
)

// Config is the controller process configuration.
// URL is only for Resty clients. Serve listens on Listen.
type Config struct {
	Listen           string
	DB               string
	HeartbeatTimeout time.Duration
	URL              string
}

// Load applies flag > env > config file > default.
// A flag counts only when the user set it, so a zero default cannot mask env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix("PI_SQUAD")
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	v.AutomaticEnv()
	if err := v.BindEnv("url", "PI_SQUAD_CONTROLLER_URL"); err != nil {
		return Config{}, err
	}
	v.SetDefault("listen", DefaultListen)
	v.SetDefault("db", DefaultDB)
	v.SetDefault("heartbeat-timeout", DefaultTimeout.String())
	v.SetDefault("url", DefaultURL)

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
	return Config{
		Listen:           listen,
		DB:               db,
		HeartbeatTimeout: timeout,
		URL:              url,
	}, nil
}

func applyChangedFlags(cmd *cobra.Command, v *viper.Viper) error {
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
