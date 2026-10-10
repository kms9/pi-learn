package project

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

type Discovery struct {
	SchemaVersion   int    `json:"schema_version"`
	ProtocolVersion string `json:"protocol_version"`
	ControllerID    string `json:"controller_id"`
	ControllerEpoch int64  `json:"controller_epoch"`
	ProjectRoot     string `json:"project_root"`
	Endpoint        string `json:"endpoint"`
	PID             int    `json:"pid"`
}
type Runtime struct {
	Root      string
	Directory string
	lock      *os.File
	Discovery Discovery
}

func RandomID(prefix string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(b), nil
}
func Lock(root string) (*Runtime, error) {
	dir := filepath.Join(root, ".agents/pisquad/.runtime")
	if st, err := os.Lstat(dir); err == nil && (!st.IsDir() || st.Mode()&os.ModeSymlink != 0) {
		return nil, fmt.Errorf("runtime must be a real private directory")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return nil, err
	}
	fd, err := unix.Open(filepath.Join(dir, "controller.lock"), unix.O_CREAT|unix.O_RDWR|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), "controller.lock")
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("CONTROLLER_ALREADY_RUNNING: %w", err)
	}
	id, err := RandomID("ctl-")
	if err != nil {
		f.Close()
		return nil, err
	}
	r := &Runtime{Root: root, Directory: dir, lock: f, Discovery: Discovery{SchemaVersion: 1, ProtocolVersion: Protocol, ControllerID: id, ProjectRoot: root, PID: os.Getpid()}}
	return r, nil
}
func AtomicWrite(path string, b []byte, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".publish-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(mode); err == nil {
		_, err = f.Write(b)
	}
	if err == nil {
		err = f.Sync()
	}
	cerr := f.Close()
	if err != nil {
		return err
	}
	if cerr != nil {
		return cerr
	}
	if err = os.Rename(name, path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
func (r *Runtime) Publish(endpoint string, epoch int64) error {
	r.Discovery.Endpoint = endpoint
	r.Discovery.ControllerEpoch = epoch
	b, err := json.MarshalIndent(r.Discovery, "", "  ")
	if err != nil {
		return err
	}
	return AtomicWrite(filepath.Join(r.Directory, "controller.json"), b, 0600)
}
func (r *Runtime) Close() error {
	if r.lock == nil {
		return nil
	}
	// A discovery file is not a lock; only remove our own publication.
	if b, err := os.ReadFile(filepath.Join(r.Directory, "controller.json")); err == nil {
		var d Discovery
		if json.Unmarshal(b, &d) == nil && d.ControllerID == r.Discovery.ControllerID {
			_ = os.Remove(filepath.Join(r.Directory, "controller.json"))
		}
	}
	err := r.lock.Close()
	r.lock = nil
	return err
}
func ReadDiscovery(root string) (Discovery, error) {
	var d Discovery
	b, err := ReadDocument(root, ".agents/pisquad/.runtime/controller.json")
	if err != nil {
		return d, err
	}
	if err := DecodeStrict(b, &d); err != nil {
		return d, err
	}
	u, err := url.Parse(d.Endpoint)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return d, fmt.Errorf("invalid discovery endpoint")
	}
	if d.SchemaVersion != 1 || d.ProtocolVersion != Protocol || d.ProjectRoot != root || d.ControllerID == "" || d.ControllerEpoch < 1 || d.PID < 1 {
		return d, fmt.Errorf("invalid discovery identity")
	}
	return d, nil
}
func (r *Runtime) OperatorToken(rotate bool) (string, error) {
	p := filepath.Join(r.Directory, "operator.token")
	if !rotate {
		if st, err := os.Lstat(p); err == nil {
			if !st.Mode().IsRegular() || st.Mode().Perm() != 0600 {
				return "", fmt.Errorf("operator token must be regular mode 0600")
			}
			b, err := os.ReadFile(p)
			if err != nil {
				return "", err
			}
			token := strings.TrimSpace(string(b))
			if len(token) != 64 {
				return "", fmt.Errorf("invalid operator credential")
			}
			return token, nil
		} else if !os.IsNotExist(err) {
			return "", err
		}
	}
	token, err := RandomID("")
	if err != nil {
		return "", err
	}
	if err := AtomicWrite(p, []byte(token+"\n"), 0600); err != nil {
		return "", err
	}
	return token, nil
}
