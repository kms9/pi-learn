package project

import "time"

// Timing describes configured contact/permit deadlines independently of task
// state. The adapter polls every second and renews below the remaining window.
func Timing(heartbeatTimeout, leaseTTL time.Duration) map[string]int64 {
	return map[string]int64{
		"heartbeat_timeout_ms":    heartbeatTimeout.Milliseconds(),
		"offline_after_ms":        (2 * heartbeatTimeout).Milliseconds(),
		"lease_ttl_ms":            leaseTTL.Milliseconds(),
		"adapter_poll_ms":         1000,
		"renew_when_remaining_ms": 20000,
	}
}

// PresenceAt describes contact only. Neither suspect nor offline proves that
// execution stopped or permits releasing an identity, lease, or reservation.
func PresenceAt(lastSeen, now time.Time, timeout time.Duration, revoked bool) string {
	if revoked || lastSeen.IsZero() {
		return "offline"
	}
	age := now.Sub(lastSeen)
	if age < timeout {
		return "online"
	}
	if age < timeout*2 {
		return "suspect"
	}
	return "offline"
}
