# Tableau de bord — Indicateurs National OMS BVD

A static dashboard for the 124 KPIs collected through the Ona form
[`bvd_oms_kpis_drc_2026`](https://enketo.whonghub.org/x/PlEb7CW2), organised by the eleven
response pillars. GitHub Actions pulls the submissions on a schedule and commits them as JSON;
GitHub Pages serves the page. There is no server, no database and no build step, so the only
thing that can break is the API call, and it breaks visibly in the Actions log.

```
form/        the published XLSForm — the source of truth for labels, targets and pillars
scripts/     build_indicators.py (form → registry) · fetch_data.py (Ona → data) · make_sample_data.py
config/      overrides.json — your corrections to what the parser infers
docs/        the site itself, served by GitHub Pages
docs/data/   indicators.json (registry) · submissions.json (values) · kpi_long.csv (tidy export)
```

## Setting it up once

1. Create the repository and push this folder to `main`.
2. In **Settings → Pages**, set the source to *Deploy from a branch*, branch `main`, folder
   `/docs`. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.
3. Get an API token: sign in at <https://whonghub.org>, open your account settings and copy the
   API token. Anyone who can see the form's data on Ona can generate one.
4. In **Settings → Secrets and variables → Actions**, add a repository secret named `ONA_TOKEN`
   with that value. Optionally add a repository *variable* `ONA_FORM_ID` with the numeric form id
   — without it the script looks the form up by its `id_string` on every run, which costs one
   extra request and needs the token's account to have the form listed.
5. Open the **Actions** tab, select *refresh-data* and run it once by hand. It rebuilds the
   registry, downloads the submissions, and commits `docs/data/`. Reload the page and the
   demonstration banner disappears.

Running it locally is the same two commands:

```bash
pip install -r requirements.txt
python scripts/build_indicators.py
ONA_TOKEN=xxxxxxxx python scripts/fetch_data.py
python -m http.server -d docs 8000      # then open http://localhost:8000
```

## When the form changes

Republish the XLSForm on Ona, drop the new `.xlsx` into `form/`, and push. The workflow picks up
any change under `form/` and regenerates `docs/data/indicators.json`, so new indicators, retitled
indicators and revised targets all flow through without touching the dashboard code. Indicator
ids come from the field names (`realisation_s12` → `S12`), so keep those stable and the history
stays joined up.

## Targets, and the one thing worth fixing in the form

Targets live inside the `note` label of each indicator (`Cible : 90`), which is why the parser
reads them out of the label text rather than a dedicated column. Sixty-nine of the 124 indicators
carry a numeric target; the rest are recorded as `—` or *Non défini* and are displayed as values
without a status.

Among the indicators that do have targets, thirty-five percentages are written as a fraction
(`Cible : 1`, `Cible : 0.9`) while the others use whole numbers (`Cible : 90`, `Cible : 100`).
The dashboard reconciles this by treating any percentage target of 1 or less as a fraction and
multiplying by 100, and marks those rows with a small ⚠ so the inconsistency stays visible. The
durable fix is in the form itself: pick one convention, state it in the hint so that data entry
follows it too, and republish. Until then there is a real risk that a focal point enters `0.9`
where another enters `90`, and no dashboard can tell those apart after the fact.

Whether a lower value is good or bad is inferred: a target of 0 or an `≤` operator means lower is
better, a percentage target at or above 50 means higher is better, and the remainder falls back to
the wording of the label. Where that inference is wrong, correct it in `config/overrides.json`
rather than in the script — overrides are re-applied after every rebuild.

## Reading the page

The status chip compares the latest value in the selected period against the target: on target
when the value meets it, *à surveiller* within 20 % of it, off target beyond that. Indicators with
no target are shown as *sans cible* and are deliberately excluded from the on-target percentage,
so that percentage always has a defensible denominator.

The completeness grid is the part worth watching. Each row is a pillar, each column a week, and
the shade is the share of that pillar's indicators filled in that week. A blank column across
several pillars usually means a reporting failure rather than an epidemiological one, and it is
much easier to see there than in a table of values. The column for the week still running is
italicised: it is incomplete by definition, not by fault.

A missing value means *not reported*, never zero, and the dashboard never fills a gap with a zero.

## The weekly model, and how submissions are combined

Reporting is weekly. A week runs Sunday to Saturday and is named by its closing Saturday; a
report is due by the end of the following Tuesday, and only a submission arriving after that is
labelled *en retard*. Each submission is filed under the week containing its `reporting_date`.

Two things about the form make the arithmetic less obvious than it looks, and both are handled in
`docs/app.js` rather than by asking focal points to change how they work:

*One submission can cover every pillar.* `response_pillar` offers **TOUS / ALL** alongside the
eleven pillars, and choosing it makes all eleven groups relevant in a single submission. `all` is
not a pillar, so the dashboard attributes such a submission to each pillar it actually carries
data for. Read literally, it credited the report to a twelfth pillar that does not exist, and the
eleven real ones showed *Aucun rapport sur la période*.

*A pillar may send several submissions for one week.* Focal points do submit day by day, or send a
correction after the fact. The reports for a pillar and week are merged indicator by indicator in
submission order: a later report replaces the indicators it fills in and leaves the rest of the
week's values standing. The alternative — letting the newest submission replace the week outright
— silently discarded every value that a partial follow-up had left blank.

The summary tiles describe one week: the last *closed* week of the selected period. Headlining the
week still in progress made the six pillars whose reports were not due yet look like six missing
reports.

## Personal data

Every submission carries the respondent's name and email. `fetch_data.py` drops the email and
reduces the name to initials before anything is written to `docs/data/`, because that folder is
published to a URL anyone can read. So the dashboard shows "P. G." rather than the full name.

**Both defaults are on.** To publish full names instead — only if that is a deliberate decision —
set the repository variable `REDACT_NAMES` to `0`. `scripts/scrub_published.py` runs in CI after
the fetch as a second check, and can be run by hand to clean files written before this was the
default:

```bash
python scripts/scrub_published.py     # idempotent; respects REDACT_NAMES=0
```

`docs/index.html` also sends `noindex, nofollow, noarchive` so the page is not meant to be indexed.

What that does **not** solve: if the repository is public, everything in `docs/data/` is still
readable by anyone with the URL — the values and, importantly, the free-text comments the focal
points type in, which are not written with publication in mind. Redacting names reduces the harm;
it does not make the folder private. For a genuinely internal audience, keep the repository private
— GitHub Pages on a private repository needs a paid plan, and the alternative is to serve the same
`docs/` folder from any internal host, since it is a plain static folder with no dependencies.
