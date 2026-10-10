package project

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
)

type ProbeHost struct {
	ProfileID      string `json:"profile_id"`
	PiVersion      string `json:"pi_version"`
	Mode           string `json:"mode"`
	NodeVersion    string `json:"node_version"`
	Executable     string `json:"pi_executable"`
	ExecutableHash string `json:"pi_executable_sha256"`
}
type ProbeReport struct {
	SchemaVersion int       `json:"schema_version"`
	PiVersion     string    `json:"pi_version"`
	Host          ProbeHost `json:"host"`
	ObservedAt    string    `json:"observed_at"`
	Events        []struct {
		Seq     int             `json:"seq"`
		At      string          `json:"at"`
		Type    string          `json:"type"`
		Details json.RawMessage `json:"details"`
	} `json:"events"`
	Assertions json.RawMessage `json:"assertions"`
}
type probeContext struct {
	RequestSeq int               `json:"request_seq"`
	Identity   map[string]any    `json:"identity"`
	Sections   map[string]string `json:"section_hashes"`
	Tools      []string          `json:"tools"`
	Scope      string            `json:"observation_scope"`
	Status     string            `json:"status"`
	Hash       string            `json:"sha256"`
	Bytes      int               `json:"bytes"`
}

func validDigest(value string) bool {
	b, err := hex.DecodeString(value)
	return err == nil && len(b) == 32
}
func validContext(c probeContext) bool {
	if len(c.Identity) != 9 || len(c.Sections) > 64 || len(c.Tools) > 512 {
		return false
	}
	for _, name := range []string{"role_id", "team_id", "run_id", "task_id", "attempt_id", "segment_id", "role_hash", "working_hash", "config_hash"} {
		if _, ok := c.Identity[name]; !ok {
			return false
		}
	}
	for _, name := range []string{"task_id", "attempt_id"} {
		v, ok := c.Identity[name].(string)
		if !ok || v == "" || len(v) > 256 {
			return false
		}
	}
	segment, ok := c.Identity["segment_id"].(float64)
	if !ok || segment < 1 || segment != float64(int64(segment)) {
		return false
	}
	if !validDigest(c.Sections["pi_squad_task"]) || !validDigest(c.Sections["pi_squad_protocol"]) {
		return false
	}
	for name, digest := range c.Sections {
		if !strings.HasPrefix(name, "pi_squad_") || !validDigest(digest) {
			return false
		}
	}
	seen := map[string]bool{}
	for _, name := range c.Tools {
		if name == "" || len(name) > 256 || seen[name] {
			return false
		}
		seen[name] = true
	}
	return len(c.Tools) > 0
}
func sameContext(a, b probeContext) bool {
	x, y := append([]string{}, a.Tools...), append([]string{}, b.Tools...)
	sort.Strings(x)
	sort.Strings(y)
	return reflect.DeepEqual(a.Identity, b.Identity) && reflect.DeepEqual(a.Sections, b.Sections) && reflect.DeepEqual(x, y)
}

// Version-only callers can inspect reports, but cannot attest an installation.
func ReadProbe(path, installedVersion string) (map[string]any, error) {
	return readProbe(path, CapabilityReport{PiVersion: installedVersion, ProfileID: HostProfile}, false)
}
func ReadProbeForHost(path string, installed CapabilityReport) (map[string]any, error) {
	return readProbe(path, installed, true)
}
func readProbe(path string, installed CapabilityReport, matchHost bool) (map[string]any, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 4*1024*1024 {
		return nil, fmt.Errorf("invalid or oversized probe report")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var report ProbeReport
	if err := DecodeStrict(data, &report); err != nil {
		return nil, err
	}
	if report.SchemaVersion == 1 {
		return map[string]any{"source": path, "pi_version": report.PiVersion, "schema_version": 1, "core_runtime_observed": false, "diagnostic": "LEGACY_PROBE: collect schema 2 with the selected TUI installation", "scenario_acceptance": "NOT_EVALUATED"}, nil
	}
	if report.SchemaVersion != 2 {
		return nil, fmt.Errorf("unsupported probe schema; requires schema 2")
	}
	h := report.Host
	if report.PiVersion != installed.PiVersion || h.PiVersion != report.PiVersion || h.ProfileID != installed.ProfileID || h.ProfileID != HostProfile || h.PiVersion != HostVersion || h.Mode != "tui" {
		return nil, fmt.Errorf("probe profile/Pi version/mode mismatch")
	}
	if matchHost && (h.Executable != installed.Executable || h.ExecutableHash != installed.ExecutableHash || !validDigest(h.ExecutableHash)) {
		return nil, fmt.Errorf("probe Pi executable identity mismatch")
	}
	observed := map[string]int{}
	stage, inputSeq, last := 0, 0, 0
	var expected, canonical probeContext
	cycles := []map[string]any{}
	for _, event := range report.Events {
		if event.Seq <= last {
			return nil, fmt.Errorf("nonmonotonic probe sequence")
		}
		last = event.Seq
		observed[event.Type]++
		switch event.Type {
		case "session_start", "session_shutdown", "session_before_switch", "session_before_fork", "session_before_tree", "user_bash", "session_before_compact", "session_compact_failed":
			stage = 0
		case "session_tree":
			var d struct {
				Changed bool `json:"changed"`
			}
			if json.Unmarshal(event.Details, &d) != nil || d.Changed {
				stage = 0
			}
		case "input":
			stage = 0
			var d struct {
				Source string `json:"source"`
			}
			if json.Unmarshal(event.Details, &d) == nil && d.Source == "extension" {
				stage = 1
				inputSeq = event.Seq
			}
		case "before_agent_start":
			var d probeContext
			valid := stage == 1 && json.Unmarshal(event.Details, &d) == nil && validContext(d)
			stage = 0
			if valid {
				expected = d
				stage = 2
			}
		case "context_with_system":
			var d probeContext
			valid := stage >= 2 && stage <= 4 && json.Unmarshal(event.Details, &d) == nil && d.Scope == "last_observer" && d.Status == "match" && d.RequestSeq > canonical.RequestSeq && validContext(d) && sameContext(d, expected)
			stage = 0
			if valid {
				canonical = d
				stage = 3
			}
		case "before_provider_request":
			var d probeContext
			valid := stage == 3 && json.Unmarshal(event.Details, &d) == nil && d.Scope == "last_observer" && d.Status == "match" && d.RequestSeq == canonical.RequestSeq && d.Bytes > 0 && validDigest(d.Hash) && validContext(d) && sameContext(d, canonical)
			stage = 0
			if valid {
				stage = 4
			}
		case "agent_before_settle":
			var d struct {
				Outcome string `json:"outcome"`
			}
			if stage == 4 && json.Unmarshal(event.Details, &d) == nil && d.Outcome == "completed" {
				stage = 5
			} else {
				stage = 0
			}
		case "agent_settled":
			var d struct {
				Idle    bool  `json:"idle"`
				Pending *bool `json:"pending"`
				Aborted *bool `json:"aborted"`
			}
			if stage == 5 && json.Unmarshal(event.Details, &d) == nil && d.Idle && d.Pending != nil && !*d.Pending && d.Aborted != nil && !*d.Aborted {
				cycles = append(cycles, map[string]any{"input_seq": inputSeq, "settled_seq": event.Seq, "identity": canonical.Identity, "request_seq": canonical.RequestSeq})
			}
			stage = 0
		}
	}
	return map[string]any{"source": path, "schema_version": 2, "pi_version": report.PiVersion, "profile_id": h.ProfileID, "host_identity_matched": matchHost, "observed_at": report.ObservedAt, "observed_events": observed, "ordered_core_lifecycles": cycles, "core_runtime_observed": matchHost && len(cycles) > 0, "scenario_acceptance": "NOT_EVALUATED"}, nil
}
