package project

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// The only host this Controller schedules on: the pinned DSH release running the
// pinned ds-bot with the Squad seam patch (2026-10-19 D1, D9).
const (
	HostProfile  = "dsh/0.2.1-rc.2+ds-bot/ae63b45"
	DSHVersion   = "0.2.1-rc.2"
	DSBotVersion = "0.2.0"
	DSBotCommit  = "ae63b45"
)

type CapabilityReport struct {
	GoVersion    string   `json:"go_version"`
	NodeVersion  string   `json:"node_version"`
	DSHVersion   string   `json:"dsh_version"`
	DSHBinary    string   `json:"dsh_executable"`
	DSBotDir     string   `json:"ds_bot_dir"`
	DSBotVersion string   `json:"ds_bot_version"`
	SeamHash     string   `json:"seam_sha256"`
	ProfileID    string   `json:"profile_id"`
	RuntimeProbe string   `json:"runtime_probe"`
	Errors       []string `json:"errors"`
	Warnings     []string `json:"warnings"`
}

func versionOutput(bin string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, bin, "--version").Output()
}

// InspectCapabilities checks the DSH executable and the patched ds-bot directory the
// host loads. The runtime half (the adapter actually attached through the seam) is
// reported by the adapter when it registers, not here.
func InspectCapabilities(dshBinary, dsBotDir string) CapabilityReport {
	r := CapabilityReport{GoVersion: runtime.Version(), NodeVersion: "unknown", DSHVersion: "unknown", DSHBinary: "unknown", DSBotDir: dsBotDir, DSBotVersion: "unknown", SeamHash: "unknown", ProfileID: HostProfile, RuntimeProbe: "NOT_RUN", Errors: []string{}, Warnings: []string{}}
	if b, err := versionOutput("node"); err == nil {
		r.NodeVersion = strings.TrimSpace(string(b))
	} else {
		r.Errors = append(r.Errors, "Node unavailable")
	}
	if bin, err := exec.LookPath(dshBinary); err != nil {
		r.Errors = append(r.Errors, "DSH executable not found")
	} else {
		r.DSHBinary, _ = filepath.Abs(bin)
		if b, err := versionOutput(bin); err == nil {
			r.DSHVersion = strings.TrimSpace(string(b))
		} else {
			r.Errors = append(r.Errors, "dsh --version unavailable")
		}
		if r.DSHVersion != DSHVersion {
			r.Errors = append(r.Errors, "SQUAD_HOST_UNSUPPORTED: DSH "+r.DSHVersion+"; requires "+HostProfile)
		}
	}
	if dsBotDir == "" {
		r.Errors = append(r.Errors, "ds-bot directory not given")
		return r
	}
	b, err := os.ReadFile(filepath.Join(dsBotDir, "package.json"))
	if err != nil {
		r.Errors = append(r.Errors, "ds-bot package.json unavailable")
		return r
	}
	var p struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	}
	if json.Unmarshal(b, &p) != nil || p.Name != "ds-bot" {
		r.Errors = append(r.Errors, "not a ds-bot package")
		return r
	}
	r.DSBotVersion = p.Version
	if p.Version != DSBotVersion {
		r.Errors = append(r.Errors, "SQUAD_HOST_UNSUPPORTED: ds-bot "+p.Version+"; requires "+HostProfile)
	}
	seam, err := os.ReadFile(filepath.Join(dsBotDir, "src/host/seam.js"))
	if err != nil {
		r.Errors = append(r.Errors, "SEAM_MISSING: ds-bot is not patched (run dsh_squad/scripts/prepare-ds-bot.sh)")
		return r
	}
	digest := sha256.Sum256(seam)
	r.SeamHash = hex.EncodeToString(digest[:])
	return r
}
