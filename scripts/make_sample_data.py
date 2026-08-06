#!/usr/bin/env python3
"""
Write a sample docs/data/submissions.json so the dashboard can be opened before
the Ona token exists. The dashboard shows a banner whenever source == "sample".
The first successful run of fetch_data.py overwrites this file.

    python scripts/make_sample_data.py [days]
"""

import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
random.seed(17)

REPORTERS = ["A. K.", "M. T.", "J. B.", "F. N.", "L. M."]


def draw(ind, day_index):
    """A plausible value: near target, drifting, with the odd bad day."""
    unit, target = ind["unit"], ind["target"]
    scaled = None
    if ind["has_target"] and target is not None:
        scaled = target * 100 if (unit in ("percent", "ratio") and target <= 1) else target

    if unit == "percent":
        centre = scaled if scaled not in (None, 0) else 70
        if ind["direction"] == "lower":
            centre = min(centre + 8, 25)
        value = max(0, min(100, random.gauss(centre - 6 + day_index * 0.4, 9)))
        return round(value, 1)
    if unit == "days":
        return round(max(0.5, random.gauss((scaled or 4) + 0.6, 1.1)), 1)
    if unit == "ratio":
        return round(max(0, random.gauss(0.8, 0.15)), 2)
    if ind["direction"] == "lower":
        return float(max(0, int(random.gauss(2, 2))))
    return float(max(0, int(random.gauss(40, 18))))


def main(days=21):
    registry = json.loads((DATA / "indicators.json").read_text(encoding="utf-8"))
    pillars = registry["pillars"]
    by_pillar = {p["id"]: [i for i in registry["indicators"] if i["pillar"] == p["id"]] for p in pillars}

    records, sid = [], 1000
    start = date.today() - timedelta(days=days - 1)
    for day_index in range(days):
        day = start + timedelta(days=day_index)
        for pillar in pillars:
            # Not every pillar reports every day — that gap is the point of the matrix view.
            if random.random() < 0.22:
                continue
            indicators = by_pillar[pillar["id"]]
            values, comments = {}, {}
            for ind in indicators:
                if random.random() < 0.12:
                    continue
                values[ind["id"]] = draw(ind, day_index)
            if indicators and random.random() < 0.25:
                pick = random.choice(list(values) or [indicators[0]["id"]])
                comments[pick] = "Donnée provisoire, en attente de validation par la coordination."
            sid += 1
            records.append({
                "id": sid,
                "date": day.isoformat(),
                "submitted_at": f"{day.isoformat()}T{random.randint(8, 19):02d}:{random.randint(0, 59):02d}:00",
                "pillar": pillar["id"],
                "by": random.choice(REPORTERS),
                "values": values,
                "comments": comments,
                "general_comments": {},
            })

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "form_version": registry["form"]["version"],
        "source": "sample",
        "submission_count": len(records),
        "submissions": records,
    }
    (DATA / "submissions.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"sample: {len(records)} submissions over {days} days -> docs/data/submissions.json")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 21)
