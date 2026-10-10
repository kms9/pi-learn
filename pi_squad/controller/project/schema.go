package project

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
)

// OutputSchema is an explicit, strict schema for Task JSON results. Unknown
// keywords are rejected at configuration time, never silently ignored.
type OutputSchema struct {
	Type                 string                  `json:"type"`
	Properties           map[string]OutputSchema `json:"properties,omitempty"`
	Required             []string                `json:"required,omitempty"`
	Items                *OutputSchema           `json:"items,omitempty"`
	Enum                 []any                   `json:"enum,omitempty"`
	AdditionalProperties *bool                   `json:"additionalProperties,omitempty"`
	Minimum              *float64                `json:"minimum,omitempty"`
	Maximum              *float64                `json:"maximum,omitempty"`
	MinItems             *int                    `json:"minItems,omitempty"`
	MaxItems             *int                    `json:"maxItems,omitempty"`
}

func ParseOutputSchema(raw json.RawMessage) (*OutputSchema, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var s OutputSchema
	if err := DecodeStrict(raw, &s); err != nil {
		return nil, err
	}
	if err := s.ValidateDefinition(); err != nil {
		return nil, err
	}
	return &s, nil
}
func (s OutputSchema) ValidateDefinition() error {
	switch s.Type {
	case "object", "array", "string", "number", "integer", "boolean", "null":
	default:
		return fmt.Errorf("invalid result schema type %q", s.Type)
	}
	for key, p := range s.Properties {
		if key == "" {
			return fmt.Errorf("empty schema property")
		}
		if err := p.ValidateDefinition(); err != nil {
			return err
		}
	}
	for _, key := range s.Required {
		if _, ok := s.Properties[key]; !ok {
			return fmt.Errorf("required property not defined: %s", key)
		}
	}
	if s.Items != nil {
		return s.Items.ValidateDefinition()
	}
	return nil
}
func (s OutputSchema) Check(value any) error {
	if len(s.Enum) > 0 {
		ok := false
		for _, v := range s.Enum {
			if reflect.DeepEqual(v, value) {
				ok = true
			}
		}
		if !ok {
			return fmt.Errorf("value not in enum")
		}
	}
	switch s.Type {
	case "object":
		v, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("object required")
		}
		for _, key := range s.Required {
			if _, ok := v[key]; !ok {
				return fmt.Errorf("missing property %s", key)
			}
		}
		for key, x := range v {
			schema, ok := s.Properties[key]
			if !ok {
				if s.AdditionalProperties != nil && !*s.AdditionalProperties {
					return fmt.Errorf("unexpected property %s", key)
				}
				continue
			}
			if err := schema.Check(x); err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
		}
	case "array":
		v, ok := value.([]any)
		if !ok {
			return fmt.Errorf("array required")
		}
		if s.MinItems != nil && len(v) < *s.MinItems {
			return fmt.Errorf("too few items")
		}
		if s.MaxItems != nil && len(v) > *s.MaxItems {
			return fmt.Errorf("too many items")
		}
		if s.Items != nil {
			for _, x := range v {
				if err := s.Items.Check(x); err != nil {
					return err
				}
			}
		}
	case "string":
		if _, ok := value.(string); !ok {
			return fmt.Errorf("string required")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("boolean required")
		}
	case "null":
		if value != nil {
			return fmt.Errorf("null required")
		}
	case "number", "integer":
		v, ok := value.(float64)
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("finite number required")
		}
		if s.Type == "integer" && math.Trunc(v) != v {
			return fmt.Errorf("integer required")
		}
		if s.Minimum != nil && v < *s.Minimum {
			return fmt.Errorf("below minimum")
		}
		if s.Maximum != nil && v > *s.Maximum {
			return fmt.Errorf("above maximum")
		}
	}
	return nil
}
