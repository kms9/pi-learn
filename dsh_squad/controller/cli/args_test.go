package cli

import "testing"

func TestNormalizeLegacyFlags(t *testing.T) {
	got := normalizeLegacyFlags([]string{"-listen", "127.0.0.1:1", "-heartbeat-timeout=2s", "agents", "list"})
	want := []string{"--listen", "127.0.0.1:1", "--heartbeat-timeout=2s", "agents", "list"}
	if len(got) != len(want) {
		t.Fatalf("got %#v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %#v want %#v", got, want)
		}
	}
}
