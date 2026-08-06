#!/usr/bin/env python3
"""
Build the indicator registry (docs/data/indicators.json) from the XLSForm.

The XLSForm is the single source of truth for what an indicator *is*: its code,
its pillar, its label in FR/EN, and its target (which is written into the
`note` label as "Cible : X" / "Target: X").

Re-run this whenever the form is edited and re-deployed:
    python scripts/build_indicators.py form/KPI3_XLSForm_grid_no_question_groups.xlsx

Any judgement call the parser makes (unit, direction, target scale) can be
overridden in config/overrides.json without touching this script.
"""

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FORM = ROOT / "form" / "KPI3_XLSForm_grid_no_question_groups.xlsx"
OUT = ROOT / "docs" / "data" / "indicators.json"
OVERRIDES = ROOT / "config" / "overrides.json"

TARGET_MARKERS = {"fr": "Cible", "en": "Target"}

# --- classification vocabulary -------------------------------------------------
PERCENT_WORDS = ("pourcentage", "proportion", "taux", "%")
# Narrow on purpose: "jour" alone also matches "séjour", "toujours", and phrases
# like "stock de 7 jours", none of which make the indicator a duration.
DAYS_PATTERN = re.compile(r"\b(delai|delais|duree|temps moyen|mediane du delai|nombre de jours entre)\b")
RATIO_WORDS = ("ratio", "par rapport au nombre", "parrapport au nombre")
# Words that describe a failure being measured: a lower value is the good outcome.
# Kept deliberately narrow, because in a percentage the subject word ("décès",
# "nouveaux cas") is usually the denominator, not the thing you want less of —
# "proportion de décès ayant bénéficié d'un enterrement digne" wants to go up.
FAILURE_WORDS = (
    "perdu", "perte", "rupture", "echec", "abandon", "refus", "reticence",
    "retard", "letalite", "mortalite", "incident", "plainte", "non conforme",
)
# For bare counts, the epidemiological quantities you want driven to zero.
COUNT_LOWER_WORDS = ("nouveaux cas", "deces", "alerte non", "rupture de stock")


def deaccent(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(text)) if unicodedata.category(c) != "Mn"
    ).lower()


def split_label(raw, lang):
    """Return (indicator label, raw target string) for one language."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None, None
    text = str(raw).replace("\xa0", " ").strip()
    marker = TARGET_MARKERS[lang]
    parts = re.split(rf"\n\s*{marker}\s*:?\s*", text, maxsplit=1)
    label = re.sub(r"\s+", " ", parts[0]).strip()
    target = re.sub(r"\s+", " ", parts[1]).strip() if len(parts) > 1 else None
    return label, target


def parse_target(raw):
    """Turn 'Cible : ≤ à 4 jour' into a comparable number plus its operator."""
    if raw is None:
        return None, None, False
    text = raw.replace(",", ".").strip()
    if text in {"—", "-", "–", ""} or deaccent(text).startswith("non defini"):
        return None, None, False
    # Check two-character operators before the bare "<" / ">" so "<=" is not
    # read twice; the form writes targets like "<50%" with no equals sign.
    operator = "="
    if any(sym in text for sym in ("≤", "<=", "au plus", "moins de")):
        operator = "<="
    elif any(sym in text for sym in ("≥", ">=", "au moins", "plus de")):
        operator = ">="
    elif "<" in text:
        operator = "<="
    elif ">" in text:
        operator = ">="
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None, operator, False
    return float(match.group(0)), operator, True


def classify(label_fr, target, operator, has_target):
    """Guess the unit and the desirable direction.

    The target decides wherever it can: a target of 0 means less is better, a
    target at the top of a percentage scale means more is better. Keywords are
    only the fallback, for the 55 indicators that carry no numeric target.
    """
    flat = deaccent(label_fr)
    # Percentage wins over duration: "% traités dans un délai de 24h" is a percentage.
    if any(word in flat for word in PERCENT_WORDS):
        unit = "percent"
    elif DAYS_PATTERN.search(flat):
        unit = "days"
    elif any(word in flat for word in RATIO_WORDS):
        unit = "ratio"
    else:
        unit = "count"

    if unit == "days":
        return unit, "lower"
    if has_target and target == 0:
        return unit, "lower"
    if operator == "<=":
        return unit, "lower"
    if has_target and unit in ("percent", "ratio") and target is not None:
        scaled = target * 100 if target <= 1 else target
        if scaled >= 50:
            return unit, "higher"
    if any(word in flat for word in FAILURE_WORDS):
        return unit, "lower"
    if unit == "count" and any(word in flat for word in COUNT_LOWER_WORDS):
        return unit, "lower"
    return unit, "higher"


def code_from_name(name):
    """realisation_s12 -> S12 ; realisation_ed3 -> ED3"""
    stem = name.split("_", 1)[1]
    letters = re.match(r"[a-z]+", stem).group(0)
    digits = stem[len(letters):]
    return f"{letters.upper()}{digits}"


def main(form_path):
    book = pd.ExcelFile(form_path)
    survey = book.parse("survey").where(lambda d: d.notna(), None)
    choices = book.parse("choices")
    settings = book.parse("settings").iloc[0]

    pillar_labels = {
        row["name"]: {
            "fr": row["label::French"],
            "en": row["label::English"],
        }
        for _, row in choices[choices["list_name"] == "response_pillar"].iterrows()
        if row["name"] != "all"
    }

    pillars, indicators = [], []
    current_group = None
    current_pillar = None
    pending = None  # the note row waiting for its matching decimal row
    order = 0

    for _, row in survey.iterrows():
        rtype, name = str(row["type"]), row["name"]

        if rtype.startswith("begin_group"):
            current_group = name
            relevant = str(row.get("relevant") or "")
            found = re.findall(r"'(pillar_\d+)'", relevant)
            current_pillar = found[-1] if found else None
            pillars.append({
                "id": current_pillar,
                "group": current_group,
                "order": int(re.search(r"\d+", current_pillar).group(0)) if current_pillar else 999,
                "label": pillar_labels.get(current_pillar, {"fr": name, "en": name, "pt": name}),
            })
            continue

        if rtype == "end_group":
            current_group, current_pillar = None, None
            continue

        if rtype == "note" and str(name).startswith("target_"):
            label_fr, target_fr = split_label(row["label::French"], "fr")
            label_en, target_en = split_label(row["label::English"], "en")
            pending = {
                "note_field": name,
                "label": {"fr": label_fr, "en": label_en},
                "target_raw": target_fr or target_en,
            }
            continue

        if rtype == "decimal" and str(name).startswith("realisation_") and pending:
            order += 1
            code = code_from_name(name)
            label_fr = pending["label"]["fr"] or ""
            # Strip the leading "S12 - " so the code is not printed twice in the UI.
            clean = {
                lang: re.sub(rf"^{code}\s*[-–]\s*", "", value or "", flags=re.I)
                for lang, value in pending["label"].items()
            }
            value, operator, has_target = parse_target(pending["target_raw"])
            unit, direction = classify(label_fr, value, operator, has_target)
            record = {
                "id": code.lower(),
                "code": code,
                "order": order,
                "pillar": current_pillar,
                "group": current_group,
                "label": clean,
                "value_field": f"{current_group}/{name}",
                "comment_field": f"{current_group}/comment_{name.split('_', 1)[1]}",
                "unit": unit,
                "direction": direction,
                "target_raw": pending["target_raw"],
                "target": value,
                "target_operator": operator,
                "has_target": has_target,
            }
            # A percentage target written as 1 almost certainly means 100 %.
            record["target_scale_suspect"] = bool(
                has_target and unit in ("percent", "ratio") and value is not None and 0 < value <= 1
            )
            indicators.append(record)
            pending = None

    if OVERRIDES.exists():
        overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
        by_id = {ind["id"]: ind for ind in indicators}
        for key, patch in overrides.get("indicators", {}).items():
            if key.lower() in by_id:
                by_id[key.lower()].update(patch)
                by_id[key.lower()]["overridden"] = True

    payload = {
        "form": {
            "title": settings["form_title"],
            "id_string": settings["form_id"],
            "version": str(settings["version"]),
            "default_language": settings["default_language"],
            "enketo_url": "https://enketo.whonghub.org/x/PlEb7CW2",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pillars": sorted(pillars, key=lambda p: p["order"]),
        "indicators": indicators,
        "meta_fields": {
            "respondent_name": "respondent_name",
            "respondent_email": "respondent_email",
            "reporting_date": "reporting_date",
            "response_pillar": "response_pillar",
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    suspects = [i["code"] for i in indicators if i["target_scale_suspect"]]
    print(f"{len(indicators)} indicators across {len(pillars)} pillars -> {OUT}")
    print(f"  with a numeric target : {sum(i['has_target'] for i in indicators)}")
    print(f"  percent/ratio targets written as a fraction (check these): {len(suspects)}")
    if suspects:
        print("  " + ", ".join(suspects))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FORM)
