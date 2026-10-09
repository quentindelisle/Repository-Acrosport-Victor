/* Acrosport · Enchaînement — PWA hors-ligne (tablette prof)
   Toutes les données restent sur l'appareil (localStorage) + sauvegarde JSON. */
'use strict';
const LS_KEY = 'acrosport-enchainement.v1';
const TYPES = ['Duo statique','Trio statique','Quatuor statique','Duo dynamique','Trio dynamique','Quatuor dynamique'];
const TYPE_SHORT = {'Duo statique':'Duos statiques','Trio statique':'Trios statiques','Quatuor statique':'Quatuors statiques','Duo dynamique':'Duos dynamiques','Trio dynamique':'Trios dynamiques','Quatuor dynamique':'Quatuors dynamiques'};
const ROLE_NAMES = {P:'Porteur',V:'Voltigeur',Pa:'Parade',Ai:'Aide',R:'Réalise'};
const CYCLE_FIG = ['', 'P', 'V', 'Pa', 'Ai'];
const CYCLE_LIA = ['', 'R', 'P', 'V', 'Pa', 'Ai'];
const FIGMAP = Object.fromEntries(FIGURES.map(f => [f.id, f]));
const INDMAP = Object.fromEntries(INDIVIDUELS.map(f => [f.id, f]));
const LIAMAP = Object.fromEntries(LIAISONS.map(f => [f.id, f]));

/* ---------- état ---------- */
function defaultState() {
  return {
    version: 1,
    settings: { bareme: {A:0.4,B:0.6,C:0.8,D:1}, baremeInd: {A:0.2,B:0.3,C:0.4,D:0.5},
      nbFigMin: 4, nbIndMin: 2, countInd: false, maxFig: 0, pin: '' },
    classes: [], groups: [], currentClassId: null, lastExport: null
  };
}
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const s = JSON.parse(raw); const d = defaultState(); s.settings = Object.assign(d.settings, s.settings || {}); return Object.assign(d, s); }
  } catch (e) { console.warn(e); }
  return defaultState();
}
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Sauvegarde locale impossible : exportez en JSON'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- vue ---------- */
const V = { view: 'home', groupId: null, profTab: 'classes', profOk: false, selStudents: new Set(), openClass: null,
  pick: null, catType: TYPES[0], catSub: '', catLvl: '', catQ: '' };

/* ---------- utilitaires ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r2 = x => Math.round(x * 100) / 100;
const fmt = x => r2(x).toLocaleString('fr-FR', {minimumFractionDigits: 1, maximumFractionDigits: 2});
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const cls = id => S.classes.find(c => c.id === id);
const grp = id => S.groups.find(g => g.id === id);
const curClass = () => cls(S.currentClassId);
const stuOf = (c, sid) => c && c.students.find(s => s.id === sid);
function stuById(sid) { for (const c of S.classes) { const s = c.students.find(x => x.id === sid); if (s) return s; } return null; }
function toast(msg, ms = 2600) { document.querySelectorAll('.toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function val(level) { return S.settings.bareme[level] ?? 0; }
function valInd(level) { return S.settings.baremeInd[level] ?? 0; }
function today() { return new Date().toISOString().slice(0, 10); }
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function figTitle(f) { return `${TYPE_SHORT[f.type] || f.type} · ${f.famName}${f.sub ? ' (' + f.sub + ')' : ''}`; }

/* ---------- initiales ---------- */
function baseIni(s, level = 0) {
  const clean = x => norm(x).replace(/[^a-z]/g, '');
  const p = clean(s.prenom) || '?', n = clean(s.nom) || '?';
  const U = x => x.toUpperCase();
  if (level === 0) return U(p[0]) + U(n[0]);
  if (level === 1) return U(p[0]) + U(n[0]) + (n[1] || '');
  if (level === 2) return U(p[0]) + (p[1] || '') + U(n[0]);
  return U(p[0]) + (p[1] || '') + U(n[0]) + (n[1] || '');
}
function computeInitials(c) {
  const taken = new Set(c.students.filter(s => s.iniManual).map(s => s.ini.toUpperCase()));
  const auto = c.students.filter(s => !s.iniManual);
  const lvl = new Map(auto.map(s => [s, 0]));
  for (let round = 0; round < 4; round++) {
    const cnt = {}; auto.forEach(s => { const k = baseIni(s, lvl.get(s)).toUpperCase(); cnt[k] = (cnt[k] || 0) + 1; });
    let changed = false;
    auto.forEach(s => { const k = baseIni(s, lvl.get(s)).toUpperCase(); if ((cnt[k] > 1 || taken.has(k)) && lvl.get(s) < 3) { lvl.set(s, lvl.get(s) + 1); changed = true; } });
    if (!changed) break;
  }
  const seen = new Set(taken);
  auto.forEach(s => { const v = baseIni(s, lvl.get(s)); let w = v, k = 2; while (seen.has(w.toUpperCase())) w = v + (k++); s.ini = w; seen.add(w.toUpperCase()); });
}

/* ---------- calculs ---------- */
function groupMembers(g) { const c = cls(g.classId); return g.members.map(sid => stuOf(c, sid) || {id: sid, ini: '?', nom: '(élève supprimé)', prenom: ''}); }
function studentStats(g, sid) {
  const vals = []; let P = 0, Vo = 0, other = 0, lia = 0;
  g.routine.forEach(it => {
    const r = it.roles[sid];
    if (!r) return;
    if (it.kind === 'fig') {
      const f = FIGMAP[it.ref]; if (!f) return;
      if (r === 'P' || r === 'V') { vals.push({v: val(f.level), lvl: f.level}); r === 'P' ? P++ : Vo++; } else other++;
    } else lia++;
  });
  const sorted = vals.slice().sort((a, b) => b.v - a.v);
  const kept = S.settings.maxFig > 0 ? sorted.slice(0, S.settings.maxFig) : sorted;
  const ptsFig = r2(kept.reduce((a, b) => a + b.v, 0));
  const ind = (g.indiv[sid] || []).map(id => INDMAP[id]).filter(Boolean);
  const ptsInd = r2(ind.reduce((a, e) => a + valInd(e.level), 0));
  const total = r2(ptsFig + (S.settings.countInd ? ptsInd : 0));
  const alerts = [];
  if (vals.length < S.settings.nbFigMin) alerts.push(`${vals.length}/${S.settings.nbFigMin} figures (porteur ou voltigeur)`);
  if (ind.length < S.settings.nbIndMin) alerts.push(`${ind.length}/${S.settings.nbIndMin} éléments statiques`);
  const lv = {A:0,B:0,C:0,D:0}; vals.forEach(x => lv[x.lvl]++);
  return {nFig: vals.length, P, V: Vo, other, lia, ptsFig, ind, ptsInd, total, alerts, lv};
}
function itemIssues(g, it, idx) {
  const out = [];
  if (it.kind !== 'fig') return out;
  const f = FIGMAP[it.ref]; if (!f) return ['Figure inconnue'];
  const roles = Object.values(it.roles);
  const nP = roles.filter(r => r === 'P').length, nV = roles.filter(r => r === 'V').length;
  if (nP + nV !== f.nb) out.push(`${f.nb} gymnastes attendus (porteurs + voltigeurs) : ${nP + nV} indiqué(s)`);
  else { if (!nP) out.push('Aucun porteur indiqué'); if (!nV) out.push('Aucun voltigeur indiqué'); }
  // élèves engagés dans deux figures simultanées
  const block = simulBlock(g, idx);
  block.forEach(j => {
    if (j === idx) return;
    const o = g.routine[j];
    Object.keys(it.roles).forEach(sid => { if (it.roles[sid] && o.roles[sid]) { const s = stuById(sid); out.push(`${s ? s.ini : '?'} est aussi dans l'élément n°${j + 1} (simultané)`); } });
  });
  return out;
}
function simulBlock(g, idx) {
  let a = idx; while (a > 0 && g.routine[a].simul) a--;
  let b = idx; while (b + 1 < g.routine.length && g.routine[b + 1].simul) b++;
  const r = []; for (let i = a; i <= b; i++) r.push(i); return r;
}
function groupStatus(g) {
  if (g.validated) return '<span class="badge ok">✓ Rendu</span>';
  if (!g.routine.length) return '<span class="badge err">Vide</span>';
  return '<span class="badge wip">En cours</span>';
}

/* ---------- rendu principal ---------- */
function render() {
  renderClassSel();
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('on', b.dataset.nav === (V.view === 'group' ? 'home' : V.view)));
  const app = $('#app');
  if (V.view === 'home') app.innerHTML = viewHome();
  else if (V.view === 'group') app.innerHTML = viewGroup();
  else if (V.view === 'catalog') app.innerHTML = viewCatalogPage();
  else if (V.view === 'prof') app.innerHTML = V.profOk || !S.settings.pin ? viewProf() : viewPin();
  renderModal();
}
function renderClassSel() {
  const sel = $('#classSel');
  sel.innerHTML = S.classes.length ? S.classes.map(c => `<option value="${c.id}" ${c.id === S.currentClassId ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option>Aucune classe</option>';
  sel.disabled = !S.classes.length;
}

/* ----- accueil : groupes de la classe ----- */
function viewHome() {
  const c = curClass();
  if (!c) return `<div class="card empty"><h2>Bienvenue 👋</h2><p>Aucune classe n'est encore importée.</p><p>Le professeur importe la liste de classe et crée les groupes dans l'<b>Espace prof</b>.</p><button class="btn" data-act="goProf">Ouvrir l'espace prof</button></div>`;
  const gs = S.groups.filter(g => g.classId === c.id);
  let h = `<h2>${esc(c.name)} — choisissez votre groupe</h2>`;
  if (!gs.length) return h + `<div class="card empty">Aucun groupe dans cette classe.<br>Le professeur doit créer les groupes (Espace prof → Groupes).</div>`;
  h += '<div class="groups">' + gs.map(g => {
    const m = groupMembers(g);
    const nf = g.routine.filter(i => i.kind === 'fig').length;
    return `<button class="gcard" data-act="openGroup" data-id="${g.id}">
      <div class="spread"><h3>${esc(g.name)}</h3>${groupStatus(g)}</div>
      <div class="chips">${m.map(s => `<span class="chip"><span class="ini">${esc(s.ini)}</span></span>`).join('')}</div>
      <div class="muted small">${m.length} gymnastes · ${nf} figure${nf > 1 ? 's' : ''} · ${g.routine.length - nf} liaison${g.routine.length - nf > 1 ? 's' : ''}</div>
    </button>`;
  }).join('') + '</div>';
  return h;
}

/* ----- espace groupe ----- */
function viewGroup() {
  const g = grp(V.groupId); if (!g) { V.view = 'home'; return viewHome(); }
  const c = cls(g.classId); const mem = groupMembers(g); const ro = g.validated;
  let h = `<div class="spread" style="margin-top:6px"><button class="btn ghost" data-act="back">← Groupes</button>${groupStatus(g)}</div>
  <h2 style="margin-top:10px">${esc(g.name)} <span class="muted small">· ${esc(c ? c.name : '')}</span></h2>
  <div class="chips">${mem.map(s => `<span class="chip"><span class="ini">${esc(s.ini)}</span> ${esc(s.prenom)} ${esc((s.nom || '').slice(0, 1))}.</span>`).join('')}</div>`;
  if (mem.length < 3 || mem.length > 6) h += `<p class="warn">⚠️ Un groupe doit compter de 3 à 6 gymnastes (actuellement ${mem.length}).</p>`;
  if (ro) h += `<div class="lock">🔒 Enchaînement rendu le ${new Date(g.validatedAt).toLocaleString('fr-FR')}. Seul le professeur peut le rouvrir (Espace prof → Synthèse).</div>`;
  h += `<h3>1. Enchaînement</h3>
  <div class="legend"><span style="background:var(--rP)">P = Porteur</span><span style="background:var(--rV)">V = Voltigeur</span><span style="background:var(--rPa)">Pa = Parade</span><span style="background:var(--rAi)">Ai = Aide</span><span style="background:var(--rR)">R = Réalise (liaison)</span></div>
  <p class="muted small">Touchez l'initiale d'un gymnaste pour changer son rôle. Seuls les porteurs et voltigeurs marquent les points de difficulté.</p>`;
  if (!g.routine.length) h += `<div class="card empty">L'enchaînement est vide. Ajoutez vos figures et vos éléments de liaison.</div>`;
  g.routine.forEach((it, i) => { h += itemHtml(g, it, i, mem, ro); });
  if (!ro) h += `<div class="row" style="margin:12px 0"><button class="btn grow" data-act="pickFig">＋ Ajouter une figure</button><button class="btn sec grow" data-act="pickLia">＋ Ajouter une liaison</button></div>`;
  // éléments individuels
  h += `<h3>2. Éléments statiques individuels <span class="muted small">(${S.settings.nbIndMin} par élève, en plus des figures)</span></h3><div class="card">`;
  mem.forEach(s => {
    const list = g.indiv[s.id] || [];
    h += `<div class="indrow"><div style="min-width:92px"><div class="ini">${esc(s.ini)}</div><div class="small muted">${esc(s.prenom)}</div></div><div class="row">`;
    list.forEach((id, k) => { const e = INDMAP[id]; if (!e) return; h += `<div class="indslot"><img src="${e.img}" alt="${esc(e.code)}" data-act="showInd" data-id="${e.id}"><span class="lvl ${e.level}" style="position:absolute;left:4px;bottom:4px;height:22px;min-width:22px;font-size:12px">${e.code}</span>${ro ? '' : `<button class="x" data-act="rmInd" data-sid="${s.id}" data-k="${k}">✕</button>`}</div>`; });
    if (!ro && list.length < Math.max(S.settings.nbIndMin, 2) + 2) h += `<button class="indslot add" data-act="pickInd" data-sid="${s.id}">＋</button>`;
    h += `</div></div>`;
  });
  h += `</div>`;
  // bilan
  h += `<h3>3. Bilan de difficulté</h3>${bilanTable(g)}`;
  if (!ro) h += `<button class="btn ok big" data-act="validate" style="margin-top:14px">✓ Rendre l'enchaînement au professeur</button>`;
  h += `<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="printGroup" data-id="${g.id}">🖨️ Imprimer la fiche</button></div>`;
  return h;
}
function itemHtml(g, it, i, mem, ro) {
  const isFig = it.kind === 'fig';
  const f = isFig ? FIGMAP[it.ref] : LIAMAP[it.ref];
  if (!f) return '';
  const issues = itemIssues(g, it, i);
  let h = `<div class="item ${isFig ? '' : 'lia'} ${it.simul ? 'simul' : ''}">`;
  if (it.simul) h += `<div class="small" style="padding:4px 10px;background:#fff8e6">⇉ en même temps que l'élément n°${i}</div>`;
  h += `<div class="head"><div class="num">${i + 1}</div>`;
  if (f.img) h += `<button class="thumb" data-act="${isFig ? 'showFig' : 'showLia'}" data-id="${f.id}"><img src="${f.img}" alt=""></button>`;
  h += `<div class="info">`;
  if (isFig) h += `<div class="ttl"><span class="lvl ${f.level}">${f.code}</span> <span class="pts">${fmt(val(f.level))} pt</span></div><div class="small">${esc(figTitle(f))}</div>`;
  else h += `<div class="ttl">🔗 ${esc(f.name)}</div><div class="small muted">${esc((LIAISON_CATS.find(c => c.code === f.cat) || {}).name || '')} · liaison</div>`;
  issues.forEach(m => h += `<div class="warn">⚠️ ${esc(m)}</div>`);
  if (it.note || !ro) h += ro ? `<div class="small muted">📝 ${esc(it.note)}</div>` : `<input type="text" placeholder="Note (facultatif)" value="${esc(it.note || '')}" data-act="note" data-i="${i}" style="width:100%;margin-top:6px;min-height:38px;padding:6px 8px">`;
  h += `</div></div><div class="roles">`;
  mem.forEach(s => {
    const r = it.roles[s.id] || '';
    h += `<button class="role ${r}" ${ro ? 'disabled' : ''} data-act="cycle" data-i="${i}" data-sid="${s.id}"><span class="ini">${esc(s.ini)}</span><span class="r">${r ? ROLE_NAMES[r] : '—'}</span></button>`;
  });
  h += `</div>`;
  if (!ro) h += `<div class="tools"><button class="tbtn" data-act="up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="tbtn" data-act="down" data-i="${i}" ${i < g.routine.length - 1 ? '' : 'disabled'}>↓</button>${i ? `<button class="tbtn ${it.simul ? 'on' : ''}" data-act="simul" data-i="${i}" style="padding:0 10px">⇉ simultané</button>` : ''}<span class="grow"></span><button class="tbtn" data-act="del" data-i="${i}" style="color:var(--err)">🗑</button></div>`;
  return h + `</div>`;
}
function bilanTable(g, forPrint = false) {
  const mem = groupMembers(g); const st = S.settings;
  let h = `<div class="tablewrap ${forPrint ? '' : 'card'}" style="${forPrint ? '' : 'padding:6px'}"><table><thead><tr><th>Élève</th><th class="n">Fig.</th><th class="n">P</th><th class="n">V</th><th class="n">A/B/C/D</th><th class="n">Pts figures</th><th class="n">Élém. stat.</th>${st.countInd ? '<th class="n">Total</th>' : ''}<th>Alertes</th></tr></thead><tbody>`;
  mem.forEach(s => {
    const x = studentStats(g, s.id);
    h += `<tr><td><span class="ini">${esc(s.ini)}</span> <span class="small">${esc(s.prenom)}</span></td><td class="n">${x.nFig}</td><td class="n">${x.P}</td><td class="n">${x.V}</td><td class="n small">${x.lv.A}/${x.lv.B}/${x.lv.C}/${x.lv.D}</td><td class="n pts">${fmt(x.ptsFig)}</td><td class="n">${x.ind.map(e => e.code).join(', ') || '—'}${x.ind.length ? ` <span class="small muted">(${fmt(x.ptsInd)})</span>` : ''}</td>${st.countInd ? `<td class="n pts">${fmt(x.total)}</td>` : ''}<td>${x.alerts.length ? x.alerts.map(a => `<div class="${forPrint ? '' : 'warn'}">${esc(a)}</div>`).join('') : (forPrint ? 'OK' : '<span class="badge ok">OK</span>')}</td></tr>`;
  });
  h += `</tbody></table>`;
  h += `<p class="small muted" style="margin:6px 0 0">Barème figures : A ${fmt(st.bareme.A)} · B ${fmt(st.bareme.B)} · C ${fmt(st.bareme.C)} · D ${fmt(st.bareme.D)}${st.maxFig ? ` — seules les ${st.maxFig} meilleures figures sont retenues` : ''}. Points comptés pour le porteur et le voltigeur.</p></div>`;
  return h;
}

/* ----- catalogue (page de consultation) ----- */
function viewCatalogPage() {
  return `<h2>Code de figures</h2><p class="muted small">Consultez les figures par famille. Touchez une figure pour voir sa description.</p>${catalogFilters('page')}${catalogGrid(null, 'page')}
  <h2>Éléments de liaison</h2>${liaisonList(null)}
  <h2>Éléments statiques individuels</h2><div class="grid">${INDIVIDUELS.map(e => indCard(e)).join('')}</div>`;
}
function catalogFilters() {
  const subs = [...new Set(FIGURES.filter(f => f.type === V.catType).map(f => f.famName))];
  return `<div class="tabs">${TYPES.map(t => `<button class="${t === V.catType ? 'on' : ''}" data-act="catType" data-v="${t}">${TYPE_SHORT[t]}</button>`).join('')}</div>
  <div class="row" style="margin-bottom:10px">
    <select data-act="catSub"><option value="">Toutes les familles (${subs.length})</option>${subs.map(s => `<option ${s === V.catSub ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <div class="chips">${['', 'A', 'B', 'C', 'D'].map(l => `<button class="chip ${V.catLvl === l ? 'sel' : ''}" data-act="catLvl" data-v="${l}">${l || 'Tous'}${l ? ' · ' + fmt(val(l)) : ''}</button>`).join('')}</div>
  </div>`;
}
function catalogGrid(g) {
  const list = FIGURES.filter(f => f.type === V.catType && (!V.catSub || f.famName === V.catSub) && (!V.catLvl || f.level === V.catLvl));
  if (!list.length) return '<div class="empty">Aucune figure pour ce filtre.</div>';
  const n = g ? g.members.length : 99;
  let h = '', last = '';
  list.forEach(f => {
    const head = f.famName + (f.sub ? ' — ' + f.sub : '');
    if (head !== last) { if (last) h += '</div>'; h += `<h3>${esc(head)}</h3><div class="grid">`; last = head; }
    const dis = f.nb > n;
    h += `<button class="fcard ${dis ? 'dis' : ''}" data-act="showFig" data-id="${f.id}"><div class="im"><img loading="lazy" src="${f.img}" alt="${esc(f.code)}"></div><div class="t"><span class="lvl ${f.level}">${f.code}</span><span class="pts">${fmt(val(f.level))} pt</span></div>${dis ? `<div class="small err">Il faut ${f.nb} gymnastes</div>` : ''}</button>`;
  });
  return h + '</div>';
}
function liaisonList(g) {
  return LIAISON_CATS.map(c => {
    const items = LIAISONS.filter(l => l.cat === c.code);
    return `<h3>${esc(c.name)}</h3><p class="small muted">${esc(c.info)}</p><div class="grid">${items.map(l => `<button class="fcard" data-act="showLia" data-id="${l.id}">${l.img ? `<div class="im"><img loading="lazy" src="${l.img}" alt=""></div>` : ''}<div class="t" style="font-weight:600">${esc(l.name)}</div><div class="small muted">${esc(l.nb)} gymnaste(s)</div></button>`).join('')}</div>`;
  }).join('');
}
function indCard(e) { return `<button class="fcard" data-act="showInd" data-id="${e.id}"><div class="im"><img loading="lazy" src="${e.img}" alt=""></div><div class="t"><span class="lvl ${e.level}">${e.code}</span><span class="small muted">${fmt(valInd(e.level))} pt</span></div></button>`; }

/* ---------- modales ---------- */
function openModal(m) { V.pick = m; renderModal(); }
function closeModal() { V.pick = null; renderModal(); }
function renderModal() {
  const root = $('#modalRoot'); const m = V.pick;
  if (!m) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
  document.body.style.overflow = 'hidden';
  const g = grp(V.groupId);
  let title = '', body = '';
  if (m.kind === 'fig') { title = 'Choisir une figure'; body = catalogFilters() + catalogGrid(g); }
  else if (m.kind === 'lia') { title = 'Choisir une liaison'; body = liaisonList(g); }
  else if (m.kind === 'ind') { const s = stuById(m.sid); title = `Élément statique — ${s ? s.ini : ''}`; body = `<p class="small muted">Éléments individuels de maintien (code de figures).</p><div class="grid">${INDIVIDUELS.map(e => indCard(e)).join('')}</div>`; }
  else if (m.kind === 'detail') {
    const d = m.detail; title = d.title;
    body = `<div class="detail">${d.img ? `<img src="${d.img}" alt="">` : ''}<div class="card">${d.head || ''}<p>${esc(d.desc)}</p>${d.secu && d.secu !== '—' ? `<p class="small"><b>Sécurité :</b> ${esc(d.secu)}</p>` : ''}</div>
      ${d.addAct ? `<button class="btn big" data-act="${d.addAct}" data-id="${d.id}" ${d.disabled ? 'disabled' : ''}>${d.disabled ? esc(d.disabled) : 'Ajouter'}</button>` : ''}
      ${m.back ? `<button class="btn ghost big" style="margin-top:8px" data-act="detailBack">← Retour à la liste</button>` : ''}</div>`;
  } else if (m.kind === 'pin') {
    root.innerHTML = `<div class="modal" style="align-items:center"><div class="dialog"><h3 style="margin-top:0">${esc(m.title)}</h3><input type="password" inputmode="numeric" id="pinIn" placeholder="Code prof" style="width:100%"><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Annuler</button><button class="btn" data-act="pinOk">Valider</button></div></div></div>`;
    setTimeout(() => $('#pinIn') && $('#pinIn').focus(), 50); return;
  }
  root.innerHTML = `<div class="modal" data-act="modalBg"><div class="sheet"><div class="sh"><h3>${esc(title)}</h3><button class="tbtn" data-act="closeModal" style="font-size:20px">✕</button></div><div class="sb" id="sheetBody">${body}</div></div></div>`;
  if (m.scroll) { const sb = $('#sheetBody'); if (sb) sb.scrollTop = m.scroll; }
}
function showDetail(detail) {
  const prev = V.pick && V.pick.kind !== 'detail' ? V.pick : (V.pick && V.pick.back) || null;
  if (prev) { const sb = $('#sheetBody'); if (sb) prev.scroll = sb.scrollTop; }
  openModal({kind: 'detail', detail, back: prev});
}

/* ---------- espace prof ---------- */
function viewPin() { return `<div class="card empty"><h2>🔒 Espace prof</h2><p>Saisissez le code prof pour continuer.</p><button class="btn" data-act="askPin">Saisir le code</button></div>`; }
function viewProf() {
  const tabs = [['classes', 'Classes'], ['groupes', 'Groupes'], ['synthese', 'Synthèse & points'], ['sauvegarde', 'Sauvegarde JSON'], ['reglages', 'Réglages']];
  let h = `<h2>Espace prof</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="${V.profTab === k ? 'on' : ''}" data-act="profTab" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (V.profTab === 'classes') h += profClasses();
  if (V.profTab === 'groupes') h += profGroups();
  if (V.profTab === 'synthese') h += profSynth();
  if (V.profTab === 'sauvegarde') h += profBackup();
  if (V.profTab === 'reglages') h += profSettings();
  return h;
}
function profClasses() {
  let h = `<div class="card"><h3 style="margin-top:0">Importer une liste de classe</h3>
  <p class="small muted">Fichiers acceptés : CSV / TXT (export Pronote, ENT…) ou Excel (.xlsx, .ods). Colonnes reconnues : <b>Nom</b>, <b>Prénom</b>, <b>Classe</b> — ou une seule colonne « NOM Prénom ». Sans colonne Classe, les élèves sont placés dans la classe indiquée ci-dessous.</p>
  <div class="row"><input type="text" id="impClass" placeholder="Nom de la classe (ex. 1G3)" class="grow"><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls,.ods,text/csv,text/plain"></div>
  <p class="small muted" style="margin:10px 0 4px">… ou collez la liste (un élève par ligne) :</p>
  <textarea id="impText" placeholder="DUPONT Léa&#10;MARTIN Hugo&#10;…"></textarea>
  <div class="row" style="margin-top:8px"><button class="btn" data-act="doImport">Importer</button></div></div>`;
  if (!S.classes.length) return h + `<div class="empty">Aucune classe.</div>`;
  S.classes.forEach(c => {
    const open = V.openClass === c.id;
    h += `<div class="card"><div class="spread"><div><b style="font-size:18px">${esc(c.name)}</b> <span class="muted small">· ${c.students.length} élèves · ${S.groups.filter(g => g.classId === c.id).length} groupes</span></div>
      <div class="row"><button class="btn sec" data-act="toggleClass" data-id="${c.id}">${open ? 'Fermer' : 'Élèves'}</button><button class="btn ghost" data-act="renameClass" data-id="${c.id}">Renommer</button><button class="btn danger" data-act="delClass" data-id="${c.id}">Supprimer</button></div></div>`;
    if (open) {
      h += `<div class="tablewrap"><table><thead><tr><th>Initiales</th><th>Nom</th><th>Prénom</th><th></th></tr></thead><tbody>${c.students.map(s => `<tr><td><input class="iniin" value="${esc(s.ini)}" data-act="editIni" data-c="${c.id}" data-sid="${s.id}" maxlength="5"></td><td>${esc(s.nom)}</td><td>${esc(s.prenom)}</td><td class="n"><button class="tbtn" data-act="delStu" data-c="${c.id}" data-sid="${s.id}" style="color:var(--err)">🗑</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:8px"><input type="text" id="newNom" placeholder="NOM"><input type="text" id="newPrenom" placeholder="Prénom"><button class="btn sec" data-act="addStu" data-c="${c.id}">＋ Ajouter</button><button class="btn ghost" data-act="resetIni" data-c="${c.id}">Recalculer les initiales</button></div>`;
    }
    h += `</div>`;
  });
  return h;
}
function profGroups() {
  const c = curClass();
  if (!c) return `<div class="empty">Importez d'abord une classe.</div>`;
  const gs = S.groups.filter(g => g.classId === c.id);
  const used = new Set(gs.flatMap(g => g.members));
  const free = c.students.filter(s => !used.has(s.id));
  V.selStudents.forEach(id => { if (used.has(id)) V.selStudents.delete(id); });
  let h = `<div class="card"><div class="spread"><h3 style="margin:0">${esc(c.name)} — élèves sans groupe (${free.length})</h3><span class="small muted">Touchez pour sélectionner</span></div>
    <div class="chips" style="margin:10px 0">${free.map(s => `<button class="chip ${V.selStudents.has(s.id) ? 'sel' : ''}" data-act="selStu" data-sid="${s.id}"><span class="ini">${esc(s.ini)}</span> ${esc(s.prenom)} ${esc(s.nom)}</button>`).join('') || '<span class="muted">Tous les élèves ont un groupe ✓</span>'}</div>
    <div class="row"><button class="btn" data-act="newGroup" ${V.selStudents.size ? '' : 'disabled'}>Créer un groupe avec la sélection (${V.selStudents.size})</button>
    <span class="grow"></span><label class="small">Taille</label><select id="randSize">${[3, 4, 5, 6].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn sec" data-act="randGroups" ${free.length >= 3 ? '' : 'disabled'}>🎲 Répartir au hasard</button></div></div>`;
  if (!gs.length) h += `<div class="empty">Aucun groupe.</div>`;
  gs.forEach(g => {
    const m = groupMembers(g); const bad = m.length < 3 || m.length > 6;
    h += `<div class="card"><div class="spread"><input type="text" value="${esc(g.name)}" data-act="renameGroup" data-id="${g.id}" style="font-weight:700;max-width:220px">
      <span class="${bad ? 'err' : 'muted'} small">${m.length} gymnastes ${bad ? '(3 à 6 requis)' : ''}</span>${groupStatus(g)}</div>
      <div class="chips" style="margin:10px 0">${m.map(s => `<button class="chip" data-act="rmMember" data-g="${g.id}" data-sid="${s.id}" title="Retirer"><span class="ini">${esc(s.ini)}</span> ${esc(s.prenom)} ✕</button>`).join('')}</div>
      <div class="row"><button class="btn sec" data-act="addToGroup" data-id="${g.id}" ${V.selStudents.size ? '' : 'disabled'}>＋ Ajouter la sélection</button><button class="btn ghost" data-act="openGroup" data-id="${g.id}">Ouvrir</button><span class="grow"></span><button class="btn danger" data-act="delGroup" data-id="${g.id}">Supprimer</button></div></div>`;
  });
  return h;
}
function profSynth() {
  const c = curClass();
  if (!c) return `<div class="empty">Aucune classe.</div>`;
  const gs = S.groups.filter(g => g.classId === c.id);
  let h = `<div class="row" style="margin-bottom:6px"><button class="btn sec" data-act="exportCSV">⬇︎ Export CSV des points</button><button class="btn ghost" data-act="printAll">🖨️ Imprimer toutes les fiches</button></div>`;
  if (!gs.length) return h + `<div class="empty">Aucun groupe.</div>`;
  const done = gs.filter(g => g.validated).length;
  h += `<p class="muted">${done}/${gs.length} groupes ont rendu leur enchaînement.</p>`;
  gs.forEach(g => {
    const nf = g.routine.filter(i => i.kind === 'fig').length;
    const issues = g.routine.reduce((a, it, i) => a + itemIssues(g, it, i).length, 0);
    h += `<div class="card"><div class="spread"><b style="font-size:17px">${esc(g.name)}</b>${groupStatus(g)}</div>
    <div class="small muted" style="margin:4px 0 8px">${nf} figures · ${g.routine.length - nf} liaisons${issues ? ` · <span class="warn">${issues} alerte(s) de rôles</span>` : ''}</div>
    ${bilanTable(g)}
    <div class="row" style="margin-top:8px"><button class="btn ghost" data-act="openGroup" data-id="${g.id}">Ouvrir</button><button class="btn ghost" data-act="printGroup" data-id="${g.id}">🖨️ Fiche</button>${g.validated ? `<button class="btn sec" data-act="unlock" data-id="${g.id}">🔓 Rouvrir pour modification</button>` : `<button class="btn ok" data-act="validateProf" data-id="${g.id}">✓ Marquer comme rendu</button>`}</div></div>`;
  });
  return h;
}
function profBackup() {
  const last = S.lastExport ? new Date(S.lastExport).toLocaleString('fr-FR') : 'jamais';
  return `<div class="card"><h3 style="margin-top:0">Sauvegarde automatique</h3><p class="small">Les données sont enregistrées automatiquement sur cette tablette à chaque modification. Pour ne rien perdre (nettoyage du navigateur, changement de tablette), exportez régulièrement un fichier JSON.</p><p class="small muted">Dernier export : ${last}</p></div>
  <div class="card"><h3 style="margin-top:0">Exporter</h3><div class="row"><button class="btn" data-act="exportAll">⬇︎ Tout exporter (JSON)</button><button class="btn sec" data-act="exportClass" ${curClass() ? '' : 'disabled'}>⬇︎ Exporter la classe ${esc(curClass() ? curClass().name : '')}</button></div></div>
  <div class="card"><h3 style="margin-top:0">Importer une sauvegarde</h3><p class="small muted">Fusion : les classes et groupes du fichier remplacent ceux qui ont le même identifiant, les autres sont conservés. Remplacement : toutes les données actuelles sont effacées.</p>
  <input type="file" id="jsonFile" accept=".json,application/json"><div class="row" style="margin-top:8px"><button class="btn" data-act="importJSON" data-mode="merge">Fusionner</button><button class="btn danger" data-act="importJSON" data-mode="replace">Remplacer tout</button></div></div>
  <div class="card"><h3 style="margin-top:0">Réinitialiser</h3><button class="btn danger" data-act="resetAll">Effacer toutes les données de la tablette</button></div>`;
}
function profSettings() {
  const st = S.settings;
  const lv = (k, o) => ['A', 'B', 'C', 'D'].map(l => `<label class="stu">${l} <input type="number" step="0.05" min="0" value="${o[l]}" data-act="setBar" data-k="${k}" data-l="${l}" style="width:86px"></label>`).join('');
  return `<div class="card"><h3 style="margin-top:0">Barème des figures (difficulté)</h3><div class="row">${lv('bareme', st.bareme)}</div>
  <p class="small muted">Le code de figures indique 0,2 / 0,4 / 0,6 / 0,8 ; ce barème établissement le remplace.</p></div>
  <div class="card"><h3 style="margin-top:0">Exigences par élève</h3>
  <div class="row"><label class="stu">Figures minimum (porteur ou voltigeur) <input type="number" min="0" value="${st.nbFigMin}" data-act="setNum" data-k="nbFigMin" style="width:80px"></label></div>
  <div class="row" style="margin-top:8px"><label class="stu">Éléments statiques individuels <input type="number" min="0" value="${st.nbIndMin}" data-act="setNum" data-k="nbIndMin" style="width:80px"></label></div>
  <div class="row" style="margin-top:8px"><label class="stu">Ne retenir que les N meilleures figures (0 = toutes) <input type="number" min="0" value="${st.maxFig}" data-act="setNum" data-k="maxFig" style="width:80px"></label></div></div>
  <div class="card"><h3 style="margin-top:0">Éléments statiques individuels</h3><label class="stu"><input type="checkbox" data-act="setCountInd" ${st.countInd ? 'checked' : ''} style="width:24px;height:24px"> Ajouter leurs points au total de difficulté</label>
  <div class="row" style="margin-top:8px">${lv('baremeInd', st.baremeInd)}</div></div>
  <div class="card"><h3 style="margin-top:0">Code prof</h3><p class="small muted">Protège l'espace prof et la réouverture des enchaînements rendus. Laisser vide pour désactiver.</p><div class="row"><input type="password" id="pinNew" inputmode="numeric" placeholder="${st.pin ? 'Code défini — nouveau code' : 'Nouveau code'}"><button class="btn sec" data-act="setPin">Enregistrer</button></div></div>
  <p class="small muted">Données : ${FIGURES.length} figures, ${INDIVIDUELS.length} éléments statiques, ${LIAISONS.length} éléments de liaison.</p>`;
}

/* ---------- import liste de classe ---------- */
function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const sample = lines.slice(0, 5).join('\n');
  const delim = [';', '\t', ','].map(d => [d, (sample.match(new RegExp(d === '\t' ? '\t' : '\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0];
  const d = delim[1] ? delim[0] : null;
  return lines.map(l => {
    if (!d) return [l.trim()];
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === d && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim()); return out;
  });
}
function splitNomPrenom(full) {
  const t = String(full).trim().split(/\s+/);
  const isUp = w => /[A-ZÀ-Ý]/.test(w) && w === w.toUpperCase();
  let k = 0; while (k < t.length - 1 && isUp(t[k])) k++;
  if (k === 0) k = 1;
  return {nom: t.slice(0, k).join(' '), prenom: t.slice(k).join(' ')};
}
function rowsToStudents(rows, defClass) {
  rows = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
  if (!rows.length) return [];
  const h = rows[0].map(norm);
  let iNom = h.findIndex(x => x === 'nom' || x === 'nom de famille' || (x.startsWith('nom') && !x.includes('prenom'))),
      iPre = h.findIndex(x => x.startsWith('prenom')),
      iCla = h.findIndex(x => x === 'classe' || x.startsWith('classe') || x === 'division' || x === 'groupe classe'),
      iFull = h.findIndex(x => x === 'eleve' || x === 'eleves' || x === 'nom prenom' || x === 'nom et prenom' || x === 'nom - prenom');
  const hasHeader = iNom >= 0 || iPre >= 0 || iFull >= 0 || iCla >= 0;
  const data = hasHeader ? rows.slice(1) : rows;
  if (!hasHeader) { if (rows[0].length >= 2) { iNom = 0; iPre = 1; iCla = rows[0].length >= 3 ? 2 : -1; } else iFull = 0; }
  if (iFull >= 0 && iNom < 0) iNom = -1;
  return data.map(r => {
    let nom, prenom;
    if (iNom >= 0 && iPre >= 0) { nom = r[iNom]; prenom = r[iPre]; }
    else { const x = splitNomPrenom(r[iFull >= 0 ? iFull : (iNom >= 0 ? iNom : 0)]); nom = x.nom; prenom = x.prenom; }
    const classe = (iCla >= 0 && r[iCla]) ? r[iCla] : defClass;
    return {nom: (nom || '').toUpperCase(), prenom: prenom || '', classe};
  }).filter(s => s.nom || s.prenom);
}
async function readListFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    if (typeof XLSX === 'undefined') throw new Error('Lecteur Excel indisponible');
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: false, defval: ''});
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  return parseCSV(text);
}
async function doImport() {
  const defClass = ($('#impClass').value || '').trim();
  const file = $('#impFile').files[0]; const txt = $('#impText').value;
  let rows = [];
  try { if (file) rows = await readListFile(file); else if (txt.trim()) rows = parseCSV(txt); else return toast('Choisissez un fichier ou collez une liste'); }
  catch (e) { return toast('Lecture impossible : ' + e.message); }
  const studs = rowsToStudents(rows, defClass);
  if (!studs.length) return toast('Aucun élève reconnu');
  if (studs.some(s => !s.classe)) return toast('Indiquez le nom de la classe (pas de colonne « Classe » dans le fichier)');
  let added = 0; const touched = new Set();
  studs.forEach(s => {
    let c = S.classes.find(x => norm(x.name) === norm(s.classe));
    if (!c) { c = {id: uid(), name: s.classe, students: []}; S.classes.push(c); }
    touched.add(c);
    if (!c.students.some(x => norm(x.nom) === norm(s.nom) && norm(x.prenom) === norm(s.prenom))) { c.students.push({id: uid(), nom: s.nom, prenom: s.prenom, ini: ''}); added++; }
  });
  touched.forEach(c => { c.students.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr')); computeInitials(c); });
  const first = [...touched][0]; S.currentClassId = first.id; V.openClass = first.id;
  S.classes.sort((a, b) => a.name.localeCompare(b.name, 'fr', {numeric: true}));
  save(); render(); toast(`${added} élève(s) importé(s) dans ${[...touched].map(c => c.name).join(', ')}`);
}

/* ---------- sauvegarde JSON ---------- */
function exportAll() { S.lastExport = Date.now(); save(); download(`acrosport_sauvegarde_${today()}.json`, JSON.stringify({app: 'acrosport-enchainement', exported: new Date().toISOString(), data: S}, null, 1)); render(); }
function exportClass() {
  const c = curClass(); if (!c) return;
  S.lastExport = Date.now(); save();
  const data = {version: 1, settings: S.settings, classes: [c], groups: S.groups.filter(g => g.classId === c.id), currentClassId: c.id};
  download(`acrosport_${c.name.replace(/[^\w-]+/g, '_')}_${today()}.json`, JSON.stringify({app: 'acrosport-enchainement', exported: new Date().toISOString(), data}, null, 1)); render();
}
async function importJSON(mode) {
  const f = $('#jsonFile').files[0]; if (!f) return toast('Choisissez un fichier .json');
  let obj; try { obj = JSON.parse(await f.text()); } catch (e) { return toast('Fichier JSON invalide'); }
  const d = obj.data || obj;
  if (!Array.isArray(d.classes) || !Array.isArray(d.groups)) return toast("Ce fichier n'est pas une sauvegarde de l'application");
  if (mode === 'replace') { if (!confirm('Remplacer TOUTES les données de la tablette ?')) return; const base = defaultState(); S = Object.assign(base, d); S.settings = Object.assign(base.settings, d.settings || {}); }
  else {
    d.classes.forEach(c => { const i = S.classes.findIndex(x => x.id === c.id); i >= 0 ? S.classes[i] = c : S.classes.push(c); });
    d.groups.forEach(g => { const i = S.groups.findIndex(x => x.id === g.id); i >= 0 ? S.groups[i] = g : S.groups.push(g); });
  }
  S.groups.forEach(g => { g.routine = g.routine || []; g.indiv = g.indiv || {}; g.members = g.members || []; });
  if (!cls(S.currentClassId)) S.currentClassId = S.classes[0] ? S.classes[0].id : null;
  save(); render(); toast(`Import réussi : ${d.classes.length} classe(s), ${d.groups.length} groupe(s)`);
}
function exportCSV() {
  const c = curClass(); if (!c) return;
  const st = S.settings; const rows = [['Classe', 'Groupe', 'Nom', 'Prénom', 'Initiales', 'Nb figures', 'Porteur', 'Voltigeur', 'Nb A', 'Nb B', 'Nb C', 'Nb D', 'Points figures', 'Éléments statiques', 'Points éléments statiques', 'Total', 'Alertes', 'Rendu']];
  S.groups.filter(g => g.classId === c.id).forEach(g => groupMembers(g).forEach(s => {
    const x = studentStats(g, s.id);
    rows.push([c.name, g.name, s.nom, s.prenom, s.ini, x.nFig, x.P, x.V, x.lv.A, x.lv.B, x.lv.C, x.lv.D, fmt(x.ptsFig), x.ind.map(e => e.code).join(' '), fmt(x.ptsInd), fmt(st.countInd ? x.total : x.ptsFig), x.alerts.join(' / '), g.validated ? 'oui' : 'non']);
  }));
  download(`acrosport_points_${c.name.replace(/[^\w-]+/g, '_')}_${today()}.csv`, '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- impression ---------- */
function printGroups(gs) {
  const html = gs.map(g => {
    const c = cls(g.classId); const mem = groupMembers(g);
    const items = g.routine.map((it, i) => {
      const isFig = it.kind === 'fig'; const f = isFig ? FIGMAP[it.ref] : LIAMAP[it.ref]; if (!f) return '';
      const byRole = {}; Object.entries(it.roles).forEach(([sid, r]) => { if (!r) return; const s = stuById(sid); (byRole[r] = byRole[r] || []).push(s ? s.ini : '?'); });
      return `<div class="pitem"><div style="width:22px;font-weight:700">${i + 1}${it.simul ? '⇉' : ''}</div>${f.img ? `<img src="${f.img}">` : ''}<div style="flex:1"><b>${isFig ? `${f.code} — ${esc(figTitle(f))} — ${fmt(val(f.level))} pt` : 'Liaison : ' + esc(f.name)}</b><br>${Object.entries(byRole).map(([r, l]) => `${ROLE_NAMES[r]} : ${l.join(', ')}`).join(' · ') || '<i>rôles non renseignés</i>'}${it.note ? `<br><i>${esc(it.note)}</i>` : ''}</div></div>`;
    }).join('');
    return `<div class="pfiche"><h1>Acrosport — ${esc(g.name)} (${esc(c ? c.name : '')})</h1><div>${mem.map(s => `<b>${esc(s.ini)}</b> ${esc(s.prenom)} ${esc(s.nom)}`).join(' · ')}</div><div style="font-size:9pt;color:#555">${g.validated ? 'Rendu le ' + new Date(g.validatedAt).toLocaleString('fr-FR') : 'Non rendu'} — imprimé le ${new Date().toLocaleDateString('fr-FR')}</div><h3>Enchaînement</h3>${items || '<i>vide</i>'}<h3>Éléments statiques individuels</h3><div>${mem.map(s => `<b>${esc(s.ini)}</b> : ${(g.indiv[s.id] || []).map(id => INDMAP[id] ? INDMAP[id].code : '').join(', ') || '—'}`).join(' · ')}</div><h3>Bilan de difficulté</h3>${bilanTable(g, true)}</div>`;
  }).join('');
  $('#print').innerHTML = html;
  setTimeout(() => window.print(), 300);
}

/* ---------- actions ---------- */
function needPin(then, title = 'Code prof') {
  if (!S.settings.pin || V.profOk) return then();
  V.afterPin = then; openModal({kind: 'pin', title});
}
const A = {
  goProf() { V.view = 'prof'; render(); },
  back() { V.view = 'home'; render(); },
  openGroup(el) { V.groupId = el.dataset.id; V.view = 'group'; render(); window.scrollTo(0, 0); },
  pickFig() { const g = grp(V.groupId); if (V.catType.startsWith('Quatuor') && g.members.length < 4) V.catType = TYPES[0]; openModal({kind: 'fig'}); },
  pickLia() { openModal({kind: 'lia'}); },
  pickInd(el) { openModal({kind: 'ind', sid: el.dataset.sid}); },
  closeModal() { closeModal(); },
  modalBg(el, ev) { if (ev.target === el) closeModal(); },
  detailBack() { const b = V.pick.back; openModal(b); },
  showFig(el) {
    const f = FIGMAP[el.dataset.id]; const g = V.view === 'group' ? grp(V.groupId) : null;
    const inPick = V.pick && V.pick.kind === 'fig';
    showDetail({id: f.id, title: `${f.code} · ${TYPE_SHORT[f.type]}`, img: f.img, desc: f.desc,
      head: `<div class="row"><span class="lvl ${f.level}">${f.code}</span><span class="pts">${fmt(val(f.level))} point</span><span class="muted small">${esc(figTitle(f))} · ${f.nb} gymnastes</span></div>`,
      addAct: inPick ? 'addFig' : null, disabled: inPick && g && f.nb > g.members.length ? `Il faut au moins ${f.nb} gymnastes` : ''});
  },
  showLia(el) {
    const l = LIAMAP[el.dataset.id]; const inPick = V.pick && V.pick.kind === 'lia';
    const cat = LIAISON_CATS.find(c => c.code === l.cat);
    showDetail({id: l.id, title: l.name, img: l.img, desc: l.desc, secu: l.secu, head: `<div class="muted small">${esc(cat ? cat.name : '')} · ${esc(l.nb)} gymnaste(s)${l.cat === 'IS' ? ' · niveau ' + l.level + ' du code (non compté)' : ''}</div>`, addAct: inPick ? 'addLia' : null});
  },
  showInd(el) {
    const e = INDMAP[el.dataset.id]; const inPick = V.pick && V.pick.kind === 'ind';
    showDetail({id: e.id, title: `Élément statique ${e.code}`, img: e.img, desc: e.desc, head: `<div class="row"><span class="lvl ${e.level}">${e.code}</span><span class="muted small">Élément individuel de maintien · ${fmt(valInd(e.level))} pt (code)</span></div>`, addAct: inPick ? 'addInd' : null});
  },
  addFig(el) {
    const g = grp(V.groupId); const it = {uid: uid(), kind: 'fig', ref: el.dataset.id, roles: {}, simul: false, note: ''};
    g.routine.push(it); save(); closeModal(); render(); toast('Figure ajoutée — indiquez les rôles');
    setTimeout(() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'}), 50);
  },
  addLia(el) { const g = grp(V.groupId); g.routine.push({uid: uid(), kind: 'lia', ref: el.dataset.id, roles: {}, simul: false, note: ''}); save(); closeModal(); render(); toast('Liaison ajoutée'); },
  addInd(el) {
    const g = grp(V.groupId); const sid = V.pick.back ? V.pick.back.sid : V.pick.sid;
    const l = g.indiv[sid] = g.indiv[sid] || [];
    if (l.includes(el.dataset.id)) return toast('Élément déjà choisi pour cet élève');
    l.push(el.dataset.id); save(); closeModal(); render();
  },
  rmInd(el) { const g = grp(V.groupId); g.indiv[el.dataset.sid].splice(+el.dataset.k, 1); save(); render(); },
  cycle(el) {
    const g = grp(V.groupId); if (g.validated) return; const it = g.routine[+el.dataset.i]; const sid = el.dataset.sid;
    const cyc = it.kind === 'fig' ? CYCLE_FIG : CYCLE_LIA; const cur = it.roles[sid] || '';
    const nx = cyc[(cyc.indexOf(cur) + 1) % cyc.length];
    if (nx) it.roles[sid] = nx; else delete it.roles[sid];
    save(); const y = window.scrollY; render(); window.scrollTo(0, y);
  },
  up(el) { move(+el.dataset.i, -1); }, down(el) { move(+el.dataset.i, 1); },
  del(el) { const g = grp(V.groupId); const i = +el.dataset.i; if (!confirm('Supprimer cet élément de l\'enchaînement ?')) return; g.routine.splice(i, 1); if (g.routine[0]) g.routine[0].simul = false; save(); keepScroll(); },
  simul(el) { const g = grp(V.groupId); const it = g.routine[+el.dataset.i]; it.simul = !it.simul; save(); keepScroll(); },
  validate() {
    const g = grp(V.groupId);
    const pb = groupMembers(g).filter(s => studentStats(g, s.id).alerts.length).length + g.routine.reduce((a, it, i) => a + itemIssues(g, it, i).length, 0);
    if (!confirm(pb ? `Il reste ${pb} alerte(s). Rendre quand même l'enchaînement au professeur ?` : "Rendre l'enchaînement au professeur ? Il ne sera plus modifiable.")) return;
    g.validated = true; g.validatedAt = Date.now(); save(); render(); toast('Enchaînement rendu ✓');
  },
  printGroup(el) { printGroups([grp(el.dataset.id)]); },
  printAll() { const c = curClass(); printGroups(S.groups.filter(g => g.classId === c.id)); },
  catType(el) { V.catType = el.dataset.v; V.catSub = ''; rerenderCatalog(); },
  catLvl(el) { V.catLvl = el.dataset.v; rerenderCatalog(); },
  // prof
  askPin() { needPin(() => render()); },
  pinOk() {
    const v = $('#pinIn').value;
    if (v !== S.settings.pin) return toast('Code incorrect');
    V.profOk = true; const f = V.afterPin; V.afterPin = null; closeModal(); f ? f() : render();
  },
  profTab(el) { V.profTab = el.dataset.v; render(); },
  doImport() { doImport(); },
  toggleClass(el) { V.openClass = V.openClass === el.dataset.id ? null : el.dataset.id; render(); },
  renameClass(el) { const c = cls(el.dataset.id); const n = prompt('Nouveau nom de la classe', c.name); if (n && n.trim()) { c.name = n.trim(); save(); render(); } },
  delClass(el) {
    const c = cls(el.dataset.id); if (!confirm(`Supprimer la classe ${c.name}, ses élèves et ses ${S.groups.filter(g => g.classId === c.id).length} groupes ?`)) return;
    S.classes = S.classes.filter(x => x !== c); S.groups = S.groups.filter(g => g.classId !== c.id);
    if (S.currentClassId === c.id) S.currentClassId = S.classes[0] ? S.classes[0].id : null; save(); render();
  },
  delStu(el) {
    const c = cls(el.dataset.c); const s = stuOf(c, el.dataset.sid); if (!confirm(`Supprimer ${s.prenom} ${s.nom} ?`)) return;
    c.students = c.students.filter(x => x !== s); S.groups.forEach(g => { g.members = g.members.filter(m => m !== s.id); g.routine.forEach(it => delete it.roles[s.id]); delete g.indiv[s.id]; }); save(); render();
  },
  addStu(el) {
    const c = cls(el.dataset.c); const nom = $('#newNom').value.trim().toUpperCase(), prenom = $('#newPrenom').value.trim();
    if (!nom && !prenom) return toast('Saisissez un nom et un prénom');
    c.students.push({id: uid(), nom, prenom, ini: ''}); computeInitials(c); save(); render();
  },
  resetIni(el) { const c = cls(el.dataset.c); c.students.forEach(s => s.iniManual = false); computeInitials(c); save(); render(); toast('Initiales recalculées'); },
  selStu(el) { const id = el.dataset.sid; V.selStudents.has(id) ? V.selStudents.delete(id) : V.selStudents.add(id); render(); },
  newGroup() {
    const c = curClass(); const n = S.groups.filter(g => g.classId === c.id).length + 1;
    if (V.selStudents.size > 6) return toast('6 gymnastes maximum par groupe');
    S.groups.push({id: uid(), classId: c.id, name: 'Groupe ' + n, members: [...V.selStudents], routine: [], indiv: {}, validated: false});
    if (V.selStudents.size < 3) toast('⚠️ Groupe de moins de 3 gymnastes : complétez-le');
    V.selStudents.clear(); save(); render();
  },
  addToGroup(el) {
    const g = grp(el.dataset.id); if (g.members.length + V.selStudents.size > 6) return toast('6 gymnastes maximum par groupe');
    g.members.push(...V.selStudents); V.selStudents.clear(); save(); render();
  },
  rmMember(el) {
    const g = grp(el.dataset.g); const sid = el.dataset.sid; const s = stuById(sid);
    const used = g.routine.some(it => it.roles[sid]) || (g.indiv[sid] || []).length;
    if (used && !confirm(`${s ? s.prenom : 'Cet élève'} a déjà des rôles dans l'enchaînement. Le retirer du groupe ?`)) return;
    g.members = g.members.filter(m => m !== sid); g.routine.forEach(it => delete it.roles[sid]); delete g.indiv[sid]; save(); render();
  },
  delGroup(el) { const g = grp(el.dataset.id); if (!confirm(`Supprimer ${g.name} et son enchaînement ?`)) return; S.groups = S.groups.filter(x => x !== g); save(); render(); },
  randGroups() {
    const c = curClass(); const size = +$('#randSize').value;
    const gs = S.groups.filter(g => g.classId === c.id); const used = new Set(gs.flatMap(g => g.members));
    const free = c.students.filter(s => !used.has(s.id)).map(s => s.id);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    let k = Math.max(1, Math.round(free.length / size));
    while (k > 1 && free.length / k < 3) k--;
    while (free.length / k > 6) k++;
    if (!confirm(`Créer ${k} groupe(s) au hasard avec les ${free.length} élèves sans groupe ?`)) return;
    const buckets = Array.from({length: k}, () => []); free.forEach((id, i) => buckets[i % k].push(id));
    let n = gs.length; buckets.forEach(b => S.groups.push({id: uid(), classId: c.id, name: 'Groupe ' + (++n), members: b, routine: [], indiv: {}, validated: false}));
    V.selStudents.clear(); save(); render();
  },
  unlock(el) { needPin(() => { const g = grp(el.dataset.id); g.validated = false; save(); render(); toast(`${g.name} peut de nouveau modifier son enchaînement`); }); },
  validateProf(el) { const g = grp(el.dataset.id); g.validated = true; g.validatedAt = Date.now(); save(); render(); },
  exportAll() { exportAll(); }, exportClass() { exportClass(); }, exportCSV() { exportCSV(); },
  importJSON(el) { importJSON(el.dataset.mode); },
  resetAll() { if (!confirm('Effacer TOUTES les classes, groupes et enchaînements de cette tablette ?')) return; if (!confirm('Confirmez : cette action est définitive (pensez à exporter avant).')) return; S = defaultState(); save(); render(); },
  setPin() { S.settings.pin = $('#pinNew').value.trim(); V.profOk = true; save(); render(); toast(S.settings.pin ? 'Code prof enregistré' : 'Code prof désactivé'); },
  setCountInd(el) { S.settings.countInd = el.checked; save(); }
};
function move(i, d) { const g = grp(V.groupId); const j = i + d; if (j < 0 || j >= g.routine.length) return; [g.routine[i], g.routine[j]] = [g.routine[j], g.routine[i]]; if (g.routine[0]) g.routine[0].simul = false; save(); keepScroll(); }
function keepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function rerenderCatalog() {
  if (V.pick && V.pick.kind === 'fig') { const sb = $('#sheetBody'); const g = grp(V.groupId); sb.innerHTML = catalogFilters() + catalogGrid(g); sb.scrollTop = 0; }
  else render();
}

/* ---------- événements ---------- */
document.addEventListener('click', ev => {
  const nav = ev.target.closest('[data-nav]');
  if (nav) { const v = nav.dataset.nav; V.view = v; if (v === 'prof' && S.settings.pin && !V.profOk) { render(); needPin(() => render()); return; } render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const fn = A[el.dataset.act]; if (fn) fn(el, ev);
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'classSel') { S.currentClassId = el.value; V.selStudents.clear(); save(); if (V.view === 'group') V.view = 'home'; render(); return; }
  const act = el.dataset.act; if (!act) return;
  if (act === 'catSub') { V.catSub = el.value; rerenderCatalog(); }
  else if (act === 'note') { const g = grp(V.groupId); g.routine[+el.dataset.i].note = el.value; save(); }
  else if (act === 'editIni') { const c = cls(el.dataset.c); const s = stuOf(c, el.dataset.sid); const v = el.value.trim().slice(0, 5); if (!v) return render(); if (c.students.some(x => x !== s && x.ini.toUpperCase() === v.toUpperCase())) { toast('Initiales déjà utilisées dans la classe'); return render(); } s.ini = v; s.iniManual = true; save(); }
  else if (act === 'renameGroup') { const g = grp(el.dataset.id); g.name = el.value.trim() || g.name; save(); }
  else if (act === 'setBar') { const v = parseFloat(String(el.value).replace(',', '.')); if (!isNaN(v)) { S.settings[el.dataset.k][el.dataset.l] = v; save(); } }
  else if (act === 'setNum') { const v = parseInt(el.value, 10); if (!isNaN(v) && v >= 0) { S.settings[el.dataset.k] = v; save(); } }
  else if (act === 'setCountInd') { A.setCountInd(el); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'pinIn') A.pinOk(); if (ev.key === 'Escape' && V.pick) closeModal(); });

/* ---------- démarrage ---------- */
if (!cls(S.currentClassId) && S.classes[0]) S.currentClassId = S.classes[0].id;
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
