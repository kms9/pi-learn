//go:build !pisquad_integration

// Package fault exposes no production control surface.
package fault

import "time"

func Point(string) error { return nil }
func Now() time.Time     { return time.Now().UTC() }
