#!/usr/bin/env python3
"""Scrub secrets from exported agent transcripts (markdown) in place.

Usage:
  tools/redact-transcripts.py [--check] [--secrets-file PATH ...] DIR_OR_FILE ...

  default     rewrite files in place, print per-category redaction counts (JSON)
  --check     do not modify; exit 1 if any pattern still matches (counts only)

Secret *values* are never printed. Literal values are read at runtime from
env-style files (default: every ~/.secrets/*.env); any variable whose name
contains KEY/TOKEN/SECRET/PASS/AUTH/COOKIE/CREDENTIAL is treated as secret.
Everything matched is replaced with "[REDACTED]".
"""
import argparse, glob, json, os, re, sys

R = "[REDACTED]"
SECRET_NAME = re.compile(r"KEY|TOKEN|SECRET|PASS|AUTH|COOKIE|CREDENTIAL", re.I)

def load_literals(files):
    vals = set()
    for f in files:
        try:
            for line in open(os.path.expanduser(f), encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.replace("export ", "").strip()
                v = v.strip().strip('"').strip("'")
                if SECRET_NAME.search(k) and len(v) >= 8:
                    vals.add(v)
        except OSError:
            pass
    return sorted(vals, key=len, reverse=True)

# Values that are code/env references rather than secrets (left alone in
# the generic assignment rule only).
NON_SECRET_VALUE = re.compile(
    r"^(?:\$|process\.env|os\.environ|env\.|<|\[REDACTED|true$|false$|null$|none$|undefined$|"
    r"[A-Z][A-Z0-9_]{2,}$|"
    # dotted code references such as a.Segment / ui.palette.query / fs.readFileSync
    r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$|"
    # markdown emphasis picked up after "secrets:" prose
    r"[_*]{2})", re.I)

# (category, regex, replacement-group-handling)
# For patterns with a named group "v", only that group is replaced.
PATTERNS = [
    ("private_key_block", re.compile(
        r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----.*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----",
        re.S)),
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{16,}")),
    ("openai_key", re.compile(r"sk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{16,}")),
    ("sk_style_key", re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_\-]{16,}")),
    ("github_token", re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})")),
    ("aws_access_key", re.compile(r"(?<![A-Z0-9])(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}(?![A-Z0-9])")),
    ("aws_secret", re.compile(
        r"(?i)aws_?secret_?access_?key[\"']?\s*[:=]\s*[\"']?(?P<v>[A-Za-z0-9/+=]{30,})")),
    ("slack_token", re.compile(r"xox[abposr]-[A-Za-z0-9\-]{10,}")),
    ("google_api_key", re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("jwt", re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}")),
    ("bearer", re.compile(r"(?i)\bBearer\s+(?P<v>[A-Za-z0-9._~+/=\-]{8,})")),
    ("authorization_header", re.compile(
        r"(?i)\b(?:authorization|x-api-key|api-key|x-auth-token)[\"']?\s*[:=]\s*[\"']?(?P<v>(?!Bearer\b)(?!\[REDACTED)[^\s\"',;}]{8,})")),
    ("cookie", re.compile(
        r"(?i)\b(?:set-)?cookie[\"']?\s*[:=]\s*[\"']?"
        r"(?P<v>(?!\[REDACTED)[A-Za-z0-9_\-.]+=[^\s\"';]{6,}(?:;\s*[A-Za-z0-9_\-.]+=[^\s\"';]*)*)")),
    ("assignment", re.compile(
        r"(?i)\b(?P<k>[A-Za-z0-9_.\-]*(?:password|passwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key)[A-Za-z0-9_]*)"
        r"[\"']?\s*(?::=|=|:)\s*[\"']?(?P<v>[A-Za-z0-9_\-./+=~@!#%^&*]{8,})")),
]

def redact_text(text, literals, counts):
    for v in literals:
        n = text.count(v)
        if n:
            counts["secrets_file_literal"] = counts.get("secrets_file_literal", 0) + n
            text = text.replace(v, R)
    for cat, rx in PATTERNS:
        def sub(m, cat=cat):
            if "v" in rx.groupindex:
                val = m.group("v")
                if cat in ("assignment", "authorization_header", "cookie") and NON_SECRET_VALUE.search(val):
                    return m.group(0)
                if val.startswith("[REDACTED") or val == "REDACTED":
                    return m.group(0)
                counts[cat] = counts.get(cat, 0) + 1
                s, e = m.span("v")
                b = m.start()
                return m.group(0)[: s - b] + R + m.group(0)[e - b:]
            counts[cat] = counts.get(cat, 0) + 1
            return R
        text = rx.sub(sub, text)
    return text

def iter_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for f in sorted(glob.glob(os.path.join(p, "**", "*"), recursive=True)):
                if os.path.isfile(f) and f.endswith((".md", ".json", ".txt")):
                    yield f
        elif os.path.isfile(p):
            yield p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--secrets-file", action="append")
    ap.add_argument("paths", nargs="+")
    a = ap.parse_args()
    files = a.secrets_file or glob.glob(os.path.expanduser("~/.secrets/*.env"))
    literals = load_literals(files)
    total, per_file = {}, {}
    for f in iter_files(a.paths):
        with open(f, encoding="utf-8", errors="surrogateescape") as fh:
            t = fh.read()
        c = {}
        nt = redact_text(t, literals, c)
        if c:
            per_file[os.path.basename(f)] = c
            for k, v in c.items():
                total[k] = total.get(k, 0) + v
            if not a.check:
                with open(f, "w", encoding="utf-8", errors="surrogateescape") as fh:
                    fh.write(nt)
    print(json.dumps({"mode": "check" if a.check else "redact",
                      "literals_loaded": len(literals),
                      "total": total, "per_file": per_file}, ensure_ascii=False, indent=1))
    if a.check and total:
        sys.exit(1)

if __name__ == "__main__":
    main()
