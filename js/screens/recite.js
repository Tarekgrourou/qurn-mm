// «التلاوة»: recite from memory into the phone, then check yourself ayah by ayah with the muṣḥaf
// open — for those who have no one to listen to them. Also: listening tools (waveform, A–B loop,
// bookmarks), an approximate pace/pause analysis, tajwid self-checks and recitation plans.
// The log and self-checks live in state (S.recs, S.recPlans); the audio stays on the device.
'use strict';

const PURPOSE = [['hifz', 'حفظ'], ['both', 'حفظ وتجويد'], ['tajwid', 'تجويد']];
const PURPOSE_AR = { both: 'حفظ وتجويد', hifz: 'حفظ', tajwid: 'تجويد' };
const RATING_AR = ['متقن', 'متوسط', 'ضعيف'];
// Mistake categories in the order shown in the ✗ sheet.
const CATS = ['forget', 'subst', 'omit', 'add', 'jump', 'hesitate', 'tajwid'];
const isFix = r => !!r.fixOf;
const mistakeLine = m => MISTAKE_AR[m.res] + (m.res === 'jump' && m.confused != null ? ' · اشتبه بـ' + ayahName(m.confused) : '') + (m.note ? ' · ' + esc(m.note) : '');
const REC_FILTERS = [['all', 'الكل'], ['todo', 'لم تُراجَع'], ['hifz', 'حفظ'], ['tajwid', 'تجويد'], ['work', 'فيها أخطاء']];
const recList = S => Object.entries(S.recs).filter(([, r]) => !r.fixOf).map(([id, r]) => ({ id: +id, ...r })).sort((a, b) => b.id - a.id);
const awaiting = S => recList(S).filter(r => r.checked == null && r.purpose !== 'tajwid');
const recWork = r => Object.values(r.aspects || {}).filter(v => v === 1).length;
const recMatch = (r, f) => f === 'all' || (f === 'todo' && r.checked == null && !recAssessed(r)) || (f === 'hifz' && r.purpose !== 'tajwid') ||
  (f === 'tajwid' && r.purpose !== 'hifz') || (f === 'work' && (recWork(r) > 0 || r.rating === 2 || recMistakes(r).length > 0));
const recAyat = r => { const a = []; for (let g = r.from; g <= r.to; g++) a.push(g); return a; };

// Ayah segments of a take: one per ayah from the marks (tapped or suggested); if there are fewer
// segments than ayat the last one holds the rest, if more the extra ones join the last ayah.
function recSegments(r, durMs) {
  const ayat = recAyat(r), segs = segmentsOf(r.marks, durMs || r.ms, r.trim);
  while (segs.length > ayat.length) { const x = segs.pop(); segs[segs.length - 1].to = x.to; }
  return segs.map((s, i) => ({ ...s, g1: ayat[i], g2: i === segs.length - 1 ? ayat[ayat.length - 1] : ayat[i] }));
}

// One-line result of a take, shared by the list, the comparison and Progress.
function recSummary(r) {
  const bits = [], mis = recMistakes(r);
  if (r.checked != null) bits.push(`<span class="tag ${mis.length ? 'warn' : 'ok'}">${mis.length ? errWord(mis.length) : 'دون أخطاء'}</span>`);
  if (r.rating >= 0) bits.push(`<span class="t-cap">${RATING_AR[r.rating]}</span>`);
  const marked = Object.keys(r.aspects || {}).length, work = recWork(r);
  if (marked) bits.push(`<span class="t-cap">${work ? `تجويد: ${work} ${work === 1 ? 'جانب يحتاج' : work === 2 ? 'جانبان يحتاجان' : 'جوانب تحتاج'} عملاً` : 'تجويد: جيد'}</span>`);
  if (r.an && r.an.wpm) bits.push(`<span class="t-cap num">${r.an.wpm} كلمة/د</span>`);
  if (r.counted != null) bits.push(`<span class="t-cap">${icon('check', 14)} احتُسبت مراجعة</span>`);
  if (!bits.length) bits.push('<span class="t-cap">لم تُراجَع بعد</span>');
  return `<span class="rec-sum">${bits.join('')}</span>`;
}

// Play button for a spoken note on a mistake, when its audio is on this device.
const vnBtn = (id, m) => { const key = id + ':' + m.g; return m.vn && Clips.vnHas(key) ? C.iconBtn(Player.playing('vn:' + key) ? 'pause-circle' : 'waveform', 'vnPlay', key, 'ملاحظتي الصوتية', { size: 22 }) : ''; };

const REC_STRENGTH_AR = { strong: 'قوي', medium: 'متوسط', weak: 'ضعيف' };
// «من تسميعك»: strength of one thumun from your self-checks, with one cell per ayah. Shown beside
// the review-based strength, never instead of it.
function recStrengthLine(S, t, T) {
  const a = recAyahStats(S, t), th = recThumunStats(S, t, a)[T.id];
  if (!th) return '';
  const cells = []; for (let g = T.start; g <= T.end; g++) cells.push(`<i class="${a[g] ? 'k-' + recStrengthKey(a[g].strength) : ''}" title="${ayahName(g)}"></i>`);
  return `<div class="rs"><span class="t-meta">من تسميعك: <b>${REC_STRENGTH_AR[recStrengthKey(th.strength)]}</b> · راجعت ${iso(th.checked + ' / ' + th.total)} آية${th.open ? ' · ' + errWord(th.open) + ' لم تُصحَّح' : ''}</span><span class="rs-cells" role="img" aria-label="قوة كل آية من تسميعك">${cells.join('')}</span></div>`;
}
// Why a thumun is suggested for recitation, in words.
const recWhy = (x, t) => x.why === 'open' ? errWord(x.open) + ' لم تُصحَّح' : x.why === 'weak' ? 'كثرت أخطاؤه في تسميعك' : (x.checked ? 'آخر مراجعة لتسميعه ' : 'سجّلته ولم تراجعه · ') + agoText(t - x.last);
// «اقترح للتسميع» and «تمرين الأخطاء», for Today.
function recSuggestions(X) {
  if (!Clips.supported) return '';
  const { S, t } = X, list = recPriority(S, t, 3), drill = drillQueue(S).length;
  if (!list.length && !drill) return '';
  const rows = list.map(x => C.row({ icon: 'microphone', label: shortRange(THUMUN[x.id].start, THUMUN[x.id].end), cap: thumunMetaDual([x.id]) + ' · ' + recWhy(x, t), a: 'recSuggest', v: x.id }));
  if (drill) rows.push(C.row({ icon: 'repeat', iconBox: 'clay', label: 'تمرين الأخطاء', cap: `${ayatWord(drill)} فيها خطأ مفتوح · تعيد تلاوتها واحدة واحدة`, a: 'drillStart' }));
  return `<div class="sec">${C.secH('اقترح للتسميع', 'من تسميعك وأخطائك')}<div class="group">${rows.join('')}</div><span class="t-cap" style="padding:0 6px">اقتراح فقط، ولا يغيّر وردك اليومي.</span></div>`;
}

// Compact play button for lists and comparisons.
const playBtn = (id, ms) => Clips.has(id)
  ? `<span class="rec-play" data-player="${id}">${C.iconBtn(Player.playing(id) ? 'pause-circle' : 'play-circle', 'recPlay', id, Player.playing(id) ? 'إيقاف' : 'استمع', { size: 30 })}<span class="pos num t-cap">${clipTime(ms)}</span></span>`
  : `<span class="rec-play" title="الصوت غير موجود على هذا الجهاز">${icon('cloud-slash', 22).replace('class="ic"', 'class="ic t-3"')}</span>`;

// Waveform with ayah boundaries, long pauses, mistakes, bookmarks, the A–B loop and a playhead.
// Time runs right to left (RTL), like the rest of the app. Tapping it seeks.
function waveView(r, c, segs, hes) {
  const dur = c.durMs || r.ms, at = ms => (Math.max(0, Math.min(1, ms / dur)) * 100).toFixed(2) + '%';
  const mis = new Map(recMistakes(r).map(m => [m.g, m.res]));
  // Bars as one scalable SVG (fits any width); x mirrored so time runs right to left.
  const nb = c.peaks.length, bars = `<svg viewBox="0 0 ${nb} 100" preserveAspectRatio="none" aria-hidden="true">${c.peaks.map((p, i) => { const h = Math.max(4, Math.round(p * 100)); return `<rect x="${nb - 1 - i + 0.15}" y="${(100 - h) / 2}" width="0.7" height="${h}" rx="0.3"/>`; }).join('')}</svg>`;
  const segBg = segs.map(s => mis.has(s.g1) ? `<span class="seg-bad ${mis.get(s.g1) === 'hesitate' ? 'hes' : ''}" style="inset-inline-start:${at(s.from)};width:${((s.to - s.from) / dur * 100).toFixed(2)}%"></span>` : '').join('');
  const marks = segs.slice(1).map(s => `<span class="mk" style="inset-inline-start:${at(s.from)}"></span>`).join('');
  const pauses = hes.flat().map(p => `<span class="ps" style="inset-inline-start:${at(p.at)}" title="${secText(p.len)}"></span>`).join('');
  const bms = (r.bookmarks || []).map(b => `<span class="bm" style="inset-inline-start:${at(b.ms)}"></span>`).join('') + (r.hes || []).map(h => `<span class="hs" style="inset-inline-start:${at(h)}" title="تردّد"></span>`).join('');
  const loop = Player.id === +r._id && Player.loop ? `<span class="loop" style="inset-inline-start:${at(Player.loop[0])};width:${((Player.loop[1] - Player.loop[0]) / dur * 100).toFixed(2)}%"></span>` : '';
  const trim = r.trim ? `<span class="cut" style="inset-inline-start:0;width:${at(r.trim[0])}"></span><span class="cut" style="inset-inline-start:${at(r.trim[1])};inset-inline-end:0"></span>` : '';
  return `<div class="wave" data-wave="${r._id}" role="slider" aria-label="موضع التشغيل" aria-valuemin="0" aria-valuemax="${Math.round(dur / 1000)}">${segBg}${trim}${loop}<div class="bars">${bars}</div>${marks}${pauses}${bms}<span class="head" style="inset-inline-start:${Player.id === +r._id ? at(Player.posMs()) : '0%'}"></span></div>`;
}

// Approximate analysis of a take: speaking time, pace, pauses inside ayat.
function recAnalysis(r, c, segs) {
  if (!c || !c.det) return null;
  const hes = hesitations(c.det.pauses, segs);
  return { speechMs: c.det.speechMs, wpm: paceWpm(wordsIn(r.from, r.to), c.det.speechMs), pauses: c.det.pauses.length, hes: hes.reduce((n, h) => n + h.length, 0), hesBySeg: hes };
}

const ReciteScreen = {
  render(X) {
    const { S, t, ui } = X, st = recStats(S, t), all = recList(S);
    const f = ui.recFilter || 'all', th = ui.recTh;
    const list = all.filter(r => recMatch(r, f) && (th == null || r.ids.includes(th)));
    const hero = `<div class="hero mint" style="border-radius:28px;padding:22px;gap:14px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap"><div style="display:flex;flex-direction:column"><span class="t-meta t-2">تسجيلاتك هذا الشهر</span><span class="metric"><span class="n" style="font-size:48px">${st.count}</span></span></div>
        ${st.self.cur.n ? `<span class="t-meta t-2">راجعت ${st.self.cur.n} · ${st.self.cur.per100 != null ? st.self.cur.per100 + ' خطأ لكل 100 آية' : ''}</span>` : st.count ? `<span class="t-meta t-2">نحو ${durationText(Math.max(1, st.minutes))} من التلاوة</span>` : ''}</div>
      <span class="t-body-s">${all.length ? (st.worst ? `أكثر ما يحتاج عملاً في التجويد: <b>${st.worst.label}</b>` : 'سمّع من حفظك ثم راجع تسجيلك آية بآية مع مصحفك.') : 'لا تجد من يسمّع لك؟ سمّع من حفظك والمصحف مغلق، ثم استمع لتسجيلك آية بآية والمصحف مفتوح، وسجّل أخطاءك بنفسك.'}</span>
      ${C.btn('سمّع الآن', 'recPick', null, { size: 'l', icon: 'microphone', iconSize: 22, full: true })}</div>`;
    const plans = ReciteScreen.waiting(X) + ReciteScreen.plans(X);
    if (!all.length) {
      return `<div class="page"><h1 class="h1">التلاوة</h1>${hero}${plans}
        <div class="sec">${C.secH('كيف تسمّع لنفسك؟')}<div class="group">${[['microphone', 'سمّع من حفظك', 'المصحف مغلق. اضغط «الآية التالية» عند نهاية كل آية إن شئت.'], ['book-open', 'راجع مع مصحفك', 'يشغّل التطبيق آية واحدة ثم يتوقف، فتقارن وتحكم: صحيحة أم فيها خطأ.'], ['chart-bar', 'تابع تقدّمك', 'الأخطاء لكل 100 آية، وسرعة القراءة والوقفات، وأكثر الآيات خطأً.']].map(([ic, l, s]) => C.row({ icon: ic, label: l, sub: s })).join('')}</div></div>
        <span class="t-cap" style="text-align:center">التسجيلات على هذا الجهاز فقط. نتائج مراجعتك وملاحظاتك تدخل في النسخ الاحتياطية.</span></div>`;
    }
    const chips = `<div class="hscroll">${REC_FILTERS.map(([k, l]) => `<button class="chip-filter ${f === k ? 'on' : ''}" data-a="recFilter" data-v="${k}" aria-pressed="${f === k}">${l}<span class="n num">${k === 'all' ? '' : all.filter(r => recMatch(r, k)).length}</span></button>`).join('')}</div>`;
    const thNote = th != null ? `<div class="note subtle row-note" style="padding:10px 10px 10px 16px;border-radius:18px">${icon('funnel-simple', 18)}<span style="flex:1;font-size:14px;color:var(--tx-1)">${shortRange(THUMUN[th].start, THUMUN[th].end)}</span>${C.btn('الكل', 'recTh', null, { kind: 'link', size: 'xs' })}</div>` : '';
    const days = [...new Set(list.map(r => r.day))];
    const groups = days.map(d => `<div class="sec" style="gap:8px"><div class="t-meta" style="padding:0 6px">${d === t ? 'اليوم' : d === t - 1 ? 'أمس' : dateText(d)}</div>
      ${list.filter(r => r.day === d).map(r => ReciteScreen.card(r)).join('')}</div>`).join('');
    return `<div class="page"><h1 class="h1">التلاوة</h1>${hero}${plans}${chips}${thNote}
      ${groups || `<div class="t-body-s" style="text-align:center;padding:20px">لا تسجيلات بهذا التصنيف.</div>`}
      ${st.total ? C.btn('تابع تحسّنك في التقدّم', 'go', 'progRec', { kind: 'link', size: 's', icon: 'chart-bar', iconSize: 18 }).replace('class="btn', 'style="align-self:center" class="btn') : ''}</div>`;
  },
  card(r) {
    return `<div class="card rec-card">${playBtn(r.id, r.ms)}
      <button class="tx" data-a="go" data-v="recd:${r.id}"><span class="t-title-s">${shortRange(r.from, r.to)}</span>
        <span class="t-cap">${pagesText(r.from, r.to)} · ${PURPOSE_AR[r.purpose]}</span>${recSummary(r)}
        ${r.note ? `<span class="t-cap t-2 clamp1">${esc(r.note)}</span>` : ''}</button>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</div>`;
  },

  // Takes not yet reviewed (review later is recommended), and the open mistakes.
  waiting(X) {
    const { S, t } = X, wait = awaiting(S), open = allMistakes(S).filter(m => m.status !== 'resolved');
    const when = r => r.reviewAt ? (r.reviewAt > Date.now() ? 'موعدها ' + new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(r.reviewAt)) : 'حان موعدها') : 'سُجّلت ' + agoText(t - r.day);
    const w = wait.length ? `<div class="sec">${C.secH('بانتظار المراجعة', String(wait.length))}${wait.slice(0, 4).map(r => `<button class="card row" style="padding:14px 16px;border-radius:22px" data-a="recReview" data-v="${r.id}"><span class="icon-box">${icon('book-open', 20)}</span><span class="tx"><span class="l">${shortRange(r.from, r.to)}</span><span class="c">${when(r)} · ${pagesText(r.from, r.to)}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>`).join('')}</div>` : '';
    const m = open.length ? `<button class="card row" style="padding:14px 16px;border-radius:22px" data-a="go" data-v="recMistakes"><span class="icon-box clay">${icon('warning-diamond', 20)}</span><span class="tx"><span class="l">أخطاء لم تُصحَّح بعد</span><span class="c">${open.length} · أعد تلاوة الآية حتى تسلم</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>` : '';
    return w + m;
  },

  // Recitation plans: active ones as cards with a coverage bar and «التالي», finished ones folded.
  plans(X) {
    const { S, ui } = X, active = S.recPlans.filter(p => !p.done), done = S.recPlans.filter(p => p.done);
    const card = p => {
      const st = planStatus(p, S.recs), n = st.pieces.length, open = ui.planOpen === p.id;
      const bar = ['clean', 'mistakes', 'recorded'].map(k => st[k] ? `<span class="pl-${k}" style="flex:${st[k]}"></span>` : '').join('') + (st.none ? `<span style="flex:${st.none}"></span>` : '');
      const nx = st.next;
      const grid = open ? `<div class="pl-grid">${st.pieces.map((pc, i) => `<button class="pl-cell pl-${pc.state}" data-a="planPieceGo" data-v="${p.id}:${i}" aria-label="${shortRange(pc.from, pc.to)} · ${{ none: 'لم يُسجَّل', recorded: 'لم يُراجَع', mistakes: 'فيه أخطاء', clean: 'دون أخطاء' }[pc.state]}">${i + 1}</button>`).join('')}</div>
        <div class="legend-dots t-cap"><span><i class="pl-clean"></i>دون أخطاء</span><span><i class="pl-mistakes"></i>فيه أخطاء</span><span><i class="pl-recorded"></i>لم يُراجَع</span><span><i></i>لم يُسجَّل</span></div>
        <div class="btn-row wrap">${C.btn('أرشف الخطة', 'planArchive', p.id, { kind: 'ghost', size: 's' })}${C.btn('حذف', 'planDelete', p.id, { kind: 'ghost', size: 's' })}</div>` : '';
      return `<div class="card" style="gap:10px"><button class="row" style="padding:0;min-height:0;background:none" data-a="planOpen" data-v="${p.id}" aria-expanded="${open}"><span class="tx"><span class="l">${p.name}</span><span class="c">${st.clean} من ${n} دون أخطاء${st.mistakes ? ` · ${st.mistakes} فيها أخطاء` : ''}${st.recorded ? ` · ${st.recorded} تنتظر المراجعة` : ''}</span></span>${icon('caret-down', 18).replace('class="ic"', `class="ic chev" style="${open ? 'transform:rotate(180deg)' : ''}"`)}</button>
        <span class="pl-bar">${bar}</span>
        ${st.done ? '<span class="t-cap">أتممت الخطة: كل الأجزاء دون أخطاء.</span>' : nx ? C.btn(`${nx.state === 'recorded' ? 'راجع' : 'سمّع'} التالي: ${shortRange(nx.from, nx.to)}`, 'planNext', p.id, { kind: 'tonal', size: 's', icon: nx.state === 'recorded' ? 'book-open' : 'microphone', iconSize: 18, full: true }) : ''}
        ${grid}</div>`;
    };
    return `<div class="sec">${C.secH('خطط التسميع', '', C.btn('خطة جديدة', 'planNew', null, { kind: 'link', size: 'xs', icon: 'plus', iconSize: 16 }))}
      ${active.length ? active.map(card).join('') : '<span class="t-cap" style="padding:0 6px">خطة تسميع تقسّم حزباً أو جزءاً أو سورة إلى أجزاء صغيرة، وتقترح عليك التالي حتى تسمّعها كلها دون أخطاء.</span>'}
      ${done.length ? `<span class="t-cap" style="padding:0 6px">خطط مكتملة: ${done.map(p => p.name).join('، ')}</span>` : ''}</div>`;
  }
};

const RecDetailScreen = {
  title: 'التسجيل',
  render(X, idS) {
    const { S, t, ui } = X, id = +idS, r0 = S.recs[id];
    if (!r0) return `<div class="page">${C.empty(C.emptyArt(4, 18, 4), 'حُذف هذا التسجيل', '', C.btn('التلاوة', 'go', 'tab:rec', { kind: 'tonal' }))}</div>`;
    const r = { ...r0, _id: id }, c = Clips.get(id), has = !!c;
    const segs = recSegments(r, c && c.durMs);
    const an = recAnalysis(r, c, segs);
    // The first listen without the muṣḥaf is offered until the take has a verdict or the listen is done.
    const blindOpen = has && r.purpose !== 'tajwid' && r.checked == null && !Object.keys(r.ayahs || {}).length && !(r.blind && r.blind.day != null);
    const view = ui.recView === 'blind' && !has ? 'check' : ui.recView || (r.purpose === 'tajwid' ? 'listen' : r.checked == null ? (blindOpen && S.settings.recBlind ? 'blind' : 'check') : 'result');
    r._blindOpen = blindOpen;
    const head = `<div class="card" style="gap:4px"><span class="t-meta">${thumunMetaDual(r.ids)} · ${pagesText(r.from, r.to)}</span><span class="t-title-l">${C.range(r.from, r.to)}</span><span class="t-cap">${dateText(r.day)} · ${clipTime(r.ms)} · ${PURPOSE_AR[r.purpose]}</span>${C.noteLine(S, r.ids)}${C.kbLine(S, r.from, r.to)}</div>`;
    const tabs = C.seg('recView', [['check', 'راجع آية بآية'], ['result', 'النتيجة'], ['listen', 'استماع حر']], view, { h44: true });
    const body = { listen: RecDetailScreen.listen, check: RecDetailScreen.check, result: RecDetailScreen.result, blind: RecDetailScreen.blind }[view](X, r, c, segs, an);
    return `<div class="page">${head}${tabs}${has ? '' : `<div class="note subtle row-note">${icon('cloud-slash', 20)}<span>الصوت غير موجود على هذا الجهاز. بقيت نتائج مراجعتك وملاحظاتك.</span></div>`}${body}</div>`;
  },

  player(r, c, an) {
    const id = r._id, playing = Player.playing(id);
    const wave = c && c.peaks ? waveView(r, c, recSegments(r, c.durMs), an ? an.hesBySeg : []) : `<div class="wave loading"><span class="t-cap">${c && c.failed ? 'تعذّر تحليل الصوت؛ يبقى التشغيل متاحاً.' : 'جارٍ تحليل الصوت…'}</span></div>`;
    const loop = Player.id === id && Player.loop;
    return `<div class="card player" data-player="${id}">${wave}
      <span style="display:flex;justify-content:space-between" class="t-cap num"><span class="pos">${clipTime(Player.id === id ? Player.posMs() : 0)}</span><span>${clipTime((c && c.durMs) || r.ms)}</span></span>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">${C.iconBtn('arrow-clockwise', 'recSkip', 5, 'تقدّم 5 ثوانٍ', { size: 24 })}${C.iconBtn(playing ? 'pause-circle' : 'play-circle', 'recPlay', id, playing ? 'إيقاف' : 'استمع', { size: 52 })}${C.iconBtn('arrow-counter-clockwise', 'recSkip', -5, 'رجوع 5 ثوانٍ', { size: 24 })}</div>
      ${C.seg('recRate', [['0.75', '0.75×'], ['1', '1×'], ['1.25', '1.25×']], String(Player.rate))}
      <div class="btn-row wrap">${C.btn(loop ? 'A: ' + clipTime(loop[0]) : 'بداية A', 'loopA', id, { kind: 'outline', size: 's' })}${C.btn(loop ? 'B: ' + clipTime(loop[1]) : 'نهاية B', 'loopB', id, { kind: 'outline', size: 's' })}${loop ? C.btn('ألغِ التكرار', 'loopClear', null, { kind: 'ghost', size: 's' }) : ''}${C.btn('علامة', 'bmAdd', id, { kind: 'tonal', size: 's', icon: 'flag', iconSize: 16 })}</div>
      ${loop ? `<span class="t-cap">يتكرر المقطع بين A وB حتى تلغيه.</span>` : ''}</div>`;
  },

  // First listen, muṣḥaf closed: the whole take, one button for «I think I slipped here».
  blind(X, r, c) {
    const id = r._id, n = ((r.blind && r.blind.marks) || []).length, playing = Player.playing(id);
    return `<div class="note subtle row-note">${icon('eye-slash', 20)}<span>أغلق مصحفك. استمع للتسجيل كاملاً، واضغط الزر كلما ظننت أنك أخطأت. بعدها تراجع بالمصحف، فتعرف كم خطأً التقطته بسمعك.</span></div>
      <div class="card chk-card" data-player="${id}">
        <div style="display:flex;align-items:center;justify-content:center;gap:16px">${C.iconBtn('arrow-clockwise', 'recSkip', 5, 'تقدّم 5 ثوانٍ', { size: 24 })}${C.iconBtn(playing ? 'pause-circle' : 'play-circle', 'recPlay', id, playing ? 'إيقاف' : 'استمع', { size: 60 })}${C.iconBtn('arrow-counter-clockwise', 'recSkip', -5, 'رجوع 5 ثوانٍ', { size: 24 })}</div>
        <span class="t-cap num" style="text-align:center"><span class="pos">${clipTime(Player.id === id ? Player.posMs() : 0)}</span> / ${clipTime((c && c.durMs) || r.ms)}</span>
        <button class="go-blind" data-a="blindMark" data-v="${id}">${icon('flag', 22)}<span>أظن أني أخطأت هنا</span>${n ? `<b class="num">${n}</b>` : ''}</button>
        ${n ? C.btn('تراجع عن آخر علامة', 'blindUndo', id, { kind: 'ghost', size: 's' }) : ''}
        <div class="row-note" style="display:flex;align-items:center;gap:12px"><span style="flex:1;font-size:14px">ابدأ كل مراجعة بهذه الخطوة</span>${C.switch(!!X.S.settings.recBlind, 'recBlind', null, 'ابدأ كل مراجعة بالاستماع الأول')}</div></div>
      ${C.btn('انتهيت · راجع الآن بالمصحف', 'blindDone', id, { size: 'l', full: true, icon: 'book-open', iconSize: 20 })}
      ${C.btn('تخطَّ هذه الخطوة', 'recView', 'check', { kind: 'ghost', size: 's', full: true })}`;
  },

  listen(X, r, c, segs, an) {
    const id = r._id;
    if (!c) return '';
    const bms = (r.bookmarks || []).map((b, i) => `<div class="clip"><button class="kb-ref num" data-a="bmJump" data-v="${id}:${i}">${clipTime(b.ms)}</button><span class="tx"><span>${b.note ? esc(b.note) : '<span class="t-3">دون ملاحظة</span>'}</span></span>${C.iconBtn('note-pencil', 'bmNote', id + ':' + i, 'ملاحظة العلامة', { size: 20 })}${C.iconBtn('trash', 'bmDel', id + ':' + i, 'حذف العلامة', { size: 20 })}</div>`).join('');
    const det = c.det;
    const trimRow = det ? (r.trim ? `<span class="t-cap">حُذف الصمت من البداية والنهاية عند التشغيل.</span>${C.btn('ألغِ القصّ', 'trimClear', id, { kind: 'ghost', size: 's' })}`
      : det.start > 800 || (c.durMs || r.ms) - det.end > 800 ? `${C.btn('قصّ الصمت', 'trimApply', id, { kind: 'outline', size: 's', icon: 'arrows-left-right', iconSize: 16 })}<span class="t-cap">${secText(det.start)} في البداية · ${secText((c.durMs || r.ms) - det.end)} في النهاية</span>` : '') : '';
    return `<div class="note subtle row-note" style="font-size:13px">${icon('info', 18)}<span>الاستماع الحر أقل كشفاً للأخطاء: الذاكرة تُكمل ما تتوقعه. للمراجعة استعمل «راجع آية بآية».</span></div>
      ${RecDetailScreen.player(r, c, an)}
      ${trimRow ? `<div class="btn-row wrap" style="align-items:center">${trimRow}</div>` : ''}
      <div class="sec">${C.secH('العلامات', r.bookmarks && r.bookmarks.length ? '' : 'اضغط «علامة» أثناء الاستماع')}${bms ? `<div class="card" style="gap:2px;padding:8px 14px">${bms}</div>` : ''}</div>
      ${RecDetailScreen.analysisCard(X, r, an)}`;
  },

  analysisCard(X, r, an) {
    if (!an) return '';
    const prev = recList(X.S).filter(o => o.id !== r._id && o.from === r.from && o.to === r.to && o.an && o.an.wpm && o.id < r._id)[0];
    const cmp = prev ? `<span class="t-cap">مقارنة بتسجيلك ${agoText(X.t - prev.day)}: ${an.wpm > prev.an.wpm ? 'أسرع' : an.wpm < prev.an.wpm ? 'أبطأ' : 'بالسرعة نفسها'} (${prev.an.wpm} ← ${an.wpm} كلمة/د)، والوقفات داخل الآيات ${prev.an.hes} ← ${an.hes}.</span>` : '';
    return `<div class="sec">${C.secH('تحليل تقريبي')}<div class="card" style="gap:10px"><div class="grid3" style="gap:8px">
        <div class="mini-stat"><span class="k">مدة القراءة</span><span class="v"><b class="num" style="font-size:18px">${clipTime(an.speechMs)}</b></span></div>
        <div class="mini-stat"><span class="k">السرعة</span><span class="v"><b class="num" style="font-size:18px">${an.wpm}</b><span>كلمة/د</span></span></div>
        <div class="mini-stat"><span class="k">وقفات طويلة</span><span class="v"><b class="num" style="font-size:18px">${an.hes}</b><span>داخل الآيات</span></span></div></div>
      ${cmp}<span class="t-cap">محسوب من الصوت على جهازك. الوقفة الطويلة ليست بالضرورة تردّداً، وقد تكون وقفاً أو تنفّساً.</span></div></div>`;
  },

  // The self-check: one ayah at a time, played alone, judged against the muṣḥaf.
  check(X, r, c, segs, an) {
    const { ui, t } = X, id = r._id;
    if (r.purpose === 'tajwid') return `<div class="card"><span class="t-body-s">هذا التسجيل للتجويد. غيّر الغرض إلى «حفظ» لتراجعه آية بآية.</span>${C.seg('recPurpose', PURPOSE.map(([k, l]) => [id + ':' + k, l]), id + ':' + r.purpose)}</div>`;
    if (!c) return '';
    if (!c.det && !c.failed) return `<div class="card"><span class="t-body-s">جارٍ تحليل الصوت لتقسيمه إلى آيات…</span></div>`;
    const ayat = recAyat(r), i = Math.min(ui.chkI || 0, segs.length - 1), sg = segs[i];
    const results = r.ayahs || {}, cur = results[sg.g1] || null, res = cur ? cur.res : null;
    const src = r.marksSrc === 'auto' ? 'تقسيم مقترح من الوقفات. إن بدأت آية في غير موضعها فحرّك بدايتها.' : r.marks && r.marks.length ? 'حدّدت نهايات الآيات أثناء التسجيل.' : '';
    const dots = `<div class="chk-dots">${segs.map((s, k) => { const x = results[s.g1], cls = x ? (x.res === 'ok' ? 'ok' : x.res === 'unsure' ? 'q' : x.status === 'resolved' ? 'fixed' : x.res === 'hesitate' ? 'hes' : x.res === 'omit' ? 'om' : 'bad') : ''; return `<button class="${k === i ? 'cur' : ''} ${cls}" data-a="chkGo" data-v="${k}" aria-label="${ayahName(s.g1)}${x ? ' · ' + (x.res === 'ok' ? 'صحيحة' : x.res === 'unsure' ? 'غير متأكد' : MISTAKE_AR[x.res]) : ''}">${x ? (x.res === 'ok' ? '✓' : x.res === 'unsure' ? '؟' : '✗') : ''}${fromG(s.g1).a}</button>`; }).join('')}</div>`;
    const hes = an ? an.hesBySeg[i] || [] : [];
    const merged = sg.g2 !== sg.g1;
    const done = ayat.every(g => results[g] && results[g].res);
    const p0 = pageOf(r.from), p1 = pageOf(r.to);
    const flagged = r.blind && r.blind.day != null ? blindAyat(r.blind.marks, segs) : [];
    const offer = r._blindOpen ? `<div class="card subtle" style="border-radius:22px;gap:8px"><span class="t-title-s" style="font-size:15px">استماع أول دون مصحف (اختياري)</span><span class="t-body-s">استمع للتسجيل كاملاً والمصحف مغلق وعلّم ما تظنه خطأً، ثم راجع بالمصحف. تعرف بذلك كم تلتقط بسمعك.</span>${C.btn('ابدأ الاستماع الأول', 'recView', 'blind', { kind: 'tonal', size: 's', icon: 'eye-slash', iconSize: 16 }).replace('class="btn', 'style="align-self:flex-start" class="btn')}</div>` : '';
    return `${offer}<div class="note subtle row-note">${icon('book-open', 20)}<span>افتح مصحفك على ${pagesText(r.from, r.to)}. استمع لكل آية ثم احكم عليها. ${src}</span></div>
      ${dots}
      <div class="card chk-card" data-player="${id}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="t-title-m">${merged ? `${shortRange(sg.g1, sg.g2)}` : ayahName(sg.g1)}</span><span class="t-cap num">${i + 1} / ${segs.length}${p0 !== p1 ? ' · ' + pagesText(sg.g1, sg.g1) : ''}</span></div>
        ${merged ? `<span class="t-cap" style="color:var(--fb-warning-fg)">هذا المقطع يضم أكثر من آية. شغّله وأوقفه عند نهاية الآية ثم اضغط «قسّم هنا».</span>` : ''}
        <div style="display:flex;align-items:center;justify-content:center;gap:16px">${C.iconBtn('caret-right', 'chkGo', Math.max(0, i - 1), 'الآية السابقة', { size: 26, disabled: i === 0 })}${C.iconBtn(Player.playing(id) ? 'pause-circle' : 'play-circle', 'chkPlay', i, 'شغّل الآية', { size: 60 })}${C.iconBtn('caret-left', 'chkGo', Math.min(segs.length - 1, i + 1), 'الآية التالية', { size: 26, disabled: i === segs.length - 1 })}</div>
        <span class="t-cap num" style="text-align:center"><span class="pos">${clipTime(Player.id === id ? Player.posMs() : sg.from)}</span> · من ${clipTime(sg.from)} إلى ${clipTime(sg.to)}</span>
        ${(r.hes || []).filter(h => h >= sg.from && h < sg.to).map(h => `<button class="kb-line strong" data-a="chkHes" data-v="${Math.round(h)}">${icon('hand-tap', 16)}<span>علّمتَ تردّداً هنا عند ${clipTime(h)} — استمع إليه</span></button>`).join('')}
        ${hes.map(p => `<button class="kb-line strong" data-a="chkPause" data-v="${Math.round(p.at - p.len / 2)}">${icon('hourglass-medium', 16)}<span>وقفة ${secText(p.len)} داخل الآية عند ${clipTime(p.at)} — هل تردّدت؟ استمع إليها</span></button>`).join('')}
        <div class="verdicts" role="radiogroup" aria-label="حكمك على الآية">
          <button class="vd ok ${res === 'ok' ? 'on' : ''}" data-a="chkRes" data-v="ok" role="radio" aria-checked="${res === 'ok'}"><b>✓</b><span>صحيحة</span></button>
          <button class="vd bad ${isMistake(res) ? 'on' : ''}" data-a="chkWrong" role="radio" aria-checked="${isMistake(res)}"><b>✗</b><span>خطأ</span></button>
          <button class="vd q ${res === 'unsure' ? 'on' : ''}" data-a="chkRes" data-v="unsure" role="radio" aria-checked="${res === 'unsure'}"><b>؟</b><span>غير متأكد</span></button></div>
        ${isMistake(res) ? `<button class="kb-line strong" data-a="chkWrong">${icon('pencil-simple', 16)}<span>${mistakeLine({ ...cur })} — اضغط للتعديل</span></button>` : res === 'unsure' ? '<span class="t-cap">ستبقى هذه الآية «للتأكد»: أعد سماعها لاحقاً مع مصحفك.</span>' : ''}
        ${res && flagged.includes(sg.g1) ? '<span class="t-cap">علّمتَ هذه الآية في الاستماع الأول.</span>' : ''}
        ${res && i < segs.length - 1 && !X.S.settings.recAutoNext ? C.btn('التالية', 'chkNext', null, { size: 'l', full: true, icon: 'caret-left', iconSize: 20 }) : ''}
        <div class="row-note" style="display:flex;align-items:center;gap:12px"><span style="flex:1;font-size:14px">انتقل تلقائياً بعد الحكم</span>${C.switch(!!X.S.settings.recAutoNext, 'recAutoNext', null, 'انتقل تلقائياً بعد الحكم')}</div>
        <details class="chk-fix"><summary class="t-cap">ضبط التقسيم</summary><div class="btn-row wrap" style="padding-top:8px">
          ${i > 0 ? `${C.btn('ابدأ قبل ½ ث', 'chkNudge', -500, { kind: 'outline', size: 's' })}${C.btn('ابدأ بعد ½ ث', 'chkNudge', 500, { kind: 'outline', size: 's' })}${C.btn('ادمج مع السابقة', 'chkMerge', i, { kind: 'ghost', size: 's' })}` : ''}
          ${C.btn('قسّم هنا', 'chkSplit', id, { kind: 'tonal', size: 's' })}</div><span class="t-cap">«قسّم هنا» يضع نهاية آية عند موضع التشغيل الحالي.</span></details></div>
      ${done ? C.btn(r.checked != null ? 'عرض النتيجة' : 'أنهِ المراجعة', 'chkFinish', id, { size: 'l', full: true, icon: 'check-circle', iconSize: 22 }) : `<span class="t-cap" style="text-align:center">بقي منها ${ayatWord(ayat.filter(g => !(results[g] && results[g].res)).length)} من ${ayat.length}. تُشغَّل كل آية ثم تتوقف حتى تحكم عليها.</span>`}`;
  },

  // One mistake: category, «اشتبه بـ», note, open/corrected, re-record until clean.
  mistakeRow(id, m) {
    const fixed = m.status === 'resolved', tries = (m.fixes || []).length;
    return `<div class="row" style="align-items:flex-start;gap:10px"><span class="tx"><span class="l">${ayahName(m.g)} <span class="tag ${fixed ? 'ok' : 'warn'}" style="height:22px;font-size:12px">${fixed ? 'صُحّح' : 'مفتوح'}</span></span><span class="s">${mistakeLine(m)}</span>${tries ? `<span class="c">${tries} ${tries === 1 ? 'محاولة' : tries === 2 ? 'محاولتان' : 'محاولات'} تصحيح</span>` : ''}</span>
      <span style="display:flex;gap:4px;flex:none">${vnBtn(id, m)}${C.iconBtn('play-circle', 'mkPlay', id + ':' + m.g, 'استمع إلى الآية', { size: 22 })}${fixed ? '' : C.iconBtn('microphone', 'recFix', id + ':' + m.g, 'أعد تلاوة الآية', { size: 22 })}</span></div>`;
  },

  result(X, r, c, segs, an) {
    const { S, t } = X, id = r._id, mis = recMistakes(r), checkedN = Object.keys(r.ayahs || {}).length;
    const sug = suggestRating(mis.length);
    const block = recCountBlock(S, S.recs[id], t);
    const why = { counted: `احتُسبت مراجعة ${agoText(t - r.counted)}.`, old: 'تُحتسب تسجيلات اليوم فقط.', notMem: 'هذا الموضع غير محفوظ بعد في التطبيق.', noRating: 'اختر التقييم أولاً.', tajwid: 'تسجيل للتجويد فقط.' }[block] || 'تُحدَّث قوة هذا الموضع وموعد مراجعته، وتدخل أخطاؤه في مواضع الضعف.';
    const summary = r.checked != null
      ? `<div class="card" style="gap:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="t-title-m">${mis.length ? errWord(mis.length) : 'دون أخطاء'}</span><span class="t-cap">راجعت ${ayatWord(checkedN)} ${agoText(t - r.checked)}</span></div>
        ${mis.length ? `<div class="group">${mis.map(m => RecDetailScreen.mistakeRow(id, m)).join('')}</div>` : ''}
        ${recUnsure(r).length ? `<span class="t-cap">للتأكد (؟): ${recUnsure(r).map(g => ayahName(g)).join('، ')}</span>` : ''}
        ${(b => b ? `<div class="inset-panel" style="gap:2px"><span class="t-meta">الاستماع الأول دون مصحف</span><span class="t-body-s" style="color:var(--tx-1)">${b.caught + b.missed ? `التقطت بسمعك ${b.caught} من ${b.caught + b.missed} من أخطائك${b.missed ? ` · فاتك ${b.missed}` : ''}` : 'لم تجد بالمصحف خطأً يُلتقط بالسمع'}${b.extra ? ` · علّمت ${ayatWord(b.extra)} وهي سليمة` : ''}.</span></div>` : '')(r.blind && r.blind.res)}</div>`
      : r.purpose !== 'tajwid' ? `<div class="card" style="gap:10px"><span class="t-body-s">لم تراجع هذا التسجيل بعد. راجعه آية بآية مع مصحفك لتعرف أخطاءك.</span>${C.btn('راجع آية بآية', 'recView', 'check', { kind: 'tonal', size: 's' })}</div>` : '';
    const hifz = r.purpose === 'tajwid' ? '' : `<div class="sec">${C.secH('الحفظ')}<div class="card" style="gap:12px">
        <span class="t-meta t-2">التقييم${r.checked != null ? ` · المقترح من أخطائك: <b>${RATING_AR[sug]}</b>` : ''}</span>${C.picks('recRate1', [['0', 'متقن'], ['1', 'متوسط'], ['2', 'ضعيف']].map(([v, l]) => [id + ':' + v, l]), id + ':' + r.rating)}
        <div class="row-note" style="display:flex;align-items:center;gap:12px"><span style="flex:1;display:flex;flex-direction:column"><span style="font-size:15px;font-weight:500">احتسبها مراجعة</span><span class="t-cap">${why}</span></span>${r.counted != null ? icon('check-circle-fill', 24).replace('class="ic"', 'class="ic t-brand"') : C.switch(false, block ? null : 'recCount', id, 'احتسبها مراجعة').replace('<button', block ? '<button disabled' : '<button')}</div></div></div>`;
    const tajwid = r.purpose === 'hifz' ? '' : `<div class="sec">${C.secH('التجويد', 'اختر ما ينطبق')}<div class="group">${TAJWID.map(([k, l]) =>
      `<div class="check-row"><span class="l">${l}</span>${C.picks('recAspect', [['0', 'جيد'], ['1', 'يحتاج عملاً']].map(([v, lb]) => [id + ':' + k + ':' + v, lb]), r.aspects[k] != null ? id + ':' + k + ':' + r.aspects[k] : '', 'compact')}</div>`).join('')}</div></div>`;
    const others = recList(S).filter(o => o.id !== id && o.from === r.from && o.to === r.to);
    const compare = others.length ? `<div class="sec">${C.secH('تسجيلاتك السابقة لهذا الموضع')}${others.map(o => `<div class="card rec-card">${playBtn(o.id, o.ms)}<button class="tx" data-a="go" data-v="recd:${o.id}"><span class="t-title-s" style="font-size:15px">${dateText(o.day, { day: 'numeric', month: 'long' })}</span>${recSummary(o)}</button></div>`).join('')}</div>` : '';
    return `${summary}${hifz}${tajwid}${RecDetailScreen.analysisCard(X, r, an)}
      <div class="sec">${C.secH('الغرض')}${C.seg('recPurpose', PURPOSE.map(([k, l]) => [id + ':' + k, l]), id + ':' + r.purpose)}</div>
      <div class="sec">${C.secH('ملاحظاتي')}<textarea id="rec-note" class="field" maxlength="1000" dir="auto" data-id="${id}" aria-label="ملاحظاتي على هذا التسجيل" placeholder="مثلاً: أطلت المد في الآية 5.">${esc(r.note || '')}</textarea></div>
      ${compare}
      <div class="btn-row">${C.btn('سمّع مرة أخرى', 'recAgain', id, { kind: 'tonal', icon: 'microphone', iconSize: 18, flex: true })}${C.btn('حذف', 'recDelete', id, { kind: 'ghost', icon: 'trash', iconSize: 18, flex: true })}</div>`;
  }
};

// Progress → التلاوة: self-checks first, then tajwid, from your own reviews of your recordings.
const ProgRecScreen = {
  title: 'التلاوة',
  render(X) {
    const st = recStats(X.S, X.t), sc = st.self.cur, sp = st.self.prev;
    if (!st.total) return `<div class="page">${C.empty(C.emptyArt(8, 18, 4), 'لا تسجيلات بعد', 'يظهر هنا تطوّر حفظك وتجويدك من مراجعتك لتسجيلاتك.', C.btn('سمّع الآن', 'recPick', null, { kind: 'tonal' }))}</div>`;
    const max = Math.max(1, ...st.weeks.map(w => w.n));
    const weeks = `<div class="wkbars">${st.weeks.map((w, i) => `<span class="b ${i === 7 ? 'now' : ''}" title="${w.n}"><i style="height:${Math.round(w.n / max * 100)}%"></i>${w.checks ? `<i class="chk" style="height:${Math.round(w.checks / max * 100)}%"></i>` : ''}<b class="num">${w.n || ''}</b></span>`).join('')}</div>
      <div style="display:flex;justify-content:space-between" class="t-cap"><span>قبل 8 أسابيع</span><span>هذا الأسبوع</span></div>
      <div class="legend-dots t-cap"><span><i style="background:var(--m-medium)"></i>تسجيلات</span><span><i style="background:var(--brand-text)"></i>راجعتها</span></div>`;
    const trend = (cur, prev, lowerBetter, unit) => cur == null ? '—' : `<b class="num" style="font-size:18px">${cur}</b>${unit ? `<span>${unit}</span>` : ''}${prev != null && prev !== cur ? `<span class="tag ${(cur < prev) === lowerBetter ? 'ok' : 'warn'}" style="height:22px">${cur < prev ? icon('arrow-down', 12) : icon('arrow-up', 12)} ${prev}</span>` : ''}`;
    const self = sc.n ? `<div class="grid2">
        <div class="mini-stat"><span class="k">أخطاء لكل 100 آية</span><span class="v">${trend(sc.per100, sp.per100, true)}</span></div>
        <div class="mini-stat"><span class="k">مراجعات هذا الشهر</span><span class="v"><b class="num" style="font-size:18px">${sc.n}</b><span>${sc.ayat} آية</span></span></div>
        <div class="mini-stat"><span class="k">السرعة</span><span class="v">${trend(sc.wpm, sp.wpm, false, 'كلمة/د')}</span></div>
        <div class="mini-stat"><span class="k">وقفات داخل الآيات</span><span class="v">${trend(sc.hes, sp.hes, true, 'في التسجيل')}</span></div></div>
      <span class="t-cap">المقارنة مع الشهر الماضي. السرعة والوقفات تقريبية.</span>
      ${st.blind.rate != null ? `<span class="t-cap">في الاستماع الأول دون مصحف التقطت ${st.blind.rate}% من أخطائك (${st.blind.caught} من ${st.blind.caught + st.blind.missed}).</span>` : ''}`
      : '<div class="card"><span class="t-body-s">راجع تسجيلاتك آية بآية ليظهر هنا معدّل أخطائك وتطوّره.</span></div>';
    const wrong = st.wrongTop.length ? `<div class="sec">${C.secH('أكثر الآيات خطأً في تسميعك')}<div class="group">${st.wrongTop.map(w => { const T = THUMUN[AYAH_TH[w.g]]; return C.row({ label: ayahName(w.g), cap: `${w.n} ${w.n === 1 ? 'مرة' : w.n === 2 ? 'مرتان' : 'مرات'} · ${Object.entries(w.types).map(([k, n]) => MISTAKE_AR[k] + (n > 1 ? ' ×' + n : '')).join('، ')}`, a: 'go', v: `hizb:${T.hizb}:${T.k}` }); }).join('')}</div></div>` : '';
    const marked = st.aspects.filter(a => a.cur.n);
    const aspects = marked.length ? `<div class="group">${marked.map(a => {
      const pct = Math.round(a.cur.rate * 100);
      const tr = a.trend == null ? '' : a.trend < -0.05 ? `<span class="tag ok">${icon('arrow-down', 12)} تحسّن</span>` : a.trend > 0.05 ? `<span class="tag warn">${icon('arrow-up', 12)} يحتاج انتباهاً</span>` : '<span class="tag">ثابت</span>';
      return `<div class="check-row" style="flex-direction:column;align-items:stretch;gap:6px"><span style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="l">${a.label}</span>${tr}</span>
        <span class="track"><span style="width:${pct}%;background:${pct > 50 ? 'var(--m-weak)' : 'var(--m-medium)'}"></span></span>
        <span class="t-cap">يحتاج عملاً في ${iso(a.cur.work + ' / ' + a.cur.n)} من تقييماتك هذا الشهر${a.prev.n ? ` · الشهر الماضي ${Math.round(a.prev.rate * 100)}%` : ''}</span></div>`;
    }).join('')}</div>` : '<div class="card"><span class="t-body-s">قيّم جوانب التجويد في تسجيلاتك لترى أين تتحسّن.</span></div>';
    const pairs = st.pairs.length ? `<div class="sec">${C.secH('متشابهاتي', 'من أخطاء «انتقال»')}<div class="group">${st.pairs.slice(0, 6).map(p => C.row({ icon: 'arrows-left-right', label: `${ayahName(p.a)} ↔ ${ayahName(p.b)}`, cap: `${p.n} ${p.n === 1 ? 'مرة' : p.n === 2 ? 'مرتان' : 'مرات'} · آخرها ${agoText(X.t - p.last)}${p.open ? ` · ${p.open} لم تُصحَّح` : ''}`, a: 'go', v: `hizb:${THUMUN[AYAH_TH[p.a]].hizb}:${THUMUN[AYAH_TH[p.a]].k}` })).join('')}</div></div>` : '';
    const weakTh = Object.values(recThumunStats(X.S, X.t)).filter(x => x.strength < REC_SCORE.strong).sort((a, b) => a.strength - b.strength || a.id - b.id).slice(0, 5);
    const weakest = weakTh.length ? `<div class="sec">${C.secH('أضعف المواضع في تسميعك', 'الأخطاء القديمة والمصحَّحة تُحسب أقل')}<div class="group">${weakTh.map(x => { const T = THUMUN[x.id], k = recStrengthKey(x.strength); return C.row({ lead: C.stateCell(k, 16), label: shortRange(T.start, T.end), cap: `${REC_STRENGTH_AR[k]} · ${errWord(x.mistakes)}${x.open ? ` · ${x.open} لم تُصحَّح` : ''} · آخر مراجعة ${agoText(X.t - x.last)}`, a: 'go', v: `hizb:${T.hizb}:${T.k}` }); }).join('')}</div></div>` : '';
    const fixes = st.mistakesStatus.open + st.mistakesStatus.resolved ? `<button class="card row" style="padding:14px 16px;border-radius:22px" data-a="go" data-v="recMistakes"><span class="icon-box clay">${icon('warning-diamond', 20)}</span><span class="tx"><span class="l">الأخطاء: ${st.mistakesStatus.resolved} صُحّحت · ${st.mistakesStatus.open} مفتوحة</span><span class="c">أعد تلاوة الآية حتى تسلم</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>` : '';
    const plans = X.S.recPlans.length ? `<div class="sec">${C.secH('خطط التسميع')}<div class="group">${X.S.recPlans.map(p => { const ps = planStatus(p, X.S.recs); return C.row({ label: p.name, cap: `${ps.clean} من ${ps.pieces.length} دون أخطاء${p.done ? ' · مكتملة' : ''}`, end: `<span class="track" style="width:80px"><span style="width:${Math.round(ps.clean / Math.max(1, ps.pieces.length) * 100)}%"></span></span>` }); }).join('')}</div></div>` : '';
    return `<div class="page">
      <div class="sec">${C.secH('التسميع الذاتي', 'آخر 30 يوماً')}${self}</div>
      <div class="sec">${C.secH('الأسابيع الأخيرة')}<div class="card" style="gap:8px">${weeks}</div></div>
      ${fixes}${weakest}${wrong}${pairs}${plans}
      <div class="sec">${C.secH('التجويد', 'آخر 30 يوماً')}${aspects}</div>
      <span class="t-cap" style="text-align:center">مبنيّ على مراجعتك الذاتية لتسجيلاتك.</span></div>`;
  }
};

// Sheets: choose what to recite, record it, start a plan, edit a bookmark note.
const RecSheets = {
  pick(X) {
    const { S, t, p, ui } = X, k = ui.pick, mem = memIds(S);
    const today = [...(p.newItem ? [p.newItem] : []), ...p.recent, ...p.review].slice(0, 4);
    const nexts = S.recPlans.filter(pl => !pl.done).map(pl => ({ pl, nx: planStatus(pl, S.recs).next })).filter(x => x.nx && x.nx.state !== 'recorded');
    const recent = []; recList(S).forEach(r => { if (recent.length < 3 && !recent.some(x => x.from === r.from && x.to === r.to)) recent.push(r); });
    const opt = (ids, label, sub) => C.radioRow(label, sub, 'pickIds', ids.join('.'), k.ids && k.ids.join('.') === ids.join('.'));
    const h = k.h, L = hizbThumun(h);
    return `${Sheets.head('ماذا ستسمّع؟', 'اختر الموضع، ثم سمّع من حفظك')}
      <div class="sheet-body">
        ${nexts.length ? `<span class="t-title-s" style="font-size:15px;padding:4px 4px 0">من خططك</span>${nexts.map(x => opt(x.nx.ids, rangeText(x.nx.from, x.nx.to), x.pl.name)).join('')}` : ''}
        ${today.length ? `<span class="t-title-s" style="font-size:15px;padding:8px 4px 0">من ورد اليوم</span>${today.map(it => opt(it.ids, rangeText(it.from, it.to), REC_LABEL[it.kind] + ' · ' + pagesText(it.from, it.to))).join('')}` : ''}
        ${recent.length ? `<span class="t-title-s" style="font-size:15px;padding:8px 4px 0">أعد تسميع</span>${recent.map(r => opt(r.ids, rangeText(r.from, r.to), 'آخر تسجيل ' + agoText(t - r.day))).join('')}` : ''}
        <span class="t-title-s" style="font-size:15px;padding:8px 4px 0">اختر ثُمناً</span>
        <div class="card r22" style="gap:12px;padding:14px 16px"><div style="display:flex;align-items:center;justify-content:space-between">${C.iconBtn('caret-right', 'pickH', -1, 'الحزب السابق', { size: 20 })}<span class="t-title-s">الحزب ${h}</span>${C.iconBtn('caret-left', 'pickH', 1, 'الحزب التالي', { size: 20 })}</div>
          <div class="picks grid4">${L.map((id, i) => `<button class="pick num ${k.ids && k.ids.length === 1 && k.ids[0] === id ? 'on' : ''} ${mem.includes(id) ? '' : 'dim'}" data-a="pickIds" data-v="${id}" aria-label="الثُّمن ${i + 1} · ${shortRange(THUMUN[id].start, THUMUN[id].end)}">${i + 1}</button>`).join('')}</div>
          ${k.ids && k.ids.length === 1 && L.includes(k.ids[0]) ? `<span class="t-cap">${rangeText(THUMUN[k.ids[0]].start, THUMUN[k.ids[0]].end)}</span>` : '<span class="t-cap">الأرقام الباهتة غير محفوظة بعد، ويمكن تسجيلها للتجويد.</span>'}</div>
        <span class="t-title-s" style="font-size:15px;padding:8px 4px 0">الغرض</span>${C.seg('pickPurpose', PURPOSE, k.purpose)}</div>
      <div class="sheet-foot">${C.btn(k.ids ? 'ابدأ التسميع' : 'اختر الموضع أولاً', k.ids ? 'pickGo' : null, null, { kind: k.ids ? 'primary' : 'pending', size: 'l', full: true, icon: 'microphone', iconSize: 20 })}</div>`;
  },

  // Record from memory: pause/resume, level meter, «الآية التالية» marks. Then check or save.
  recorder(X, sh) {
    const m = X.ui.mic, from = sh.from ?? THUMUN[sh.ids[0]].start, to = sh.to ?? THUMUN[sh.ids[sh.ids.length - 1]].end;
    const n = to - from + 1, marks = m.marks || 0, fix = sh.fix, hesN = m.hes || 0;
    const pausedWhy = m.away === 'call' ? 'توقّف التسجيل: مكالمة أو تطبيق آخر يستعمل الميكروفون. اضغط «تابع» بعد انتهائها.' : m.away === 'back' ? 'عاد الميكروفون. اضغط «تابع» لتكمل.' : m.away ? 'توقّف التسجيل حين غادرت التطبيق. اضغط «تابع» لتكمل.' : 'متوقف مؤقتاً.';
    const live = m.state === 'rec' || m.state === 'paused';
    const main = live
      ? `<div class="mic-stage has-aurora ${m.state === 'paused' ? 'paused' : ''}">${C.aurora('deep')}<span class="time num">${clipTime(m.ms || 0)}</span>${C.levels()}<span class="st"><i class="dot"></i>${m.state === 'paused' ? 'متوقف مؤقتاً' : 'يستمع'}</span></div>
        ${n > 1 ? `<button class="go next" data-a="micNext" aria-label="الآية التالية" ${m.state === 'paused' ? 'disabled' : ''}><span>الآية التالية</span><b class="num">${Math.min(marks + 1, n)} / ${n}</b></button>` : ''}
        ${sh.purpose === 'tajwid' ? '' : `<button class="go hes" data-a="micHes" aria-label="تردّدت هنا${hesN ? '، ' + hesN : ''}" ${m.state === 'paused' ? 'disabled' : ''}>${icon('hand-tap', 22)}<span>تردّدت هنا</span>${hesN ? `<b class="num">${hesN}</b>` : ''}</button>`}
        <div class="btn-row" style="width:100%">${C.btn(m.state === 'paused' ? 'تابع' : 'إيقاف مؤقت', m.state === 'paused' ? 'micResume' : 'micPause', null, { kind: 'outline', icon: m.state === 'paused' ? 'play-circle' : 'pause-circle', iconSize: 18, flex: true })}${C.btn('أنهِ', 'micStop', null, { kind: 'danger', icon: 'stop-circle', iconSize: 18, flex: true })}</div>
        ${marks ? C.btn('تراجع عن آخر علامة', 'micUndo', null, { kind: 'ghost', size: 's' }) : ''}
        <span class="t-cap" style="text-align:center">${m.state === 'paused' ? pausedWhy : (n > 1 ? 'اضغط «الآية التالية» عند نهاية كل آية (اختياري). ' : '') + (sh.purpose === 'tajwid' ? '' : 'إن تردّدت اضغط «تردّدت هنا» وأكمل.')}</span>`
      : m.state === 'done'
        ? `<div class="btn-row" style="width:100%">${C.btn(Player.playing('new') ? 'إيقاف' : 'استمع', 'micPlay', null, { kind: 'tonal', icon: Player.playing('new') ? 'pause-circle' : 'play-circle', flex: true })}${C.btn('أعد التسجيل', 'micStart', null, { kind: 'outline', flex: true })}</div>
          ${m.recovered ? `<div class="note subtle row-note" style="font-size:13px">${icon('clock-counter-clockwise', 18)}<span>استُعيد تسجيل لم يُحفظ حين أُغلق التطبيق (${clipTime(m.ms || 0)}). قد تنقصه الثانية الأخيرة. استمع إليه ثم احفظه أو تجاهله.</span></div>` : ''}
          ${m.cut ? `<div class="note subtle row-note" style="font-size:13px">${icon('warning-circle', 18)}<span>انقطع الميكروفون فانتهى التسجيل هنا. حُفظ ما سُجّل حتى تلك اللحظة.</span></div>` : ''}
          <span class="t-cap">${fix ? 'استمع ثم احكم: هل سلمت الآية هذه المرة؟' : (n === 1 ? '' : m.marks ? `حدّدت ${m.marks} من ${n - 1} نهاية آية.` : 'لم تحدّد نهايات الآيات؛ سيقترحها التطبيق من الوقفات.') + (hesN ? ` علّمت ${hesN === 1 ? 'تردّداً واحداً' : hesN === 2 ? 'تردّدين' : hesN + ' تردّدات'}.` : '')}</span>`
        : `<button class="go" data-a="micStart" aria-label="ابدأ التسجيل">${icon('microphone', 38)}</button><span class="t-meta" style="text-align:center">${m.error || (fix ? 'أغلق مصحفك، واضغط لتعيد تلاوة هذه الآية وحدها.' : 'أغلق مصحفك، واضغط لتبدأ التسميع من حفظك.')}</span>
          ${fix && Clips.has(fix.rec) ? C.btn('استمع إلى خطئك أولاً', 'mkPlay', fix.rec + ':' + fix.g, { kind: 'ghost', size: 's', icon: 'play-circle', iconSize: 16 }) : ''}`;
    const drill = sh.drill && X.ui.drill;
    const later = RecSheets.laterOptions(X);
    const foot = fix
      ? `<div class="sheet-foot"><div class="btn-row">${C.btn('سليمة', 'micFix', 'clean', { size: 'l', flex: true, icon: 'check-bold', iconSize: 18 })}${C.btn('ما زال فيها خطأ', 'micFix', 'wrong', { kind: 'outline', size: 'l', flex: true })}</div>${C.btn('تجاهل', 'micDiscard', null, { kind: 'ghost', size: 's', full: true })}</div>`
      : sh.purpose === 'tajwid'
        ? `<div class="sheet-foot">${C.btn('احفظ واستمع', 'micSave', 'check', { size: 'l', full: true })}${C.btn('تجاهل', 'micDiscard', null, { kind: 'ghost', size: 's', full: true })}</div>`
        : `<div class="sheet-foot"><span class="t-cap" style="text-align:center">المراجعة بعد وقت تكشف أخطاء أكثر من المراجعة فوراً.</span>
          <span class="t-meta t-2">راجع لاحقاً (موصى به)</span><div class="picks grid2">${later.map(([at, l]) => `<button class="pick" data-a="micLater" data-v="${at}">${l}</button>`).join('')}</div>
          <div class="btn-row">${C.btn('راجع الآن', 'micSave', 'check', { kind: 'outline', size: 's', flex: true, icon: 'book-open', iconSize: 16 })}${C.btn('تجاهل', 'micDiscard', null, { kind: 'ghost', size: 's', flex: true })}</div></div>`;
    return `${Sheets.head(drill ? `تمرين الأخطاء · ${drill.i + 1} من ${drill.queue.length}` : fix ? 'أعد تلاوة الآية' : 'سمّع من حفظك', fix ? `${ayahName(from)} · ${MISTAKE_AR[(X.S.recs[fix.rec].ayahs[fix.g] || {}).res] || ''}` : `${rangeText(from, to)} · ${PURPOSE_AR[sh.purpose]}`)}
      <div class="sheet-body"><div class="mic">${live ? '' : `<span class="time num">${clipTime(m.ms || 0)}</span>`}${main}</div>
        <span class="t-cap" style="text-align:center">يبقى الصوت على هذا الجهاز ولا يدخل في النسخ الاحتياطية. يُحفظ التسجيل ثانية بثانية، فإن أُغلق التطبيق عُرض عليك استرجاعه. تبقى الشاشة مضاءة أثناء التسجيل.</span></div>
      ${m.state === 'done' ? foot : drill && !live ? `<div class="sheet-foot">${C.btn('تخطَّ هذه الآية', 'drillSkip', null, { kind: 'ghost', size: 's', full: true })}</div>` : ''}`;
  },
  // «راجع لاحقاً»: a few sensible times (epoch ms, label).
  laterOptions(X) {
    const now = new Date(), h = now.getHours(), at = (d, hh, mm) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(hh, mm, 0, 0); return x.getTime(); };
    const [rh, rm] = X.S.settings.reminderTime.split(':').map(Number);
    const opts = [[Date.now() + 3600e3, 'بعد ساعة'], [Date.now() + 3 * 3600e3, 'بعد 3 ساعات']];
    if (h < 19) opts.push([at(0, 20, 0), 'هذا المساء']);
    opts.push([at(1, rh, rm), 'غداً ' + timeText(X.S.settings.reminderTime)]);
    return opts.slice(0, 4).map(([t, l]) => [Math.round(t), l]);
  },

  // ✗: which kind of mistake, «اشتبه بـ» for a jump, an optional note.
  mistake(X, sh) {
    const r = X.S.recs[sh.id], cur = (r && r.ayahs[sh.g]) || {}, cat = sh.cat || (isMistake(cur.res) ? cur.res : null);
    const conf = sh.confused ?? cur.confused ?? null, c0 = conf != null ? fromG(conf) : fromG(sh.g);
    return `${Sheets.head('ما الخطأ؟', ayahName(sh.g))}
      <div class="sheet-body pad20">
        <div class="cat-grid">${CATS.map(k => `<button class="cat ${cat === k ? 'on' : ''}" data-a="mkCat" data-v="${k}" role="radio" aria-checked="${cat === k}"><b>${MISTAKE_AR[k]}</b><span>${MISTAKE_HINT[k]}</span></button>`).join('')}</div>
        ${cat === 'jump' ? `<div style="display:flex;flex-direction:column;gap:8px"><span class="t-meta t-2">اشتبه بـ · اختياري</span><div style="display:flex;gap:8px"><label style="flex:2;display:flex;flex-direction:column;gap:4px"><span class="t-cap">السورة</span><select id="mj-s" class="field">${SURAH_NAMES.map((nm, k) => `<option value="${k + 1}" ${k + 1 === c0.s ? 'selected' : ''}>${k + 1} · ${nm}</option>`).join('')}</select></label>
          <label style="flex:1;display:flex;flex-direction:column;gap:4px"><span class="t-cap">الآية</span><input id="mj-a" class="field num" type="number" inputmode="numeric" min="1" value="${conf != null ? c0.a : ''}" placeholder="—"></label></div></div>` : ''}
        <input id="mk-note" class="field" dir="auto" maxlength="200" aria-label="ملاحظة" placeholder="ملاحظة (اختياري)" value="${esc(sh.text ?? cur.note ?? '')}">
        ${RecSheets.voiceNote(sh, cur)}</div>
      <div class="sheet-foot">${C.btn(cat ? 'احفظ الخطأ' : 'اختر نوع الخطأ', cat ? 'mkSave' : null, null, { kind: cat ? 'primary' : 'pending', size: 'l', full: true })}${isMistake(cur.res) ? C.btn('ليست خطأ', 'mkClear', null, { kind: 'ghost', size: 's', full: true }) : ''}</div>`;
  },

  // «ملاحظة صوتية»: record up to 30 s, listen, replace or delete.
  voiceNote(sh, cur) {
    if (!Clips.supported) return '';
    const key = sh.id + ':' + sh.g, vn = sh.vn !== undefined ? sh.vn : cur.vn, has = vn && Clips.vnHas(key);
    if (sh.vnRec) return `<div class="vn rec"><i class="dot"></i><span id="vn-time" class="num">${clipTime(0)}</span><span class="t-cap" style="flex:1">قل ما الخطأ · حتى 30 ثانية</span>${C.btn('أنهِ', 'vnStop', null, { kind: 'danger', size: 's', icon: 'stop-circle', iconSize: 16 })}</div>`;
    if (has) return `<div class="vn" data-player="vn:${key}">${C.iconBtn(Player.playing('vn:' + key) ? 'pause-circle' : 'play-circle', 'vnPlay', key, 'استمع إلى الملاحظة', { size: 30 })}<span style="flex:1;font-size:14px">ملاحظة صوتية · <span class="num">${clipTime(vn.ms)}</span></span>${C.btn('أعد', 'vnStart', null, { kind: 'ghost', size: 's' })}${C.iconBtn('trash', 'vnDel', null, 'حذف الملاحظة الصوتية', { size: 20 })}</div>`;
    return `${C.btn('ملاحظة صوتية', 'vnStart', null, { kind: 'outline', size: 's', icon: 'microphone', iconSize: 16 }).replace('class="btn', 'style="align-self:flex-start" class="btn')}${sh.vnErr ? `<span class="t-cap" style="color:var(--fb-warning-fg)">${sh.vnErr}</span>` : ''}`;
  },

  plan(X) {
    const k = X.ui.planNew, n = k.n, unit = k.unit;
    const ids = planIds(unit, n), from = THUMUN[ids[0]].start, to = THUMUN[ids[ids.length - 1]].end;
    const label = unit === 'hizb' ? 'الحزب ' + n : unit === 'juz' ? 'الجزء ' + n : 'سورة ' + SURAH_NAMES[n - 1];
    const max = { hizb: 60, juz: 30, surah: 114 }[unit];
    const pieces = planPieces(ids, k.piece).length;
    return `${Sheets.head('خطة تسميع جديدة', 'تُقسَّم إلى أجزاء صغيرة تسمّعها واحداً بعد الآخر')}
      <div class="sheet-body pad20">
        ${C.seg('planUnit', [['hizb', 'حزب'], ['juz', 'جزء'], ['surah', 'سورة']], unit)}
        <div class="card r22" style="gap:6px;padding:14px 16px"><div style="display:flex;align-items:center;justify-content:space-between">${C.iconBtn('caret-right', 'planNum', -1, 'السابق', { size: 20, disabled: n <= 1 })}<span class="t-title-s">${label}</span>${C.iconBtn('caret-left', 'planNum', 1, 'التالي', { size: 20, disabled: n >= max })}</div>
          <span class="t-cap" style="text-align:center">${rangeText(from, to)} · ${thumunWord(ids.length)}</span></div>
        <span class="t-meta t-2">حجم الجزء الواحد</span>${C.seg('planPiece', [['1', 'ثُمن'], ['2', 'ثُمنان']], String(k.piece))}
        <span class="t-cap">${pieces} ${pieces === 1 ? 'جزء' : pieces === 2 ? 'جزآن' : pieces <= 10 ? 'أجزاء' : 'جزءاً'}. تكتمل الخطة حين تسمّع كل جزء وتراجعه دون أخطاء.</span></div>
      <div class="sheet-foot">${C.btn('أنشئ الخطة', 'planCreate', null, { size: 'l', full: true })}</div>`;
  },

  bmNote(X, sh) {
    const r = X.S.recs[sh.id], b = r && r.bookmarks[sh.i];
    if (!b) return '';
    return `${Sheets.head('ملاحظة العلامة', clipTime(b.ms))}<div class="sheet-body"><input id="bm-in" class="field" dir="auto" maxlength="200" aria-label="ملاحظة العلامة" value="${esc(sh.text ?? b.note ?? '')}" placeholder="مثلاً: مدّ لازم هنا"></div>
      <div class="sheet-foot">${C.btn('حفظ', 'bmNoteSave', null, { size: 'l', full: true })}</div>`;
  }
};

// Thumun ids of a hizb, a juz or a surah (thumun overlapping the surah).
function planIds(unit, n) {
  if (unit === 'hizb') return hizbThumun(n);
  if (unit === 'juz') return juzThumun(n);
  const a = surahStart(n), b = surahEnd(n);
  return THUMUN.filter(T => T.end >= a && T.start <= b).map(T => T.id);
}

// «الأخطاء»: every mistake from your self-checks; re-record the ayah until it is clean.
const RecMistakesScreen = {
  title: 'الأخطاء',
  render(X) {
    const { S, t, ui } = X, st = ui.mkStatus || 'open', cat = ui.mkCat || 'all';
    const all = allMistakes(S), list = all.filter(m => (st === 'all' || (st === 'open') === (m.status !== 'resolved')) && (cat === 'all' || m.res === cat));
    if (!all.length) return `<div class="page">${C.empty(C.emptyArt(6, 18, 3), 'لا أخطاء مسجّلة', 'تظهر هنا أخطاؤك حين تراجع تسجيلاتك آية بآية.', C.btn('سمّع الآن', 'recPick', null, { kind: 'tonal' }))}</div>`;
    const cats = [...new Set(all.map(m => m.res))];
    const chips = `<div class="hscroll"><button class="chip-filter ${cat === 'all' ? 'on' : ''}" data-a="mkCatFilter" data-v="all">كل الأنواع</button>${CATS.filter(k => cats.includes(k)).map(k => `<button class="chip-filter ${cat === k ? 'on' : ''}" data-a="mkCatFilter" data-v="${k}" aria-pressed="${cat === k}">${MISTAKE_AR[k]}<span class="n num">${all.filter(m => m.res === k).length}</span></button>`).join('')}</div>`;
    const hizbs = [...new Set(list.map(m => THUMUN[AYAH_TH[m.g]].hizb))].sort((a, b) => a - b);
    const card = m => {
      const fixed = m.status === 'resolved', tries = (m.fixes || []).length;
      return `<div class="card" style="gap:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="t-title-s">${ayahName(m.g)}</span><span class="tag ${fixed ? 'ok' : 'warn'}">${fixed ? 'صُحّح ' + agoText(t - m.resolved) : 'مفتوح'}</span></div>
        <span class="t-body-s">${mistakeLine(m)}</span>
        <span class="t-cap">من تسميع ${agoText(t - m.day)} · ${pagesText(m.g, m.g)}${tries ? ` · ${tries === 1 ? 'محاولة واحدة' : tries === 2 ? 'محاولتان' : tries + ' محاولات'}` : ''}</span>
        <div class="btn-row wrap">${m.vn && Clips.vnHas(m.rec + ':' + m.g) ? C.btn('ملاحظتي', 'vnPlay', m.rec + ':' + m.g, { kind: 'outline', size: 's', icon: Player.playing('vn:' + m.rec + ':' + m.g) ? 'pause-circle' : 'waveform', iconSize: 16 }) : ''}${C.btn('استمع', 'mkPlay', m.rec + ':' + m.g, { kind: 'outline', size: 's', icon: 'play-circle', iconSize: 16 })}${fixed ? '' : C.btn('أعد التسجيل', 'recFix', m.rec + ':' + m.g, { kind: 'tonal', size: 's', icon: 'microphone', iconSize: 16 })}${C.btn('التسجيل', 'go', 'recd:' + m.rec, { kind: 'ghost', size: 's' })}</div></div>`;
    };
    const openN = drillQueue(S, 999).length;
    return `<div class="page">
      ${openN && Clips.supported ? C.btn(`تمرين الأخطاء · ${ayatWord(Math.min(10, openN))}`, 'drillStart', null, { kind: 'tonal', full: true, icon: 'repeat', iconSize: 18 }) : ''}
      ${C.seg('mkStatus', [['open', `مفتوحة (${all.filter(m => m.status !== 'resolved').length})`], ['resolved', `صُحّحت (${all.filter(m => m.status === 'resolved').length})`], ['all', 'الكل']], st, { h44: true })}
      ${chips}
      ${hizbs.length ? hizbs.map(h => `<div class="sec">${C.secH('الحزب ' + h)}${list.filter(m => THUMUN[AYAH_TH[m.g]].hizb === h).map(card).join('')}</div>`).join('') : '<div class="t-body-s" style="text-align:center;padding:20px">لا أخطاء بهذا التصنيف.</div>'}
      <span class="t-cap" style="text-align:center">الخطأ يُصحَّح حين تعيد تلاوة الآية وتحكم بأنها سليمة.</span></div>`;
  }
};
