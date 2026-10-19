package scheduler

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/kms9/pi-learn/dsh_squad/controller/project"
	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// Artifacts a Bot hands in live in the Controller's own content-addressed store
// (2026-10-19 D8): <ArtifactDir>/sha256/<hex>, written once and never changed, so the
// hash a result names always matches the bytes. A result refers to one as
// "artifact:sha256/<hex>"; a plain path still means a file in the Project.

const (
	ArtifactScheme   = "artifact:sha256/"
	MaxArtifactBytes = 8 * 1024 * 1024
)

var artifactHex = regexp.MustCompile(`^[0-9a-f]{64}$`)

var mediaTypes = map[string]bool{
	"text/plain": true, "text/markdown": true, "text/html": true, "text/csv": true,
	"application/json": true, "image/svg+xml": true, "image/png": true, "application/octet-stream": true,
}

type ArtifactUpload struct {
	Name      string `json:"name"`
	MediaType string `json:"media_type"`
	Content   []byte `json:"content_base64"`
}

type artifactMeta struct {
	Name      string `json:"name"`
	MediaType string `json:"media_type"`
}

// artifactFile resolves an artifact reference or a Project path to the file to check.
func (s *Service) artifactFile(ref string) (string, error) {
	if strings.HasPrefix(ref, ArtifactScheme) {
		sum := strings.TrimPrefix(ref, ArtifactScheme)
		if !artifactHex.MatchString(sum) || s.ArtifactDir == "" {
			return "", task.Reject("INVALID_ARTIFACT", ref)
		}
		return filepath.Join(s.ArtifactDir, "sha256", sum), nil
	}
	return project.CanonicalResource(s.Project.Root, ref)
}

// StoreArtifact keeps bytes a running attempt (or the operator) hands in.
func (s *Service) StoreArtifact(ctx context.Context, p Principal, q ArtifactUpload) (task.Artifact, error) {
	var out task.Artifact
	if s.ArtifactDir == "" {
		return out, task.Reject("ARTIFACTS_DISABLED", "no artifact store configured")
	}
	if len(q.Content) == 0 || len(q.Content) > MaxArtifactBytes {
		return out, task.Reject("INVALID_ARTIFACT", "content must be 1 byte to 8 MiB")
	}
	if q.MediaType == "" {
		q.MediaType = "application/octet-stream"
	}
	if !mediaTypes[q.MediaType] {
		return out, task.Reject("INVALID_ARTIFACT", "unsupported media type "+q.MediaType)
	}
	name := filepath.Base(strings.TrimSpace(q.Name))
	if name == "." || name == "/" || len(name) > 128 {
		return out, task.Reject("INVALID_ARTIFACT", "a file name of at most 128 bytes required")
	}
	if !p.Operator {
		// Only a runtime with an attempt in progress hands in work.
		var attempt string
		err := s.Store.DB.QueryRowContext(ctx, `SELECT attempt_id FROM agent_reservations WHERE agent_id=?`, p.Binding.AgentID).Scan(&attempt)
		if errors.Is(err, sql.ErrNoRows) {
			return out, task.Reject("STALE_EXECUTION", "no running attempt")
		}
		if err != nil {
			return out, err
		}
	}
	digest := sha256.Sum256(q.Content)
	sum := hex.EncodeToString(digest[:])
	dir := filepath.Join(s.ArtifactDir, "sha256")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return out, err
	}
	path := filepath.Join(dir, sum)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := project.AtomicWrite(path, q.Content, 0o400); err != nil {
			return out, err
		}
	} else if err != nil {
		return out, err
	}
	meta, _ := json.Marshal(artifactMeta{Name: name, MediaType: q.MediaType})
	if _, err := os.Stat(path + ".json"); errors.Is(err, os.ErrNotExist) {
		if err := project.AtomicWrite(path+".json", meta, 0o400); err != nil {
			return out, err
		}
	}
	return task.Artifact{Path: ArtifactScheme + sum, SHA256: sum, Length: int64(len(q.Content)), Name: name, MediaType: q.MediaType}, nil
}

// ArtifactContent returns the stored bytes and their media type, for reading back.
func (s *Service) ArtifactContent(sum string) ([]byte, string, error) {
	if !artifactHex.MatchString(sum) || s.ArtifactDir == "" {
		return nil, "", task.Reject("INVALID_ARTIFACT", sum)
	}
	path := filepath.Join(s.ArtifactDir, "sha256", sum)
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, "", task.Reject("ARTIFACT_NOT_FOUND", sum)
	}
	meta := artifactMeta{MediaType: "application/octet-stream"}
	if raw, err := os.ReadFile(path + ".json"); err == nil {
		_ = json.Unmarshal(raw, &meta)
	}
	return b, meta.MediaType, nil
}
