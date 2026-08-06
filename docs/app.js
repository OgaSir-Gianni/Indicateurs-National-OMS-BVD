/* Indicateurs BVD — dashboard logic.
   No build step, no dependencies: two JSON files in, one page out. */

const T = {
  fr: {
    period: "Période", pillar: "Pilier", status: "Statut", search: "Rechercher",
    export: "Exporter CSV", last: "Dernier jour rapporté", d7: "7 derniers jours",
    d30: "30 derniers jours", all: "Tout l'historique", allPillars: "Tous les piliers",
    stAll: "Tous", stOk: "Cible atteinte", stWatch: "À surveiller", stOff: "Hors cible",
    stNone: "Non rapporté", reported: "Indicateurs rapportés", onTarget: "Cible atteinte",
    offTarget: "Hors cible", noData: "Jamais rapportés", submissions: "Soumissions",
    coverageTitle: "Complétude du rapportage", coverageSub: "part des indicateurs du pilier saisis chaque jour",
    code: "Code", indicator: "Indicateur", latest: "Dernière valeur", target: "Cible",
    trend: "Tendance", when: "Le", none: "—", noTarget: "Sans cible",
    empty: "Aucun indicateur ne correspond à ces filtres.",
    sample: "Données de démonstration.", sampleBody: "Ce tableau de bord affiche un jeu de données fictif. Il sera remplacé par les vraies soumissions dès la première exécution de l'action GitHub <code>refresh-data</code>.",
    scaleWarn: "Cible saisie en fraction (1 = 100 %) dans le formulaire ; affichée ici sur 100.",
    comments: "Commentaires des rapporteurs", history: "Historique", reportedBy: "Rapporté par",
    updated: "Données actualisées le", version: "Version du formulaire", openForm: "Ouvrir le formulaire",
    noComment: "Aucun commentaire saisi sur la période.",
    footer: "Source : formulaire ONA hébergé sur whonghub.org. Les valeurs sont celles saisies par les points focaux des piliers, sans retraitement.",
  },
  en: {
    period: "Period", pillar: "Pillar", status: "Status", search: "Search",
    export: "Export CSV", last: "Latest reported day", d7: "Last 7 days",
    d30: "Last 30 days", all: "Full history", allPillars: "All pillars",
    stAll: "All", stOk: "On target", stWatch: "Watch", stOff: "Off target",
    stNone: "Not reported", reported: "Indicators reported", onTarget: "On target",
    offTarget: "Off target", noData: "Never reported", submissions: "Submissions",
    coverageTitle: "Reporting completeness", coverageSub: "share of the pillar's indicators filled each day",
    code: "Code", indicator: "Indicator", latest: "Latest value", target: "Target",
    trend: "Trend", when: "On", none: "—", noTarget: "No target",
    empty: "No indicator matches these filters.",
    sample: "Demonstration data.", sampleBody: "This dashboard is showing a fictional dataset. It is replaced by real submissions on the first run of the <code>refresh-data</code> GitHub action.",
    scaleWarn: "Target entered as a fraction (1 = 100%) in the form; shown here out of 100.",
    comments: "Reporter comments", history: "History", reportedBy: "Reported by",
    updated: "Data refreshed", version: "Form version", openForm: "Open the form",
    noComment: "No comment recorded for this period.",
    footer: "Source: ONA form hosted on whonghub.org. Values are as entered by pillar focal points, with no reprocessing.",
  },
  pt: {
    period: "Período", pillar: "Pilar", status: "Estado", search: "Pesquisar",
    export: "Exportar CSV", last: "Último dia reportado", d7: "Últimos 7 dias",
    d30: "Últimos 30 dias", all: "Todo o histórico", allPillars: "Todos os pilares",
    stAll: "Todos", stOk: "Meta atingida", stWatch: "A vigiar", stOff: "Fora da meta",
    stNone: "Não reportado", reported: "Indicadores reportados", onTarget: "Meta atingida",
    offTarget: "Fora da meta", noData: "Nunca reportados", submissions: "Submissões",
    coverageTitle: "Completude do reporte", coverageSub: "proporção dos indicadores do pilar preenchidos por dia",
    code: "Código", indicator: "Indicador", latest: "Último valor", target: "Meta",
    trend: "Tendência", when: "Em", none: "—", noTarget: "Sem meta",
    empty: "Nenhum indicador corresponde a estes filtros.",
    sample: "Dados de demonstração.", sampleBody: "Este painel mostra dados fictícios. Serão substituídos pelas submissões reais na primeira execução da ação GitHub <code>refresh-data</code>.",
    scaleWarn: "Meta introduzida como fração (1 = 100 %) no formulário; apresentada aqui em 100.",
    comments: "Comentários dos relatores", history: "Histórico", reportedBy: "Reportado por",
    updated: "Dados actualizados em", version: "Versão do formulário", openForm: "Abrir o formulário",
    noComment: "Sem comentários no período.",
    footer: "Fonte: formulário ONA alojado em whonghub.org. Valores tal como introduzidos pelos pontos focais, sem reprocessamento.",
  },
};

const state = {
  lang: "fr", period: "7", pillar: "all", status: "all", q: "",
  collapsed: new Set(), openRow: null,
};
let REG = null, SUB = null, BY_ID = {}, DATES = [];

const $ = (sel, root = document) => root.querySelector(sel);
const t = (key) => T[state.lang][key] ?? key;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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

function chipClass(st) { return st === "nt" ? "none" : st; }
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

/* ---------- selection ---------- */

function periodDates() {
  if (!DATES.length) return [];
  if (state.period === "all") return DATES;
  if (state.period === "last") return DATES.slice(-1);
  return DATES.slice(-Number(state.period));
}

function activeSubmissions() {
  const keep = new Set(periodDates());
  return SUB.submissions.filter((s) => keep.has(s.date));
}

// indicator id -> [{date, value, comment, by}] ordered by date
function seriesByIndicator(subs) {
  const out = {};
  for (const sub of subs) {
    for (const [key, value] of Object.entries(sub.values)) {
      (out[key] ||= []).push({ date: sub.date, value, comment: sub.comments[key] || "", by: sub.by });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function visibleIndicators(series) {
  const q = state.q.trim().toLowerCase();
  return REG.indicators.filter((ind) => {
    if (state.pillar !== "all" && ind.pillar !== state.pillar) return false;
    if (q) {
      const hay = `${ind.code} ${ind.label[state.lang] || ind.label.fr}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.status !== "all") {
      const list = series[ind.id];
      const last = list && list.length ? list[list.length - 1].value : undefined;
      const st = statusOf(last, ind);
      if (state.status === "none" && st !== "none") return false;
      if (state.status !== "none" && st !== state.status) return false;
    }
    return true;
  });
}

/* ---------- drawing ---------- */

function sparkline(points, ind, width = 92, height = 24) {
  if (!points.length) return "";
  const values = points.map((p) => p.value);
  const target = targetOf(ind);
  const lo = Math.min(...values, target ?? Infinity);
  const hi = Math.max(...values, target ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i) => (points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (points.length - 1));
  const y = (v) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const colour = { ok: "var(--ok)", watch: "var(--watch)", off: "var(--off)", none: "var(--none)", nt: "var(--navy-700)" }[statusOf(last.value, ind)];
  const targetLine = target === null ? "" :
    `<line x1="0" y1="${y(target).toFixed(1)}" x2="${width}" y2="${y(target).toFixed(1)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 2" opacity=".8"/>`;
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    ${targetLine}
    <path d="${path}" fill="none" stroke="var(--navy-700)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="2.6" fill="${colour}"/>
  </svg>`;
}

function seriesChart(points, ind) {
  const width = 640, height = 150, padL = 42, padR = 10, padT = 12, padB = 24;
  const values = points.map((p) => p.value);
  const target = targetOf(ind);
  const lo = Math.min(...values, target ?? Infinity, 0);
  const hi = Math.max(...values, target ?? -Infinity) || 1;
  const span = hi - lo || 1;
  const x = (i) => (points.length === 1 ? (width - padR + padL) / 2 : padL + (i * (width - padL - padR)) / (points.length - 1));
  const y = (v) => height - padB - ((v - lo) / span) * (height - padT - padB);
  const grid = [lo, lo + span / 2, hi].map((v) =>
    `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${width - padR}" y2="${y(v).toFixed(1)}" stroke="var(--line-soft)"/>
     <text x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${Math.round(v * 10) / 10}</text>`).join("");
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const dots = points.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.8" fill="var(--navy)"><title>${p.date} · ${p.value} · ${esc(p.by || "")}</title></circle>`).join("");
  const targetLine = target === null ? "" :
    `<line x1="${padL}" y1="${y(target).toFixed(1)}" x2="${width - padR}" y2="${y(target).toFixed(1)}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="4 3"/>
     <text x="${width - padR}" y="${(y(target) - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--watch)">${t("target")} ${target}</text>`;
  const ticks = points.map((p, i) => (i === 0 || i === points.length - 1 || points.length < 8)
    ? `<text x="${x(i).toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="9" fill="var(--muted)">${p.date.slice(5)}</text>` : "").join("");
  return `<svg class="series" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("history")}">
    ${grid}${targetLine}
    <path d="${path}" fill="none" stroke="var(--navy)" stroke-width="1.8" stroke-linejoin="round"/>
    ${dots}${ticks}
  </svg>`;
}

/* ---------- render ---------- */

function renderSummary(series, subs) {
  const reported = REG.indicators.filter((i) => series[i.id]?.length);
  const counts = { ok: 0, watch: 0, off: 0, nt: 0 };
  for (const ind of reported) {
    const list = series[ind.id];
    counts[statusOf(list[list.length - 1].value, ind)]++;
  }
  const never = REG.indicators.length - reported.length;
  const cards = [
    { k: t("reported"), v: `${reported.length}`, s: `/ ${REG.indicators.length}`, cls: "" },
    { k: t("onTarget"), v: `${counts.ok}`, s: `${reported.length ? Math.round((counts.ok / reported.length) * 100) : 0} %`, cls: "ok" },
    { k: t("stWatch"), v: `${counts.watch}`, s: "", cls: "watch" },
    { k: t("offTarget"), v: `${counts.off}`, s: "", cls: "off" },
    { k: t("noData"), v: `${never}`, s: "", cls: "" },
    { k: t("submissions"), v: `${subs.length}`, s: `${periodDates().length} j`, cls: "" },
  ];
  $("#summary").innerHTML = cards.map((c) =>
    `<div class="stat ${c.cls}"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="s">${esc(c.s)}</div></div>`).join("");
}

function renderCoverage(subs) {
  const dates = periodDates();
  const total = {};
  for (const ind of REG.indicators) total[ind.pillar] = (total[ind.pillar] || 0) + 1;
  const filled = {};
  for (const sub of subs) {
    for (const key of Object.keys(sub.values)) {
      const ind = BY_ID[key];
      if (!ind) continue;
      (filled[ind.pillar] ||= {});
      (filled[ind.pillar][sub.date] ||= new Set()).add(key);
    }
  }
  const shade = (share) => share === 0 ? "var(--line-soft)"
    : share < 0.25 ? "#c7d5ea" : share < 0.5 ? "#8ea9d1" : share < 0.75 ? "#4f74ad" : "var(--navy)";

  const head = `<tr><th class="row-head"></th>${dates.map((d) =>
    `<th class="date-head"><span>${d.slice(5)}</span></th>`).join("")}</tr>`;
  const rows = REG.pillars.map((p) => {
    const cells = dates.map((d) => {
      const got = filled[p.id]?.[d]?.size || 0;
      const share = total[p.id] ? got / total[p.id] : 0;
      return `<td><span class="cell" style="background:${shade(share)}" title="${esc(p.label[state.lang] || p.label.fr)} · ${d} · ${got}/${total[p.id] || 0}"></span></td>`;
    }).join("");
    return `<tr><th class="row-head">${esc(p.label[state.lang] || p.label.fr)}</th>${cells}</tr>`;
  }).join("");

  $("#coverage").innerHTML = `<table>${head}${rows}</table>`;
  $("#coverage-sub").textContent = t("coverageSub");
  $("#coverage-legend").innerHTML = ["0 %", "< 25 %", "25–50 %", "50–75 %", "> 75 %"]
    .map((lab, i) => `<span><span class="swatch" style="background:${["var(--line-soft)", "#c7d5ea", "#8ea9d1", "#4f74ad", "var(--navy)"][i]}"></span>${lab}</span>`).join("");
}

function renderPillars(series) {
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
    const ok = withData.filter((i) => statusOf(series[i.id].at(-1).value, i) === "ok").length;
    const pct = withData.length ? Math.round((ok / withData.length) * 100) : 0;
    const collapsed = state.collapsed.has(p.id);
    const rows = collapsed ? "" : list.map((ind) => indicatorRow(ind, series[ind.id] || [])).join("");
    return `<section class="panel">
      <div class="pillar-head" role="button" tabindex="0" data-pillar="${p.id}" aria-expanded="${!collapsed}">
        <span class="chev">${collapsed ? "▸" : "▾"}</span>
        <h3>${esc(p.label[state.lang] || p.label.fr)}</h3>
        <span class="count">${withData.length}/${list.length} · ${pct} % ${esc(t("onTarget")).toLowerCase()}</span>
        <span class="bar"><i style="width:${pct}%"></i></span>
      </div>
      ${collapsed ? "" : `<table class="kpis">
        <thead><tr>
          <th>${esc(t("code"))}</th><th>${esc(t("indicator"))}</th>
          <th style="text-align:right">${esc(t("latest"))}</th>
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
  const warn = ind.target_scale_suspect ? `<span class="warn" title="${esc(t("scaleWarn"))}">⚠</span>` : "";
  const open = state.openRow === ind.id;
  const detail = open ? detailRow(ind, points) : "";
  return `<tr class="expandable" data-ind="${ind.id}" aria-expanded="${open}">
      <td class="code">${esc(ind.code)}</td>
      <td class="label">${esc(label)}${warn}</td>
      <td class="num">${fmt(last?.value, ind.unit)}</td>
      <td class="target hide-sm">${target === null ? t("none") : target.toLocaleString()}</td>
      <td><span class="chip ${chipClass(st)}">${esc(chipLabel(st))}</span></td>
      <td class="hide-sm">${sparkline(points, ind)}</td>
    </tr>${detail}`;
}

function detailRow(ind, points) {
  const comments = points.filter((p) => p.comment);
  const chart = points.length ? seriesChart(points, ind) : `<p class="empty">${esc(t("stNone"))}</p>`;
  const list = comments.length
    ? `<ul class="comments">${comments.map((c) =>
        `<li><span class="when">${c.date}</span>${esc(c.comment)} <em>— ${esc(c.by || "")}</em></li>`).join("")}</ul>`
    : `<p style="color:var(--muted);margin:10px 0 0">${esc(t("noComment"))}</p>`;
  const last = points.at(-1);
  return `<tr class="detail"><td colspan="6"><div class="inner">
      <h4>${esc(ind.code)} · ${esc(t("history"))} ${last ? `· ${esc(t("reportedBy"))} ${esc(last.by || "—")} (${last.date})` : ""}</h4>
      ${chart}
      <h4 style="margin-top:14px">${esc(t("comments"))}</h4>
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
  [["last", t("last")], ["7", t("d7")], ["30", t("d30")], ["all", t("all")]].forEach(([v, lab], i) => {
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

  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll(".langs button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));

  $("#notice-slot").innerHTML = SUB.source === "sample"
    ? `<div class="notice"><strong>${esc(t("sample"))}</strong> ${t("sampleBody")}</div>` : "";
}

function render() {
  const subs = activeSubmissions();
  const series = seriesByIndicator(subs);
  renderChrome();
  renderSummary(series, subs);
  renderCoverage(subs);
  renderPillars(series);
}

/* ---------- export ---------- */

function exportCsv() {
  const subs = activeSubmissions();
  const series = seriesByIndicator(subs);
  const rows = [["pillar", "code", "indicator", "unit", "direction", "target", "date", "value", "status", "reported_by", "comment"]];
  for (const ind of visibleIndicators(series)) {
    for (const point of series[ind.id] || []) {
      rows.push([
        ind.pillar, ind.code, ind.label[state.lang] || ind.label.fr, ind.unit, ind.direction,
        targetOf(ind) ?? "", point.date, point.value, statusOf(point.value, ind), point.by || "", point.comment || "",
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

function bind() {
  $("#f-period").addEventListener("change", (e) => { state.period = e.target.value; render(); });
  $("#f-pillar").addEventListener("change", (e) => { state.pillar = e.target.value; render(); });
  $("#f-status").addEventListener("change", (e) => { state.status = e.target.value; render(); });
  let timer;
  $("#f-search").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; render(); }, 180);
  });
  $("#btn-csv").addEventListener("click", exportCsv);
  document.querySelectorAll(".langs button").forEach((b) =>
    b.addEventListener("click", () => { state.lang = b.dataset.lang; render(); }));

  $("#pillars").addEventListener("click", (e) => {
    const head = e.target.closest(".pillar-head");
    if (head) {
      const id = head.dataset.pillar;
      state.collapsed.has(id) ? state.collapsed.delete(id) : state.collapsed.add(id);
      return render();
    }
    const row = e.target.closest("tr.expandable");
    if (row) {
      state.openRow = state.openRow === row.dataset.ind ? null : row.dataset.ind;
      render();
    }
  });
  $("#pillars").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("pillar-head")) {
      e.preventDefault(); e.target.click();
    }
  });
}

async function boot() {
  const bust = `?v=${Date.now()}`;
  const [reg, sub] = await Promise.all([
    fetch(`data/indicators.json${bust}`).then((r) => r.json()),
    fetch(`data/submissions.json${bust}`).then((r) => r.json()),
  ]);
  REG = reg; SUB = sub;
  BY_ID = Object.fromEntries(REG.indicators.map((i) => [i.id, i]));
  DATES = [...new Set(SUB.submissions.map((s) => s.date).filter(Boolean))].sort();
  bind();
  render();
}

boot().catch((err) => {
  document.querySelector("#notice-slot").innerHTML =
    `<div class="notice"><strong>Données indisponibles.</strong> ${esc(err.message)} — vérifiez que <code>docs/data/indicators.json</code> et <code>docs/data/submissions.json</code> existent.</div>`;
});
