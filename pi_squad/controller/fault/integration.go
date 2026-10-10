//go:build pisquad_integration

package fault

import (
	"fmt"
	"sync"
	"time"
)

var state = struct {
	sync.Mutex
	points  map[string]string
	waiters map[string]chan struct{}
	now     *time.Time
}{points: map[string]string{}, waiters: map[string]chan struct{}{}}

func Configure(name, action string, at *time.Time) error {
	state.Lock()
	defer state.Unlock()
	if at != nil {
		value := at.UTC()
		state.now = &value
	}
	switch action {
	case "pause", "fail":
		state.points[name] = action
	case "release":
		if ch := state.waiters[name]; ch != nil {
			close(ch)
			delete(state.waiters, name)
		}
		delete(state.points, name)
	case "reset":
		for name, ch := range state.waiters {
			close(ch)
			delete(state.waiters, name)
		}
		state.points = map[string]string{}
		state.now = nil
	default:
		return fmt.Errorf("invalid fault action")
	}
	return nil
}
func Point(name string) error {
	state.Lock()
	action := state.points[name]
	if action == "fail" {
		delete(state.points, name)
		state.Unlock()
		return fmt.Errorf("INTEGRATION_FAULT: %s", name)
	}
	if action != "pause" {
		state.Unlock()
		return nil
	}
	ch := state.waiters[name]
	if ch == nil {
		ch = make(chan struct{})
		state.waiters[name] = ch
	}
	state.Unlock()
	<-ch
	return nil
}
func Now() time.Time {
	state.Lock()
	defer state.Unlock()
	if state.now != nil {
		return *state.now
	}
	return time.Now().UTC()
}
func Status() map[string]string {
	state.Lock()
	defer state.Unlock()
	out := map[string]string{}
	for k, v := range state.points {
		out[k] = v
	}
	for k := range state.waiters {
		out[k] = "paused"
	}
	return out
}
