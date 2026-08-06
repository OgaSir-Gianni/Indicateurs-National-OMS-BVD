#!/usr/bin/env python3
"""
Fold the dashboard into a single self-contained HTML file.

Useful when the audience cannot reach GitHub Pages: the result opens from a USB
stick or an email attachment, offline, with the data frozen at build time.

    python scripts/make_standalone.py [output.html]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def main(out_path):
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    css = (DOCS / "styles.css").read_text(encoding="utf-8")
    js = (DOCS / "app.js").read_text(encoding="utf-8")
    registry = json.loads((DOCS / "data" / "indicators.json").read_text(encoding="utf-8"))
    submissions = json.loads((DOCS / "data" / "submissions.json").read_text(encoding="utf-8"))

    # Replace the network boot with the embedded payloads.
    js = js.replace(
        "async function boot() {",
        "const EMBEDDED = {indicators: __INDICATORS__, submissions: __SUBMISSIONS__};\n"
        "async function boot() {\n  if (EMBEDDED.indicators) { REG = EMBEDDED.indicators; SUB = EMBEDDED.submissions; "
        "BY_ID = Object.fromEntries(REG.indicators.map((i) => [i.id, i])); "
        "DATES = [...new Set(SUB.submissions.map((s) => s.date).filter(Boolean))].sort(); "
        "bind(); render(); return; }",
    )
    js = js.replace("__INDICATORS__", json.dumps(registry, ensure_ascii=False))
    js = js.replace("__SUBMISSIONS__", json.dumps(submissions, ensure_ascii=False, separators=(",", ":")))

    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")

    out = Path(out_path)
    out.write_text(html, encoding="utf-8")
    print(f"{out} — {out.stat().st_size / 1024:.0f} KB, opens offline")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "dashboard_standalone.html")
