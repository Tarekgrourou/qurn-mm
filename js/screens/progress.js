// Progress (التقدّم): calm, visual, derived from real records. No streaks, points or pressure.
'use strict';

function covGrid(snap, deep) {
  return `<span class="cov">${snap.cells.map(x => {
    if (deep) return `<i class="${VM.isMem(x) ? 'on' : ''}"></i>`;
    const k = x.s === '0' ? '' : x.s === 'L' ? 'k-learning' : x.t === 'due' ? 'k-due' : x.t === 'recent' ? 'k-recent' : 'k-' + (STRENGTH_KEY[x.s] === 'unknown' ? 'medium' : STRENGTH_KEY[x.s]);
    return `<i class="${k}"></i>`;
  }).join('')}</span>`;
}
function memLine2(snap) {
  const part = [];
  for (let h = 1; h <= 60; h++) { const n = hizbThumun(h).filter(i => VM.isMem(snap.cells[i])).length; if (n && n < 8) part.push([h, n]); }
  if (!part.length) return snap.counts.mem ? 'لا أحزاب جزئية' : 'حدّد محفوظك ليظهر هنا';
  if (part.length === 1) return `و${thumunWord(part[0][1])} من الحزب ${part[0][0]}`;
  return `و${thumunWord(part.reduce((a, [, n]) => a + n, 0))} من ${hizbWord(part.length)}`;
}
function sessionLines(s) {
  const RES_N = ['حُفظ', 'حُفظ بعضه', 'لم يُحفظ'], RES_R = ['تمّ', 'جزئي', 'لم يتم'], Q = ['متقن', 'متوسط', 'ضعيف'];
  return (s.entries || []).map(e => ({
    label: e.kind === 'new' ? 'الحفظ الجديد' : e.kind === 'recent' ? 'القريب' : s.kind === 'extra' ? 'مراجعة أخرى' : 'المراجعة',
    range: shortRange(e.from, e.to), full: rangeText(e.from, e.to), meta: thumunMetaDual(e.ids),
    res: e.kind === 'new' ? RES_N[e.status] : (e.status === 1 ? 'جزئي · ' : e.status === 2 ? '' : '') + (e.status === 2 ? 'لم يتم' : e.rating >= 0 ? Q[e.rating] : RES_R[e.status]),
    comp: e.kind === 'new' ? RES_N[e.status] : RES_R[e.status], q: e.rating >= 0 && e.kind !== 'new' ? ['strong', 'medium', 'weak'][e.rating] : null
  }));
}

// Milestone wording: [title when reached, the fact behind it].
function msText(m) {
  if (m.id === 'th1') return ['حفظت أول ثُمن', 'ثُمن واحد من 480، وهو بداية الطريق.'];
  if (m.id === 'chk1') return ['أول تسميع دون أخطاء', 'راجعت تسجيلك آية بآية مع مصحفك ولم تجد خطأً.'];
  if (m.n === 1) return ['أتممت أول حزب', '8 أثمان من 480.'];
  if (m.n === 30) return ['أتممت 30 حزباً', 'نصف القرآن محفوظ الآن: 240 ثُمناً من 480.'];
  if (m.n === 60) return ['أتممت حفظ القرآن الكريم', '60 حزباً، 480 ثُمناً. يبقى ورد المراجعة لتثبيت المحفوظ.'];
  return ['أتممت ' + hizbWord(m.n), `${m.n * 8} ثُمناً من 480.`];
}
// The same step before it is reached.
const msGoal = m => m.id === 'th1' ? 'أول ثُمن محفوظ' : m.id === 'chk1' ? 'تسميع دون أخطاء' : m.n === 60 ? 'حفظ القرآن الكريم كاملاً' : hizbFullWord(m.n);

// Progress card for «التلاوة»: this month, and the clearest tajwid change.
function recCard(st) {
  const better = st.aspects.filter(a => a.trend != null && a.trend < -0.05);
  const line = !st.total ? 'سجّل تلاوتك لتتابع تجويدك وحفظك.'
    : better.length ? `تحسّن في ${better.slice(0, 2).map(a => a.label).join(' و')}`
    : st.worst ? `أكثر ما يحتاج عملاً: ${st.worst.label}` : 'قيّم تسجيلاتك لترى أين تتحسّن.';
  return `<button class="card" style="gap:10px" data-a="go" data-v="${st.total ? 'progRec' : 'tab:rec'}"><span class="card-head" style="width:100%"><span class="k">التلاوة</span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</span>
    ${st.total ? `<span class="t-title-m">${recWord(st.count)} هذا الشهر · نحو ${durationText(Math.max(1, st.minutes))}</span>` : ''}
    <span class="t-body-s" style="font-size:15px">${line}</span></button>`;
}

const ProgScreen = {
  render(X) {
    const { S, t, snap } = X, c = snap.counts, has = c.mem > 0;
    const act = VM.activity(S, t), nAct = act.filter(a => a.has).length;
    const weak = VM.weakList(S, t), sess = VM.sessions(S).slice(0, 3);
    const st = stats(S, t), remaining = THUMUN.length - c.mem;
    let est = '', estNote = 'تقدير تقريبي يتغير مع معدّل حفظك.', estPct = c.mem / 480 * 100;
    if (!remaining) { est = 'أتممت حفظ المصحف'; estNote = 'تستمرّ المراجعة كما اعتدت.'; }
    else if (st.newLast30) { const months = Math.max(1, Math.round(remaining / (st.newLast30 / st.rateSpan) / 30)); est = 'نحو ' + (months > 24 ? yearsWord(Math.round(months / 12)) : monthsWord(months)); }
    const strA = ['strong', 'medium', 'weak'].map(k => `<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:500" class="num">${c[k]}</span><span style="display:flex;align-items:center;gap:4px;font-size:12px" class="t-2">${C.stateCell(k, 12)}${STATE_AR[k]}</span></span>`).join('');
    const strB = ['due', 'recent'].map(k => `<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:500" class="num">${c[k]}</span><span style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap" class="t-2">${C.stateCell(k, 12)}${STATE_AR[k]}</span></span>`).join('');
    return `<div class="page" style="gap:14px">
      <h1 class="h1" style="padding-bottom:4px">التقدّم</h1>
      <button class="hero deep" style="width:100%;text-align:right;padding:22px;gap:16px" data-a="go" data-v="progMem" data-tour="overview">
        <span style="display:flex;justify-content:space-between;width:100%;font-size:14px" class="t-on-2"><span>المحفوظ</span>${icon('caret-left', 18)}</span>
        <span class="metric"><span class="n" style="font-size:60px;letter-spacing:-1.5px">${c.mem}</span><span style="font-size:17px">ثُمناً محفوظاً</span></span>
        ${covGrid(snap, true)}
        <span style="display:flex;flex-direction:column;font-size:14px" class="t-on-2"><span style="color:var(--tx-on-strong);font-weight:500">${hizbFullWord(snap.fullHizb)}</span><span>${memLine2(snap)}</span></span></button>
      <button class="card" style="gap:14px" data-a="go" data-v="progAct"><span class="card-head" style="width:100%"><span class="k">النشاط</span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</span>
        <span class="t-title-m">${nAct ? `راجعت في ${daysWord(nAct).replace(/^يوم$/, 'يوم واحد')} من آخر 30 يوماً` : 'سيظهر نشاطك هنا بعد أول ورد.'}</span>
        <span class="days30">${act.map((a, i) => `<i class="${a.has ? (a.min >= 45 ? 'hi' : 'lo') : ''} ${i === 29 ? 'today' : ''}"></i>`).join('')}</span></button>
      <button class="card" style="gap:14px" data-a="go" data-v="progStr"><span class="card-head" style="width:100%"><span class="k">القوة</span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</span>
        ${has ? C.dist({ strong: c.strong, medium: c.medium, weak: c.weak, unknown: c.unknown }, 'h14') : '<span class="t-body-s" style="font-size:15px">تظهر قوة محفوظك بعد تحديده ومراجعته.</span>'}
        <span style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;width:100%">${strA}${strB}</span></button>
      <button class="card" style="gap:12px" data-a="go" data-v="weak" data-tour="weak"><span class="card-head" style="width:100%"><span class="k">مواضع الضعف</span><span style="display:flex;align-items:center;gap:4px;font-size:13px" class="t-brand">${weak.length ? placeWord(weak.length) : ''}${icon('caret-left', 18)}</span></span>
        ${weak.length ? weak.slice(0, 2).map(w => `<span style="display:flex;align-items:center;gap:12px;width:100%"><span style="width:8px;height:8px;border-radius:99px;background:var(--m-weak);flex:none"></span><span style="flex:1;display:flex;justify-content:space-between;gap:8px"><span class="t-title-s">${ayahName(w.g)}</span><span class="t-meta">${w.with != null ? 'اشتباه مع ' + ayahName(w.with) + ' · ' : ''}${errWord(w.n)}</span></span></span>`).join('') : '<span class="t-body-s" style="font-size:15px">لا توجد مواضع ضعف متكررة الآن</span>'}</button>
      ${recCard(recStats(S, t))}
      <div class="hero sage" style="border-radius:28px;padding:20px;gap:8px;box-shadow:none"><span class="t-meta t-2" style="font-size:14px">تقدير الختم</span>
        ${est ? `<span style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">${remaining ? '<span class="t-meta t-2" style="font-size:14px">بمعدّلك الحالي</span>' : ''}<span style="font-size:26px;font-weight:500">${est}</span></span><span class="track empty-bg"><span style="width:${estPct}%"></span></span><span class="t-meta t-2">${estNote}</span>`
          : '<span style="font-size:16px;text-wrap:pretty">نحتاج بعض الوقت لمعرفة معدّلك الفعلي. يظهر التقدير بعد أن تسجّل حفظاً جديداً.</span>'}</div>
      ${(() => { const ms = milestones(S, t), got = ms.filter(m => m.reached), nx = ms.find(m => !m.reached && m.kind !== 'check');
        return `<button class="card row" style="padding:16px 18px;border-radius:24px" data-a="go" data-v="progMs"><span class="icon-box">${icon('flag', 20)}</span><span class="tx"><span class="l">الإنجازات</span><span class="c">${got.length ? msText(got[got.length - 1].kind === 'check' && got.length > 1 ? got[got.length - 2] : got[got.length - 1])[0] : 'تظهر هنا محطات حفظك'}${nx ? ' · التالي: ' + msGoal(nx) : ''}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>`; })()}
      <div class="sec">${C.secH('آخر الجلسات', '', sess.length ? C.btn('السجل كاملاً', 'go', 'history', { kind: 'link', size: 'xs' }) : '')}
        ${sess.length ? sess.map(s => `<button class="card r22 row" style="padding:14px 16px" data-a="go" data-v="session:${s.day}:${s.kind}:${s.i}"><span class="tx"><span class="l" style="font-size:15px">${dateText(s.day)}</span><span style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px" class="t-2">${sessionLines(s).map(l => `<span>${l.range} · ${l.res}</span>`).join('')}</span></span><span class="end">≈ ${minutesWord(s.min || 1)}</span></button>`).join('')
          : '<div class="note subtle" style="border-radius:22px">سيظهر سجل مراجعاتك هنا بعد أول ورد.</div>'}</div></div>`;
  }
};

const ProgMemScreen = {
  title: 'المحفوظ',
  render(X) {
    const { snap } = X, c = snap.counts;
    const bars = Array.from({ length: 30 }, (_, k) => { const m = juzThumun(k + 1).filter(i => VM.isMem(snap.cells[i])).length; return `<span class="${m === 16 ? 'full' : m ? 'part' : ''}" style="height:${Math.max(4, m / 16 * 100)}%" title="الجزء ${k + 1}: ${m}/16"></span>`; }).join('');
    const fullSur = X.surahs().filter(s => s.pct === 100).length;
    return `<div class="page" style="gap:16px">
      <div class="card p24" style="gap:18px;border-radius:32px"><div style="display:flex;align-items:flex-end;justify-content:space-between"><span style="display:flex;flex-direction:column"><span class="metric"><span class="n" style="font-size:72px;letter-spacing:-2px">${c.mem}</span></span><span class="t-title-s" style="font-size:17px">ثُمناً محفوظاً</span></span><span style="font-size:28px;font-weight:300" class="t-2 num">${Math.round(c.mem / 480 * 100)}%</span></div>
        <div style="display:flex;flex-direction:column;font-size:15px"><span style="font-weight:500">${hizbFullWord(snap.fullHizb)}</span><span class="t-2">${memLine2(snap)}</span></div>
        ${covGrid(snap, false)}<div style="display:flex;justify-content:space-between;font-size:12px" class="t-3"><span>الفاتحة</span><span>كل عمود حزب · كل صف ثُمن</span><span>الناس</span></div></div>
      <div class="card" style="gap:12px"><span class="t-meta t-2" style="font-size:14px">بحسب الأجزاء</span><div class="juzbars">${bars}</div><div style="display:flex;justify-content:space-between;font-size:12px" class="t-3"><span>الجزء 1</span><span>الجزء 15</span><span>الجزء 30</span></div></div>
      <div class="grid3"><div class="tile"><b class="num">${snap.fullHizb}</b><span>حزباً كاملاً</span></div><div class="tile"><b class="num">${snap.fullJuz}</b><span>جزءاً كاملاً</span></div><div class="tile"><b class="num">${fullSur}</b><span>سورة كاملة</span></div></div></div>`;
  }
};

// «الإنجازات»: the ladder. Reached steps stay; nothing here counts consecutive days.
const ProgMsScreen = {
  title: 'الإنجازات',
  render(X) {
    const ms = milestones(X.S, X.t), nextId = (ms.find(m => !m.reached && m.kind !== 'check') || {}).id;
    const row = m => {
      const next = m.id === nextId || (m.kind === 'check' && !m.reached);
      const cap = m.reached ? (m.day ? 'بلغته ' + dateText(m.day, { day: 'numeric', month: 'long', year: 'numeric' }) : msText(m)[1])
        : m.kind === 'hizb' && next ? `${iso(m.have + ' / ' + m.n)} · بقي ${hizbWord(m.n - m.have)}` : m.kind === 'check' ? 'سمّع من حفظك ثم راجع تسجيلك آية بآية.' : '';
      return `<div class="ms-row ${m.reached ? 'on' : next ? 'next' : 'later'}"><span class="dot">${icon(m.reached ? 'check-bold' : m.kind === 'check' ? 'microphone' : 'flag', 18)}</span><span class="tx"><span class="l">${m.reached ? msText(m)[0] : msGoal(m)}</span>${cap ? `<span class="c">${cap}</span>` : ''}${!m.reached && next && m.kind === 'hizb' ? `<span class="track" style="margin-top:4px"><span style="width:${Math.round(m.have / m.n * 100)}%"></span></span>` : ''}</span></div>`;
    };
    return `<div class="page" style="gap:16px">
      <div class="lede">محطات على طريق الحفظ. ما بلغته يبقى لك، ولا يُحتسب هنا عدد الأيام المتتالية.</div>
      <div class="sec">${C.secH('الحفظ')}<div class="group">${ms.filter(m => m.kind !== 'check').map(row).join('')}</div></div>
      <div class="sec">${C.secH('التسميع')}<div class="group">${ms.filter(m => m.kind === 'check').map(row).join('')}</div></div></div>`;
  }
};

const ProgActScreen = {
  title: 'النشاط',
  render(X) {
    const { S, t } = X, act = VM.activity(S, t), n = act.filter(a => a.has).length;
    const lead = (dayDate(act[0].day).getUTCDay() + 1) % 7; // weeks start on Saturday
    const cells = [...Array.from({ length: lead }, () => '<i class="pad"></i>'), ...act.map((a, i) => `<i class="${a.has ? (a.min >= 45 ? 'hi' : 'lo') : ''} ${i === 29 ? 'today' : ''}" aria-label="${dateText(a.day)}${a.has ? ' · ≈ ' + minutesWord(a.min) : ' · لا نشاط'}">${dayDate(a.day).getUTCDate()}</i>`)];
    const total = act.reduce((s, a) => s + a.min, 0);
    return `<div class="page" style="gap:16px">
      <div class="card" style="padding:22px;gap:16px;border-radius:32px"><span class="t-title" style="text-wrap:pretty">${n ? `راجعت في ${daysWord(n).replace(/^يوم$/, 'يوم واحد')} من آخر 30 يوماً` : 'سيظهر نشاطك هنا بعد أول ورد.'}</span>
        <div class="cal">${['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map(d => `<span class="wd">${d}</span>`).join('')}${cells.join('')}</div>
        <div class="legend-dots t-2" style="font-size:12px"><span><i style="width:12px;height:12px;border-radius:4px;background:var(--m-strong)"></i>45 دقيقة فأكثر</span><span><i style="width:12px;height:12px;border-radius:4px;background:var(--m-medium)"></i>أقل من 45 دقيقة</span><span><i style="width:12px;height:12px;border-radius:4px;background:var(--m-empty)"></i>لا نشاط</span></div></div>
      <div class="grid2"><div class="tile"><span>متوسط الجلسة</span><b style="font-size:22px">${n ? '≈ ' + minutesWord(Math.round(total / n)) : '—'}</b></div><div class="tile"><span>مجموع الوقت</span><b style="font-size:18px;line-height:1.6">${total ? '≈ ' + durationText(total) : '—'}</b></div></div>
      <div class="foot-note">الأوقات تقديرية بحسب مقدار ما سُجّل. الأيام دون نشاط تبقى محايدة؛ التطبيق لا يحتسب أياماً متتالية ولا يعاقب على الانقطاع.</div></div>`;
  }
};

const ProgStrScreen = {
  title: 'القوة',
  render(X) {
    const c = X.snap.counts, tot = c.mem || 1;
    const row = k => C.row({ lead: C.stateCell(k, 16), label: `<span style="display:flex;justify-content:space-between"><span>${STATE_AR[k]}</span><span class="num">${c[k]}</span></span>`, sub: `<span class="track"><span class="k-${k === 'unknown' ? 'medium' : k}" style="width:${Math.max(c[k] ? 2 : 0, c[k] / tot * 100)}%;background:var(--k)"></span></span>`, a: 'memFilterGo', v: k === 'unknown' ? 'all' : k });
    return `<div class="page" style="gap:16px">${C.dist({ strong: c.strong, medium: c.medium, weak: c.weak, unknown: c.unknown }, 'h20')}
      <div class="sec">${C.secH('قوة الحفظ')}<div class="group">${['strong', 'medium', 'weak', ...(c.unknown ? ['unknown'] : [])].map(row).join('')}</div></div>
      <div class="sec">${C.secH('حالة المراجعة')}<div class="group">${['due', 'recent'].map(row).join('')}</div></div>
      <div class="foot-note">القوة تصف تمكّنك من المحفوظ، وحالة المراجعة تصف توقيتها. اضغط على أي صف لعرض المواضع المقصودة.</div></div>`;
  }
};

const HistoryScreen = {
  title: 'سجل الجلسات',
  render(X) {
    const list = VM.sessions(X.S), missed = backfillDays(X.S, X.t);
    const add = missed.length ? C.btn('سجّل ورد يوم فائت', 'missed', null, { kind: 'tonal', size: 's', icon: 'calendar-plus', iconSize: 18, full: true }) : '';
    if (!list.length) return `<div class="page">${C.empty(`<div style="display:flex;flex-direction:column;gap:6px;width:160px"><span style="height:10px;border-radius:99px;background:var(--m-empty)"></span><span style="height:10px;width:70%;border-radius:99px;background:var(--m-empty)"></span><span style="height:10px;width:45%;border-radius:99px;background:var(--m-empty)"></span></div>`, 'سيظهر سجل مراجعاتك هنا بعد أول ورد.', '')}</div>`;
    return `<div class="page">${add}${list.map(s => `<div class="sec" style="gap:8px"><div style="display:flex;gap:8px;align-items:baseline;padding:0 6px"><span class="t-title-s" style="font-size:15px">${dateText(s.day)}</span><span class="t-meta">${s.day === X.t ? 'اليوم' : s.day === X.t - 1 ? 'أمس' : ''}${s.kind === 'extra' ? (s.src === 'rec' ? ' · من تسجيل' : ' · مراجعة أخرى') : ''}</span></div>
      <button class="card r24 p18" data-a="go" data-v="session:${s.day}:${s.kind}:${s.i}">${sessionLines(s).map(l => `<span style="display:flex;justify-content:space-between;gap:10px;width:100%"><span style="display:flex;flex-direction:column"><span class="t-cap">${l.label}</span><span class="t-title-s">${l.range}</span></span><span class="t-2" style="font-size:14px;align-self:flex-end">${l.res}</span></span>`).join('')}
        <span style="display:flex;justify-content:space-between;width:100%;padding-top:10px;border-top:1px solid var(--bd-1);font-size:13px" class="t-2"><span>مصدر التحقق · ${s.teacher ? 'على شيخ' : 'ذاتي'}</span><span>≈ ${minutesWord(s.min || 1)}</span></span></button></div>`).join('')}</div>`;
  }
};

const SessionScreen = {
  title: 'تفاصيل الجلسة',
  render(X, day, kind, idx) {
    const list = VM.sessions(X.S);
    const s = idx != null && idx !== '' ? list.find(z => z.i === +idx) : list.find(z => z.day === +day && z.kind === kind);
    if (!s) return `<div class="page"><div class="note subtle">لم تعد هذه الجلسة موجودة.</div></div>`;
    const TYPE = { forget: 'نسيان', hesitate: 'تردّد', confuse: 'اشتباه' };
    const canEdit = s.kind === 'daily' && s.day === X.t && canEditToday(X.S, X.t);
    return `<div class="page" style="gap:16px">
      <div class="hero mint" style="gap:4px"><span style="font-size:26px;font-weight:500">${dateText(s.day)}</span><span class="t-meta t-2" style="font-size:14px">≈ ${minutesWord(s.min || 1)} · مصدر التحقق: ${s.teacher ? 'على شيخ' : 'ذاتي'}${s.kind === 'extra' ? (s.src === 'rec' ? ' · من تسجيل' : ' · مراجعة أخرى') : ''}</span></div>
      ${sessionLines(s).map(l => `<div class="card r24 p18" style="gap:10px"><span class="t-cap">${l.label}</span><span style="display:flex;flex-direction:column"><span class="t-title-m">${l.full}</span><span class="t-meta">${l.meta}</span></span><span style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag sunken">الإنجاز: ${l.comp}</span>${l.q ? C.statusChip(l.q, 'التقييم: ' + ['متقن', 'متوسط', 'ضعيف'][['strong', 'medium', 'weak'].indexOf(l.q)]) : ''}</span></div>`).join('')}
      <div class="sec" style="gap:8px">${C.secH('الأخطاء المسجّلة')}${s.errs.length ? `<div class="group">${s.errs.map(e => `<div class="row" style="min-height:52px;font-size:15px"><span style="width:8px;height:8px;border-radius:99px;background:var(--m-weak)"></span>${ayahName(e.g)}${e.type ? ' · ' + TYPE[e.type] : ''}${e.confused != null ? ' مع ' + ayahName(e.confused) : ''}</div>`).join('')}</div>` : '<div class="note subtle" style="border-radius:22px">لم تُسجَّل أخطاء في هذه الجلسة.</div>'}</div>
      ${canEdit ? C.btn('عدّل تسجيل اليوم', 'editToday', null, { kind: 'tonal', full: true, icon: 'pencil-simple' }) : ''}</div>`;
  }
};
