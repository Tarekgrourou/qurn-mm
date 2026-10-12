// Reusable components (design system §13–§24). Each returns an HTML string; interaction is
// declared with data-a (action name) and data-v (value), handled centrally in app.js.
'use strict';

const C = {
  attr(a, v) { return a ? ` data-a="${a}"${v != null ? ` data-v="${esc(v)}"` : ''}` : ''; },

  // ---- Map cell (two channels) ----
  // x: { s, t } from VM.cell. size in px, or 0 for fluid (fills its grid column).
  cell(x, size = 12, o = {}) {
    const small = !size || size < 24;
    const r = small ? 3 : Math.round(size * 0.24);
    const dot = small ? 4 : Math.max(5, Math.round(size * 0.2));
    const style = `${size ? `--sz:${size}px;` : ''}--r:${r}px;--dot:${dot}px;--dot-o:${small ? 2 : Math.round(size * 0.14)}px;--ring:${small ? 1.5 : Math.max(2, Math.round(size * 0.08))}px`;
    const cls = ['cell', 's-' + x.s, !size && 'fluid', o.dim && 'dim', o.sel && 'sel'].filter(Boolean).join(' ');
    const inner = x.t === 'recent' ? '<i class="ring"></i>' : x.t === 'due' ? '<i class="dot"></i>' : '';
    return `<span class="${cls}" style="${style}"${o.label ? ` role="img" aria-label="${o.label}"` : ' aria-hidden="true"'}>${inner}</span>`;
  },
  // The cell that represents a state in legends and chips.
  stateCell(key, size = 12) {
    const x = { strong: { s: 'S' }, medium: { s: 'M' }, weak: { s: 'W' }, unknown: { s: 'U' }, due: { s: 'U', t: 'due' }, recent: { s: 'U', t: 'recent' }, learning: { s: 'L' }, none: { s: '0' } }[key];
    return C.cell({ t: null, ...x }, size);
  },
  // Eight cells of one hizb, highlighting [a..b] (1-based thumun numbers).
  hizbStrip(snap, h, a, b, size = 12) {
    return `<span class="cells8">${hizbThumun(h).map((id, k) => C.cell(snap.cells[id], size, { dim: k + 1 < a || k + 1 > b })).join('')}</span>`;
  },
  statusChip(key, label, withCell = true) {
    return `<span class="st-chip ${key}">${withCell ? C.stateCell(key, 12) : ''}${label || STATE_AR[key]}</span>`;
  },
  // Stacked distribution bar from counts.
  dist(c, cls = '') {
    const order = ['strong', 'medium', 'weak', 'unknown', 'due', 'recent', 'learning', 'none'];
    const k2 = { unknown: 'medium' };
    return `<div class="dist ${cls}">${order.filter(k => c[k]).map(k => `<span class="k-${k2[k] || k}" style="flex:${c[k]} 1 0${k === 'unknown' ? ';opacity:.45' : ''}"></span>`).join('')}</div>`;
  },

  // ---- Buttons ----
  btn(label, a, v, o = {}) {
    const cls = ['btn', o.kind || 'primary', o.size, o.full && 'full', o.flex && 'flex'].filter(Boolean).join(' ');
    return `<button class="${cls}"${C.attr(a, v)}${o.disabled ? ' disabled' : ''}${o.tour ? ` data-tour="${o.tour}"` : ''}${o.aria ? ` aria-label="${o.aria}"` : ''}>${o.icon ? icon(o.icon, o.iconSize || 20) : ''}${label}</button>`;
  },
  iconBtn(name, a, v, label, o = {}) {
    return `<button class="iconbtn ${o.kind || ''}"${C.attr(a, v)} aria-label="${label}"${o.disabled ? ' disabled' : ''}>${icon(name, o.size || 22)}</button>`;
  },

  // ---- Controls ----
  seg(a, opts, cur, o = {}) {
    return `<div class="seg ${o.h44 ? 'h44' : ''}" role="radiogroup"${o.tour ? ` data-tour="${o.tour}"` : ''}>${opts.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}"${C.attr(a, v)} role="radio" aria-checked="${v === cur}">${l}</button>`).join('')}</div>`;
  },
  picks(a, opts, cur, cls = '') {
    return `<div class="picks ${cls}" role="radiogroup">${opts.map(([v, l]) => `<button class="pick ${v === cur ? 'on' : ''}"${C.attr(a, v)} role="radio" aria-checked="${v === cur}">${l}</button>`).join('')}</div>`;
  },
  radioRow(label, sub, a, v, on, end = '') {
    return `<button class="radio-row ${on ? 'on' : ''}"${C.attr(a, v)} role="radio" aria-checked="${on}"><span class="radio"></span><span class="tx"><span class="l">${label}</span>${sub ? `<span class="s">${sub}</span>` : ''}</span>${end}</button>`;
  },
  switch(on, a, v, label) {
    return `<button class="switch ${on ? 'on' : ''}"${C.attr(a, v)} role="switch" aria-checked="${on}" aria-label="${label}"></button>`;
  },
  chk(state) { // 'all' | 'part' | 'none'
    return `<span class="chk ${state === 'all' ? 'on' : state === 'part' ? 'part' : ''}">${state === 'all' ? icon('check-bold', 16) : state === 'part' ? icon('minus-bold', 16) : ''}</span>`;
  },
  stepperSmall(n, a, min, max) {
    return `<span class="stepper-s">${C.iconBtn('minus-bold', a, -1, 'إنقاص', { disabled: n <= min, size: 18 })}<span class="v num">${n}</span>${C.iconBtn('plus-bold', a, 1, 'زيادة', { disabled: n >= max, size: 18 })}</span>`;
  },

  // ---- Structure ----
  secH(title, meta = '', action = '') {
    return `<div class="sec-h"><span>${title}</span>${action || (meta ? `<span class="meta">${meta}</span>` : '')}</div>`;
  },
  // List group of rows. row: { icon, label, sub, cap, end, a, v, chev, iconBox }
  group(rows) {
    return `<div class="group">${rows.map(C.row).join('')}</div>`;
  },
  row(r) {
    const tag = r.a ? 'button' : 'div';
    const lead = r.lead || (r.icon ? `<span class="icon-box ${r.iconBox || ''}">${icon(r.icon, 20)}</span>` : '');
    return `<${tag} class="row ${r.cls || ''}"${C.attr(r.a, r.v)}>${lead}<span class="tx"><span class="l">${r.label}</span>${r.sub ? `<span class="s">${r.sub}</span>` : ''}${r.cap ? `<span class="c">${r.cap}</span>` : ''}</span>${r.end || ''}${r.a && r.chev !== false ? icon('caret-left', 18).replace('class="ic"', 'class="ic chev"') : ''}</${tag}>`;
  },
  topBar(title) {
    return `<div class="topbar">${C.iconBtn('arrow-right', 'back', null, 'رجوع', { size: 24 })}<div class="title">${title}</div></div>`;
  },
  // Dismissible first-use tip (only shown until the user taps "فهمت").
  tip(key, text) {
    return `<div class="tip" role="note">${icon('lightbulb', 20)}<span class="tx">${text}</span><button class="btn s" data-a="dismissTip" data-v="${key}">فهمت</button></div>`;
  },
  empty(art, title, body, action = '') {
    return `<div class="empty">${art}<div class="t">${title}</div>${body ? `<div class="b">${body}</div>` : ''}${action}</div>`;
  },
  emptyArt(n, size, cols, dashedAt = -1, fill = '') {
    return `<div class="empty-art" style="grid-template-columns:repeat(${cols},${size}px)">${Array.from({ length: n }, (_, i) => `<span style="height:${size}px;${fill}" class="${i === dashedAt ? 'dashed' : ''}"></span>`).join('')}</div>`;
  },
  // Your own note for any thumun in a range (the first one that has a note).
  noteLine(S, ids) {
    const id = ids.find(i => S.notes && S.notes[i]);
    return id == null ? '' : `<div class="note-line">${icon('note-pencil', 16)}<span>${esc(S.notes[id].text)}</span></div>`;
  },
  // «عن القرآن» heads-up for a range: a similar ayah first, then a reason of revelation, then the
  // surah's theme. Stronger when you have a recorded mistake on that ayah.
  kbLine(S, from, to) {
    const hits = kbFor(from, to);
    if (!hits.length) return '';
    const h = hits.find(x => x.kind === 'mut') || hits.find(x => x.kind === 'sajda') || hits.find(x => x.kind === 'waqf') || hits.find(x => x.kind === 'nuzul') || hits[0];
    let ic = 'warning-diamond', text, v, strong = false;
    if (h.kind === 'mut') {
      const m = h.item, out = m.sides.find(x => { const g = kbG(x.ref); return g < from || g > to; });
      text = 'متشابه: ' + m.title + (out ? ' · قارن بـ' + kbRef(out.ref) : '');
      v = 'mut:' + m.id;
      strong = [...m.sides.map(x => x.ref), ...(m.also || [])].some(r => { const g = kbG(r); return g >= from && g <= to && S.errors.some(e => e.g === g); });
    } else if (h.kind === 'nuzul') { ic = 'book-open'; text = 'سبب نزول: ' + kbRef(h.item.ref); v = 'nuzul:' + h.item.id; }
    else if (h.kind === 'waqf') { ic = 'pause-circle'; text = 'وقف وابتداء: ' + h.item.title + ' · ' + kbRef(h.item.ref); v = 'waqf:' + h.item.id; }
    else if (h.kind === 'sajda') { ic = 'arrow-down'; text = 'سجدة تلاوة: ' + kbRef(h.item.ref); v = 'sajda:' + h.item.ref[0]; }
    else { ic = 'lightbulb'; text = 'مقصد السورة: ' + h.item.theme; v = 'themes:' + h.item.s; }
    return `<button class="kb-line ${strong ? 'strong' : ''}" data-a="kbOpen" data-v="${v}">${icon(ic, 16)}<span>${text}</span>${hits.length > 1 ? `<b class="num">+${hits.length - 1}</b>` : ''}</button>`;
  },
  // A quiet card with an icon, two lines and an optional action row.
  infoCard(ic, title, body, actions = '', cls = 'subtle') {
    return `<div class="card ${cls}" style="border-radius:24px;gap:10px"><div style="display:flex;gap:10px;align-items:flex-start">${icon(ic, 22).replace('class="ic"', 'class="ic t-brand"')}<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="t-title-s">${title}</span>${body ? `<span class="t-body-s">${body}</span>` : ''}</span></div>${actions ? `<div class="btn-row wrap">${actions}</div>` : ''}</div>`;
  },
  // "من البقرة 16 إلى البقرة 24" with the connectors lighter, isolated for bidi.
  range(from, to) { return `<span class="iso">${rangeText(from, to)}</span>`; },
  // The four-cell mark (design system: AppIcon): full, half, a little, not yet. Colours follow the theme.
  brandMark(height, label = '') {
    return `<span class="brand-mark" style="--bm:${height}px" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><i></i><i></i><i></i><i></i></span>`;
  },
  // Slow drifting background (gradient.motion.*): 'mint' | 'deep' | 'dawn'. One per screen, behind
  // short text only; still under reduced motion. The parent needs class "has-aurora".
  aurora(kind) { return `<span class="aurora ${kind}" aria-hidden="true"><i></i><i></i><i></i></span>`; },
  // Seven level bars for the recorder; --l (0..1) is set from the microphone while recording.
  levels() { return `<span class="lv" aria-hidden="true">${'<i></i>'.repeat(7)}</span>`; }
};
