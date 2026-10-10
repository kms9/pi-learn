package cli

import (
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/projection"
	"github.com/kms9/pi-learn/pi_squad/controller/scheduler"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
	"github.com/spf13/cobra"
	"reflect"
	"strings"
	"time"
)

// Export the Go wire shapes for the TS adapter and integration fixture consumers.
// Semantic checks (DAG, policy resolution, ownership, CAS) remain server-side.
func newSchemaCommand() *cobra.Command {
	return &cobra.Command{Use: "schema", Short: "Export protocol v2 JSON schema without reading project state", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		definitions := map[string]any{}
		var shape func(reflect.Type) map[string]any
		shape = func(t reflect.Type) map[string]any {
			if t == reflect.TypeOf(time.Time{}) {
				return map[string]any{"type": "string", "format": "date-time"}
			}
			if t == reflect.TypeOf(json.RawMessage{}) {
				return map[string]any{}
			}
			if t.Kind() == reflect.Pointer {
				return map[string]any{"anyOf": []any{shape(t.Elem()), map[string]any{"type": "null"}}}
			}
			switch t.Kind() {
			case reflect.String:
				return map[string]any{"type": "string"}
			case reflect.Bool:
				return map[string]any{"type": "boolean"}
			case reflect.Int, reflect.Int64, reflect.Int32:
				return map[string]any{"type": "integer"}
			case reflect.Slice, reflect.Array:
				return map[string]any{"anyOf": []any{map[string]any{"type": "array", "items": shape(t.Elem())}, map[string]any{"type": "null"}}}
			case reflect.Map:
				return map[string]any{"type": "object", "additionalProperties": shape(t.Elem())}
			case reflect.Struct:
				parts := strings.Split(t.PkgPath(), "/")
				name := parts[len(parts)-1] + "_" + t.Name()
				ref := map[string]any{"$ref": "#/$defs/" + name}
				if _, ok := definitions[name]; ok {
					return ref
				}
				definitions[name] = map[string]any{}
				properties := map[string]any{}
				required := []string{}
				for i := 0; i < t.NumField(); i++ {
					field := t.Field(i)
					tag := strings.Split(field.Tag.Get("json"), ",")
					key := tag[0]
					if key == "-" || field.PkgPath != "" {
						continue
					}
					if key == "" {
						key = field.Name
					}
					properties[key] = shape(field.Type)
					optional := false
					for _, option := range tag[1:] {
						optional = optional || option == "omitempty"
					}
					if !optional {
						required = append(required, key)
					}
				}
				definitions[name] = map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
				return ref
			default:
				return map[string]any{}
			}
		}
		named := map[string]any{}
		for name, value := range map[string]any{"discovery": project.Discovery{}, "team": project.Team{}, "workflow": project.Workflow{}, "task_contract": task.Contract{}, "attempt": task.Attempt{}, "run": task.Run{}, "error": task.Error{}, "create_run": scheduler.CreateRun{}, "create_task": scheduler.CreateTask{}, "operation": scheduler.Operation{}, "acceptance": scheduler.AcceptanceRequest{}, "attempt_event": scheduler.AttemptEvent{}, "register": scheduler.Register{}, "heartbeat": scheduler.HeartbeatRequest{}, "instance": scheduler.Instance{}, "snapshot": projection.Snapshot{}, "message": scheduler.Message{}, "message_send": scheduler.SendMessage{}, "interruption": scheduler.Interruption{}, "stopped_evidence": scheduler.StoppedEvidence{}, "clarification": scheduler.ClarificationRequest{}, "decision": scheduler.Decision{}, "message_receipt": scheduler.MessageReceipt{}} {
			named[name] = shape(reflect.TypeOf(value))
		}
		return printJSON(cmd, map[string]any{"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "urn:pi-squad:protocol:2", "title": "Pi Squad v2 wire contracts", "$defs": definitions, "x-contracts": named, "x-semantic-validation": "Controller project/task/scheduler validators remain authoritative; nullable Go zero values are not acceptance evidence"})
	}}
}
