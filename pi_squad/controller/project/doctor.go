package project

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type CapabilityReport struct {
	GoVersion    string          `json:"go_version"`
	NodeVersion  string          `json:"node_version"`
	PiVersion    string          `json:"pi_version"`
	SourceCommit string          `json:"source_commit"`
	Declared     map[string]bool `json:"declared_capabilities"`
	RuntimeProbe string          `json:"runtime_probe"`
	Errors       []string        `json:"errors"`
}

func InspectCapabilities() CapabilityReport {
	r := CapabilityReport{GoVersion: runtime.Version(), NodeVersion: "unknown", PiVersion: "unknown", SourceCommit: "unknown", Declared: map[string]bool{}, RuntimeProbe: "NOT_RUN", Errors: []string{}}
	if b, err := exec.Command("node", "--version").Output(); err == nil {
		r.NodeVersion = strings.TrimSpace(string(b))
	} else {
		r.Errors = append(r.Errors, "Node version unavailable")
	}
	bin, err := exec.LookPath("pi")
	if err != nil {
		r.Errors = append(r.Errors, "Pi executable not found")
		return r
	}
	resolved, err := filepath.EvalSymlinks(bin)
	if err != nil {
		r.Errors = append(r.Errors, err.Error())
		return r
	}
	dir := filepath.Dir(resolved)
	for {
		b, err := os.ReadFile(filepath.Join(dir, "package.json"))
		if err == nil {
			var p struct {
				Name    string `json:"name"`
				Version string `json:"version"`
				GitHead string `json:"gitHead"`
			}
			if json.Unmarshal(b, &p) == nil && p.Name == "@earendil-works/pi-coding-agent" {
				r.PiVersion = p.Version
				if p.GitHead != "" {
					r.SourceCommit = p.GitHead
				}
				break
			}
		}
		next := filepath.Dir(dir)
		if next == dir {
			r.Errors = append(r.Errors, "Pi package metadata not found; native bundle needs runtime probe")
			return r
		}
		dir = next
	}
	types, err := os.ReadFile(filepath.Join(dir, "dist/core/extensions/types.d.ts"))
	if err != nil {
		r.Errors = append(r.Errors, "Pi type declarations unavailable")
		return r
	}
	text := string(types)
	for _, name := range []string{"systemPromptOptions", "before_provider_request", "agent_settled", "agent_before_settle", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "user_bash", "ui_prompt_start", "ui_prompt_end", "addAutocompleteProvider", "expandPromptTemplates"} {
		r.Declared[name] = strings.Contains(text, name)
		if !r.Declared[name] {
			r.Errors = append(r.Errors, "CAPABILITY_UNAVAILABLE: "+name)
		}
	}
	return r
}
