package project

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
)

// Called after taking the Project process lock, before legacy registry migration.
func CheckDatabaseVersion(ctx context.Context, path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	uri := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}
	db, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return err
	}
	defer db.Close()
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return nil
		}
		// A legacy store must be the explicitly staged, backed-up migration
		// output. Merely passing --db must never upgrade the original in place.
		manifest, err := os.ReadFile(filepath.Join(filepath.Dir(path), "migration-manifest.json"))
		if err != nil {
			return fmt.Errorf("EXPLICIT_MIGRATION_REQUIRED: legacy database requires migrate before serve")
		}
		var plan MigrationPlan
		if err := DecodeStrict(manifest, &plan); err != nil {
			return fmt.Errorf("EXPLICIT_MIGRATION_REQUIRED: invalid migration manifest: %w", err)
		}
		expected := filepath.Join(plan.Root, ".agents/pisquad/.runtime/state.sqlite")
		actual, err := filepath.EvalSymlinks(path)
		if err != nil {
			return err
		}
		prepared, err := os.ReadFile(actual)
		if err != nil {
			return err
		}
		if actual != expected || plan.MigratedDatabaseHash == "" || Hash(prepared) != plan.MigratedDatabaseHash {
			return fmt.Errorf("EXPLICIT_MIGRATION_REQUIRED: database is not the verified migration output")
		}
		if _, err := os.Stat(filepath.Join(filepath.Dir(actual), "legacy-backup.sqlite")); err != nil {
			return fmt.Errorf("EXPLICIT_MIGRATION_REQUIRED: consistent backup missing")
		}
		return nil
	}
	var version int
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&version); err != nil {
		return err
	}
	if version > 2 {
		return fmt.Errorf("SCHEMA_VERSION_UNSUPPORTED: database version %d is newer than 2", version)
	}
	return nil
}
