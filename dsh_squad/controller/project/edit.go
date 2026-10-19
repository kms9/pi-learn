package project

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Configuration files a user may edit from the DS Bot interface (M3-4), relative to
// .agents/dshsquad. Nothing else under that directory (the runtime, credentials) can
// be read or written through this path.
var editablePath = regexp.MustCompile(`^(roles/[a-z][a-z0-9-]*/(role|agents)\.md|teams/[a-z][a-z0-9-]*/(team\.json|instructions\.md)|teams/[a-z][a-z0-9-]*/workflows/[a-z][a-z0-9-]*\.json)$`)

type ConfigFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Hash    string `json:"hash"`
}

// ConfigEdit writes (or, with Delete, removes) one file. ExpectedHash is the hash the
// editor last read; empty means the file must not exist yet.
type ConfigEdit struct {
	Path         string `json:"path"`
	Content      string `json:"content"`
	ExpectedHash string `json:"expected_hash"`
	Delete       bool   `json:"delete,omitempty"`
}

func EditablePath(path string) bool { return editablePath.MatchString(path) }

// ConfigFiles lists every editable file with its content and hash.
func ConfigFiles(root string) ([]ConfigFile, error) {
	base := filepath.Join(root, ".agents", "dshsquad")
	out := []ConfigFile{}
	err := filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(base, path)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") && path != base {
				return filepath.SkipDir
			}
			return nil
		}
		if !EditablePath(rel) {
			return nil
		}
		b, err := ReadDocument(root, ".agents/dshsquad/"+rel)
		if err != nil {
			return err
		}
		out = append(out, ConfigFile{Path: rel, Content: string(b), Hash: Hash(b)})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, err
}

// ApplyConfigEdits checks every edit against what is on disk, applies them to a copy of
// the configuration and loads it there; only a configuration that loads is written
// back. With validateOnly nothing is written. Returns the resulting snapshot.
func ApplyConfigEdits(root string, edits []ConfigEdit, validateOnly bool) (Snapshot, error) {
	if len(edits) == 0 || len(edits) > 32 {
		return Snapshot{}, fmt.Errorf("1 to 32 edits required")
	}
	current, err := ConfigFiles(root)
	if err != nil {
		return Snapshot{}, err
	}
	hashes := map[string]string{}
	for _, f := range current {
		hashes[f.Path] = f.Hash
	}
	seen := map[string]bool{}
	for _, e := range edits {
		if !EditablePath(e.Path) || seen[e.Path] {
			return Snapshot{}, fmt.Errorf("CONFIG_PATH_INVALID: %s", e.Path)
		}
		seen[e.Path] = true
		if hashes[e.Path] != e.ExpectedHash {
			return Snapshot{}, fmt.Errorf("CONFIG_CHANGED: %s was changed since it was read", e.Path)
		}
		if !e.Delete && len(e.Content) > MaxDocumentBytes {
			return Snapshot{}, fmt.Errorf("CONFIG_TOO_LARGE: %s", e.Path)
		}
	}
	scratch, err := os.MkdirTemp("", "dshsquad-config-")
	if err != nil {
		return Snapshot{}, err
	}
	defer os.RemoveAll(scratch)
	for _, f := range current {
		if err := writeConfigFile(scratch, f.Path, f.Content); err != nil {
			return Snapshot{}, err
		}
	}
	for _, dir := range []string{"roles", "teams"} {
		if err := os.MkdirAll(filepath.Join(scratch, ".agents", "dshsquad", dir), 0o755); err != nil {
			return Snapshot{}, err
		}
	}
	for _, e := range edits {
		if err := applyEdit(scratch, e); err != nil {
			return Snapshot{}, err
		}
	}
	// A Team's configuration is frozen by config_version: changing any of its files
	// (instructions, a workflow) under the same version would be refused when the next
	// Run or runtime freezes it. The version moves on with the change.
	bumps, err := versionBumps(scratch, current, edits)
	if err != nil {
		return Snapshot{}, err
	}
	for _, e := range bumps {
		if err := applyEdit(scratch, e); err != nil {
			return Snapshot{}, err
		}
	}
	edits = append(edits, bumps...)
	if _, err := Load(scratch); err != nil {
		return Snapshot{}, fmt.Errorf("CONFIG_INVALID: %w", err)
	}
	if !validateOnly {
		for _, e := range edits {
			if err := applyEdit(root, e); err != nil {
				return Snapshot{}, err
			}
		}
	}
	return Load(root)
}

func applyEdit(root string, e ConfigEdit) error {
	if !e.Delete {
		return writeConfigFile(root, e.Path, e.Content)
	}
	path := filepath.Join(root, ".agents", "dshsquad", filepath.FromSlash(e.Path))
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	// A role or Team directory left empty goes too, so it does not fail the next load.
	base := filepath.Join(root, ".agents", "dshsquad")
	for dir := filepath.Dir(path); dir != base && filepath.Dir(dir) != base; dir = filepath.Dir(dir) {
		if err := os.Remove(dir); err != nil {
			break
		}
	}
	return nil
}

func writeConfigFile(root, rel, content string) error {
	path := filepath.Join(root, ".agents", "dshsquad", filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return AtomicWrite(path, []byte(content), 0o644)
}

var configVersion = regexp.MustCompile(`"config_version"\s*:\s*(\d+)`)

// versionBumps returns, for each Team whose files the edits touch without raising its
// config_version, an edit of its team.json with the version one higher (in scratch).
func versionBumps(scratch string, current []ConfigFile, edits []ConfigEdit) ([]ConfigEdit, error) {
	before := map[string]string{}
	for _, f := range current {
		before[f.Path] = f.Content
	}
	touched := map[string]bool{}
	for _, e := range edits {
		if parts := strings.Split(e.Path, "/"); parts[0] == "teams" && !e.Delete {
			touched[parts[1]] = true
		}
	}
	out := []ConfigEdit{}
	for team := range touched {
		path := "teams/" + team + "/team.json"
		old, existed := before[path]
		if !existed {
			continue
		}
		b, err := os.ReadFile(filepath.Join(scratch, ".agents", "dshsquad", "teams", team, "team.json"))
		if err != nil {
			return nil, err
		}
		now := string(b)
		oldVersion, newVersion := configVersion.FindStringSubmatch(old), configVersion.FindStringSubmatch(now)
		if oldVersion == nil || newVersion == nil || newVersion[1] != oldVersion[1] {
			continue
		}
		var n int
		fmt.Sscanf(newVersion[1], "%d", &n)
		bumped := configVersion.ReplaceAllString(now, fmt.Sprintf(`"config_version": %d`, n+1))
		hash := ""
		for _, f := range current {
			if f.Path == path {
				hash = f.Hash
			}
		}
		replaced := false
		for i := range edits {
			if edits[i].Path == path {
				replaced = true
			}
		}
		if replaced {
			// The edit itself carries team.json: raise the version in it instead.
			for i := range edits {
				if edits[i].Path == path {
					edits[i].Content = bumped
				}
			}
			if err := writeConfigFile(scratch, path, bumped); err != nil {
				return nil, err
			}
			continue
		}
		out = append(out, ConfigEdit{Path: path, Content: bumped, ExpectedHash: hash})
	}
	return out, nil
}
