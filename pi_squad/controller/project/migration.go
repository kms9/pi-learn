package project

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type MigrationEntry struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	SHA256      string `json:"sha256"`
}
type MigrationPlan struct {
	Root                     string           `json:"root"`
	Entries                  []MigrationEntry `json:"entries"`
	Conflicts                []string         `json:"conflicts"`
	Database                 string           `json:"database"`
	BackupPlan               string           `json:"backup_plan"`
	RequiresExplicitMappings bool             `json:"requires_explicit_mappings"`
	MigratedDatabaseHash     string           `json:"migrated_database_sha256,omitempty"`
}

// PlanMigration is deliberately read-only, including when no new project exists.
func PlanMigration(cwd, db string) (MigrationPlan, error) {
	root, err := filepath.Abs(cwd)
	if err != nil {
		return MigrationPlan{}, err
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return MigrationPlan{}, err
	}
	p := MigrationPlan{Root: root, Entries: []MigrationEntry{}, Conflicts: []string{}, Database: db, BackupPlan: "stop old writer; acquire project process lock; SQLite consistent backup including WAL; verify manifest before publication", RequiresExplicitMappings: true}
	entries, err := os.ReadDir(filepath.Join(root, ".agents/roles"))
	if err != nil {
		return p, err
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if !e.IsDir() || !ValidID(e.Name()) {
			p.Conflicts = append(p.Conflicts, "invalid legacy role directory: "+e.Name())
			continue
		}
		src := ".agents/roles/" + e.Name() + "/role.md"
		b, err := ReadDocument(root, src)
		if err != nil {
			p.Conflicts = append(p.Conflicts, err.Error())
			continue
		}
		if _, err := ParseRole(b, e.Name()); err != nil {
			p.Conflicts = append(p.Conflicts, err.Error())
			continue
		}
		dst := ".agents/pisquad/roles/" + e.Name() + "/role.md"
		if _, err := os.Lstat(filepath.Join(root, dst)); err == nil {
			p.Conflicts = append(p.Conflicts, "destination exists: "+dst)
		}
		p.Entries = append(p.Entries, MigrationEntry{src, dst, Hash(b)})
	}
	if db != "" {
		st, err := os.Stat(db)
		if err != nil {
			return p, err
		}
		if !st.Mode().IsRegular() {
			return p, fmt.Errorf("database must be a regular file")
		}
	}
	sort.Strings(p.Conflicts)
	return p, nil
}

// ApplyMigration stages a new layout without deleting the legacy input. The
// operator supplies the complete Team mapping; an empty mapping means standalone.
func ApplyMigration(ctx context.Context, cwd, db string, teams []TeamSnapshot, confirmedStopped bool) (MigrationPlan, error) {
	p, err := PlanMigration(cwd, db)
	if err != nil {
		return p, err
	}
	if !confirmedStopped {
		return p, fmt.Errorf("explicit confirmation that the old writer is stopped is required")
	}
	if len(p.Conflicts) != 0 {
		return p, fmt.Errorf("migration conflicts must be resolved")
	}
	destination := filepath.Join(p.Root, ".agents/pisquad")
	if _, err := os.Lstat(destination); err == nil {
		return p, fmt.Errorf("destination already exists; never overwrite project state")
	} else if !os.IsNotExist(err) {
		return p, err
	}
	lockPath := filepath.Join(p.Root, ".agents", "pisquad-migration.lock")
	fd, err := unix.Open(lockPath, unix.O_CREAT|unix.O_RDWR|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0600)
	if err != nil {
		return p, err
	}
	lock := os.NewFile(uintptr(fd), lockPath)
	defer lock.Close()
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return p, fmt.Errorf("another migration holds the lock")
	}
	staging, err := os.MkdirTemp(filepath.Join(p.Root, ".agents"), ".pisquad-migration-*")
	if err != nil {
		return p, err
	}
	defer os.RemoveAll(staging)
	stagedRoot := filepath.Join(staging, "project")
	layout := filepath.Join(stagedRoot, ".agents/pisquad")
	if err := os.MkdirAll(filepath.Join(layout, "roles"), 0755); err != nil {
		return p, err
	}
	if err := os.MkdirAll(filepath.Join(layout, "teams"), 0755); err != nil {
		return p, err
	}
	if err := os.MkdirAll(filepath.Join(layout, ".runtime"), 0700); err != nil {
		return p, err
	}
	for _, e := range p.Entries {
		b, err := ReadDocument(p.Root, e.Source)
		if err != nil {
			return p, err
		}
		if Hash(b) != e.SHA256 {
			return p, fmt.Errorf("migration source changed: %s", e.Source)
		}
		dst := filepath.Join(stagedRoot, e.Destination)
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return p, err
		}
		if err := os.WriteFile(dst, b, 0644); err != nil {
			return p, err
		}
		if err := os.WriteFile(filepath.Join(filepath.Dir(dst), "agents.md"), nil, 0644); err != nil {
			return p, err
		}
	}
	seen := map[string]bool{}
	for _, t := range teams {
		if !ValidID(t.Config.TeamID) || seen[t.Config.TeamID] {
			return p, fmt.Errorf("invalid/duplicate team mapping")
		}
		seen[t.Config.TeamID] = true
		dir := filepath.Join(layout, "teams", t.Config.TeamID)
		if err := os.MkdirAll(filepath.Join(dir, "workflows"), 0755); err != nil {
			return p, err
		}
		b, err := json.MarshalIndent(t.Config, "", "  ")
		if err != nil {
			return p, err
		}
		if err := os.WriteFile(filepath.Join(dir, "team.json"), b, 0644); err != nil {
			return p, err
		}
		if err := os.WriteFile(filepath.Join(dir, "instructions.md"), []byte(t.Instructions), 0644); err != nil {
			return p, err
		}
		for id, w := range t.Workflows {
			if !ValidID(id) {
				return p, fmt.Errorf("invalid workflow mapping")
			}
			b, err := json.MarshalIndent(w, "", "  ")
			if err != nil {
				return p, err
			}
			if err := os.WriteFile(filepath.Join(dir, "workflows", id+".json"), b, 0644); err != nil {
				return p, err
			}
		}
	}
	if _, err := Load(stagedRoot); err != nil {
		return p, err
	}
	if db != "" {
		abs, err := filepath.Abs(db)
		if err != nil {
			return p, err
		}
		source, err := sql.Open("sqlite", "file:"+filepath.ToSlash(abs)+"?mode=ro")
		if err != nil {
			return p, err
		}
		defer source.Close()
		backup := filepath.Join(layout, ".runtime", "legacy-backup.sqlite")
		if _, err := source.ExecContext(ctx, `VACUUM INTO ?`, backup); err != nil {
			return p, fmt.Errorf("consistent backup: %w", err)
		}
		b, err := os.ReadFile(backup)
		if err != nil {
			return p, err
		}
		if err := os.WriteFile(filepath.Join(layout, ".runtime", "state.sqlite"), b, 0600); err != nil {
			return p, err
		}
		migrated, err := sql.Open("sqlite", filepath.Join(layout, ".runtime", "state.sqlite"))
		if err != nil {
			return p, err
		}
		defer migrated.Close()
		var check string
		if err := migrated.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&check); err != nil || check != "ok" {
			return p, fmt.Errorf("backup integrity check failed: %s %v", check, err)
		}
		var exists int
		if err := migrated.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='agents'`).Scan(&exists); err != nil {
			return p, err
		}
		if exists != 0 {
			if _, err := migrated.ExecContext(ctx, `UPDATE agents SET last_seen='1970-01-01T00:00:00Z'`); err != nil {
				return p, err
			}
		}
		if err := migrated.Close(); err != nil {
			return p, err
		}
		prepared, err := os.ReadFile(filepath.Join(layout, ".runtime", "state.sqlite"))
		if err != nil {
			return p, err
		}
		p.MigratedDatabaseHash = Hash(prepared)
		p.BackupPlan = "completed consistent legacy-backup.sqlite; original DB and inputs preserved; restored presence is offline"
	}
	manifest, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return p, err
	}
	if err := os.WriteFile(filepath.Join(layout, ".runtime", "migration-manifest.json"), manifest, 0600); err != nil {
		return p, err
	}
	// Publish only after all validation. A failure before rename leaves old inputs intact.
	if _, err := os.Lstat(destination); err == nil {
		return p, fmt.Errorf("destination appeared during migration")
	}
	if err := os.Rename(layout, destination); err != nil {
		return p, err
	}
	return p, nil
}
