package project

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTree(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		path := filepath.Join(root, ".agents/dshsquad", rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

const teamJSON = `{"schema_version":1,"team_id":"math","config_version":1,"leader":{"agent_ref":"chief"},"members":[{"role_ref":"builder","responsibility":"build"}],"instructions_file":"instructions.md","policy":{"run_admission":"fifo_single_active","max_parallel_tasks":1,"max_delegate_depth":1,"max_total_tasks":5,"max_attempts_per_task":2,"allowed_tools":["read"],"writable_roots":[],"acceptance_policy":{"mode":"on_completion","child_policy":"separate"}}}`

func TestConfigEditsAreValidatedBeforeWriting(t *testing.T) {
	root, _ := filepath.EvalSymlinks(t.TempDir())
	writeTree(t, root, map[string]string{
		"roles/builder/role.md":      "---\nname: builder\ndescription: builds\n---\nYou build.\n",
		"roles/builder/agents.md":    "Be careful.\n",
		"teams/math/team.json":       teamJSON,
		"teams/math/instructions.md": "Teach.\n",
		".runtime/operator.token":    "secret",
	})
	files, err := ConfigFiles(root)
	if err != nil || len(files) != 4 {
		t.Fatalf("files %v %v", files, err)
	}
	for _, f := range files {
		if strings.Contains(f.Path, ".runtime") {
			t.Fatal("the runtime directory must not be listed")
		}
	}
	hash := map[string]string{}
	for _, f := range files {
		hash[f.Path] = f.Hash
	}
	// A Team naming a role that does not exist is refused, and nothing is written.
	bad := strings.Replace(teamJSON, `"role_ref":"builder"`, `"role_ref":"ghost"`, 1)
	if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: "teams/math/team.json", Content: bad, ExpectedHash: hash["teams/math/team.json"]}}, false); err == nil || !strings.Contains(err.Error(), "CONFIG_INVALID") {
		t.Fatalf("want CONFIG_INVALID, got %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(root, ".agents/dshsquad/teams/math/team.json")); string(b) != teamJSON {
		t.Fatal("a refused edit changed the file")
	}
	// A stale hash is refused.
	if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: "teams/math/instructions.md", Content: "x", ExpectedHash: "old"}}, false); err == nil || !strings.Contains(err.Error(), "CONFIG_CHANGED") {
		t.Fatalf("want CONFIG_CHANGED, got %v", err)
	}
	// A path outside the editable set is refused.
	if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: ".runtime/operator.token", Content: "x"}}, false); err == nil || !strings.Contains(err.Error(), "CONFIG_PATH_INVALID") {
		t.Fatalf("want CONFIG_PATH_INVALID, got %v", err)
	}
	// A new role and the Team naming it, in one change.
	withReviewer := strings.Replace(teamJSON, `{"role_ref":"builder","responsibility":"build"}`, `{"role_ref":"builder","responsibility":"build"},{"role_ref":"reviewer","responsibility":"review"}`, 1)
	snap, err := ApplyConfigEdits(root, []ConfigEdit{
		{Path: "roles/reviewer/role.md", Content: "---\nname: reviewer\ndescription: reviews\n---\nYou review.\n"},
		{Path: "roles/reviewer/agents.md", Content: "Be fair.\n"},
		{Path: "teams/math/team.json", Content: withReviewer, ExpectedHash: hash["teams/math/team.json"]},
	}, false)
	if err != nil || len(snap.Roles) != 2 || len(snap.Teams["math"].Config.Members) != 2 {
		t.Fatalf("snapshot %v %v", snap.Roles, err)
	}
	// Validate-only writes nothing.
	files, _ = ConfigFiles(root)
	for _, f := range files {
		hash[f.Path] = f.Hash
	}
	if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: "teams/math/instructions.md", Content: "New.\n", ExpectedHash: hash["teams/math/instructions.md"]}}, true); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(root, ".agents/dshsquad/teams/math/instructions.md")); string(b) != "Teach.\n" {
		t.Fatal("validate_only wrote the file")
	}
	// Changing a Team's instructions moves its config_version on, so the frozen
	// snapshot of the old version is never contradicted.
	versionBefore := snap.Teams["math"].Config.ConfigVersion
	snap, err = ApplyConfigEdits(root, []ConfigEdit{{Path: "teams/math/instructions.md", Content: "New.\n", ExpectedHash: hash["teams/math/instructions.md"]}}, false)
	if err != nil || snap.Teams["math"].Config.ConfigVersion != versionBefore+1 {
		t.Fatalf("config_version %d after an instructions edit (was %d): %v", snap.Teams["math"].Config.ConfigVersion, versionBefore, err)
	}
	files, _ = ConfigFiles(root)
	for _, f := range files {
		hash[f.Path] = f.Hash
	}
	// Deleting a role the Team still names is refused.
	if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: "roles/reviewer/role.md", ExpectedHash: hash["roles/reviewer/role.md"], Delete: true}, {Path: "roles/reviewer/agents.md", ExpectedHash: hash["roles/reviewer/agents.md"], Delete: true}}, false); err == nil {
		t.Fatal("deleting a role in use must be refused")
	}
}

// P5 = A: formal work is read-only; a Team that would write is refused.
func TestATeamThatWouldWriteIsRefused(t *testing.T) {
	for name, team := range map[string]string{
		"write tool":     strings.Replace(teamJSON, `"allowed_tools":["read"]`, `"allowed_tools":["read","write"]`, 1),
		"edit tool":      strings.Replace(teamJSON, `"allowed_tools":["read"]`, `"allowed_tools":["read","edit"]`, 1),
		"writable roots": strings.Replace(teamJSON, `"writable_roots":[]`, `"writable_roots":["out"]`, 1),
	} {
		if team == teamJSON {
			t.Fatalf("%s: the fixture did not change", name)
		}
		root, _ := filepath.EvalSymlinks(t.TempDir())
		writeTree(t, root, map[string]string{
			"roles/builder/role.md":      "---\nname: builder\ndescription: builds\n---\nYou build.\n",
			"roles/builder/agents.md":    "Be careful.\n",
			"teams/math/team.json":       teamJSON,
			"teams/math/instructions.md": "Teach.\n",
		})
		files, _ := ConfigFiles(root)
		hash := ""
		for _, f := range files {
			if f.Path == "teams/math/team.json" {
				hash = f.Hash
			}
		}
		if _, err := ApplyConfigEdits(root, []ConfigEdit{{Path: "teams/math/team.json", Content: team, ExpectedHash: hash}}, true); err == nil || !strings.Contains(err.Error(), "READ_ONLY") {
			t.Fatalf("%s: want READ_ONLY, got %v", name, err)
		}
	}
}
