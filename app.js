'use strict';
// BSI Watch — the daily, agent-prepared view of a simulated allo-HCT unit.
const ORGS = ['ecoli', 'entero'];
const NAME = { ecoli: 'E. coli', entero: 'Enterococcus' };
const STALE = 7;                         // a stool result older than this many days no longer counts
const RANK = { high: 3, watch: 2, low: 1, due: 0, na: -1 };
const TIER_LABEL = { high: 'High', watch: 'Watch', low: 'Low', due: 'Stool due', na: 'Not scored' };
const S = { W: null, day: 24, sel: null, acts: {} };
const $ = (id) => document.getElementById(id);
const pct = (v, d) => v == null ? '—' : (v * 100).toFixed(d ?? (v < 0.01 ? 2 : 1)) + '%';
const ab = (v) => v == null ? '—' : v === 0 ? 'not detected' : v < 0.001 ? '<0.1%' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const BUILD = document.querySelector('meta[name="build"]')?.content || '';

async function init() {
  try { const t = localStorage.getItem('bsiw-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  S.W = await (await fetch(`data/ward.json?v=${BUILD}`)).json();
  S.day = Math.min(Math.max(S.day, S.W.span[0]), S.W.span[1]);
  $('prevDay').onclick = () => go(-1);
  $('nextDay').onclick = () => go(1);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'Escape') $('how').classList.add('hidden');
  });
  $('howBtn').onclick = () => $('how').classList.remove('hidden');
  $('howClose').onclick = () => $('how').classList.add('hidden');
  $('how').onclick = (e) => { if (e.target.id === 'how') $('how').classList.add('hidden'); };
  $('themeBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('bsiw-theme', document.documentElement.dataset.theme); } catch (e) {}
    render();
  };
  tierTable();
  render();
}
function go(d) { S.day = Math.min(Math.max(S.day + d, S.W.span[0]), S.W.span[1]); render(); }

// ------------------------------------------------------------------ status of one patient on one day
function tierOf(o, p) { const t = S.W.tiers[o]; return p >= t.high ? 'high' : p >= t.watch ? 'watch' : 'low'; }
function status(pt, d) {
  const past = pt.samples.filter(s => s.d <= d);
  const last = past[past.length - 1];
  const out = { last, age: last ? d - last.d : null, org: {} };
  for (const o of ORGS) {
    const sc = past.filter(s => s['p_' + o] != null);
    const s = sc[sc.length - 1], prev = sc[sc.length - 2];
    if (!s) { out.org[o] = { tier: 'na' }; continue; }
    const age = d - s.d;
    out.org[o] = { tier: age > STALE ? 'due' : tierOf(o, s['p_' + o]), p: s['p_' + o], s, age, prev: prev ? prev['p_' + o] : null,
      after: last && s !== last && last['p_' + o] == null };       // no longer scored: after a BSI with this organism
  }
  const fresh = ORGS.map(o => out.org[o]).filter(x => x.tier !== 'na' && x.tier !== 'due');
  out.tier = !last || out.age > STALE ? 'due' : fresh.length ? fresh.reduce((a, b) => RANK[b.tier] > RANK[a.tier] ? b : a).tier : 'na';
  out.top = ORGS.reduce((a, o) => (RANK[out.org[o].tier] > RANK[out.org[a].tier] ? o : a), 'ecoli');
  out.culture = pt.infections.filter(([day]) => day <= d && d - day <= 7);
  return out;
}

// ------------------------------------------------------------------ context + reasons
function context(pt, d) {
  const anc = pt.anc.filter(([day]) => day <= d && d - day <= 3);
  const ancDay = anc.length ? Math.max(...anc.map(a => a[0])) : null;
  const ancV = ancDay != null ? Math.max(...anc.filter(a => a[0] === ancDay).map(a => a[1])) : null;
  const t = pt.temp.filter(([day]) => day <= d && d - day <= 1);
  const tmax = t.length ? Math.max(...t.map(a => a[1])) : null;
  const abx = [...new Set(pt.drugs.filter(([, a, b]) => a <= d && d <= b).map(([n]) => n))];
  return { anc: ancV, tmax, abx, hct: d - pt.hct_shift };
}
const PHRASE = {
  'E. coli abundance and trend': (c, s) => `E. coli in stool: ${ab(s.ab_ecoli)}`,
  'Enterococcus abundance and trend': (c, s) => `Enterococcus in stool: ${ab(s.ab_entero)}`,
  'Lineages containing Enterococcus': () => 'Enterococcus-related bacteria in stool',
  'Pathogen vs commensal ratios': () => 'Balance of Enterococcus vs commensal anaerobes',
  'Protective commensal indices': () => 'Protective commensal bacteria pattern',
  'Bacteroides interaction': () => 'Bacteroides pattern',
  'Other gut bacteria': () => 'Overall gut community pattern',
  'Other bacteria, trends': () => 'Recent shifts in other gut bacteria',
  'Antibiotics, prior 14 days': (c) => c.abx.length ? `Antibiotics in the last 2 weeks (now: ${c.abx.slice(0, 2).join(', ')})` : 'Antibiotics in the last 2 weeks',
  'Antibiotics by class': (c) => c.abx.length ? `Recent antibiotics (now: ${c.abx.slice(0, 2).join(', ')})` : 'Recent antibiotic exposure',
  'Antibiotic totals': () => 'Number of antibiotic classes recently',
  'Antibiotic groups': () => 'Broad-spectrum / anti-anaerobe exposure',
  'Antibiotic intensification': () => 'Recent escalation of antibiotics',
  'Days since last antibiotic dose': () => 'Timing of recent antibiotics',
  'Antibiotic → commensal-loss cascade': () => 'Antibiotic-associated loss of anaerobes',
  'Neutrophil count (ANC)': (c) => c.anc != null && c.anc < 0.5 ? `Neutropenia (ANC ${c.anc})` : 'Neutrophil count',
  'ANC trend, prior 14 days': () => 'Neutrophil trend over 2 weeks',
  'Neutropenia × Enterococcus': () => 'Neutropenia while Enterococcus is present',
  'ANC recovery timing': () => 'Timing of neutrophil recovery',
  'Day relative to transplant': (c) => c.hct >= 0 && c.hct <= 30 ? `Early after transplant (day +${c.hct})` : 'Time since transplant',
};
const GENERIC = new Set(['Overall gut community pattern', 'Time since transplant', 'Recent shifts in other gut bacteria',
  'Neutrophil count', 'Timing of recent antibiotics']);
function reasons(o, s, c) {
  const g = s['g_' + o]; if (!g) return [];
  const names = S.W.groups[o];
  const seen = new Set(), out = [];
  g.map((v, i) => [v, i]).filter(([v]) => v > Math.log(1.1)).sort((a, b) => b[0] - a[0]).forEach(([v, i]) => {
    const f = PHRASE[names[i]]; const txt = f ? f(c, s) : names[i];
    if (!seen.has(txt) && out.length < 3) { seen.add(txt); out.push(txt); }
  });
  return out;
}

// ------------------------------------------------------------------ brief
function brief(d) {
  const on = S.W.patients.filter(p => p.stay[0] <= d && d <= p.stay[1]);
  const st = on.map(p => [p, status(p, d), status(p, d - 1)]);
  const high = st.filter(([, s]) => s.tier === 'high' && !s.culture.length);
  const up = st.filter(([, s, y]) => s.tier === 'high' && y.tier !== 'high' && !s.culture.length);
  const newRes = st.filter(([, s]) => s.last && s.last.d === d).length;
  const due = st.filter(([, s]) => s.tier === 'due');
  const cultures = st.filter(([p]) => p.infections.some(([day]) => day === d));
  const head = high.length ? `${plural(high.length, 'patient')} at high risk today` : 'No patients at high risk today';
  const items = [];
  for (const [p, s] of up) items.push(['high', `Bed ${p.bed} moved to High for ${NAME[s.top]} (${pct(s.org[s.top].p)} risk in 14 days)`]);
  const stay = high.filter(h => !up.includes(h));
  if (stay.length) items.push(['high', `Still High: ${stay.map(([p, s]) => `Bed ${p.bed} (${NAME[s.top]})`).join(', ')}`]);
  for (const [p] of cultures) items.push(['high', `Bed ${p.bed}: positive blood culture today (${agent(p.infections.find(([day]) => day === d)[1])})`]);
  if (due.length) items.push(['due', `${plural(due.length, 'patient')} due a stool sample: Bed ${due.map(([p]) => p.bed).join(', ')}`]);
  items.push(['muted', `${plural(newRes, 'new stool result')} since yesterday · ${on.length} patients on the unit`]);
  $('brief').innerHTML = `<div class="kicker"><span class="dot"></span>Prepared by the agent · unit day ${d}</div>
    <h1>${head}</h1>
    <ul>${items.map(([k, t]) => `<li><span class="b" style="background:var(--${k === 'muted' ? 'ink-3' : k})"></span>${t}</li>`).join('')}</ul>
    <div class="sources">${['Stool 16S', 'Antibiotics (MAR)', 'Blood counts', 'Vitals', 'Microbiology'].map(x => `<span class="src">${x}</span>`).join('')}</div>`;
  return st;
}
function agent(a) {
  return ({ Escherichia: 'E. coli', Enterococcus_Faecium_Vancomycin_Resistant: 'VRE', Enterococcus_Faecium: 'E. faecium',
    Enterococcus_Faecalis: 'E. faecalis', Enterococcus_Vancomycin_Resistant: 'VRE', Klebsiella_Pneumoniae: 'K. pneumoniae' })[a] || a.replace(/_/g, ' ');
}

// ------------------------------------------------------------------ list
function render() {
  const d = S.day;
  $('dayNum').textContent = d;
  $('prevDay').disabled = d <= S.W.span[0]; $('nextDay').disabled = d >= S.W.span[1];
  const st = brief(d);
  const cult = st.filter(([, s]) => s.culture.length);
  const rest = st.filter(([, s]) => !s.culture.length);
  const groups = [
    ['Positive blood culture · last 7 days', cult, true],
    ['Needs review', rest.filter(([, s]) => s.tier === 'high'), true],
    ['Watch', rest.filter(([, s]) => s.tier === 'watch'), true],
    ['Stool sample due', rest.filter(([, s]) => s.tier === 'due'), true],
    ['Low risk', rest.filter(([, s]) => s.tier === 'low' || s.tier === 'na'), false],
  ];
  const byRisk = (a, b) => (b[1].org[b[1].top].p || 0) - (a[1].org[a[1].top].p || 0);
  groups.forEach(g => g[1].sort(byRisk));
  if (!S.sel || !st.some(([p]) => p.bed === S.sel)) S.sel = (groups.slice(1).find(g => g[1].length)?.[1][0]?.[0] || groups[0][1][0]?.[0] || {}).bed ?? null;
  S.lowOpen = S.lowOpen ?? false;
  $('list').innerHTML = groups.filter(([, rows]) => rows.length).map(([title, rows, open]) => {
    const isLow = title === 'Low risk', show = !isLow || S.lowOpen;
    rows.sort((a, b) => (b[1].org[b[1].top].p || 0) - (a[1].org[a[1].top].p || 0));
    return `<section class="group"><h2>${title} <span class="count">${rows.length}</span>
      ${isLow ? `<button data-toggle-low>${S.lowOpen ? 'Hide' : 'Show'}</button>` : ''}</h2>
      ${show ? `<div class="rows">${rows.map(([p, s]) => rowHTML(p, s, d)).join('')}</div>` : ''}</section>`;
  }).join('');
  $('list').querySelectorAll('.row').forEach(r => r.onclick = () => {
    S.sel = +r.dataset.bed; render();
    if (matchMedia('(max-width: 900px)').matches) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const tl = $('list').querySelector('[data-toggle-low]'); if (tl) tl.onclick = () => { S.lowOpen = !S.lowOpen; render(); };
  detail(st.find(([p]) => p.bed === S.sel), d);
}
function rowHTML(p, s, d) {
  const c = context(p, d), o = s.top, os = s.org[o];
  let why;
  if (s.culture.length) {
    const [day, a] = s.culture[s.culture.length - 1];
    why = `${agent(a)} in blood culture ${day === d ? 'today' : plural(d - day, 'day') + ' ago'}`;
  } else if (s.tier === 'due') why = s.last ? `Last stool result ${plural(s.age, 'day')} ago` : 'No stool result yet this admission';
  else if (s.tier === 'na') why = 'Not scored after infection';
  else why = reasons(o, os.s, c).find(r => !GENERIC.has(r)) || `${NAME[o]} in stool: ${ab(os.s['ab_' + o])}`;
  const pill = s.culture.length ? `<span class="pill high"><span class="sw"></span>Positive culture</span>`
    : s.tier === 'due' || s.tier === 'na' ? `<span class="pill ${s.tier}"><span class="sw"></span>${TIER_LABEL[s.tier]}</span>`
    : `<span class="pill ${s.tier}"><span class="sw"></span>${NAME[o]} · ${TIER_LABEL[s.tier]}</span>`;
  const isNew = s.last && s.last.d === d;
  const act = S.acts[`${p.bed}-${d}`];
  return `<button class="row ${S.sel === p.bed ? 'sel' : ''}" data-bed="${p.bed}">
    <span class="bed">${p.bed}</span>
    <span><span class="who">Bed ${p.bed}<small>${p.pid} · day ${c.hct >= 0 ? '+' : ''}${c.hct}</small></span>
      <span class="why" style="display:block">${why}</span></span>
    <span class="side">${pill}${isNew ? '<span class="new">NEW RESULT</span>' : act?.ack ? '<span class="new" style="color:var(--low);background:var(--low-soft)">REVIEWED</span>' : ''}</span>
  </button>`;
}

// ------------------------------------------------------------------ detail
function detail(entry, d) {
  const el = $('detail');
  if (!entry) { el.innerHTML = `<div class="empty">No patients on the unit on this day.</div>`; return; }
  const [p, s] = entry, c = context(p, d);
  const key = `${p.bed}-${d}`, act = S.acts[key] || {};
  let h = `<div class="dhead"><span class="bed">${p.bed}</span><div><h2>Bed ${p.bed}</h2>
    <div class="meta">${p.pid} · day ${c.hct >= 0 ? '+' : ''}${c.hct} after transplant · ${s.last ? `last stool ${s.age === 0 ? 'today' : plural(s.age, 'day') + ' ago'}` : 'no stool result yet'}</div></div></div>`;
  for (const [day, a] of s.culture) {
    const mine = ORGS.some(o => (o === 'ecoli' && a === 'Escherichia') || (o === 'entero' && a.startsWith('Enterococcus')));
    h += `<div class="event ${mine ? '' : 'other'}">● Positive blood culture ${day === d ? 'today' : plural(d - day, 'day') + ' ago'}: ${agent(a)}${mine ? '' : ' (not covered by these models)'}</div>`;
  }
  const covered = (o, a) => (o === 'ecoli' && a === 'Escherichia') || (o === 'entero' && a.startsWith('Enterococcus'));
  h += `<div class="orgs">${ORGS.map(o => orgHTML(p, s.org[o], o, c, d, s.culture.some(([, a]) => covered(o, a)))).join('')}</div>`;
  const chips = [];
  if (c.anc != null) chips.push([c.anc < 0.5, `ANC <b>${c.anc}</b> ×10³/µL${c.anc < 0.5 ? ' · neutropenic' : ''}`]);
  if (c.tmax != null) chips.push([c.tmax >= 100.4, `Max temp <b>${c.tmax} °F</b>${c.tmax >= 100.4 ? ' · febrile' : ''}`]);
  chips.push([false, c.abx.length ? `On <b>${c.abx.join(', ')}</b>` : 'No antibiotics today']);
  if (s.last?.dom && s.last.dom[1] >= 0.3) chips.push([true, `Gut dominated by <b>${s.last.dom[0]}</b> (${Math.round(s.last.dom[1] * 100)}%)`]);
  h += `<div class="sect"><h3>Context</h3><div class="chips">${chips.map(([w, t]) => `<span class="chip ${w ? 'warn' : ''}">${t}</span>`).join('')}</div></div>`;
  const steps = nextSteps(s);
  h += `<div class="sect"><h3>Suggested next steps</h3><div class="steps">${steps.map(t => `<div class="stepi"><span class="box"></span>${t}</div>`).join('')}</div>
    <div class="fine">Example protocol: steps would be set by the unit. The models estimate risk; they do not recommend treatment.</div></div>`;
  h += `<div class="actions">
    <button class="btn ${act.ack ? 'done' : 'primary'}" id="ackBtn">${act.ack ? '✓ Reviewed' : 'Mark reviewed'}</button>
    <button class="btn ${act.stool ? 'done' : ''}" id="stoolBtn">${act.stool ? '✓ Stool sample requested' : 'Request stool sample'}</button></div>`;
  el.innerHTML = h;
  $('ackBtn').onclick = () => { S.acts[key] = { ...act, ack: !act.ack }; toast(act.ack ? 'Review undone' : `Bed ${p.bed} marked reviewed (demo)`); render(); };
  $('stoolBtn').onclick = () => { S.acts[key] = { ...act, stool: !act.stool }; toast(act.stool ? 'Request cancelled' : `Stool sample requested for Bed ${p.bed} (demo — no order placed)`); render(); };
}
function orgHTML(p, os, o, c, d, confirmed) {
  if (confirmed) return `<div class="org"><div class="ohead"><span class="oname">${NAME[o]}</span><span class="pill high"><span class="sw"></span>Confirmed BSI</span></div>
    <div class="odds" style="margin-top:10px">Positive blood culture. Risk scoring for ${NAME[o]} is paused; the last score before the infection was <b>${pct(os.p)}</b>.</div>
    ${os.p != null ? spark(p, o, d) : ''}</div>`;
  if (os.tier === 'na') return `<div class="org"><div class="ohead"><span class="oname">${NAME[o]}</span><span class="pill na">Not scored</span></div>
    <div class="muted">No scored stool sample yet.</div></div>`;
  const t = S.W.tiers[o], tier = os.tier;
  const rate = tier === 'due' ? null : t.rate[tier];
  const trend = os.prev == null ? '' : os.p > os.prev * 1.15 ? `↑ from ${pct(os.prev)}` : os.p < os.prev / 1.15 ? `↓ from ${pct(os.prev)}` : 'stable';
  const rs = reasons(o, os.s, c);
  return `<div class="org"><div class="ohead"><span class="oname">${NAME[o]}</span><span class="pill ${tier}"><span class="sw"></span>${TIER_LABEL[tier]}</span></div>
    <div class="big"><span class="num">${pct(os.p)}</span><span class="trend">${trend}</span></div>
    <div class="odds">${tier === 'due' ? `From a stool sample ${plural(os.age, 'day')} old; needs a new sample.` :
      os.after ? 'Last score before the infection; later samples are not scored.' :
      `risk of ${NAME[o]} BSI in 14 days · in our cohort about <b>1 in ${Math.max(1, Math.round(1 / rate))}</b> stool samples at this level were followed by one`}</div>
    ${spark(p, o, d)}
    ${rs.length && tier !== 'low' ? `<div class="whyh">Main factors</div><ul class="why">${rs.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}</div>`;
}
function nextSteps(s) {
  if (s.culture.length) return ['Managed as a confirmed infection by the care team', 'Risk scores are paused for the infecting organism'];
  if (s.tier === 'high') return ['Review today with the transplant ID team', 'If febrile or unstable: blood cultures per unit protocol', 'Repeat stool sample in 2–3 days to follow the trend'];
  if (s.tier === 'watch') return ['Repeat stool sample within 3–4 days', 'Re-check when the next result is in'];
  if (s.tier === 'due') return [s.last ? `Request a stool sample (last result ${plural(s.age, 'day')} ago)` : 'Request a first stool sample'];
  return ['No action suggested; continue routine stool sampling'];
}
function spark(p, o, d) {
  const W = 300, H = 64, L = 0, R = 6, d0 = d - 29;
  const lo = Math.log10(0.001), hi = Math.log10(0.5);
  const x = (day) => L + (day - d0) / 29 * (W - L - R), y = (v) => H - 4 - (Math.log10(Math.max(0.001, Math.min(0.5, v))) - lo) / (hi - lo) * (H - 8);
  const t = S.W.tiers[o];
  const pts = p.samples.filter(s => s['p_' + o] != null && s.d <= d && s.d >= d0 - 30);
  let path = '';
  pts.forEach((s, i) => { const X = Math.max(L, x(s.d)), Y = y(s['p_' + o]); path += i ? `H${X}V${Y}` : `M${X},${Y}`; });
  if (pts.length) path += `H${x(d)}`;
  const dots = pts.filter(s => s.d >= d0).map(s => `<circle cx="${x(s.d)}" cy="${y(s['p_' + o])}" r="2.6" fill="var(--spark)"/>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${NAME[o]} risk, last 30 days">
    <rect x="0" y="0" width="${W}" height="${y(t.high)}" fill="var(--high-band)"/>
    <rect x="0" y="${y(t.high)}" width="${W}" height="${y(t.watch) - y(t.high)}" fill="var(--watch-band)"/>
    <path d="${path}" fill="none" stroke="var(--spark)" stroke-width="1.8" vector-effect="non-scaling-stroke"/>${dots}
    <line x1="${x(d)}" x2="${x(d)}" y1="0" y2="${H}" stroke="var(--ink-3)" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="2 3"/>
  </svg><div class="fine" style="display:flex;justify-content:space-between;margin-top:2px"><span>30 days ago</span><span>today</span></div>`;
}

// ------------------------------------------------------------------ misc
function tierTable() {
  const T = S.W.tiers, oneIn = (r) => `1 in ${Math.round(1 / r)}`;
  $('tierTable').innerHTML = `<table class="tiers"><thead><tr><th>Tier</th><th>Share of samples</th><th>E. coli BSI ≤ 14 d</th><th>Enterococcus BSI ≤ 14 d</th></tr></thead><tbody>
    <tr><td><span class="pill high"><span class="sw"></span>High</span></td><td>top 10%</td><td>${oneIn(T.ecoli.rate.high)}</td><td>${oneIn(T.entero.rate.high)}</td></tr>
    <tr><td><span class="pill watch"><span class="sw"></span>Watch</span></td><td>next 20%</td><td>${oneIn(T.ecoli.rate.watch)}</td><td>${oneIn(T.entero.rate.watch)}</td></tr>
    <tr><td><span class="pill low"><span class="sw"></span>Low</span></td><td>remaining 70%</td><td>${oneIn(T.ecoli.rate.low)}</td><td>${oneIn(T.entero.rate.low)}</td></tr>
    <tr><td class="fine">All samples</td><td></td><td class="fine">${oneIn(T.ecoli.base)}</td><td class="fine">${oneIn(T.entero.base)}</td></tr></tbody></table>`;
}
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

init().catch(e => { document.querySelector('main').innerHTML = `<p style="padding:24px">Could not load data (${e.message}). Serve this folder over http.</p>`; });
