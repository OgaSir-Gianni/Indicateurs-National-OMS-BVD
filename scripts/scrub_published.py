#!/usr/bin/env python3
"""
Redact respondent names in the already-published files under docs/data.

fetch_data.py now redacts by default, but files written before that change still
carry full names, and docs/data is served from a public GitHub Pages URL. Run
this once so the fix does not wait for the next refresh:

    python scripts/scrub_published.py

It is idempotent — a name already reduced to initials is left alone.
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_data import initials  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"

# "P. G." / "M. V. M." — already redacted, leave as is.
ALREADY = re.compile(r"^(?:[A-Z]\.\s*)+$")


def redact(name):
    text = str(name or "").strip()
    if not text or text == "—" or ALREADY.match(text):
        return text
    return initials(text)


def scrub_submissions(path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    changed = []
    for rec in doc.get("submissions", []):
        before = rec.get("by")
        after = redact(before)
        if after != before:
            changed.append(before)
            rec["by"] = after
        rec.pop("email", None)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return changed


def scrub_csv(path):
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        return []
    header, body = rows[0], rows[1:]
    if "reported_by" not in header:
        return []
    col = header.index("reported_by")
    changed = []
    for row in body:
        if len(row) > col:
            before = row[col]
            after = redact(before)
            if after != before:
                changed.append(before)
                row[col] = after
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows([header] + body)
    return changed


def main():
    if os.environ.get("REDACT_NAMES") == "0":
        print("REDACT_NAMES=0 — names are meant to be published here, nothing to do.")
        return 0

    total = set()
    for path, fn in ((DATA / "submissions.json", scrub_submissions),
                     (DATA / "kpi_long.csv", scrub_csv)):
        if not path.exists():
            print(f"note: {path.name} absent, skipped")
            continue
        changed = fn(path)
        total |= set(changed)
        print(f"{path.name}: {len(changed)} field(s) redacted")

    print(f"\ndistinct names removed: {len(total)}")
    for name in sorted(total):
        print(f"  {name!r} -> {initials(name)!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
