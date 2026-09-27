package project

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

type ProbeReport struct {
	SchemaVersion int    `json:"schema_version"`
	PiVersion     string `json:"pi_version"`
	ObservedAt    string `json:"observed_at"`
	Events        []struct {
		Seq     int             `json:"seq"`
		At      string          `json:"at"`
		Type    string          `json:"type"`
		Details json.RawMessage `json:"details"`
	} `json:"events"`
	Assertions json.RawMessage `json:"assertions"`
}

func ReadProbe(path, installedVersion string) (map[string]any, error) {
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
	if report.SchemaVersion != 1 || report.PiVersion != installedVersion {
		return nil, fmt.Errorf("probe schema/Pi version mismatch")
	}
	observed := map[string]int{}
	// Core readiness requires one ordered lifecycle, not unrelated events from
	// different sessions or turns. Keep sequence evidence for the reviewer.
	stage := 0
	inputSeq := 0
	taskID := ""
	attemptID := ""
	segmentID := int64(0)
	cycles := []map[string]any{}
	last := 0
	for _, event := range report.Events {
		if event.Seq <= last {
			return nil, fmt.Errorf("nonmonotonic probe sequence")
		}
		last = event.Seq
		observed[event.Type]++
		switch event.Type {
		case "session_start", "session_shutdown", "user_bash":
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
			var d struct {
				Keys      []string `json:"section_keys"`
				TaskID    string   `json:"task_id"`
				AttemptID string   `json:"attempt_id"`
				SegmentID int64    `json:"segment_id"`
			}
			valid := false
			if stage == 1 && json.Unmarshal(event.Details, &d) == nil && d.TaskID != "" && d.AttemptID != "" && d.SegmentID > 0 {
				for _, key := range d.Keys {
					if key == "pi_squad_task" {
						valid = true
					}
				}
			}
			stage = 0
			if valid {
				stage = 2
				taskID, attemptID, segmentID = d.TaskID, d.AttemptID, d.SegmentID
			}
		case "before_provider_request":
			var d struct {
				Hash                   string   `json:"sha256"`
				Bytes                  int      `json:"bytes"`
				TaskIDs                []string `json:"task_ids"`
				ContextIdentityPresent bool     `json:"context_identity_present"`
				SegmentID              int64    `json:"segment_id"`
			}
			valid := false
			if stage >= 2 && json.Unmarshal(event.Details, &d) == nil && d.Bytes > 0 && d.ContextIdentityPresent && d.SegmentID == segmentID {
				digest, err := hex.DecodeString(d.Hash)
				if err == nil && len(digest) == 32 {
					for _, id := range d.TaskIDs {
						if id == taskID {
							valid = true
						}
					}
				}
			}
			stage = 0
			if valid {
				stage = 3
			}
		case "agent_before_settle":
			if stage == 3 {
				stage = 4
			} else {
				stage = 0
			}
		case "agent_settled":
			var d struct {
				Idle    bool  `json:"idle"`
				Pending *bool `json:"pending"`
			}
			if stage == 4 && json.Unmarshal(event.Details, &d) == nil && d.Idle && d.Pending != nil && !*d.Pending {
				cycles = append(cycles, map[string]any{"input_seq": inputSeq, "settled_seq": event.Seq, "task_id": taskID, "attempt_id": attemptID, "segment_id": segmentID})
			}
			stage = 0
		}
	}
	return map[string]any{"source": path, "pi_version": report.PiVersion, "observed_at": report.ObservedAt, "observed_events": observed, "ordered_core_lifecycles": cycles, "core_runtime_observed": len(cycles) > 0, "scenario_acceptance": "NOT_EVALUATED"}, nil
}
