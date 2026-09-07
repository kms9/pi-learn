#!/usr/bin/env python3
"""Compare docs-zh translations against the local pi-dev checkout.

Default: print a report and exit 1 if anything is stale or missing.
Does not rewrite translations. Hash updates are explicit (--accept / --record-head).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "docs-zh" / "manifest.json"
UPSTREAM_DIR = ROOT / "pi-dev"

DOC_GLOBS = (
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "packages/*/README.md",
    "packages/*/docs/**/*.md",
    "packages/coding-agent/examples/**/*.md",
    "packages/session-backends/**/README.md",
    "packages/session-backends/**/docs/**/*.md",
)

SKIP_NAME_PARTS = ("CHANGELOG.md", "/images/")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def discover_upstream_docs() -> list[str]:
    found: list[str] = []
    for pattern in DOC_GLOBS:
        for path in UPSTREAM_DIR.glob(pattern):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if any(part in rel for part in SKIP_NAME_PARTS):
                continue
            if rel.endswith(".zh.md"):
                continue
            found.append(rel)
    return sorted(set(found))


def check_entries(manifest: dict) -> list[dict]:
    rows: list[dict] = []
    for entry in manifest["entries"]:
        kind = entry["kind"]
        zh_rel = entry["zh"]
        zh_path = ROOT / "docs-zh" / zh_rel
        source_rel = entry.get("source")
        row = {
            "kind": kind,
            "zh": zh_rel,
            "source": source_rel,
            "status": entry.get("status"),
        }
        if not zh_path.is_file():
            row["status"] = "missing-zh"
            rows.append(row)
            continue
        if kind == "original" or not source_rel:
            row["status"] = "original"
            rows.append(row)
            continue
        source_path = ROOT / source_rel
        if not source_path.is_file():
            row["status"] = "missing-source"
            rows.append(row)
            continue
        current = sha256_file(source_path)
        row["currentSha256"] = current
        if current == entry.get("sourceSha256"):
            row["status"] = "ok"
        else:
            row["status"] = "stale"
        rows.append(row)
    return rows


def new_upstream_docs(manifest: dict) -> list[str]:
    tracked = {e["source"] for e in manifest["entries"] if e.get("source")}
    return [rel for rel in discover_upstream_docs() if rel not in tracked]


def print_report(manifest: dict, rows: list[dict], head: dict, extras: list[str]) -> None:
    pin = manifest["upstream"]
    print(f"upstream remote : {pin.get('remote')}")
    print(f"pinned head     : {pin.get('head')} ({pin.get('branch')})")
    print(f"local pi-dev    : {head.get('head')} ({head.get('branch')})")
    if head.get("dirty"):
        print("local pi-dev    : working tree is dirty")
    if head.get("head") and head["head"] != pin.get("head"):
        print("head drift      : local checkout moved; run pull then re-translate stale files")
    print()

    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(row["status"], []).append(row)

    order = ("stale", "missing-source", "missing-zh", "ok", "original")
    for status in order:
        items = groups.get(status, [])
        if not items:
            continue
        print(f"[{status}] {len(items)}")
        show = items if status not in {"ok", "original"} else items[:0]
        for row in show:
            src = row.get("source") or "-"
            print(f"  {row['zh']}")
            if src != row["zh"]:
                print(f"    source: {src}")
        if status in {"ok", "original"}:
            print(f"  ({len(items)} files)")
        print()

    if extras:
        print(f"[new-upstream-doc] {len(extras)}")
        for rel in extras:
            print(f"  {rel}")
        print()


def accept_sources(manifest: dict, sources: list[str]) -> int:
    wanted = set(sources)
    updated = 0
    for entry in manifest["entries"]:
        source_rel = entry.get("source")
        if source_rel not in wanted:
            continue
        path = ROOT / source_rel
        if not path.is_file():
            print(f"cannot accept missing source: {source_rel}", file=sys.stderr)
            continue
        entry["sourceSha256"] = sha256_file(path)
        entry["status"] = "ok"
        updated += 1
        wanted.remove(source_rel)
    if wanted:
        print("unknown --accept paths:", *sorted(wanted), sep="\n  ", file=sys.stderr)
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print machine-readable report")
    parser.add_argument(
        "--record-head",
        action="store_true",
        help="write the current pi-dev HEAD/branch into manifest.json",
    )
    parser.add_argument(
        "--accept",
        action="append",
        default=[],
        metavar="SOURCE",
        help="after re-translating, record the current source hash (repeatable)",
    )
    parser.add_argument(
        "--write-status",
        action="store_true",
        help="write computed status back into manifest.json",
    )
    args = parser.parse_args()

    if not MANIFEST_PATH.is_file():
        print(f"missing {MANIFEST_PATH}", file=sys.stderr)
        return 2
    if not UPSTREAM_DIR.is_dir():
        print(f"missing local checkout {UPSTREAM_DIR}", file=sys.stderr)
        return 2

    manifest = load_manifest()
    head = {
        "head": git(UPSTREAM_DIR, "rev-parse", "HEAD"),
        "branch": git(UPSTREAM_DIR, "rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(git(UPSTREAM_DIR, "status", "--porcelain")),
    }

    if args.accept:
        n = accept_sources(manifest, args.accept)
        save_manifest(manifest)
        print(f"accepted {n} source hash(es)")

    if args.record_head:
        manifest["upstream"]["head"] = head["head"]
        manifest["upstream"]["branch"] = head["branch"]
        save_manifest(manifest)
        print(f"recorded head {head['head']}")

    rows = check_entries(manifest)
    extras = new_upstream_docs(manifest)

    if args.write_status:
        by_zh = {row["zh"]: row["status"] for row in rows}
        for entry in manifest["entries"]:
            if entry["zh"] in by_zh:
                entry["status"] = by_zh[entry["zh"]]
        save_manifest(manifest)

    report = {
        "upstream": manifest["upstream"],
        "local": head,
        "entries": rows,
        "newUpstreamDocs": extras,
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_report(manifest, rows, head, extras)

    blocking = {"stale", "missing-source", "missing-zh"}
    problems = sum(1 for row in rows if row["status"] in blocking)
    if head["head"] != manifest["upstream"].get("head"):
        problems += 1
    # Newly discovered upstream docs are informational; they do not fail the check.
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
