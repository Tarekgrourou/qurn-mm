// «عن القرآن»: four groups (الحفظ · المصحف · ورش · الآداب والأحكام), sections inside each, and one
// search over everything. Similar ayat show your own memorization and mistakes next to them.
'use strict';

const KB_GROUPS = [
  ['hifz', 'الحفظ', [['mut', 'المتشابهات'], ['themes', 'مقاصد السور'], ['open', 'الفواتح والخواتيم'], ['stories', 'القصص المتكررة'], ['nuzul', 'أسباب النزول'], ['waqf', 'الوقف والابتداء']]],
  ['mushaf', 'المصحف', [['struct', 'البنية والتحزيب'], ['count', 'عدّ الآي'], ['sajda', 'سجدات التلاوة']]],
  ['warsh', 'ورش', [['riwaya', 'الرواية ورجالها'], ['usul', 'الأصول'], ['between', 'بين السورتين']]],
  ['adab', 'الآداب', [['tilawa', 'آداب التلاوة'], ['hamil', 'حامل القرآن'], ['methods', 'طرق الحفظ'], ['tathbit', 'تثبيت الحفظ'], ['ahkam', 'أحكام'], ['khatm', 'ختم القرآن']]]
];
const KB_SEC_LABEL = Object.fromEntries(KB_GROUPS.flatMap(g => g[2]));
const kbGroupOf = sec => KB_GROUPS.find(g => g[2].some(([k]) => k === sec)) || KB_GROUPS[0];
const kbPlace = r => { const g = kbG(r), T = THUMUN[AYAH_TH[g]]; return { g, T, page: pageOf(g) }; };
// A tappable Warsh reference: «البقرة 135 · ص 23» → its hizb, thumun open.
const kbRefBtn = r => { const p = kbPlace(r); return `<button class="kb-ref" data-a="go" data-v="hizb:${p.T.hizb}:${p.T.k}">${kbRef(r)} · ${pagesText(p.g, p.g)}</button>`; };
const kbSource = keys => `<span class="t-cap kb-src">${icon('book-open', 14)} ${keys.map(k => KB_SOURCES[k]).join(' · ')}</span>`;
const kbSrcLine = text => text ? `<span class="t-cap kb-src">${icon('book-open', 14)} ${text}</span>` : '';
// One entry: title, text, who said it or the evidence, and the source the research cites.
const kbCard = (sec, e, focus, o = {}) => `<div class="card kb-card ${focus === e.id ? 'kb-focus' : ''}" id="kb-${sec}-${e.id}" style="gap:8px">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="t-title-s">${e.title}</span>${o.tag ? `<span class="tag sunken">${o.tag}</span>` : ''}</div>
  ${o.top || ''}<span class="t-body-s" style="color:var(--tx-1)">${e.text}</span>
  ${(e.refs || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${e.refs.map(kbRefBtn).join('')}</div>` : ''}
  ${e.by ? `<span class="t-cap">${o.byLabel || 'الدليل أو القائل'}: ${e.by}</span>` : ''}${kbSrcLine(e.src)}</div>`;

// Search: plain spelling on both sides, every section in one index.
const kbNorm = s => String(s).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
let KB_INDEX = null;
function kbIndex() {
  if (KB_INDEX) return KB_INDEX;
  const out = [], add = (sec, id, title, text) => out.push({ sec, id, title, hay: kbNorm(title + ' ' + text) });
  MUTASHABIHAT.forEach(m => add('mut', m.id, m.title, m.sides.map(x => x.words).join(' ') + ' ' + m.note + ' ' + (m.tawjih || '')));
  Object.entries(SURAH_THEMES).forEach(([s, th]) => add('themes', s, 'مقصد سورة ' + SURAH_NAMES[s - 1], th.theme + ' ' + th.help));
  KB_OPENINGS.forEach(e => add('open', e.id, 'فواتح السور: ' + e.title, e.text + ' ' + e.ex));
  KB_ENDINGS.forEach(e => add('open', e.id, e.title, e.text));
  KB_STORIES.forEach(e => add('stories', e.id, 'قصة ' + e.title, e.text + ' ' + e.where));
  NUZUL.forEach(n => add('nuzul', n.id, 'سبب نزول: ' + kbRef(n.ref), n.words + ' ' + n.q + ' ' + n.a));
  KB_WAQF_KINDS.forEach(e => add('waqf', e.id, e.title, e.text));
  KB_WAQF.forEach(e => add('waqf', e.id, e.title, e.words + ' ' + e.text));
  KB_COUNT.forEach(e => add('count', e.id, e.title, e.text));
  add('struct', KB_TAHZIB.id, KB_TAHZIB.title, KB_TAHZIB.text);
  KB_SAJDAT.forEach(r => add('sajda', r[0], 'سجدة سورة ' + SURAH_NAMES[r[0] - 1], 'سجدات التلاوة'));
  KB_RIWAYA.forEach(e => add('riwaya', e.id, e.title, e.text));
  KB_USUL.forEach(e => add('usul', e.id, e.title, e.text + ' ' + e.ex));
  KB_BETWEEN.forEach(e => add('between', e.id, e.title, e.text));
  Object.entries(KB_ADAB).forEach(([sec, list]) => list.forEach(e => add(sec, e.id, e.title, e.text + ' ' + (e.by || ''))));
  return (KB_INDEX = out);
}

const KnowScreen = {
  title: 'عن القرآن',
  render(X, sec, id) {
    const want = sec || X.ui.kbSec, cur = KB_SEC_LABEL[want] ? want : 'mut', grp = kbGroupOf(cur), q = (X.ui.kbq || '').trim();
    const search = `<div class="search">${icon('magnifying-glass', 22).replace('class="ic"', 'class="ic t-2"')}<input id="kbq" value="${esc(X.ui.kbq || '')}" placeholder="ابحث: كلمة من آية، أو موضوع" enterkeyhint="search" aria-label="ابحث في «عن القرآن»" autocomplete="off">${q ? C.iconBtn('x-circle-fill', 'kbClear', null, 'مسح', { size: 22 }).replace('class="iconbtn', 'style="color:var(--tx-3)" class="iconbtn') : ''}</div>`;
    const notice = `<div class="note subtle row-note" style="font-size:13px">${icon('info', 18)}<span>${KB_NOTICE}</span></div>`;
    if (q.length >= 2) return `<div class="page">${search}${KnowScreen.results(q)}${notice}</div>`;
    const tabs = `${C.seg('kbGroup', KB_GROUPS.map(([k, l]) => [k, l]), grp[0], { h44: true })}
      <div class="hscroll">${grp[2].map(([k, l]) => `<button class="chip-filter ${cur === k ? 'on' : ''}" data-a="kbSec" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
    const fn = KnowScreen[cur] || (KB_ADAB[cur] ? (x, f) => KnowScreen.adab(x, f, cur) : KnowScreen.mut);
    return `<div class="page">${search}${tabs}${fn(X, id)}${notice}</div>`;
  },

  results(q) {
    const words = kbNorm(q).split(/\s+/).filter(Boolean), hits = kbIndex().filter(e => words.every(w => e.hay.includes(w))).slice(0, 40);
    if (!hits.length) return `<div class="t-body-s" style="text-align:center;padding:24px">لا نتائج لـ«${esc(q)}». جرّب كلمة واحدة دون تشكيل.</div>`;
    return `<div class="sec">${C.secH('النتائج', String(hits.length))}<div class="group">${hits.map(e => C.row({ label: e.title, cap: kbGroupOf(e.sec)[1] + ' · ' + KB_SEC_LABEL[e.sec], a: 'kbOpen', v: e.sec + ':' + e.id })).join('')}</div></div>`;
  },

  // ---- الحفظ ----
  mut(X, focus) {
    const { S, t, ui } = X, conf = confusions(S, t), mine = myMutashabihat(S);
    const errAt = new Set(S.errors.map(e => e.g));
    const isMem = m => [...m.sides.map(x => x.ref), ...(m.also || [])].some(r => { const T = kbPlace(r).T; return S.th[T.id] && S.th[T.id].mem; });
    const list = MUTASHABIHAT.filter(m => !ui.kbMine || isMem(m) || m.id === focus);
    const card = m => {
      const refs = [...m.sides.map(x => x.ref), ...(m.also || [])];
      const err = refs.some(r => errAt.has(kbG(r)));
      const rule = m.rule ? MUT_RULES.find(r => r.id === m.rule) : null;
      const long = m.tawjih && m.tawjih.length > 120;
      return `<div class="card kb-card ${focus === m.id ? 'kb-focus' : ''}" id="kb-${m.id}" style="gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="t-title-s">${m.title}</span><span class="rec-sum">${err ? '<span class="tag warn">أخطأت فيه</span>' : ''}${isMem(m) ? '<span class="tag ok">في محفوظك</span>' : ''}</span></div>
        ${m.sides.map(x => `<div class="kb-side"><span class="kb-words">${x.words}</span>${kbRefBtn(x.ref)}</div>`).join('')}
        <span class="t-body-s">${m.note}</span>
        ${(m.also || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span class="t-cap">مواضع أخرى:</span>${m.also.map(kbRefBtn).join('')}</div>` : ''}
        ${m.tawjih ? (long ? `<details class="kb-more" ${focus === m.id ? 'open' : ''}><summary class="t-cap">التوجيه</summary><span class="t-body-s">${m.tawjih}</span></details>` : `<span class="t-cap">${m.tawjih}</span>`) : ''}
        ${rule ? `<span class="t-cap">${icon('lightbulb', 14)} قاعدة: ${rule.title}</span>` : m.qaida ? `<span class="t-cap">${icon('lightbulb', 14)} ${m.qaida}</span>` : ''}
        ${kbSrcLine(m.src)}</div>`;
    };
    const first = m => Math.min(...m.sides.map(x => kbG(x.ref)));
    const groups = [...new Set(list.map(m => m.group))].sort((a, b) => Math.min(...list.filter(m => m.group === a).map(first)) - Math.min(...list.filter(m => m.group === b).map(first)) || (a.startsWith('سورة') ? -1 : 1));
    return `<div class="sec">${C.secH('قواعد تساعد على الضبط')}<div class="group">${MUT_RULES.map(r => C.row({ icon: 'lightbulb', label: r.title, sub: r.body, cap: 'مثال: ' + r.ex })).join('')}</div>
        <span class="t-cap" style="padding:0 6px">قواعد تقريبية تعين على التذكّر، وليست مطّردة في كل موضع.</span></div>
      ${conf.length ? `<button class="card row" style="padding:16px 18px;border-radius:24px" data-a="go" data-v="weak"><span class="icon-box clay">${icon('arrows-left-right', 20)}</span><span class="tx"><span class="l">اشتباهاتك أنت</span><span class="c">${conf.length} ${conf.length === 1 ? 'موضع سجّلته' : 'مواضع سجّلتها'} عند تسجيل الأخطاء</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>` : ''}
      ${mine.length ? `<div class="sec">${C.secH('متشابهاتي', 'من تسميعك المسجّل')}<div class="group">${mine.slice(0, 5).map(p => C.row({ icon: 'arrows-left-right', label: `${ayahName(p.a)} ↔ ${ayahName(p.b)}`, cap: `${p.n} ${p.n === 1 ? 'مرة' : p.n === 2 ? 'مرتان' : 'مرات'}`, a: 'go', v: `hizb:${THUMUN[AYAH_TH[p.a]].hizb}:${THUMUN[AYAH_TH[p.a]].k}` })).join('')}</div></div>` : ''}
      <div class="hscroll"><button class="chip-filter ${ui.kbMine ? '' : 'on'}" data-a="kbMine" data-v="0" aria-pressed="${!ui.kbMine}">الكل<span class="n num">${MUTASHABIHAT.length}</span></button><button class="chip-filter ${ui.kbMine ? 'on' : ''}" data-a="kbMine" data-v="1" aria-pressed="${!!ui.kbMine}">في محفوظي<span class="n num">${MUTASHABIHAT.filter(isMem).length}</span></button></div>
      ${groups.length ? groups.map(gname => `<div class="sec">${C.secH(gname, String(list.filter(m => m.group === gname).length))}${list.filter(m => m.group === gname).sort((a, b) => first(a) - first(b)).map(card).join('')}</div>`).join('') : '<div class="t-body-s" style="text-align:center;padding:20px">لا متشابهات في محفوظك بعد.</div>'}
      ${kbSource(['dabt', 'text'])}`;
  },

  themes(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">لكل سورة مقصد تدور حوله آياتها. معرفته قبل الحفظ تعين على ربط المقاطع وفهم سبب ورود القصص والألفاظ.</span>
      ${Object.entries(SURAH_THEMES).map(([s, th]) => `<div class="card kb-card ${+focus === +s ? 'kb-focus' : ''}" id="kb-theme-${s}" style="gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="t-title-m">سورة ${SURAH_NAMES[s - 1]}</span><span class="tag sunken">${isMakki(+s) ? 'مكية' : 'مدنية'}</span></div>
        <span class="t-body-s" style="color:var(--tx-1)">${th.theme}</span>
        <span class="t-cap">${icon('lightbulb', 14)} للحفظ: ${th.help}</span>
        ${C.btn('افتح السورة', 'go', 'surah:' + s, { kind: 'link', size: 'xs' }).replace('class="btn', 'style="align-self:flex-start" class="btn')}</div>`).join('')}
      ${kbSource(['mukhtasar'])}`;
  },

  open(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">افتُتحت سور القرآن بأنواع معدودة من الكلام. معرفة نوع فاتحة السورة وما تُختم به تعين على ألا تختلط عليك بدايات السور المتقاربة وخواتيمها.</span>
      <div class="sec">${C.secH('أنواع الفواتح')}${KB_OPENINGS.map(e => kbCard('open', e, focus, { top: `<span class="t-cap">مثل: ${e.ex}</span>` })).join('')}</div>
      <div class="sec">${C.secH('الخواتيم')}${KB_ENDINGS.map(e => kbCard('open', e, focus)).join('')}</div>
      ${kbSrcLine(KB_OPEN_SRC)}`;
  },

  stories(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">${KB_STORIES_NOTE}</span>
      ${KB_STORIES.map(e => kbCard('stories', e, focus, { top: `<span class="t-cap">في: ${e.where}</span>` })).join('')}`;
  },

  nuzul(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">معرفة سبب النزول تربط الآية بحدث يسهل تذكّره، وتزيل ما قد يُشكل في فهمها.</span>
      ${NUZUL.map(n => `<div class="card kb-card ${focus === n.id ? 'kb-focus' : ''}" id="kb-${n.id}" style="gap:10px">
        <div class="kb-side"><span class="kb-words">${n.words}</span>${kbRefBtn(n.ref)}</div>
        <span class="t-title-s" style="font-size:15px">${n.q}</span><span class="t-body-s">${n.a}</span>
        ${n.grade ? `<span class="t-cap">درجة الرواية: ${n.grade}</span>` : ''}
        ${n.warsh ? `<span class="t-cap">${icon('info', 14)} ${n.warsh}</span>` : ''}${kbSrcLine(n.src)}</div>`).join('')}`;
  },

  waqf(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">الوقف في غير موضعه قد يغيّر المعنى. هذه أقسام الوقف، ومواضع نبّه عليها العلماء.</span>
      <div class="sec">${C.secH('أقسام الوقف الاختياري')}<div class="group">${KB_WAQF_KINDS.map(e => C.row({ label: e.title, sub: e.text })).join('')}</div></div>
      <div class="sec">${C.secH('مواضع يُنبَّه عليها')}${KB_WAQF.map(e => kbCard('waqf', e, focus, { top: `<div class="kb-side"><span class="kb-words">${e.words}</span>${kbRefBtn(e.ref)}</div>` })).join('')}</div>
      ${kbSource(['waqf'])}`;
  },

  // ---- المصحف ----
  struct(X, focus) {
    const mk = [...SURAH_TYPE].filter(c => c === 'k').length;
    const tiles = [[114, 'سورة', `${mk} مكية · ${114 - mk} مدنية`], [TOTAL_AYAT, 'آية', 'العدّ المدني لورش'], [30, 'جزءاً', 'لكل جزء حزبان'],
      [60, 'حزباً', 'لكل حزب ثمانية أثمان'], [THUMUN.length, 'ثُمناً', 'وحدة المراجعة في التطبيق'], [iso(pageOf(0) + '–' + pageOf(TOTAL_AYAT - 1)), 'الصفحات', 'المصحف المحمدي']];
    const hizb = (n, on) => `<span class="kb-hizb"><span class="t-cap">الحزب ${n}</span><span class="kb-cells">${Array.from({ length: 8 }, (_, i) => `<i class="${on && i < 3 ? 'on' : ''}"></i>`).join('')}</span></span>`;
    const c = X.snap.counts;
    return `<div class="grid3">${tiles.map(([n, u, s]) => `<div class="tile" style="gap:0"><span class="num" style="font-size:22px;font-weight:500">${n}</span><span style="color:var(--tx-1);font-weight:500">${u}</span><span class="t-cap">${s}</span></div>`).join('')}</div>
      <div class="sec">${C.secH('كيف يُقسَّم المصحف')}<div class="card" style="gap:12px">
        <div class="kb-juz"><span class="t-meta">الجزء الأول</span><div style="display:flex;gap:8px">${hizb(1, true)}${hizb(2)}</div></div>
        <span class="t-body-s">ثلاثون جزءاً، في كل جزء حزبان (60 حزباً). وفي مصاحف ورش وقالون المنتشرة في المغرب وغرب أفريقيا يُقسَّم كل حزب إلى ثمانية أثمان، فيكون في القرآن 480 ثُمناً. أما مصاحف حفص في المشرق فتقف عند الربع (240 ربعاً).</span>
        <span class="t-body-s">يتابع التطبيق محفوظك بالثُّمن، ويعرض المواضع بالسورة والآية والصفحة كما في مصحفك.</span>
        ${c.mem ? `<span class="t-meta t-2">محفوظك الآن: ${thumunWord(c.mem)} من 480 · ${hizbFullWord(X.snap.fullHizb)}</span>` : ''}</div></div>
      ${kbCard('struct', KB_TAHZIB, focus)}
      <div class="sec">${C.secH('التحزيب بالسور «فمي بشوق»')}<div class="card" style="gap:6px;padding-bottom:10px">
        <span class="t-body-s">كان الصحابة يقسّمون القرآن لختمه في أسبوع إلى سبعة أحزاب بالسور كاملة، فلا تنقطع قصة ولا موضوع. تجمعها كلمة «فمي بشوق»: كل حرف أول سورة في حزبه، بعد الفاتحة.</span></div>
        <div class="group">${AHZAB7.map((h, i) => C.row({ lead: `<span class="icon-box">${h.key}</span>`, label: `${SURAH_NAMES[h.from - 1]} – ${SURAH_NAMES[h.to - 1]}`,
          cap: `اليوم ${i + 1} · ${h.to - h.from + 1} سورة · ${pagesText(toG(h.from, 1), toG(h.to, AYAH_COUNTS[h.to - 1]))}`, a: 'go', v: 'surah:' + h.from })).join('')}</div>
        ${kbSource(['text'])}</div>`;
  },

  count(X, focus) {
    const diff = AYAH_COUNTS.map((n, i) => ({ s: i + 1, m: n, k: KUFAN_COUNTS[i] })).filter(x => x.m !== x.k);
    const kufi = KUFAN_COUNTS.reduce((a, b) => a + b, 0);
    return `<div class="grid2"><div class="tile"><b class="num">${TOTAL_AYAT}</b><span>العدّ المدني الأخير</span></div><div class="tile"><b class="num">${kufi}</b><span>العدّ الكوفي</span></div></div>
      ${KB_COUNT.map(e => kbCard('count', e, focus)).join('')}
      <div class="sec">${C.secH('السور التي يختلف عددها', String(diff.length))}<div class="card" style="gap:8px"><span class="t-cap">مدني · كوفي. بقية السور (${114 - diff.length}) عددها واحد في العدّين.</span>
        <div class="kb-diff">${diff.map(x => `<span><b>${SURAH_NAMES[x.s - 1]}</b><i class="num">${iso(x.m + ' · ' + x.k)}</i></span>`).join('')}</div></div>
        <span class="t-cap" style="padding:0 6px">يعرض التطبيق أرقام الآيات بالعدّ المدني كما في مصحفك؛ فرقم الآية قد يختلف عنه في مصحف حفص.</span>${kbSource(['text'])}</div>`;
  },

  sajda(X, focus) {
    const { S } = X, rule = KB_ADAB.ahkam.find(e => e.id === 'sajdat');
    return `${kbCard('sajda', rule, null, { tag: 'المذهب المالكي' })}
      <div class="sec">${C.secH('مواضعها في المصحف المحمدي', '11')}<div class="group">${KB_SAJDAT.map((r, i) => { const p = kbPlace(r), mem = S.th[p.T.id] && S.th[p.T.id].mem;
        return C.row({ lead: `<span class="icon-box num">${i + 1}</span>`, label: kbRef(r), cap: `${pagesText(p.g, p.g)} · الحزب ${p.T.hizb}${mem ? ' · في محفوظك' : ''}`, a: 'go', v: `hizb:${p.T.hizb}:${p.T.k}`, cls: +focus === r[0] ? 'kb-focus' : '' }); }).join('')}</div>
        <span class="t-cap" style="padding:0 6px">المواضع من علامة السجدة ۩ في المصحف المحمدي. لأحكام السجود انظر «الآداب» ← «أحكام».</span>${kbSource(['text'])}</div>`;
  },

  // ---- ورش ----
  riwaya(X, focus) { return KB_RIWAYA.map(e => kbCard('riwaya', e, focus)).join(''); },
  usul(X, focus) {
    return `<span class="t-body-s" style="padding:0 6px">الأصول قواعد مطّردة تتميز بها رواية ورش من طريق الأزرق. هذه خلاصتها بلغة سهلة، ولكل أصل شروط وتفصيل يُؤخذ عن الشيخ.</span>
      ${KB_USUL.map(e => kbCard('usul', e, focus, { top: `<div class="kb-side"><span class="kb-words">${e.ex}</span>${e.how ? `<span class="t-cap">${e.how}</span>` : ''}<span style="display:flex;flex-wrap:wrap;gap:4px">${kbRefBtn(e.ref)}${e.ref2 ? kbRefBtn(e.ref2) : ''}</span></div>` })).join('')}
      ${kbSrcLine(KB_USUL_SRC)}`;
  },
  between(X, focus) { return KB_BETWEEN.map(e => kbCard('between', e, focus)).join(''); },

  // ---- الآداب والأحكام ----
  adab(X, focus, sec) {
    const lede = { tilawa: 'آداب يتهيأ بها القارئ للتلاوة، بقلبه وبدنه.', hamil: 'ما يُنتظر ممن حمل القرآن في صدره.', methods: 'وصف لطرق الكتاتيب والمحاضر في المغرب وغرب إفريقيا، لا إلزام بها.',
      tathbit: 'ما أوصى به العلماء لبقاء المحفوظ.', ahkam: 'أحكام على المذهب المالكي. ارجع فيما يعرض لك إلى شيخك.', khatm: 'ما ورد في ختم القرآن، مع بيان ما ثبت وما لم يثبت.' }[sec];
    return `<span class="t-body-s" style="padding:0 6px">${lede}</span>${KB_ADAB[sec].map(e => kbCard(sec, e, focus, sec === 'ahkam' ? { tag: 'المذهب المالكي' } : {})).join('')}`;
  }
};
