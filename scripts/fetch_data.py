#!/usr/bin/env python3
"""
Pull submissions from Ona (whonghub.org) and write the two files the dashboard reads.

    docs/data/submissions.json   one record per submission, values keyed by indicator id
    docs/data/kpi_long.csv       tidy long format, one row per indicator per submission

Environment:
    ONA_TOKEN     required. Account settings -> API token on https://whonghub.org
    ONA_FORM_ID   optional. Numeric form pk. Resolved from the id_string when absent.
    ONA_BASE      optional. Defaults to https://api.whonghub.org/api/v1
    REDACT_EMAILS optional. "0" keeps respondent emails in the published files.
    REDACT_NAMES  optional. "0" keeps respondent full names. Defaults to redacting
                  them to initials, because docs/data is served publicly.

Run locally with:  ONA_TOKEN=xxxx python scripts/fetch_data.py
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
REGISTRY = DATA / "indicators.json"

BASE = os.environ.get("ONA_BASE", "https://api.whonghub.org/api/v1").rstrip("/")
TOKEN = os.environ.get("ONA_TOKEN")
PAGE = 500


def api(path, **params):
    url = f"{BASE}/{path.lstrip('/')}"
    if params:
        url = f"{url}?{urlencode(params)}"
    response = requests.get(url, headers={"Authorization": f"Token {TOKEN}"}, timeout=120)
    if response.status_code == 401:
        raise SystemExit("Ona rejected the token. Regenerate it in your account settings.")
    if response.status_code == 404:
        raise SystemExit(f"Not found: {url}. Check ONA_FORM_ID and that the token's account can see the form.")
    response.raise_for_status()
    return response.json()


def resolve_form_id(id_string):
    forms = api("forms.json")
    for form in forms:
        if form.get("id_string") == id_string:
            return form["formid"]
    known = ", ".join(sorted(f.get("id_string", "?") for f in forms)) or "none visible"
    raise SystemExit(f"No form with id_string '{id_string}' on this account. Visible forms: {known}")


def fetch_all(form_id):
    """Ona pages with start/limit; keep going until a short page comes back."""
    out, start = [], 0
    while True:
        page = api(f"data/{form_id}.json", start=start, limit=PAGE)
        out.extend(page)
        if len(page) < PAGE:
            return out
        start += PAGE


def initials(name):
    parts = [p for p in str(name or "").split() if p]
    return " ".join(f"{p[0].upper()}." for p in parts) or "—"


def reshape(raw, registry):
    redact_emails = os.environ.get("REDACT_EMAILS", "1") != "0"
    # Default to redacting: docs/data/*.json and *.csv are published to GitHub
    # Pages and readable by anyone with the URL. Set REDACT_NAMES=0 to opt out.
    redact_names = os.environ.get("REDACT_NAMES", "1") != "0"
    indicators = registry["indicators"]
    general_fields = {
        pillar["id"]: f"{pillar['group']}/general_comments_{pillar['group'].split('_')[0]}_{pillar['id'].split('_')[1]}"
        for pillar in registry["pillars"]
    }

    records = []
    for row in raw:
        values, comments = {}, {}
        for ind in indicators:
            value = row.get(ind["value_field"])
            if value not in (None, ""):
                try:
                    values[ind["id"]] = float(value)
                except (TypeError, ValueError):
                    pass
            note = row.get(ind["comment_field"])
            if note not in (None, ""):
                comments[ind["id"]] = str(note).strip()

        general = {}
        for pillar in registry["pillars"]:
            for key, value in row.items():
                if key.startswith(f"{pillar['group']}/general_comments") and value:
                    general[pillar["id"]] = str(value).strip()

        record = {
            "id": row.get("_id"),
            "date": (row.get("reporting_date") or "")[:10],
            "submitted_at": (row.get("_submission_time") or "")[:19],
            "pillar": row.get("response_pillar"),
            "by": initials(row.get("respondent_name")) if redact_names else row.get("respondent_name"),
            "values": values,
            "comments": comments,
            "general_comments": general,
        }
        if not redact_emails:
            record["email"] = row.get("respondent_email")
        records.append(record)

    records.sort(key=lambda r: (r["date"], r["submitted_at"]))
    return records, general_fields


def write_long_csv(records, registry, path):
    by_id = {ind["id"]: ind for ind in registry["indicators"]}
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "submission_id", "reporting_date", "submitted_at", "reported_by",
            "pillar", "indicator_code", "indicator_fr", "unit", "direction",
            "target", "value", "comment",
        ])
        for record in records:
            for key, value in record["values"].items():
                ind = by_id[key]
                writer.writerow([
                    record["id"], record["date"], record["submitted_at"], record["by"],
                    ind["pillar"], ind["code"], ind["label"]["fr"], ind["unit"], ind["direction"],
                    ind["target"] if ind["has_target"] else "", value,
                    record["comments"].get(key, ""),
                ])


def main():
    if not TOKEN:
        raise SystemExit("ONA_TOKEN is not set. Export it, or add it as the repository secret ONA_TOKEN.")
    if not REGISTRY.exists():
        raise SystemExit("docs/data/indicators.json is missing. Run scripts/build_indicators.py first.")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    form_id = os.environ.get("ONA_FORM_ID") or resolve_form_id(registry["form"]["id_string"])
    print(f"Form {registry['form']['id_string']} -> pk {form_id}")

    raw = fetch_all(form_id)
    print(f"{len(raw)} submissions downloaded")

    records, _ = reshape(raw, registry)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "form_version": registry["form"]["version"],
        "source": "ona",
        "submission_count": len(records),
        "submissions": records,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "submissions.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    write_long_csv(records, registry, DATA / "kpi_long.csv")

    dates = sorted({r["date"] for r in records if r["date"]})
    filled = sum(len(r["values"]) for r in records)
    print(f"wrote docs/data/submissions.json and docs/data/kpi_long.csv")
    print(f"  reporting dates : {dates[0] if dates else '—'} to {dates[-1] if dates else '—'}")
    print(f"  values captured : {filled}")


if __name__ == "__main__":
    sys.exit(main())
