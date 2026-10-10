package project

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type managedPi struct {
	entry       string
	version     string
	versionFile string
	nodeBin     string
}

var managedVersionName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$`)

// Recognize the official managed launcher's fixed layout. Read its metadata;
// never evaluate assignments or commands extracted from a shell script.
func resolveManagedPi(launcher string, content []byte) (*managedPi, error) {
	if len(content) > 64*1024 || !strings.HasPrefix(string(content), "#!/bin/sh\n") {
		return nil, nil
	}
	text := string(content)
	for _, marker := range []string{
		"pi_agent_dir=${pi_bin_dir%/*}",
		"pi_current_file=$pi_agent_dir/install/current-version",
		"pi_release_dir=$pi_agent_dir/install/releases/$pi_current_version",
		"pi_release_bin=$pi_release_dir/node_modules/.bin/pi",
		"PI_MANAGED_INSTALL_ROOT=$pi_agent_dir/install",
		`exec "$pi_release_bin" "$@"`,
	} {
		if !strings.Contains(text, marker) {
			return nil, nil
		}
	}
	if filepath.Base(launcher) != "pi" || filepath.Base(filepath.Dir(launcher)) != "bin" {
		return nil, fmt.Errorf("unexpected managed launcher path")
	}
	install := filepath.Join(filepath.Dir(filepath.Dir(launcher)), "install")
	versionFile := filepath.Join(install, "current-version")
	data, err := os.ReadFile(versionFile)
	if err != nil {
		return nil, fmt.Errorf("current-version unavailable")
	}
	version := strings.TrimSpace(string(data))
	if len(data) > 256 || !managedVersionName.MatchString(version) {
		return nil, fmt.Errorf("invalid managed release name")
	}
	release := filepath.Join(install, "releases", version)
	entry, err := filepath.EvalSymlinks(filepath.Join(release, "node_modules", ".bin", "pi"))
	if err != nil {
		return nil, fmt.Errorf("selected release executable unavailable")
	}
	release, err = filepath.EvalSymlinks(release)
	if err != nil {
		return nil, fmt.Errorf("selected release unavailable")
	}
	rel, err := filepath.Rel(release, entry)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return nil, fmt.Errorf("release executable escapes selected release")
	}
	info, err := os.Stat(entry)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 {
		return nil, fmt.Errorf("selected release entry is not executable")
	}
	m := &managedPi{entry: entry, version: version, versionFile: versionFile}
	dataHome := os.Getenv("XDG_DATA_HOME")
	if dataHome == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			dataHome = filepath.Join(home, ".local", "share")
		}
	}
	if dataHome != "" {
		nodeBin := filepath.Join(dataHome, "pi-node", "current", "bin")
		if info, err := os.Stat(filepath.Join(nodeBin, "node")); err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0111 != 0 {
			m.nodeBin = nodeBin
		}
	}
	return m, nil
}

func versionOutputWithNode(binary, nodeBin string) ([]byte, error) {
	if nodeBin == "" {
		return versionOutput(binary)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "--version")
	cmd.Env = append(os.Environ(), "PATH="+nodeBin+string(os.PathListSeparator)+os.Getenv("PATH"))
	return cmd.Output()
}
