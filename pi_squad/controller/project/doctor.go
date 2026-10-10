package project

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const HostProfile = "pi-coding-agent/1.1.0"
const HostVersion = "1.1.0"

type CapabilityReport struct {
	GoVersion      string          `json:"go_version"`
	NodeVersion    string          `json:"node_version"`
	PiVersion      string          `json:"pi_version"`
	SourceCommit   string          `json:"source_commit"`
	Declared       map[string]bool `json:"declared_capabilities"`
	RuntimeProbe   string          `json:"runtime_probe"`
	Errors         []string        `json:"errors"`
	Warnings       []string        `json:"warnings"`
	ProfileID      string          `json:"profile_id"`
	Installation   string          `json:"installation_kind"`
	Executable     string          `json:"pi_executable"`
	ExecutableHash string          `json:"pi_executable_sha256"`
	Launcher       string          `json:"pi_launcher,omitempty"`
}

func InspectCapabilities() CapabilityReport {
	return InspectCapabilitiesFor("pi")
}

func versionOutput(bin string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, bin, "--version").Output()
}

func InspectCapabilitiesFor(binary string) CapabilityReport {
	r := CapabilityReport{GoVersion: runtime.Version(), NodeVersion: "unknown", PiVersion: "unknown", SourceCommit: "unknown", ProfileID: HostProfile, Installation: "unknown", Executable: "unknown", ExecutableHash: "unknown", Declared: map[string]bool{}, RuntimeProbe: "NOT_RUN", Errors: []string{}, Warnings: []string{}}
	if b, err := versionOutput("node"); err == nil {
		r.NodeVersion = strings.TrimSpace(string(b))
	} else {
		r.Warnings = append(r.Warnings, "Node version unavailable; relevant for npm installation")
	}
	bin, err := exec.LookPath(binary)
	if err != nil {
		r.Errors = append(r.Errors, "Pi executable not found")
		return r
	}
	resolved, err := filepath.EvalSymlinks(bin)
	if err != nil {
		r.Errors = append(r.Errors, err.Error())
		return r
	}
	r.Executable, err = filepath.Abs(resolved)
	if err != nil {
		r.Errors = append(r.Errors, err.Error())
		return r
	}
	entry, err := os.ReadFile(r.Executable)
	if err != nil {
		r.Errors = append(r.Errors, "Pi executable identity unavailable")
		return r
	}
	managed, err := resolveManagedPi(r.Executable, entry)
	if err != nil {
		r.Errors = append(r.Errors, "MANAGED_INSTALL_INVALID: "+err.Error())
		return r
	}
	if managed != nil {
		r.Launcher = r.Executable
		r.Executable = managed.entry
		resolved = managed.entry
		entry, err = os.ReadFile(r.Executable)
		if err != nil {
			r.Errors = append(r.Errors, "Pi managed executable identity unavailable")
			return r
		}
		if managed.nodeBin != "" {
			if b, err := versionOutput(filepath.Join(managed.nodeBin, "node")); err == nil {
				r.NodeVersion = strings.TrimSpace(string(b))
			} else {
				r.Errors = append(r.Errors, "Pi managed Node version unavailable")
			}
		}
	}
	digest := sha256.Sum256(entry)
	r.ExecutableHash = hex.EncodeToString(digest[:])
	nodeBin := ""
	if managed != nil {
		nodeBin = managed.nodeBin
	}
	if b, err := versionOutputWithNode(r.Executable, nodeBin); err == nil {
		r.PiVersion = strings.TrimSpace(string(b))
	} else {
		r.Errors = append(r.Errors, "Pi --version unavailable")
	}
	if managed != nil {
		b, err := versionOutput(r.Launcher)
		current, readErr := os.ReadFile(managed.versionFile)
		if err != nil || strings.TrimSpace(string(b)) != r.PiVersion || r.PiVersion != managed.version || readErr != nil || strings.TrimSpace(string(current)) != managed.version {
			r.Errors = append(r.Errors, "MANAGED_INSTALL_VERSION_MISMATCH: launcher, selected release and runtime must match")
		}
	}
	if r.PiVersion != HostVersion {
		r.Errors = append(r.Errors, "SQUAD_HOST_UNSUPPORTED: Pi "+r.PiVersion+"; requires "+HostProfile)
	}
	r.Installation = "executable"
	dir := filepath.Dir(resolved)
	packageDir := ""
	for {
		b, err := os.ReadFile(filepath.Join(dir, "package.json"))
		if err == nil {
			var p struct {
				Name    string `json:"name"`
				Version string `json:"version"`
				GitHead string `json:"gitHead"`
			}
			if json.Unmarshal(b, &p) == nil && p.Name == "@earendil-works/pi-coding-agent" {
				packageDir = dir
				r.Installation = "npm"
				if managed != nil {
					r.Installation = "managed"
				}
				if p.Version != r.PiVersion {
					r.Errors = append(r.Errors, "Pi CLI/package version mismatch")
				}
				if p.GitHead != "" {
					r.SourceCommit = p.GitHead
				}
				break
			}
		}
		next := filepath.Dir(dir)
		if next == dir {
			r.Warnings = append(r.Warnings, "Pi package metadata unavailable; executable installation requires runtime probe")
			break
		}
		dir = next
	}
	if packageDir == "" {
		if managed != nil {
			r.Errors = append(r.Errors, "MANAGED_INSTALL_INVALID: Pi package metadata unavailable")
		}
		return r
	}
	var major, minor, patch int
	if _, err := fmt.Sscanf(strings.TrimPrefix(r.NodeVersion, "v"), "%d.%d.%d", &major, &minor, &patch); err != nil || major < 22 || major == 22 && minor < 19 {
		r.Errors = append(r.Errors, "Node >=22.19.0 required for npm Pi")
	}
	types, err := os.ReadFile(filepath.Join(packageDir, "dist/core/extensions/types.d.ts"))
	if err != nil {
		r.Warnings = append(r.Warnings, "DECLARATIONS_UNAVAILABLE: optional diagnostic; runtime probe required")
		return r
	}
	text := string(types)
	for _, name := range []string{"systemPromptOptions", "context_with_system", "before_provider_request", "agent_settled", "agent_before_settle", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact_failed", "user_bash", "ui_prompt_start", "ui_prompt_end", "addAutocompleteProvider", "expandPromptTemplates", "parentToolCallId", "executionMode"} {
		r.Declared[name] = strings.Contains(text, name)
		if !r.Declared[name] {
			r.Warnings = append(r.Warnings, "DECLARATION_DIAGNOSTIC_MISSING: "+name)
		}
	}
	return r
}
