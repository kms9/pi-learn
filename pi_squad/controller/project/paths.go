package project

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func ContainsPath(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))
}

// CanonicalResource resolves existing ancestors so a not-yet-created file cannot
// hide behind a symlink or a nested Project. Control data is never task material.
func CanonicalResource(root, input string) (string, error) {
	p := input
	if !filepath.IsAbs(p) {
		p = filepath.Join(root, p)
	}
	p = filepath.Clean(p)
	cursor := p
	tail := []string{}
	for {
		_, err := os.Lstat(cursor)
		if err == nil {
			break
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		next := filepath.Dir(cursor)
		if next == cursor {
			return "", fmt.Errorf("unresolvable path")
		}
		tail = append(tail, filepath.Base(cursor))
		cursor = next
	}
	real, err := filepath.EvalSymlinks(cursor)
	if err != nil {
		return "", err
	}
	for i := len(tail) - 1; i >= 0; i-- {
		real = filepath.Join(real, tail[i])
	}
	if !ContainsPath(root, real) || ContainsPath(filepath.Join(root, ".agents"), real) || real == filepath.Join(root, "AGENTS.md") || ContainsPath(filepath.Join(root, ".git"), real) {
		return "", fmt.Errorf("RESOURCE_OUT_OF_SCOPE: %s", input)
	}
	cursor = real
	for cursor != root && ContainsPath(root, cursor) {
		if st, err := os.Stat(filepath.Join(cursor, ".agents/pisquad")); err == nil && st.IsDir() {
			return "", fmt.Errorf("nested Project boundary: %s", input)
		}
		cursor = filepath.Dir(cursor)
	}
	return real, nil
}
