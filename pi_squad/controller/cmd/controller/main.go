package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/httpapi"
)

func main() {
	listen := flag.String("listen", envOr("PI_SQUAD_LISTEN", "127.0.0.1:18741"), "HTTP listen address")
	dbPath := flag.String("db", envOr("PI_SQUAD_DB", "pi_squad.sqlite"), "SQLite database path")
	timeout := flag.Duration("heartbeat-timeout", envDuration("PI_SQUAD_HEARTBEAT_TIMEOUT", 15*time.Second), "mark agent offline after this much silence")
	flag.Parse()

	absDB, err := filepath.Abs(*dbPath)
	if err != nil {
		log.Fatalf("db path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(absDB), 0o755); err != nil && !os.IsExist(err) {
		log.Fatalf("create db dir: %v", err)
	}

	reg, err := agent.OpenRegistry(absDB, *timeout)
	if err != nil {
		log.Fatalf("open registry: %v", err)
	}
	defer reg.Close()

	srv := httpapi.New(agent.NewService(reg))
	addr := httpapi.SplitHostPortDefault(*listen)
	log.Printf("pi-squad controller listening on http://%s db=%s heartbeat-timeout=%s", addr, absDB, timeout.String())
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		log.Fatalf("parse %s: %v", key, err)
	}
	return d
}
