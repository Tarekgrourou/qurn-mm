// Memorized (المحفوظ): overview → surah / juz / hizb / map → detail → thumun. Progressive
// disclosure; every state shown is a projection of the engine (VM.cell).
'use strict';

const FILTERS = [['all', 'الكل'], ['strong', 'قوي'], ['medium', 'متوسط'], ['weak', 'ضعيف'], ['due', 'يحتاج مراجعة'], ['recent', 'قريب'], ['none', 'غير محفوظ']];
const prevNext = (prevA, prevV, nextA, nextV, what) =>
  `<div style="display:flex;gap:4px">${C.iconBtn('caret-right', prevA, prevV, what + ' السابق', { kind: 'surface', size: 18 })}${C.iconBtn('caret-left', nextA, nextV, what + ' التالي', { kind: 'surface', size: 18 })}</div>`;

// Line under a thumun: what its state means for the user right now.
function thumunLine(X, id) {
  const { S, t } = X, x = X.snap.cells[id], th = S.th[id];
  if (x.s === '0') return 'لم يُحفظ بعد';
  if (x.s === 'L') return S.partial[id] ? `قيد الحفظ · بلغت ${ayatWord(S.partial[id])}` : 'قيد الحفظ · ضمن ورد اليوم';
  if (x.t === 'recent') return th.memDay === t ? 'حُفظ اليوم' : `حُفظ ${agoText(t - th.memDay)} · المراجعة ${Math.min(RECENT_REVIEWS, (th.recentN || 0) + 1)} من ${RECENT_REVIEWS}`;
  if (x.s === 'W') return 'كان ضعيفاً في آخر مراجعة' + (x.t === 'due' ? ' · حان وقت مراجعته' : '');
  if (x.t === 'due') return (th.last != null ? `آخر مراجعة ${agoText(t - th.last)}` : 'لم يُراجَع في التطبيق بعد') + ' · حان وقت مراجعته';
  return `آخر مراجعة ${th.last != null ? agoText(t - th.last) : '—'} · القادمة ${inDaysText(th.due - t)}`;
}

const MemScreen = {
  render(X) {
    const { snap, ui } = X, c = snap.counts;
    const head = `<div class="title-row"><h1 class="h1" style="padding:0">المحفوظ</h1><div class="acts">${C.iconBtn('book-open', 'go', 'know', 'عن القرآن', { kind: 'surface' })}${C.iconBtn('warning-diamond', 'go', 'weak', 'مواضع الضعف', { kind: 'surface' })}${C.iconBtn('magnifying-glass', 'go', 'search', 'البحث', { kind: 'surface' })}</div></div>`;
    if (!c.mem && !c.learning) {
      return `<div class="page">${head}${C.empty(C.emptyArt(8, 16, 8), 'لم تحدد محفوظاً بعد', 'اختر ما تحفظه بالسور أو بالأحزاب، وسيظهر هنا عبر السور والأجزاء والأحزاب والخريطة.', C.btn('حدّد محفوظك', 'editMem'))}</div>`;
    }
    const f = ui.memFilter, view = ui.memView;
    const hero = `<div class="hero blue" style="border-radius:28px;padding:22px;gap:14px;box-shadow:none">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px"><div class="metric"><span class="n" style="font-size:52px">${c.mem}</span><span class="u">${c.mem > 10 || c.mem === 0 ? 'ثُمناً محفوظاً' : 'من الأثمان محفوظ'}</span></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;font-size:13px" class="t-2"><span style="font-weight:500;color:var(--tx-1)">${hizbFullWord(snap.fullHizb)}</span><span>من 480 ثُمناً</span></div></div>
      ${C.dist(VM.dist(snap.cells))}</div>`;
    const chips = `<div class="hscroll" data-tour="states">${FILTERS.map(([k, l]) => {
      const n = k === 'all' ? '' : k === 'none' ? c.none + c.learning : c[k];
      return `<button class="chip-filter ${f === k ? 'on' : ''}" data-a="memFilter" data-v="${k}" aria-pressed="${f === k}">${k === 'all' ? '' : C.stateCell(k, 12)}${l}<span class="n num">${n}</span></button>`;
    }).join('')}</div>`;
    let note = '';
    if (f !== 'all') {
      const n = f === 'none' ? c.none + c.learning : c[f];
      note = `<div class="note subtle row-note" style="padding:10px 10px 10px 16px;border-radius:18px">${icon('funnel-simple', 18)}<span style="flex:1;font-size:14px;color:var(--tx-1)">${STATE_AR[f]} · ${thumunWord(n)}</span>${C.btn('إلغاء التصفية', 'memFilter', 'all', { kind: 'link', size: 'xs' })}</div>`;
    }
    const views = { surah: MemScreen.surahList, juz: MemScreen.juzList, hizb: MemScreen.hizbList, map: MemScreen.map };
    return `<div class="page" style="gap:16px">${head}${hero}${C.seg('memView', [['surah', 'السور'], ['juz', 'الأجزاء'], ['hizb', 'الأحزاب'], ['map', 'الخريطة']], view, { h44: true, tour: 'views' })}${chips}${note}${views[view](X, f)}</div>`;
  },

  surahList(X, f) {
    const list = X.surahs().filter(s => f === 'all' || (f === 'none' ? s.mem < s.n : s.c[f]));
    if (!list.length) return `<div class="note subtle">لا سور بهذه الحالة.</div>`;
    return `<div class="group">${list.map(s => {
      const status = s.pct === 100 ? 'محفوظة بالكامل' : s.pct === 0 ? (s.learning ? 'قيد الحفظ' : 'غير محفوظ') : `${s.pct}% محفوظ`;
      const tone = s.pct === 100 ? 'color:var(--brand-text);font-weight:500' : s.pct === 0 ? 'color:var(--tx-3)' : 'font-weight:500';
      const sts = ['strong', 'medium', 'weak', 'due', 'recent'].filter(k => s.c[k]).map(k => STATE_AR[k]);
      const bar = { ...s.c, learning: s.learning, none: s.n - s.mem - s.learning };
      delete bar.due; delete bar.recent;
      return `<button class="row" data-a="go" data-v="surah:${s.s}"><span class="icon-box sunken num" style="font-size:14px;font-weight:500">${s.s}</span><span class="tx" style="gap:6px"><span style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:17px;font-weight:500">${s.name}</span><span style="font-size:13px;white-space:nowrap;${tone}">${status}</span></span>${C.dist(bar, 'h6')}<span class="c">${[ayatWord(s.n), ...sts].join(' · ')}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>`;
    }).join('')}</div>`;
  },
  juzList(X, f) {
    const out = [];
    for (let j = 1; j <= 30; j++) {
      const L = juzThumun(j), cs = L.map(i => X.snap.cells[i]);
      if (!cs.some(x => VM.matches(x, f))) continue;
      const m = cs.filter(VM.isMem).length, cell = (x) => C.cell(x, 0, { dim: !VM.matches(x, f) });
      out.push(`<button class="card r24" style="padding:16px 18px;gap:10px" data-a="go" data-v="juz:${j}"><span style="display:flex;justify-content:space-between;align-items:baseline;width:100%"><span class="t-title-s" style="font-size:17px">الجزء ${j}</span><span class="t-meta t-2 num">${iso(m + ' / 16')} ثُمناً</span></span>
        <span style="display:flex;gap:8px;width:100%"><span class="cells-grid c8" style="flex:1">${cs.slice(0, 8).map(cell).join('')}</span><span class="cells-grid c8" style="flex:1">${cs.slice(8).map(cell).join('')}</span></span>
        <span class="t-cap">${rangeText(THUMUN[L[0]].start, THUMUN[L[15]].end)}</span></button>`);
    }
    return out.length ? `<div style="display:flex;flex-direction:column;gap:10px">${out.join('')}</div>` : `<div class="note subtle">لا أجزاء بهذه الحالة.</div>`;
  },
  hizbList(X, f) {
    const out = [];
    for (let h = 1; h <= 60; h++) {
      const L = hizbThumun(h), cs = L.map(i => X.snap.cells[i]);
      if (!cs.some(x => VM.matches(x, f))) continue;
      const m = cs.filter(VM.isMem).length;
      out.push(`<button class="card r22" style="padding:14px;gap:10px;min-width:0" data-a="go" data-v="hizb:${h}"><span style="display:flex;justify-content:space-between;align-items:baseline;width:100%"><span class="t-title-s">الحزب ${h}</span><span class="t-cap t-2 num">${m ? iso(m + ' / 8') : '—'}</span></span>
        <span class="cells-grid c8">${cs.map(x => C.cell(x, 0, { dim: !VM.matches(x, f) })).join('')}</span>
        <span style="display:flex;flex-direction:column;font-size:12px;line-height:1.5"><span class="t-2">${VM.summary(cs)}</span><span class="t-3">من ${ayahName(THUMUN[L[0]].start)}</span></span></button>`);
    }
    return out.length ? `<div class="grid2">${out.join('')}</div>` : `<div class="note subtle">لا أحزاب بهذه الحالة.</div>`;
  },
  map(X, f) {
    const legend = ['strong', 'medium', 'weak', 'recent', 'due', 'learning', 'none'].map(k => `<span>${C.stateCell(k, 16)}${STATE_AR[k]}</span>`).join('');
    const blocks = Array.from({ length: 60 }, (_, k) => {
      const h = k + 1, cs = hizbThumun(h).map(i => X.snap.cells[i]);
      return `<button style="padding:6px 6px 8px;border-radius:14px;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:56px" data-a="go" data-v="hizb:${h}" aria-label="الحزب ${h}، ${VM.summary(cs)}"><span class="t-cap num" style="font-size:11px;line-height:1">${h}</span><span class="cells-grid c4">${cs.map(x => C.cell(x, 0, { dim: !VM.matches(x, f) })).join('')}</span></button>`;
    }).join('');
    return `${X.tipOn('map') ? C.tip('map', 'اضغط على الحزب لرؤية تفاصيل أثمانه.') : ''}<div class="legend">${legend}</div>
      <div class="card" style="padding:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px">${blocks}</div>
      <div class="t-meta" style="text-align:center">60 حزباً · 8 أثمان لكل حزب · اضغط على حزب لعرض تفاصيله</div>`;
  }
};

const SurahScreen = {
  title: 'المحفوظ · السور',
  render(X, s) {
    s = +s;
    const sr = X.surahs()[s - 1], { S, snap } = X;
    const ayahCells = [];
    for (let g = sr.a; g <= sr.b; g++) ayahCells.push(C.cell(VM.ayahCell(S, g, snap), 0));
    const ths = THUMUN.filter(T => T.end >= sr.a && T.start <= sr.b).map(T => T.id);
    // Runs of consecutive ayat with the same state.
    const runs = [];
    for (let g = sr.a; g <= sr.b; g++) {
      const k = VM.key(VM.ayahCell(S, g, snap)), last = runs[runs.length - 1];
      if (last && last.k === k && AYAH_TH[g] === last.th) last.b = g; else runs.push({ k, a: g, b: g, th: AYAH_TH[g] });
    }
    const cnt = {}; ths.forEach(i => { const x = snap.cells[i]; if (VM.isMem(x)) { cnt[STRENGTH_KEY[x.s]] = (cnt[STRENGTH_KEY[x.s]] || 0) + 1; if (x.t) cnt[x.t] = (cnt[x.t] || 0) + 1; } });
    const unit = n => n === 1 ? 'ثُمن' : n === 2 ? 'ثُمنان' : n >= 3 && n <= 10 ? 'أثمان' : n === 0 ? 'أثمان' : 'ثُمناً';
    const stat = k => `<div class="mini-stat"><span class="k">${C.stateCell(k, 14)}${STATE_AR[k]}</span><span class="v"><b class="num">${cnt[k] || 0}</b><span>${unit(cnt[k] || 0)}</span></span></div>`;
    const weak = VM.weakList(S, X.t).filter(w => w.g >= sr.a && w.g <= sr.b);
    return `<div class="page">
      <div class="hero mint"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div style="display:flex;flex-direction:column"><span style="font-size:30px;font-weight:500;line-height:1.3">سورة ${sr.name}</span><span class="t-meta t-2">السورة ${s} · ${ayatWord(sr.n)}</span></div>${prevNext('go', 'surah:' + (s > 1 ? s - 1 : 114), 'go', 'surah:' + (s < 114 ? s + 1 : 1), 'السورة')}</div>
        <div class="metric"><span class="n" style="font-size:64px;letter-spacing:-1.5px">${sr.pct}%</span><span class="u" style="font-size:18px">${sr.pct === 100 ? 'محفوظة بالكامل' : 'محفوظ'}</span></div>
        <div class="cells-grid c20">${ayahCells.join('')}</div><span class="t-cap">كل مربّع آية · تمتد السورة على ${thumunWord(ths.length)}</span></div>
      <div class="btn-row">${C.btn('سجّل مراجعة', 'extraSheet', 'ids:' + ths.filter(i => S.th[i] && S.th[i].mem).join('.'), { flex: true, disabled: !ths.some(i => S.th[i] && S.th[i].mem) })}${C.btn('تعديل المحفوظ', 'editMem', 'surah:' + s, { kind: 'tonal', flex: true })}</div>
      ${SURAH_THEMES[s] ? C.infoCard('lightbulb', 'مقصد السورة · ' + (isMakki(s) ? 'مكية' : 'مدنية'), SURAH_THEMES[s].theme, C.btn('المزيد عن السورة', 'kbOpen', 'themes:' + s, { kind: 'link', size: 'xs' })) : `<span class="t-cap" style="padding:0 6px">سورة ${isMakki(s) ? 'مكية' : 'مدنية'} · ${ayatWord(sr.n)}</span>`}
      <div class="sec">${C.secH('المقاطع')}<div class="group">${runs.map(r => {
        const a = r.a - sr.a + 1, b = r.b - sr.a + 1, T = THUMUN[r.th];
        return C.row({ label: a === b ? `${sr.name} ${a}` : `من ${sr.name} ${a} إلى ${sr.name} ${b}`, sub: `<span style="display:flex;align-items:center;gap:8px;padding-top:4px">${C.statusChip(r.k)}<span class="t-cap">${ayatWord(b - a + 1)} · الحزب ${T.hizb} · ص ${pageOf(r.a)}</span></span>`, a: 'go', v: `hizb:${T.hizb}:${T.k}` });
      }).join('')}</div></div>
      <div class="sec">${C.secH('الحالة بالأثمان')}<div class="card r24 p16"><span class="t-cap">قوة الحفظ</span><div class="grid3" style="gap:8px">${['strong', 'medium', 'weak'].map(stat).join('')}</div><span class="t-cap">حالة المراجعة</span><div class="grid2" style="gap:8px">${['due', 'recent'].map(stat).join('')}</div></div></div>
      ${weak.length ? `<div class="sec">${C.secH('مواضع تحتاج انتباهاً')}${weak.map(w => `<button class="warn-row" data-a="go" data-v="hizb:${THUMUN[w.th].hizb}:${THUMUN[w.th].k}">${icon('warning-diamond', 22)}<span class="tx" style="flex:1;display:flex;flex-direction:column"><span style="font-size:16px;font-weight:500">${ayahName(w.g)}</span><span style="font-size:13px">تكرر الخطأ ${w.n === 2 ? 'مرتين' : w.n + ' مرات'}</span></span>${icon('caret-left', 18)}</button>`).join('')}</div>` : ''}
    </div>`;
  }
};

const JuzScreen = {
  title: 'المحفوظ · الأجزاء',
  render(X, j) {
    j = +j;
    const L = juzThumun(j), m = L.filter(i => VM.isMem(X.snap.cells[i])).length;
    return `<div class="page">
      <div class="hero sage" style="gap:14px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><span style="font-size:30px;font-weight:500;line-height:1.3">الجزء ${j}</span>${prevNext('go', 'juz:' + (j > 1 ? j - 1 : 30), 'go', 'juz:' + (j < 30 ? j + 1 : 1), 'الجزء')}</div>
        <span class="t-title-s">${rangeText(THUMUN[L[0]].start, THUMUN[L[15]].end)}</span><div class="metric"><span class="n" style="font-size:48px">${iso(m + ' / 16')}</span><span class="t-2">ثُمناً محفوظاً</span></div></div>
      ${[2 * j - 1, 2 * j].map(h => {
        const H = hizbThumun(h), cs = H.map(i => X.snap.cells[i]), hm = cs.filter(VM.isMem).length;
        return `<button class="card" style="gap:14px" data-a="go" data-v="hizb:${h}"><span style="display:flex;justify-content:space-between;align-items:center;width:100%"><span style="display:flex;flex-direction:column"><span class="t-title">الحزب ${h}</span><span class="t-meta">${rangeText(THUMUN[H[0]].start, THUMUN[H[7]].end)}</span></span><span style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:500" class="num">${iso(hm + ' / 8')}${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</span></span>
          <span class="cells-grid c8 g6">${cs.map(x => C.cell(x, 0)).join('')}</span><span class="t-meta t-2">${VM.summary(cs)}</span></button>`;
      }).join('')}</div>`;
  }
};

const HizbScreen = {
  title: 'المحفوظ · الأحزاب',
  render(X, h, openK) {
    h = +h;
    const { S, t, snap, ui } = X, L = hizbThumun(h), cs = L.map(i => snap.cells[i]), m = cs.filter(VM.isMem).length;
    const open = ui.openThumun;
    const memIdsH = L.filter(i => S.th[i] && S.th[i].mem);
    return `<div class="page">
      <div class="hero lav" style="gap:16px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div style="display:flex;flex-direction:column"><span style="font-size:30px;font-weight:500;line-height:1.3">الحزب ${h}</span><span class="t-meta">الجزء ${Math.ceil(h / 2)} · ${h % 2 ? 'الحزب الأول منه' : 'الحزب الثاني منه'}</span></div>${prevNext('go', 'hizb:' + (h > 1 ? h - 1 : 60), 'go', 'hizb:' + (h < 60 ? h + 1 : 1), 'الحزب')}</div>
        <span class="t-title-s" style="font-size:17px">${rangeText(THUMUN[L[0]].start, THUMUN[L[7]].end)} · ${pagesText(THUMUN[L[0]].start, THUMUN[L[7]].end)}</span>
        <div class="cells-grid c8 g6">${cs.map(x => C.cell(x, 34)).join('')}</div>
        <div style="display:flex;justify-content:space-between;font-size:14px;gap:12px"><span style="font-weight:500">${m === 8 ? '8 أثمان محفوظة' : iso(m + ' / 8') + ' أثمان محفوظة'}</span><span class="t-2">${VM.summary(cs)}</span></div></div>
      <div class="btn-row">${C.btn('مراجعة الحزب', 'extraSheet', 'ids:' + memIdsH.join('.'), { flex: true, disabled: !memIdsH.length })}${C.btn('تعديل المحفوظ', 'editMem', 'hizb:' + h, { kind: 'tonal', flex: true })}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${L.map((id, k) => HizbScreen.thumunCard(X, id, k + 1, open === k + 1)).join('')}</div></div>`;
  },
  thumunCard(X, id, k, open) {
    const { S, t } = X, T = THUMUN[id], x = X.snap.cells[id], th = S.th[id], mem = VM.isMem(x);
    let details = '';
    if (open && mem) {
      const errs = S.errors.filter(e => e.th === id && t - e.day < 30);
      const byG = {}; errs.forEach(e => { (byG[e.g] = byG[e.g] || new Set()).add(e.day); });
      const postponed = (S.postponed[t] || []).includes(id);
      details = `<div style="display:flex;flex-direction:column;gap:10px;padding:0 16px 16px">
        <div class="grid3" style="gap:8px">
          <div class="mini-stat"><span class="k">الصفحات</span><span class="v"><b class="num" style="font-size:18px">${pagesText(T.start, T.end).replace('ص ', '')}</b></span></div>
          <div class="mini-stat"><span class="k">المراجعات</span><span class="v"><b class="num" style="font-size:18px">${th.reviews || 0}</b></span></div>
          <div class="mini-stat"><span class="k">القادمة</span><span class="v"><b style="font-size:15px">${x.t === 'recent' ? 'يومياً' : inDaysText(th.due - t)}</b></span></div></div>
        ${Object.keys(byG).length ? `<div class="note warn" style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:500">الأخطاء في آخر 30 يوماً</span>${Object.entries(byG).map(([g, d]) => `<span>${ayahName(+g)} · ${d.size === 1 ? 'مرة واحدة' : 'في ' + daysWord(d.size)}</span>`).join('')}</div>` : ''}
        ${recStrengthLine(S, t, T)}
        ${C.noteLine(S, [id])}${C.kbLine(S, T.start, T.end)}
        <div class="btn-row">${C.btn('سجّل مراجعة', 'extraSheet', 'ids:' + id, { kind: 'tonal', size: 's', flex: true })}${x.t === 'due' && !postponed ? C.btn('ليس اليوم', 'postpone', String(id), { kind: 'outline', size: 's', flex: true }) : postponed ? C.btn('أُجّل لليوم', null, null, { kind: 'outline', size: 's', flex: true, disabled: true }) : ''}</div>
        <div class="btn-row">${C.btn(S.notes[id] ? 'عدّل ملاحظتي' : 'أضف ملاحظة', 'noteSheet', id, { kind: 'ghost', size: 's', icon: 'note-pencil', iconSize: 18, flex: true })}${Clips.supported ? C.btn((n => n ? `تلاوتي (${n})` : 'سجّل تلاوتك')(Object.values(S.recs).filter(r => r.ids.includes(id)).length), 'recThumun', id, { kind: 'ghost', size: 's', icon: 'microphone', iconSize: 18, flex: true }) : ''}</div></div>`;
    }
    return `<div class="card r24" style="padding:0;gap:0;overflow:hidden">
      <button class="row" style="background:transparent;padding:16px;align-items:center" ${mem ? `data-a="openThumun" data-v="${k}" aria-expanded="${open}"` : ''}>${C.cell(x, 28)}
        <span class="tx"><span class="c">الثُّمن ${k} · ${pagesText(T.start, T.end)}</span><span style="font-size:16px;font-weight:500;line-height:1.45">${rangeText(T.start, T.end)}</span><span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px">${C.statusChip(VM.key(x), null, false)}<span class="t-cap t-2">${thumunLine(X, id)}</span></span></span>
        ${mem ? `<span style="color:var(--tx-3);transition:transform 200ms;${open ? 'transform:rotate(180deg)' : ''}">${icon('caret-down', 18)}</span>` : ''}</button>${details}</div>`;
  }
};

const SearchScreen = {
  title: 'البحث في المحفوظ',
  render(X) {
    const q = X.ui.q.trim();
    const res = q ? SearchScreen.results(X, q) : [];
    return `<div class="page" style="gap:16px">
      <div class="search">${icon('magnifying-glass', 22).replace('class="ic"', 'class="ic t-2"')}<input id="q" value="${esc(X.ui.q)}" placeholder="مثال: الكهف 85" enterkeyhint="search" aria-label="ابحث في المحفوظ" autocomplete="off">${q ? C.iconBtn('x-circle-fill', 'clearQ', null, 'مسح', { size: 22 }).replace('class="iconbtn', 'style="color:var(--tx-3)" class="iconbtn') : ''}</div>
      ${!q ? `<span class="lede" style="font-size:14px">ابحث باسم سورة، أو آية، أو جزء، أو حزب.</span><div class="chips">${['الكهف', 'الكهف 85', 'الحزب 31', 'الجزء 15', 'يونس'].map(s => `<button class="chip-sugg" data-a="setQ" data-v="${s}">${s}</button>`).join('')}</div>` : ''}
      ${res.length ? `<div class="group">${res.map(r => C.row({ lead: `<span class="icon-box">${icon(r.icon, 20)}</span>`, label: r.title, cap: r.sub, end: `<span class="end">${r.kind}</span>`, a: 'go', v: r.to, chev: false })).join('')}</div>` : ''}
      ${q && !res.length ? `<div style="padding:24px;text-align:center" class="t-body-s">لا توجد نتيجة مطابقة. جرّب اسم سورة أو «الحزب 31».</div>` : ''}</div>`;
  },
  results(X, q) {
    const norm = s => s.replace(/[أإآ]/g, 'ا').replace(/^ال/, '').replace(/^سورة\s*/, '').trim();
    const m = q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/^(.*?)\s*(\d+)?$/), name = (m[1] || '').trim(), num = m[2] ? +m[2] : null;
    const res = [];
    if (/^(ال)?حزب/.test(name)) (num ? [num] : [1, 2, 3, 4, 5]).filter(h => h >= 1 && h <= 60).forEach(h => {
      const L = hizbThumun(h); res.push({ kind: 'حزب', icon: 'squares-four', title: `الحزب ${h}`, sub: `${rangeText(THUMUN[L[0]].start, THUMUN[L[7]].end)} · ${VM.summary(L.map(i => X.snap.cells[i]))}`, to: 'hizb:' + h });
    });
    else if (/^(ال)?جزء/.test(name)) (num ? [num] : [1, 2, 3, 4, 5]).filter(j => j >= 1 && j <= 30).forEach(j => {
      const L = juzThumun(j); res.push({ kind: 'جزء', icon: 'book-open', title: `الجزء ${j}`, sub: `${rangeText(THUMUN[L[0]].start, THUMUN[L[15]].end)} · ${iso(L.filter(i => VM.isMem(X.snap.cells[i])).length + ' / 16')} ثُمناً`, to: 'juz:' + j });
    });
    else if (name) {
      const nq = norm(name);
      X.surahs().filter(s => norm(s.name).startsWith(nq) || norm(s.name).includes(nq)).slice(0, 6).forEach(s => {
        if (num && num <= s.n) { const g = toG(s.s, num), T = THUMUN[AYAH_TH[g]]; res.push({ kind: 'موضع', icon: 'map-pin', title: `${s.name} ${num}`, sub: `الحزب ${T.hizb} · الثُّمن ${T.k} · ص ${pageOf(g)} · ${STATE_AR[VM.key(X.snap.cells[T.id])]}`, to: `hizb:${T.hizb}:${T.k}` }); }
        res.push({ kind: 'سورة', icon: 'book-bookmark', title: `سورة ${s.name}`, sub: `${ayatWord(s.n)} · ${s.pct}% محفوظ`, to: 'surah:' + s.s });
      });
    }
    // Your own notes, matched anywhere in the text.
    const nq = q.trim();
    if (nq.length >= 2) Object.entries(X.S.notes).filter(([, n]) => n.text.includes(nq)).slice(0, 6).forEach(([id, n]) => {
      const T = THUMUN[+id];
      res.push({ kind: 'ملاحظة', icon: 'note-pencil', title: esc(n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text), sub: `${shortRange(T.start, T.end)} · الحزب ${T.hizb} · الثُّمن ${T.k}`, to: `hizb:${T.hizb}:${T.k}` });
    });
    return res;
  }
};

const WeakScreen = {
  title: 'مواضع الضعف',
  render(X) {
    let L = VM.weakList(X.S, X.t);
    if (X.ui.weakSort === 'freq') L = [...L].sort((a, b) => b.n - a.n);
    if (X.ui.weakSort === 'recent') L = [...L].sort((a, b) => a.lastDays - b.lastDays);
    const conf = confusions(X.S, X.t);
    const list = L.length ? `${X.tipOn('weak') ? C.tip('weak', 'يظهر الموضع هنا بعد تكرر الخطأ فيه في يومين أو أكثر.') : ''}${C.seg('weakSort', [['all', 'الكل'], ['freq', 'الأكثر تكراراً'], ['recent', 'الأحدث']], X.ui.weakSort)}
      ${L.map(w => { const T = THUMUN[w.th]; return `<div class="card" style="gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="display:flex;flex-direction:column"><span style="font-size:22px;font-weight:500;line-height:1.35">${ayahName(w.g)}</span><span class="t-cap">الحزب ${T.hizb} · الثُّمن ${T.k} · ص ${pageOf(w.g)}</span></div><span class="tag clay">${w.type}</span></div>
        <div style="display:flex;flex-direction:column;gap:2px;font-size:14px"><span style="font-weight:500">${errWord(w.n)} خلال آخر 30 يوماً · في ${daysWord(w.nDays)}</span>${w.with != null ? `<span class="t-2">اشتباه مع ${ayahName(w.with)}</span>` : ''}${w.recovering ? '<span class="t-2">مرّت مراجعة واحدة دون خطأ فيها</span>' : ''}<span class="t-3">آخر خطأ ${agoText(w.lastDays)}</span></div>
        <div class="btn-row">${C.btn('عرض الموضع', 'go', `hizb:${T.hizb}:${T.k}`, { kind: 'tonal', size: 's', flex: true })}${C.btn('سجّل مراجعة', 'extraSheet', 'ids:' + w.th, { kind: 'outline', size: 's', flex: true })}</div></div>`; }).join('')}`
      : C.empty(`<div style="display:flex;gap:5px">${'<span style="width:18px;height:18px;border-radius:5px;background:var(--m-strong)"></span>'.repeat(4)}</div>`, 'لا توجد مواضع ضعف متكررة الآن', 'ستظهر هنا الآيات التي يتكرر فيها الخطأ.');
    const confSec = conf.length ? `<div class="sec">${C.secH('آيات تختلط عليك', placeWord(conf.length))}<div class="group">${conf.map(p => C.row({
      label: `<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${ayahName(p.a)}${icon('arrows-left-right', 16).replace('class="ic"', 'class="ic t-3"')}${ayahName(p.b)}</span>`,
      cap: `${p.n === 1 ? 'مرة واحدة' : 'في ' + daysWord(p.n)} · الحزب ${THUMUN[p.thA].hizb}${p.thB !== p.thA ? ' والحزب ' + THUMUN[p.thB].hizb : ''}`,
      end: C.btn('راجعهما معاً', 'extraSheet', 'ids:' + [...new Set([p.thA, p.thB])].join('.'), { kind: 'link', size: 'xs' }) })).join('')}</div></div>` : '';
    return `<div class="page" style="gap:16px"><div class="lede">آيات تكرر فيها الخطأ مؤخراً</div>${list}${confSec}</div>`;
  }
};
