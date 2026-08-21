/* Indicateurs BVD — dashboard logic.
   No build step, no dependencies: two JSON files in, one page out.

   Reporting model (per K. Gausi, Aug 2026): reporting is WEEKLY.
   - A week runs Sunday..Saturday and is labelled by its closing Saturday.
   - Each submission is bucketed into the week that contains its reporting
     date, and attributed to every pillar it carries data for. The form's
     response_pillar answer can be "all" (TOUS), which opens all eleven
     pillar groups at once, so it is not itself a pillar id.
   - Several submissions may cover the same pillar and week. They are merged
     indicator by indicator in submission order: a later report replaces the
     indicators it fills in and leaves the rest of the week's values
     standing, so nothing already reported is dropped.
   - Reports are due the Tuesday after the week's closing Saturday; only a
     submission arriving after that is flagged "late". The form enforces
     nothing, the dashboard only labels.
   - Completeness is judged against the pillars that reported, never
     against the whole form.
   - The tiles headline the last *closed* week of the selected period. An
     in-progress week is labelled as such, because it is always short of the
     pillars whose reports are not due yet. */

const T = {
  fr: {
    period: "Période", pillar: "Pilier", status: "Statut",
    export: "Exporter CSV", w1: "Semaine en cours", w4: "4 dernières semaines",
    w12: "12 dernières semaines", all: "Tout l'historique", allPillars: "Tous les piliers",
    stAll: "Tous", stOk: "Cible atteinte", stWatch: "À surveiller", stOff: "Hors cible",
    stNone: "Non renseigné", noTarget: "Sans cible",
    tilePillars: "Piliers ayant rapporté", tileFilled: "Indicateurs renseignés",
    onTarget: "Cible atteinte", offTarget: "Hors cible", reports: "Rapports reçus",
    evaluated: "des indicateurs évalués", weekAbbr: "sem. au", late: "En retard",
    lateN: "en retard", deltaCol: "Δ sem.", openWeek: "semaine en cours",
    attnTitle: "Points d'attention",
    attnEmpty: "Rien à signaler : tous les indicateurs rapportés avec cible sont dans la cible.",
    attnOff: "hors cible", attnWatch: "à surveiller",
    coverageTitle: "Complétude du rapportage",
    coverageSub: "indicateurs renseignés par semaine, par rapport aux indicateurs du pilier",
    noReport: "Aucun rapport sur la période",
    code: "Code", indicator: "Indicateur", latest: "Dernière valeur", target: "Cible",
    trend: "Tendance", none: "—", week: "Semaine",
    empty: "Aucun indicateur ne correspond à ces filtres.",
    sample: "Données de démonstration.",
    sampleBody: "Ce tableau de bord affiche un jeu de données fictif. Il sera remplacé par les vraies soumissions dès la première exécution de l'action GitHub <code>refresh-data</code>.",
    scaleWarn: "Cible saisie en fraction (1 = 100 %) dans le formulaire ; affichée ici sur 100.",
    comments: "Commentaires des rapporteurs", history: "Historique", reportedBy: "Rapporté par",
    updated: "Données actualisées le", version: "Version du formulaire", openForm: "Ouvrir le formulaire",
    noComment: "Aucun commentaire saisi sur la période.",
    footer: "Source : formulaire ONA hébergé sur whonghub.org. Les valeurs sont celles saisies par les points focaux des piliers, sans retraitement. Rapportage hebdomadaire : semaine du dimanche au samedi, à rapporter au plus tard le mardi suivant. Plusieurs soumissions pour un même pilier et une même semaine sont fusionnées indicateur par indicateur, la saisie la plus récente l'emportant sur la précédente ; aucune valeur déjà rapportée n'est écartée. Une soumission faite avec le pilier « TOUS » alimente les onze piliers.",
  },
  en: {
    period: "Period", pillar: "Pillar", status: "Status",
    export: "Export CSV", w1: "Current week", w4: "Last 4 weeks",
    w12: "Last 12 weeks", all: "Full history", allPillars: "All pillars",
    stAll: "All", stOk: "On target", stWatch: "Watch", stOff: "Off target",
    stNone: "Not reported", noTarget: "No target",
    tilePillars: "Pillars reporting", tileFilled: "Indicators filled",
    onTarget: "On target", offTarget: "Off target", reports: "Reports received",
    evaluated: "of indicators with a target", weekAbbr: "week ending", late: "Late",
    lateN: "late", deltaCol: "Δ week", openWeek: "week in progress",
    attnTitle: "Needs attention",
    attnEmpty: "Nothing to flag: every reported indicator with a target is on target.",
    attnOff: "off target", attnWatch: "to watch",
    coverageTitle: "Reporting completeness",
    coverageSub: "indicators filled per week, out of the pillar's own indicators",
    noReport: "No report in this period",
    code: "Code", indicator: "Indicator", latest: "Latest value", target: "Target",
    trend: "Trend", none: "—", week: "Week",
    empty: "No indicator matches these filters.",
    sample: "Demonstration data.",
    sampleBody: "This dashboard is showing a fictional dataset. It is replaced by real submissions on the first run of the <code>refresh-data</code> GitHub action.",
    scaleWarn: "Target entered as a fraction (1 = 100%) in the form; shown here out of 100.",
    comments: "Reporter comments", history: "History", reportedBy: "Reported by",
    updated: "Data refreshed", version: "Form version", openForm: "Open the form",
    noComment: "No comment recorded for this period.",
    footer: "Source: ONA form hosted on whonghub.org. Values are as entered by pillar focal points, with no reprocessing. Weekly reporting: weeks run Sunday to Saturday, due by the following Tuesday. Several submissions for the same pillar and week are merged indicator by indicator, the most recent entry winning; no value already reported is discarded. A submission filed under the pillar \"ALL\" feeds all eleven pillars.",
  },
};

const state = {
  lang: "fr", period: "4", pillar: "all", status: "all",
  manual: new Map(),   // pillar id -> user-chosen collapsed state
  openRow: null,
};
let REG = null, SUB = null, BY_ID = {}, PILLARS = new Set(), WEEKS = [], CURWEEK = null;

const $ = (sel, root = document) => root.querySelector(sel);
const t = (key) => T[state.lang][key] ?? key;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- weeks ---------- */

// The Saturday that closes the Sunday..Saturday week containing dateStr.
function weekEnd(dateStr) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

function buildWeeks() {
  const subWeeks = SUB.submissions.filter((s) => s.date).map((s) => weekEnd(s.date)).sort();
  const gen = (SUB.generated_at || "").slice(0, 10);
  // The current reporting week is the one closed by the most recent Saturday
  // (reports arrive Saturday..Tuesday for the week that just ended).
  const today = new Date(`${gen}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 1) % 7));
  CURWEEK = today.toISOString().slice(0, 10);
  const last = [CURWEEK, ...subWeeks].sort().at(-1);
  const first = subWeeks.length ? subWeeks[0] : CURWEEK;
  const out = [];
  const cur = new Date(`${first}T00:00:00Z`);
  const stop = new Date(`${last}T00:00:00Z`);
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  WEEKS = out;
}

function periodWeeks() {
  if (state.period === "all") return WEEKS;
  return WEEKS.slice(-Number(state.period));
}

/* ---------- indicator maths ---------- */

// A percentage target written as 0.9 in the form means 90.
function targetOf(ind) {
  if (!ind.has_target || ind.target === null) return null;
  if ((ind.unit === "percent" || ind.unit === "ratio") && ind.target > 0 && ind.target <= 1) return ind.target * 100;
  return ind.target;
}

function statusOf(value, ind) {
  if (value === undefined || value === null) return "none";
  const target = targetOf(ind);
  if (target === null) return "nt";
  if (ind.direction === "lower") {
    if (target === 0) {
      if (value <= 0) return "ok";
      return value <= (ind.unit === "percent" ? 5 : 1) ? "watch" : "off";
    }
    if (value <= target) return "ok";
    return value <= target * 1.25 ? "watch" : "off";
  }
  if (target === 0) return value <= 0 ? "ok" : "off";
  const ratio = value / target;
  if (ratio >= 0.995) return "ok";
  return ratio >= 0.8 ? "watch" : "off";
}

function chipClass(st) { return st === "nt" ? "nt" : st; }
function chipLabel(st) {
  return { ok: t("stOk"), watch: t("stWatch"), off: t("stOff"), none: t("stNone"), nt: t("noTarget") }[st];
}

function fmt(value, unit) {
  if (value === undefined || value === null) return t("none");
  if (unit === "percent") return `${(Math.round(value * 10) / 10).toLocaleString()}<span class="unit"> %</span>`;
  if (unit === "days") return `${(Math.round(value * 10) / 10).toLocaleString()}<span class="unit"> j</span>`;
  if (unit === "ratio") return (Math.round(value * 100) / 100).toLocaleString();
  return Math.round(value).toLocaleString();
}
function fmtPlain(value, unit) {
  if (value === undefined || value === null) return t("none");
  if (unit === "percent") return `${Math.round(value * 10) / 10} %`;
  if (unit === "days") return `${Math.round(value * 10) / 10} j`;
  if (unit === "ratio") return String(Math.round(value * 100) / 100);
  return String(Math.round(value));
}
function targetText(ind) {
  const target = targetOf(ind);
  if (target === null) return t("noTarget");
  return `${ind.direction === "lower" ? "≤" : "≥"} ${target.toLocaleString()}`;
}

// Week-on-week movement, coloured by whether the move is desirable.
function deltaCell(points, ind) {
  if (points.length < 2) return `<span class="delta flat">${t("none")}</span>`;
  const prev = points[points.length - 2].value, curr = points[points.length - 1].value;
  const diff = curr - prev;
  if (Math.abs(diff) < 1e-9) return `<span class="delta flat">=</span>`;
  const good = ind.direction === "lower" ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? "▲" : "▼";
  const mag = ind.unit === "ratio" ? Math.round(Math.abs(diff) * 100) / 100 : Math.round(Math.abs(diff) * 10) / 10;
  return `<span class="delta ${good ? "good" : "bad"}">${arrow} ${mag.toLocaleString()}</span>`;
}

/* ---------- weekly selection ---------- */

// The window stays open until the Tuesday after the week's closing Saturday —
// the deadline WHO states in the form's own notice. Counting from Saturday
// instead marked every report filed on the Sunday..Tuesday it was due as late.
const DEADLINE_DAYS = 3;

function deadlineOf(week) {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DEADLINE_DAYS);
  return d.toISOString().slice(0, 10);
}

// response_pillar carries one pillar, or "all" (TOUS), which makes every pillar
// group relevant so one submission can cover the whole form. "all" is not a
// pillar id: attribute the submission to the pillars it actually carries data
// for, and fall back to the named pillar when it reported no value at all.
function pillarsOfSub(sub) {
  const found = new Set();
  for (const key of Object.keys(sub.values || {})) if (BY_ID[key]) found.add(BY_ID[key].pillar);
  for (const key of Object.keys(sub.comments || {})) if (BY_ID[key]) found.add(BY_ID[key].pillar);
  for (const key of Object.keys(sub.general_comments || {})) if (PILLARS.has(key)) found.add(key);
  if (PILLARS.has(sub.pillar)) found.add(sub.pillar);
  return [...found];
}

// One report per pillar per week, merged from every submission covering it in
// submission order: a later report replaces the indicators it fills in and
// leaves the others standing. Letting the latest submission replace the week
// wholesale discarded whatever a partial follow-up had left blank.
function weeklyWinners(weeks) {
  const keep = new Set(weeks);
  const winners = new Map(); // "pillar|week" -> merged report
  const ordered = SUB.submissions
    .filter((s) => s.date)
    .slice()
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));

  for (const sub of ordered) {
    const week = weekEnd(sub.date);
    if (!keep.has(week)) continue;
    const late = String(sub.submitted_at || "").slice(0, 10) > deadlineOf(week);
    for (const pillar of pillarsOfSub(sub)) {
      const key = `${pillar}|${week}`;
      let report = winners.get(key);
      if (!report) {
        // "late" describes the pillar's first report for the week: a punctual
        // report amended afterwards is not retrospectively late.
        report = { week, pillar, late, values: new Map(), general: "", subs: new Set() };
        winners.set(key, report);
      }
      report.subs.add(sub.id);
      for (const [id, value] of Object.entries(sub.values || {})) {
        if (BY_ID[id]?.pillar !== pillar) continue;
        report.values.set(id, { value, comment: sub.comments?.[id] || "", by: sub.by, late, rdate: sub.date });
      }
      const general = sub.general_comments?.[pillar];
      if (general) report.general = general;
    }
  }
  return winners;
}

// indicator id -> [{week, value, comment, by, late, rdate}] ordered by week.
// One point per week, since each pillar-week is now a single merged report.
function seriesByIndicator(winners) {
  const out = {};
  for (const report of winners.values()) {
    for (const [id, point] of report.values) {
      (out[id] ||= []).push({ week: report.week, ...point });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.week.localeCompare(b.week));
  return out;
}

function visibleIndicators(series) {
  return REG.indicators.filter((ind) => {
    if (state.pillar !== "all" && ind.pillar !== state.pillar) return false;
    if (state.status !== "all") {
      const list = series[ind.id];
      const last = list && list.length ? list[list.length - 1].value : undefined;
      if (statusOf(last, ind) !== state.status) return false;
    }
    return true;
  });
}

/* ---------- drawing ---------- */

const STATUS_COLOR = { ok: "var(--ok)", watch: "var(--watch)", off: "var(--off)", none: "var(--none)", nt: "var(--none)" };

function sparkline(points, ind, width = 96, height = 26) {
  if (!points.length) return "";
  const values = points.map((p) => p.value);
  const target = targetOf(ind);
  const lo = Math.min(...values, target ?? Infinity);
  const hi = Math.max(...values, target ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 4;
  const x = (i) => (points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (points.length - 1));
  const y = (v) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const colour = STATUS_COLOR[statusOf(last.value, ind)];
  const targetLine = target === null ? "" :
    `<line x1="0" y1="${y(target).toFixed(1)}" x2="${width}" y2="${y(target).toFixed(1)}" stroke="var(--thr)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>`;
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    ${targetLine}
    <path d="${path}" fill="none" stroke="var(--ink-2)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="3.2" fill="${colour}" stroke="var(--card)" stroke-width="1.5"/>
  </svg>`;
}

const tick = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString();

function seriesChart(points, ind) {
  const width = 680, height = 190, padL = 48, padR = 14, padT = 16, padB = 28;
  const values = points.map((p) => p.value);
  const target = targetOf(ind);
  const lo = Math.min(...values, target ?? Infinity, 0);
  const hi = Math.max(...values, target ?? -Infinity) || 1;
  const span = hi - lo || 1;
  const x = (i) => (points.length === 1 ? (width - padR + padL) / 2 : padL + (i * (width - padL - padR)) / (points.length - 1));
  const y = (v) => height - padB - ((v - lo) / span) * (height - padT - padB);

  const grid = [lo, lo + span / 2, hi].map((v) =>
    `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${width - padR}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>
     <text x="${padL - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${tick(v)}</text>`).join("");

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");

  const last = points.length - 1;
  const dots = points.map((p, i) => {
    const colour = i === last ? STATUS_COLOR[statusOf(p.value, ind)] : "var(--accent)";
    const tip = `${t("weekAbbr")} ${p.week}\n${fmtPlain(p.value, ind.unit)}${p.late ? ` · ${t("late")}` : ""}${p.by ? `\n${t("reportedBy")} ${p.by}` : ""}`;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="${colour}" stroke="var(--wash)" stroke-width="2" pointer-events="none"/>
      <circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="13" fill="transparent" data-tip="${esc(tip)}" tabindex="0"/>`;
  }).join("");

  const targetLine = target === null ? "" :
    `<line x1="${padL}" y1="${y(target).toFixed(1)}" x2="${width - padR}" y2="${y(target).toFixed(1)}" stroke="var(--thr)" stroke-width="1.5" stroke-dasharray="4 3"/>
     <text x="${width - padR}" y="${(y(target) - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--thr)">${esc(t("target"))} ${targetText(ind)}</text>`;

  const ticks = points.map((p, i) => (i === 0 || i === points.length - 1 || points.length < 9)
    ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${p.week.slice(5)}</text>` : "").join("");

  return `<svg class="series" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t("history"))}">
    ${grid}${targetLine}
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${ticks}
  </svg>`;
}

/* ---------- render ---------- */

function renderSummary(series, winners, range) {
  // Headline the last CLOSED week of the period. An in-progress week is always
  // missing the pillars whose reports are not due yet, and putting it in the
  // tiles reads as a reporting failure that has not happened.
  const closed = range.filter((w) => w <= CURWEEK);
  const week = (closed.length ? closed : range).at(-1);
  const weekWinners = [...winners.values()].filter((w) => w.week === week);
  const reportingNow = new Set(weekWinners.map((w) => w.pillar));
  const expected = REG.indicators.filter((i) => reportingNow.has(i.pillar)).length;

  let filled = 0;
  const counts = { ok: 0, watch: 0, off: 0, nt: 0, none: 0 };
  for (const report of weekWinners) {
    for (const [id, point] of report.values) {
      const ind = BY_ID[id];
      if (!ind) continue;
      filled++;
      counts[statusOf(point.value, ind)]++;
    }
  }
  const evaluated = counts.ok + counts.watch + counts.off;
  const lateN = weekWinners.filter((w) => w.late).length;
  const reportsN = new Set(weekWinners.flatMap((w) => [...w.subs])).size;
  const weekSub = `${t("weekAbbr")} ${week.slice(5)}${week > CURWEEK ? ` · ${t("openWeek")}` : ""}`;

  const cards = [
    { k: t("tilePillars"), v: `${reportingNow.size}<span class="of"> / ${REG.pillars.length}</span>`, s: weekSub, cls: "" },
    { k: t("tileFilled"), v: `${filled}<span class="of">${expected ? ` / ${expected}` : ""}</span>`,
      s: expected ? `${Math.round((filled / expected) * 100)} % · ${weekSub}` : weekSub, cls: "" },
    { k: t("onTarget"), v: `${counts.ok}`,
      s: evaluated ? `${Math.round((counts.ok / evaluated) * 100)} % ${t("evaluated")}` : weekSub, cls: "ok" },
    { k: t("stWatch"), v: `${counts.watch}`, s: weekSub, cls: counts.watch ? "watch" : "" },
    { k: t("offTarget"), v: `${counts.off}`, s: weekSub, cls: counts.off ? "off" : "" },
    { k: t("reports"), v: `${reportsN}`, s: lateN ? `${lateN} ${t("lateN")}` : weekSub, cls: "" },
  ];
  $("#summary").innerHTML = cards.map((c) =>
    `<div class="stat ${c.cls}"><div class="k">${esc(c.k)}</div><div class="v">${c.v}</div><div class="s">${esc(c.s)}</div></div>`).join("");
}

function renderAttention(series) {
  const items = [];
  for (const ind of REG.indicators) {
    const list = series[ind.id];
    if (!list?.length) continue;
    const lastPoint = list[list.length - 1];
    const st = statusOf(lastPoint.value, ind);
    if (st === "off" || st === "watch") items.push({ ind, lastPoint, st });
  }
  const rank = { off: 0, watch: 1 };
  items.sort((a, b) => (rank[a.st] - rank[b.st]) || (a.ind.order - b.ind.order));

  const offN = items.filter((i) => i.st === "off").length;
  const attnSub = $("#attn-sub");
  if (attnSub) attnSub.textContent = items.length
    ? `${offN} ${t("attnOff")} · ${items.length - offN} ${t("attnWatch")}` : "";

  if (!items.length) {
    $("#attention").innerHTML = `<p class="attn-empty"><span class="dot">✓</span>${esc(t("attnEmpty"))}</p>`;
    return;
  }
  $("#attention").innerHTML = items.map(({ ind, lastPoint, st }) => {
    const pillar = REG.pillars.find((p) => p.id === ind.pillar);
    const pillarName = (pillar?.label[state.lang] || pillar?.label.fr || ind.pillar).split(".")[0];
    return `<button class="attn-row" data-goto="${ind.id}">
      <span class="chip ${chipClass(st)}">${esc(chipLabel(st))}</span>
      <span class="code">${esc(ind.code)}</span>
      <span class="lbl">${esc(ind.label[state.lang] || ind.label.fr)}</span>
      <span class="val">${fmt(lastPoint.value, ind.unit)}</span>
      <span class="vs">${esc(t("target"))} ${esc(targetText(ind))} · ${esc(t("weekAbbr"))} ${esc(lastPoint.week.slice(5))}</span>
      <span class="tag">P${esc(pillarName)}</span>
    </button>`;
  }).join("");
}

function renderCoverage(winners, range) {
  const total = {};
  for (const ind of REG.indicators) total[ind.pillar] = (total[ind.pillar] || 0) + 1;

  const head = `<tr><th class="row-head"></th>${range.map((w) => {
    const open = w > CURWEEK;
    const tip = `${t("weekAbbr")} ${w}${open ? ` · ${t("openWeek")}` : ""}`;
    return `<th class="date-head${open ? " open" : ""}" data-tip="${esc(tip)}"><span>${w.slice(5)}</span></th>`;
  }).join("")}</tr>`;
  const rows = REG.pillars.map((p) => {
    const name = p.label[state.lang] || p.label.fr;
    const cells = range.map((w) => {
      const winner = winners.get(`${p.id}|${w}`);
      const got = winner ? winner.values.size : 0;
      const share = total[p.id] ? got / total[p.id] : 0;
      const bin = share <= 0 ? 0 : share < .25 ? 1 : share < .5 ? 2 : share < .75 ? 3 : share < .995 ? 4 : 5;
      const tip = `${name}\n${t("weekAbbr")} ${w}\n${got}/${total[p.id] || 0} (${Math.round(share * 100)} %)${winner?.late ? `\n${t("late")}` : ""}`;
      return `<td><span class="cell" style="background:var(--c${bin})" data-tip="${esc(tip)}">${winner?.late ? '<i class="late-dot"></i>' : ""}</span></td>`;
    }).join("");
    return `<tr><th class="row-head" title="${esc(name)}">${esc(name)}<span class="n">${total[p.id] || 0}</span></th>${cells}</tr>`;
  }).join("");

  $("#coverage").innerHTML = `<table>${head}${rows}</table>`;
  const covSub = $("#coverage-sub");
  if (covSub) covSub.textContent = t("coverageSub");
  $("#coverage-legend").innerHTML = ["0", "< 25 %", "25–50 %", "50–75 %", "75–99 %", "100 %"]
    .map((lab, i) => `<span><span class="swatch" style="background:var(--c${i})"></span>${lab}</span>`).join("")
    + `<span><span class="swatch" style="background:var(--c3);position:relative"><i class="late-dot"></i></span>${esc(t("late"))}</span>`;
}

function isCollapsed(pillarId, hasData) {
  if (state.manual.has(pillarId)) return state.manual.get(pillarId);
  if (state.pillar === pillarId) return false;
  return !hasData;
}

function renderPillars(series, winners, range) {
  const indicators = visibleIndicators(series);
  if (!indicators.length) {
    $("#pillars").innerHTML = `<div class="panel"><div class="empty">${esc(t("empty"))}</div></div>`;
    return;
  }
  const grouped = {};
  for (const ind of indicators) (grouped[ind.pillar] ||= []).push(ind);

  const html = REG.pillars.filter((p) => grouped[p.id]).map((p) => {
    const list = grouped[p.id];
    const withData = list.filter((i) => series[i.id]?.length);
    const evaluated = withData.filter((i) => statusOf(series[i.id].at(-1).value, i) !== "nt");
    const ok = evaluated.filter((i) => statusOf(series[i.id].at(-1).value, i) === "ok").length;
    const pct = evaluated.length ? Math.round((ok / evaluated.length) * 100) : 0;
    const collapsed = isCollapsed(p.id, withData.length > 0);
    const name = p.label[state.lang] || p.label.fr;

    const pillarWins = range.map((w) => winners.get(`${p.id}|${w}`)).filter(Boolean);
    const lastWin = pillarWins[pillarWins.length - 1];

    const general = lastWin?.general;
    const generalHtml = general && !collapsed
      ? `<p class="gencomment"><span class="when">${esc(t("weekAbbr"))} ${esc(lastWin.week.slice(5))}</span>${esc(general)}</p>` : "";

    const meta = lastWin
      ? `<span class="count">${withData.length}/${list.length} · ${pct} % ${esc(t("onTarget")).toLowerCase()} · ${esc(t("weekAbbr"))} ${esc(lastWin.week.slice(5))}</span>${lastWin.late ? `<span class="tag-late">${esc(t("late"))}</span>` : ""}`
      : `<span class="badge">${esc(t("noReport"))}</span>`;
    const bar = lastWin && evaluated.length
      ? `<span class="bar"><i style="width:${pct}%"></i></span>` : `<span class="bar" style="visibility:hidden"></span>`;

    const rows = collapsed ? "" : list.map((ind) => indicatorRow(ind, series[ind.id] || [])).join("");
    return `<section class="panel" id="sec-${p.id}">
      <div class="pillar-head" role="button" tabindex="0" data-pillar="${p.id}" aria-expanded="${!collapsed}">
        <span class="chev">${collapsed ? "▸" : "▾"}</span>
        <h3>${esc(name)}</h3>
        ${meta}
        ${bar}
      </div>
      ${generalHtml}
      ${collapsed ? "" : `<table class="kpis">
        <thead><tr>
          <th>${esc(t("code"))}</th><th>${esc(t("indicator"))}</th>
          <th style="text-align:right">${esc(t("latest"))}</th>
          <th style="text-align:right" class="hide-sm">${esc(t("deltaCol"))}</th>
          <th style="text-align:right" class="hide-sm">${esc(t("target"))}</th>
          <th>${esc(t("status"))}</th><th class="hide-sm">${esc(t("trend"))}</th>
        </tr></thead><tbody>${rows}</tbody></table>`}
    </section>`;
  }).join("");
  $("#pillars").innerHTML = html;
}

function indicatorRow(ind, points) {
  const last = points.length ? points[points.length - 1] : null;
  const st = statusOf(last?.value, ind);
  const target = targetOf(ind);
  const label = ind.label[state.lang] || ind.label.fr;
  const warn = ind.target_scale_suspect ? `<span class="warn" data-tip="${esc(t("scaleWarn"))}">⚠</span>` : "";
  const open = state.openRow === ind.id;
  const detail = open ? detailRow(ind, points) : "";
  return `<tr class="expandable" data-ind="${ind.id}" id="row-${ind.id}" tabindex="0" aria-expanded="${open}">
      <td class="code">${esc(ind.code)}</td>
      <td class="label">${esc(label)}${warn}</td>
      <td class="num">${fmt(last?.value, ind.unit)}</td>
      <td class="num hide-sm">${deltaCell(points, ind)}</td>
      <td class="target hide-sm">${target === null ? t("none") : esc(targetText(ind))}</td>
      <td><span class="chip ${chipClass(st)}">${esc(chipLabel(st))}</span></td>
      <td class="hide-sm">${sparkline(points, ind)}</td>
    </tr>${detail}`;
}

function detailRow(ind, points) {
  const comments = points.filter((p) => p.comment);
  const chart = points.length ? seriesChart(points, ind) : `<p class="empty">${esc(t("stNone"))}</p>`;
  const list = comments.length
    ? `<ul class="comments">${comments.map((c) =>
        `<li><span class="when">${esc(t("weekAbbr"))} ${c.week.slice(5)}</span>${esc(c.comment)} <em>— ${esc(c.by || "")}</em></li>`).join("")}</ul>`
    : `<p style="color:var(--muted);margin:10px 0 0">${esc(t("noComment"))}</p>`;
  const last = points.at(-1);
  return `<tr class="detail"><td colspan="7"><div class="inner">
      <h4>${esc(ind.code)} · ${esc(t("history"))} ${last ? `· ${esc(t("reportedBy"))} ${esc(last.by || "—")} (${esc(t("weekAbbr"))} ${last.week.slice(5)}${last.late ? `, ${esc(t("late")).toLowerCase()}` : ""})` : ""}</h4>
      ${chart}
      <h4 style="margin-top:16px">${esc(t("comments"))}</h4>
      ${list}
    </div></td></tr>`;
}

function renderChrome() {
  document.documentElement.lang = state.lang;
  $("#form-title").textContent = REG.form.title;
  const when = new Date(SUB.generated_at);
  $("#form-meta").innerHTML =
    `${esc(t("updated"))} ${when.toLocaleString(state.lang)} · ${esc(t("version"))} ${esc(REG.form.version)} · ` +
    `<a href="${esc(REG.form.enketo_url)}" target="_blank" rel="noopener">${esc(t("openForm"))}</a>`;
  $("#footer-note").textContent = t("footer");

  const period = $("#f-period");
  [["1", t("w1")], ["4", t("w4")], ["12", t("w12")], ["all", t("all")]].forEach(([v, lab], i) => {
    period.options[i].value = v; period.options[i].textContent = lab;
  });
  period.value = state.period;

  const pillar = $("#f-pillar");
  pillar.innerHTML = `<option value="all">${esc(t("allPillars"))}</option>` +
    REG.pillars.map((p) => `<option value="${p.id}">${esc(p.label[state.lang] || p.label.fr)}</option>`).join("");
  pillar.value = state.pillar;

  const status = $("#f-status");
  [["all", t("stAll")], ["off", t("stOff")], ["watch", t("stWatch")], ["ok", t("stOk")], ["none", t("stNone")]]
    .forEach(([v, lab], i) => { status.options[i].value = v; status.options[i].textContent = lab; });
  status.value = state.status;

  document.querySelectorAll("[data-t]").forEach((el) => {
    const label = t(el.dataset.t);
    if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) el.firstChild.textContent = label;
    else el.prepend(document.createTextNode(label));
  });
  document.querySelectorAll(".langs button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));

  // Introductory note from WHO, shown ahead of everything else on the page.
  // Text lives in config/overrides.json so it survives a registry rebuild.
  const intro = (REG.form.notice || {})[state.lang] || (REG.form.notice || {}).fr || [];
  const blocks = [];
  if (intro.length) {
    blocks.push(`<div class="notice intro">${intro.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`);
  }
  if (SUB.source === "sample") {
    blocks.push(`<div class="notice"><strong>${esc(t("sample"))}</strong> ${t("sampleBody")}</div>`);
  }
  $("#notice-slot").innerHTML = blocks.join("");
}

function render() {
  const range = periodWeeks();
  const winners = weeklyWinners(range);
  const series = seriesByIndicator(winners);
  renderChrome();
  renderSummary(series, winners, range);
  renderAttention(series);
  renderCoverage(winners, range);
  renderPillars(series, winners, range);
}

/* ---------- tooltip ---------- */

const tip = () => $("#tip");
function moveTip(e) {
  const el = tip();
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = el.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}
function bindTooltip() {
  document.addEventListener("pointerover", (e) => {
    const src = e.target.closest?.("[data-tip]");
    if (!src) return;
    const el = tip();
    el.textContent = src.dataset.tip;
    el.style.display = "block";
    moveTip(e);
  });
  document.addEventListener("pointermove", (e) => {
    if (tip().style.display === "block" && e.target.closest?.("[data-tip]")) moveTip(e);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest?.("[data-tip]")) tip().style.display = "none";
  });
  document.addEventListener("focusin", (e) => {
    const src = e.target.closest?.("[data-tip]");
    if (!src) return;
    const el = tip(), r = src.getBoundingClientRect();
    el.textContent = src.dataset.tip;
    el.style.display = "block";
    el.style.left = `${r.right + 10}px`; el.style.top = `${r.top}px`;
  });
  document.addEventListener("focusout", () => { tip().style.display = "none"; });
}

/* ---------- export ---------- */

function exportCsv() {
  const range = periodWeeks();
  const winners = weeklyWinners(range);
  const series = seriesByIndicator(winners);
  const rows = [["pillar", "code", "indicator", "unit", "direction", "target", "week_ending", "reporting_date", "late", "value", "status", "reported_by", "comment"]];
  for (const ind of visibleIndicators(series)) {
    for (const point of series[ind.id] || []) {
      rows.push([
        ind.pillar, ind.code, ind.label[state.lang] || ind.label.fr, ind.unit, ind.direction,
        targetOf(ind) ?? "", point.week, point.rdate, point.late ? "1" : "0",
        point.value, statusOf(point.value, ind), point.by || "", point.comment || "",
      ]);
    }
  }
  const csv = rows.map((r) => r.map((cell) => {
    const s = String(cell ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kpi_${REG.form.id_string}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- wiring ---------- */

function openIndicator(id) {
  const ind = BY_ID[id];
  if (!ind) return;
  state.manual.set(ind.pillar, false);
  state.openRow = id;
  render();
  requestAnimationFrame(() => {
    const row = document.getElementById(`row-${id}`);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  });
}

function bind() {
  $("#f-period").addEventListener("change", (e) => { state.period = e.target.value; render(); });
  $("#f-pillar").addEventListener("change", (e) => { state.pillar = e.target.value; render(); });
  $("#f-status").addEventListener("change", (e) => { state.status = e.target.value; render(); });
  $("#btn-csv").addEventListener("click", exportCsv);
  document.querySelectorAll(".langs button").forEach((b) =>
    b.addEventListener("click", () => { state.lang = b.dataset.lang; render(); }));

  $("#attention").addEventListener("click", (e) => {
    const row = e.target.closest(".attn-row");
    if (row) openIndicator(row.dataset.goto);
  });

  $("#pillars").addEventListener("click", (e) => {
    const head = e.target.closest(".pillar-head");
    if (head) {
      const id = head.dataset.pillar;
      state.manual.set(id, head.getAttribute("aria-expanded") === "true");
      return render();
    }
    const row = e.target.closest("tr.expandable");
    if (row) {
      state.openRow = state.openRow === row.dataset.ind ? null : row.dataset.ind;
      render();
    }
  });
  $("#pillars").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest?.(".pillar-head, tr.expandable");
    if (target) { e.preventDefault(); target.click(); }
  });

  bindTooltip();
}

async function boot() {
  const bust = `?v=${Date.now()}`;
  const [reg, sub] = await Promise.all([
    fetch(`data/indicators.json${bust}`).then((r) => r.json()),
    fetch(`data/submissions.json${bust}`).then((r) => r.json()),
  ]);
  REG = reg; SUB = sub;
  BY_ID = Object.fromEntries(REG.indicators.map((i) => [i.id, i]));
  PILLARS = new Set(REG.pillars.map((p) => p.id));
  buildWeeks();
  bind();
  render();
}

boot().catch((err) => {
  document.querySelector("#notice-slot").innerHTML =
    `<div class="notice"><strong>Données indisponibles.</strong> ${esc(err.message)} — vérifiez que <code>docs/data/indicators.json</code> et <code>docs/data/submissions.json</code> existent.</div>`;
});
