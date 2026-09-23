package cli

import (
	"os"
	"strings"

	"github.com/spf13/cobra"
)

func Execute() error {
	root := newRoot()
	root.SetArgs(normalizeLegacyFlags(os.Args[1:]))
	return root.Execute()
}

// normalizeLegacyFlags keeps the previous stdlib flag invocation working.
// pflag treats -listen as a short cluster, not as --listen.
func normalizeLegacyFlags(args []string) []string {
	long := map[string]bool{
		"-config":            true,
		"-listen":            true,
		"-db":                true,
		"-heartbeat-timeout": true,
		"-url":               true,
	}
	out := make([]string, len(args))
	for i, arg := range args {
		name, value, hasValue := strings.Cut(arg, "=")
		if long[name] {
			name = "-" + name
			if hasValue {
				name += "=" + value
			}
		}
		out[i] = name
	}
	return out
}

func newRoot() *cobra.Command {
	root := &cobra.Command{
		Use:   "controller",
		Short: "Pi Squad controller",
		RunE:  serve,
	}
	root.PersistentFlags().String("config", "", "optional Viper config file")
	root.PersistentFlags().String("listen", "", "HTTP listen address")
	root.PersistentFlags().String("db", "", "SQLite database path")
	root.PersistentFlags().Duration("heartbeat-timeout", 0, "mark an agent offline after this much silence")
	root.PersistentFlags().String("url", "", "controller base URL for client commands")

	root.AddCommand(newServeCommand(), newAgentsCommand(), newTUICommand())
	return root
}

func fail(err error) error {
	return err
}
