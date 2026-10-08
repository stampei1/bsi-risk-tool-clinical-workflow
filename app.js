'use strict';
// BSI Watch — one list of the patients on a (simulated) allo-HCT unit, highest risk first.
const ORGS = ['ecoli', 'entero'];
const NAME = { ecoli: 'E. coli', entero: 'Enterococcus' };
const STALE = 7;                         // a stool result older than this many days no longer counts
const RANK = { high: 3, watch: 2, low: 1, due: 0, na: -1 };
const TIER_LABEL = { high: 'High', watch: 'Watch', low: 'Low', due: 'No recent stool', na: 'Not scored' };
const S = { W: null, day: 24, sel: null };
const $ = (id) => document.getElementById(id);
const pct = (v, d) => v == null ? '—' : (v * 100).toFixed(d ?? (v < 0.01 ? 2 : 1)) + '%';
const ab = (v) => v == null ? '—' : v === 0 ? 'not detected' : v < 0.001 ? '<0.1%' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const BUILD = document.querySelector('meta[name="build"]')?.content || '';
const COVERED = (o, a) => (o === 'ecoli' && a === 'Escherichia') || (o === 'entero' && a.startsWith('Enterococcus'));
const agent = (a) => ({ Escherichia: 'E. coli', Enterococcus_Faecium_Vancomycin_Resistant: 'VRE', Enterococcus_Faecium: 'E. faecium',
  Enterococcus_Faecalis: 'E. faecalis', Enterococcus_Vancomycin_Resistant: 'VRE', Klebsiella_Pneumoniae: 'K. pneumoniae' })[a] || a.replace(/_/g, ' ');

async function init() {
  try { const t = localStorage.getItem('bsiw-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  S.W = await (await fetch(`data/ward.json?v=${BUILD}`)).json();
  S.day = Math.min(Math.max(S.day, S.W.span[0]), S.W.span[1]);
  $('prevDay').onclick = () => go(-1);
  $('nextDay').onclick = () => go(1);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'Escape') $('about').classList.add('hidden');
  });
  $('aboutBtn').onclick = () => $('about').classList.remove('hidden');
  $('aboutClose').onclick = () => $('about').classList.add('hidden');
  $('about').onclick = (e) => { if (e.target.id === 'about') $('about').classList.add('hidden'); };
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

// ------------------------------------------------------------------ list
function priority(s, d) {
  if (s.culture.some(([day]) => day === d)) return 0;      // positive blood culture today
  if (s.culture.length) return 5;                           // earlier this week: already known
  return { high: 1, watch: 2, due: 3, low: 4, na: 4 }[s.tier];
}
function render() {
  const d = S.day;
  $('dayNum').textContent = d;
  $('prevDay').disabled = d <= S.W.span[0]; $('nextDay').disabled = d >= S.W.span[1];
  const st = S.W.patients.filter(p => p.stay[0] <= d && d <= p.stay[1]).map(p => [p, status(p, d)])
    .sort((a, b) => priority(a[1], d) - priority(b[1], d) || (b[1].org[b[1].top].p || 0) - (a[1].org[a[1].top].p || 0));
  const nHigh = st.filter(([, s]) => s.tier === 'high' && !s.culture.length).length;
  const nCult = st.filter(([p]) => p.infections.some(([day]) => day === d)).length;
  $('summary').innerHTML = `<b>${plural(st.length, 'patient')}</b> · <span class="${nHigh ? 'hi' : ''}">${nHigh} high risk</span>` +
    (nCult ? ` · <span class="hi">${plural(nCult, 'positive blood culture')} today</span>` : '');
  if (!S.sel || !st.some(([p]) => p.bed === S.sel)) S.sel = st[0]?.[0].bed ?? null;
  $('list').innerHTML = `<table class="grid"><thead><tr><th>Bed</th><th>Patient</th><th class="c-sc">E. coli</th>
    <th class="c-sc">Enterococcus</th></tr></thead><tbody>${st.map(([p, s]) => rowHTML(p, s, d)).join('')}</tbody></table>`;
  $('list').querySelectorAll('.row').forEach(r => {
    const pick = () => { S.sel = +r.dataset.bed; render();
      if (matchMedia('(max-width: 900px)').matches) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    r.onclick = pick; r.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });
  const sel = st.find(([p]) => p.bed === S.sel);
  if (sel) detail(sel, d);
}
function cell(s, o, d) {
  const os = s.org[o];
  if (s.culture.some(([, a]) => COVERED(o, a))) return `<span class="score pos">BSI</span>`;
  if (os.tier === 'na' || os.tier === 'due') return `<span class="score na">—</span>`;
  return `<span class="score ${os.tier}">${pct(os.p)}</span>`;
}
function rowHTML(p, s, d) {
  return `<tr class="row ${S.sel === p.bed ? 'sel' : ''}" data-bed="${p.bed}" tabindex="0">
    <td class="c-bed">${p.bed}</td>
    <td class="c-pt"><span class="pid">${p.pid}</span>${s.culture.length ? '<span class="tag">+ blood culture</span>' : ''}</td>
    <td class="c-sc">${cell(s, 'ecoli', d)}</td>
    <td class="c-sc">${cell(s, 'entero', d)}</td></tr>`;
}

// ------------------------------------------------------------------ detail
function detail([p, s], d) {
  const c = context(p, d);
  let h = `<div class="dhead"><h2>Bed ${p.bed}</h2><div class="meta">${p.pid}</div></div>`;
  for (const [day, a] of s.culture)
    h += `<div class="event">Positive blood culture ${day === d ? 'today' : plural(d - day, 'day') + ' ago'}: ${agent(a)}</div>`;
  const shown = ORGS.filter(o => ['high', 'watch'].includes(s.org[o].tier) && !s.culture.some(([, a]) => COVERED(o, a)))
    .sort((a, b) => RANK[s.org[b].tier] - RANK[s.org[a].tier]);
  if (shown.length) h += shown.map(o => hero(s.org[o], o, c)).join('');
  else if (!s.culture.length) h += `<div class="hero"><p class="say">${s.tier === 'due' ? `No stool result in the last ${STALE} days.` : 'Low risk for E. coli and Enterococcus.'}</p></div>`;
  $('detail').innerHTML = h;
}
function hero(os, o, c) {
  const rate = S.W.tiers[o].rate[os.tier];
  const rs = reasons(o, os.s, c).slice(0, 2);
  return `<div class="hero ${os.tier}"><div class="hl"><span class="oname">${NAME[o]}</span><span class="score ${os.tier}">${TIER_LABEL[os.tier]}</span></div>
    <div class="big"><span class="num">${pct(os.p)}</span><span class="unit">risk of bloodstream infection in 14 days</span></div>
    <p class="say">About <b>1 in ${Math.max(1, Math.round(1 / rate))}</b> stool samples at this level were followed by one.</p>
    ${rs.length ? `<ul class="why">${rs.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}</div>`;
}
// ------------------------------------------------------------------ misc
function tierTable() {
  const T = S.W.tiers, oneIn = (r) => `1 in ${Math.round(1 / r)}`;
  $('tierTable').innerHTML = `<table class="tiers"><thead><tr><th>Tier</th><th>Share of samples</th><th>E. coli BSI ≤ 14 d</th><th>Enterococcus BSI ≤ 14 d</th></tr></thead><tbody>
    <tr><td><span class="score high">High</span></td><td>top 10%</td><td>${oneIn(T.ecoli.rate.high)}</td><td>${oneIn(T.entero.rate.high)}</td></tr>
    <tr><td><span class="score watch">Watch</span></td><td>next 20%</td><td>${oneIn(T.ecoli.rate.watch)}</td><td>${oneIn(T.entero.rate.watch)}</td></tr>
    <tr><td><span class="score low" style="box-shadow: inset 0 0 0 1px var(--line)">Low</span></td><td>remaining 70%</td><td>${oneIn(T.ecoli.rate.low)}</td><td>${oneIn(T.entero.rate.low)}</td></tr>
    <tr><td class="fine">All samples</td><td></td><td class="fine">${oneIn(T.ecoli.base)}</td><td class="fine">${oneIn(T.entero.base)}</td></tr></tbody></table>`;
}
init().catch(e => { document.querySelector('main').innerHTML = `<p style="padding:24px">Could not load data (${e.message}). Serve this folder over http.</p>`; });
