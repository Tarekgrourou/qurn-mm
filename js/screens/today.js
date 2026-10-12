// Today (اليوم): an action screen first. The plan comes from the engine; this only presents it.
'use strict';

const TodayScreen = {
  render(X) {
    const { S, t, p, snap } = X;
    const hasMem = snap.counts.mem > 0;
    const parts = [];

    if (p.done) return TodayScreen.done(X);

    // Nothing to do at all: nothing memorized and new memorization paused.
    if (!hasMem && !p.newItem) {
      parts.push(`<div class="title-row" style="flex-direction:column;align-items:flex-start;gap:4px;padding:12px 6px 0"><span class="t-meta">اليوم</span><span class="t-title-l" style="font-size:26px">${dateText(t)}</span></div>`);
      parts.push(C.empty(C.emptyArt(8, 22, 4, 3), 'لم تحدد محفوظاً بعد', 'حدّد ما تحفظه ليرتّب التطبيق وردك اليومي من المراجعة والحفظ الجديد.', C.btn('حدّد محفوظك', 'editMem', null, { size: '' })));
      return `<div class="page loose">${parts.join('')}</div>`;
    }

    if (p.allMemorized) parts.push(TodayScreen.completeHero(X));
    else if (p.returning) parts.push(TodayScreen.absenceHero(X));
    else parts.push(TodayScreen.summaryHero(X));

    const missed = backfillDays(S, t);
    if (missed.length) parts.push(C.infoCard('calendar-plus', missed.length === 1 && missed[0] === t - 1 ? 'لم تسجّل ورد أمس؟' : 'أيام لم تسجّل وردها',
      'إن كنت قرأته ونسيت تسجيله، سجّله الآن ليبقى جدول المراجعة دقيقاً.', C.btn(missed.length === 1 ? 'سجّل ورد ' + dateText(missed[0], { weekday: 'long' }) : 'اختر اليوم', 'missed', null, { kind: 'tonal', size: 's' })));
    if (p.catchup) parts.push(TodayScreen.catchupCard(X));
    else if (p.pressure && !X.ui.pressureOff && !p.returning) parts.push(TodayScreen.pressure(X));

    // New memorization
    if (p.newItem) {
      if (p.returning && !X.ui.showNew) {
        parts.push(`<button class="row card subtle" style="border-radius:24px;padding:16px 20px" data-a="toggleNew">${icon('plant', 22).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l" style="font-size:15px">الحفظ الجديد اختياري اليوم</span><span class="c">${shortRange(p.newItem.from, p.newItem.to)} · ابدأ بالمراجعة أولاً</span></span>${icon('caret-down', 20).replace('class="ic"', 'class="ic chev"')}</button>`);
      } else parts.push(TodayScreen.newSection(X));
    } else if (p.newPaused) {
      parts.push(`<div class="sec">${C.secH('الحفظ الجديد')}<button class="card subtle row" style="border-radius:24px" data-a="go" data-v="setNew">${icon('pause-circle', 22).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l" style="font-size:15px">الحفظ الجديد متوقف مؤقتاً</span><span class="c">تبقى المراجعة كما هي · غيّر ذلك من مقدار الحفظ</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button></div>`);
    }

    // Recent (القريب)
    if (p.recent.length) {
      const min = p.recent.reduce((s, x) => s + x.min, 0);
      parts.push(`<div class="sec">${C.secH('القريب', '≈ ' + minutesWord(min))}${p.recent.map(it => TodayScreen.itemCard(X, it, false)).join('')}</div>`);
    }

    // Review (المراجعة)
    if (p.review.length) {
      const min = p.review.reduce((s, x) => s + x.min, 0);
      const tip = X.tipOn('reason') ? C.tip('reason', 'تعرض هذه العبارة سبب اختيار الموضع للمراجعة.') : '';
      parts.push(`<div class="sec">${tip}${C.secH('المراجعة', segWord(p.review.length) + ' · ≈ ' + durationText(min))}${p.review.map((it, i) => TodayScreen.itemCard(X, it, true, i)).join('')}</div>`);
    } else if (hasMem) {
      parts.push(`<div class="sec">${C.secH('المراجعة')}<div class="card" style="padding:22px 20px;gap:6px"><span class="t-title-m">لا مراجعة مستحقة اليوم</span><span class="t-body-s">محفوظك كله ضمن مواعيده. يمكنك تسجيل مراجعة إضافية إن أردت.</span></div></div>`);
    } else {
      parts.push(`<div class="sec">${C.secH('المراجعة')}<div class="card" style="padding:22px 20px;gap:8px"><span class="t-title-m">تبدأ المراجعة بعد أول حفظ تسجّله</span><span class="t-body-s">أو حدّد ما تحفظه من قبل ليُضاف إلى المراجعة.</span>${C.btn('حدّد محفوظك', 'editMem', null, { kind: 'tonal', size: 's' }).replace('class="btn', 'style="align-self:flex-start" class="btn')}</div></div>`);
    }
    parts.push(recSuggestions(X));
    return `<div class="page loose">${parts.join('')}</div>`;
  },

  // Hero: today's date, total minutes and how they split (new · recent · review).
  summaryHero(X) {
    const { t, p } = X;
    const nm = p.newItem ? p.newItem.min : 0, rm = p.recent.reduce((s, x) => s + x.min, 0), vm = p.review.reduce((s, x) => s + x.min, 0);
    return `<div class="hero deep has-aurora" data-tour="summary">${C.aurora('deep')}
      <div style="display:flex;flex-direction:column;gap:2px"><span class="t-on-2" style="font-size:14px">اليوم</span><span style="font-size:26px;font-weight:500;line-height:1.35">${dateText(t)}</span></div>
      <div class="metric"><span class="t-on-2" style="font-size:16px">نحو</span><span class="n" style="font-size:60px">${Math.round(p.total)}</span><span style="font-size:18px">${p.total > 10 ? 'دقيقة' : 'دقائق'}</span></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="split3">${nm ? `<span style="flex:${nm};background:var(--tx-on-strong)"></span>` : ''}${rm ? `<span style="flex:${rm};background:var(--tx-on-strong-2)"></span>` : ''}${vm ? `<span style="flex:${vm};background:color-mix(in oklab,var(--tx-on-strong) 28%,transparent)"></span>` : ''}</div>
        <div class="legend-dots t-on-2"><span><i style="background:var(--tx-on-strong)"></i>حفظ جديد ${nm}</span><span><i style="background:var(--tx-on-strong-2)"></i>قريب ${rm}</span><span><i style="background:color-mix(in oklab,var(--tx-on-strong) 28%,transparent)"></i>مراجعة ${vm}</span></div>
      </div></div>`;
  },
  absenceHero(X) {
    const { t, p } = X;
    const total = p.total - (p.newItem && !X.ui.showNew ? p.newItem.min : 0);
    return `<div class="hero mint" data-tour="summary"><span class="icon-box l" style="background:var(--surface)">${icon('hand-waving', 26)}</span>
      <div style="font-size:28px;font-weight:500;line-height:1.3">مرحباً بعودتك</div>
      <div class="t-body">رتّبنا المراجعة بحسب الأهم دون إضافة ما فاتك.</div>
      <div class="t-meta t-2" style="display:flex;gap:8px"><span>${dateText(t)}</span><span>·</span><span>نحو ${durationText(total)}</span></div>
      ${p.pressure && !p.catchup ? `<div class="btn-row wrap">${C.btn('رتّب خطة تعويض', 'catchupSheet', null, { kind: 'on-surface', size: 's', icon: 'calendar-blank', iconSize: 18 })}</div><span class="t-cap">لديك ${thumunWord(p.dueTotal)} مستحقة. وزّعها على أيام قليلة بدل يوم واحد.</span>` : ''}</div>`;
  },
  completeHero(X) {
    return `<div class="hero deep"><div class="cov">${THUMUN.map(() => '<i class="on"></i>').join('')}</div>
      <div style="display:flex;flex-direction:column;gap:6px"><div style="font-size:28px;font-weight:500;line-height:1.35">أتممت حفظ القرآن الكريم</div><div class="t-on-2">يبقى ورد المراجعة لتثبيت المحفوظ.</div></div>
      <div class="t-on-2" style="display:flex;gap:20px;font-size:14px"><span>480 ثُمناً</span><span>60 حزباً</span><span>114 سورة</span></div></div>`;
  },
  // More is due than the daily amount: offer choices, never pressure.
  pressure(X) {
    return `<div class="hero lav" style="border-radius:28px;padding:20px;gap:12px;box-shadow:none">
      <div style="display:flex;align-items:flex-start;gap:12px"><span class="icon-box lav">${icon('hourglass-medium', 20)}</span><span style="display:flex;flex-direction:column"><span style="font-size:17px;font-weight:500">المراجعة تحتاج وقتاً أكثر هذه الفترة</span><span class="t-body-s">توجد مواد مستحقة أكثر من مقدارك اليومي المعتاد (${thumunWord(X.p.dueTotal)}). رتّبناها بحسب الأهم.</span></span></div>
      <div class="btn-row wrap">${C.btn('خطة تعويض', 'catchupSheet', null, { kind: 'on-surface', size: 's' })}${C.btn('زيادة المراجعة', 'go', 'setRev', { kind: 'on-surface', size: 's' })}${X.S.settings.newAmount > 0.5 ? C.btn('تخفيف الحفظ', 'lighterNew', null, { kind: 'on-surface', size: 's' }) : ''}${C.btn('ليس الآن', 'pressureOff', null, { kind: 'ghost', size: 's' })}</div></div>`;
  },

  // A catch-up plan is running: where it stands, and a way to stop it.
  catchupCard(X) {
    const c = X.p.catchup, n = X.p.review.reduce((s, r) => s + r.ids.length, 0);
    return C.infoCard('calendar-blank', `خطة التعويض · اليوم ${iso(c.dayN + ' / ' + c.days)}`,
      `مراجعة اليوم ${thumunWord(n)} حتى يخفّ المستحق${c.pauseNew ? '، والحفظ الجديد متوقف خلالها' : ''}. تنتهي الخطة وحدها.`,
      C.btn('إيقاف الخطة', 'catchupStop', null, { kind: 'ghost', size: 's' }), 'lav-soft');
  },

  newSection(X) {
    const it = X.p.newItem, T0 = THUMUN[it.ids[0]], T1 = THUMUN[it.ids[it.ids.length - 1]];
    const counter = X.S.counter && X.S.counter.day === X.t ? X.S.counter.n : 0;
    return `<div class="sec">${C.secH('الحفظ الجديد', '≈ ' + minutesWord(it.min))}
      <div class="card" data-tour="range">
        <div class="card-head"><span class="t-meta">${thumunMetaDual(it.ids)} · ${pagesText(it.from, it.to)}</span>${C.hizbStrip(X.snap, T0.hizb, T0.k, T1.k)}</div>
        <div class="t-title-l">${C.range(it.from, it.to)}</div>${C.noteLine(X.S, it.ids)}${C.kbLine(X.S, it.from, it.to)}
        ${it.link ? `<div class="inset-panel" style="flex-direction:row;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;font-size:14px;color:var(--tx-2)">${icon('link-simple', 18).replace('class="ic"', 'class="ic t-brand"')}<span>${it.link.side === 'before' ? 'اربطه بما قبله' : 'اربطه بما بعده'} · ${it.link.from === it.link.to ? ayahName(it.link.from) : shortRange(it.link.from, it.link.to)}</span></div>` : ''}
        <button class="row" style="border-radius:16px;min-height:52px;padding:8px 12px;background:var(--surface-subtle)" data-a="go" data-v="counter">${icon('hand-tap', 20).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l" style="font-size:14px">عدّاد التكرار</span></span><span class="end num">${counter ? counter + ' من ' + X.S.settings.repTarget : 'لم تبدأ'}</span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>
      </div></div>`;
  },

  // A recent or review item: hizb strip, range, minutes, and the reason (review only).
  itemCard(X, it, isReview, i) {
    const T0 = THUMUN[it.ids[0]], T1 = THUMUN[it.ids[it.ids.length - 1]];
    const head = `<div class="card-head"><span class="t-meta">${thumunMetaDual(it.ids)} · ${pagesText(it.from, it.to)}</span>${C.hizbStrip(X.snap, T0.hizb, T0.k, T1.k)}</div>`;
    if (!isReview) {
      return `<div class="card" style="gap:10px">${head}<div class="t-title">${C.range(it.from, it.to)}</div>${C.noteLine(X.S, it.ids)}${C.kbLine(X.S, it.from, it.to)}${C.statusChip('recent', it.reason.text)}</div>`;
    }
    const r = it.reason, key = r.weak ? 'weak' : 'due';
    return `<div class="card" style="gap:10px">${head}
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px"><span class="t-title">${C.range(it.from, it.to)}</span><span class="t-meta" style="white-space:nowrap">≈ ${minutesWord(it.min)}</span></div>${C.noteLine(X.S, it.ids)}${C.kbLine(X.S, it.from, it.to)}
      <button class="row" style="align-self:flex-start;width:auto;min-height:48px;padding:0 12px 0 14px;border-radius:14px;background:var(--surface-subtle);font-size:14px;color:var(--tx-2);gap:8px" data-a="reasonSheet" data-v="${i}" ${i === 0 ? 'data-tour="reason"' : ''} aria-label="سبب المراجعة">${C.stateCell(key, 12)}${r.text}${icon('info', 16).replace('class="ic"', 'class="ic t-3"')}</button></div>`;
  },

  // After saving today's wird: a calm summary, one follow-up, and what comes next.
  done(X) {
    const { S, t } = X;
    const todays = S.sessions.filter(s => s.day === t);
    const daily = todays.find(s => s.kind === 'daily');
    const all = todays.flatMap(s => s.entries);
    const newE = all.filter(e => e.kind === 'new' && e.status !== 2);
    const revE = all.filter(e => e.kind !== 'new' && e.status !== 2);
    const recE = all.filter(e => e.kind === 'recent' && e.status !== 2);
    const revN = revE.reduce((n, e) => n + e.ids.length, 0);
    const min = todays.reduce((m, s) => m + entriesMinutes(s.entries), 0);
    const weakE = all.find(e => e.kind !== 'new' && e.rating === 2);
    const parts = [];
    parts.push(`<div class="hero mint has-aurora" style="gap:18px">${C.aurora('mint')}<div style="display:flex;align-items:center;gap:14px"><span class="icon-box xl solid">${icon('check-bold', 26)}</span>
      <div style="display:flex;flex-direction:column"><span style="font-size:24px;font-weight:500;line-height:1.35">تم تسجيل ورد اليوم</span><span class="t-meta t-2">${dateText(t)} · ≈ ${minutesWord(min || 1)}</span></div></div>
      <div class="grid2">
        <div class="tile" style="box-shadow:none;border-radius:20px;padding:14px 16px;gap:2px"><span class="t-meta">الحفظ الجديد</span><span style="font-size:20px;font-weight:500">${newE.length ? (newE[0].status === 0 ? 'حُفظ' : 'حُفظ بعضه') : 'لا حفظ اليوم'}</span><span class="t-meta t-2">${newE.length ? shortRange(newE[0].from, newE[0].status === 0 ? newE[0].to : newE[0].lastAyah) : '—'}</span></div>
        <div class="tile" style="box-shadow:none;border-radius:20px;padding:14px 16px;gap:2px"><span class="t-meta">المراجعة</span><span style="font-size:20px;font-weight:500">${revN ? thumunWord(revN) : 'لا مراجعة'}</span><span class="t-meta t-2">${recE.length ? 'والقريب: ' + shortRange(recE[0].from, recE[0].to) : '—'}</span></div>
      </div></div>`);
    if (weakE) {
      const T0 = THUMUN[weakE.ids[0]];
      parts.push(`<div class="sec">${C.secH('موضع يحتاج متابعة')}<button class="card row" style="padding:18px 20px;border-radius:24px" data-a="go" data-v="hizb:${T0.hizb}:${T0.k}"><span class="icon-box l clay">${icon('warning-diamond', 22)}</span><span class="tx"><span class="l" style="font-size:18px">${shortRange(weakE.from, weakE.to)}</span><span class="c">${thumunMetaDual(weakE.ids)} · تقييمك: ضعيف</span></span>${icon('caret-left', 20).replace('class="ic"', 'class="ic chev"')}</button></div>`);
    }
    if (backupDue(S, t)) {
      parts.push(`<div class="card subtle" style="border-radius:24px;gap:8px"><div style="display:flex;gap:10px;align-items:flex-start">${icon('archive', 22).replace('class="ic"', 'class="ic t-brand"')}<span style="display:flex;flex-direction:column;gap:2px"><span class="t-title-s">${S.lastExport == null ? 'لم تحفظ نسخة من سجلّك بعد' : 'مضى شهر على آخر نسخة'}</span><span class="t-body-s">سجلّك كله على هذا الجهاز وحده. نسخة في ملف تحفظه من الضياع إن فقدت الجهاز.</span></span></div><div class="btn-row">${C.btn('صدّر نسخة', 'export', null, { kind: 'tonal', size: 's' })}${C.btn('لاحقاً', 'snoozeBackup', null, { kind: 'ghost', size: 's' })}</div></div>`);
    }
    parts.push(recSuggestions(X));
    parts.push(`<div class="btn-row">${C.btn('سجّل مراجعة أخرى', 'extraSheet', null, { kind: 'tonal', flex: true })}${daily ? C.btn('عرض الجلسة', 'go', 'session:' + daily.day + ':daily', { kind: 'outline', flex: true }) : ''}</div>`);
    parts.push(`<div class="t-meta" style="text-align:center;padding:4px 0">وردك التالي غداً بعد ${timeText(S.settings.dayStart)}.</div>`);
    return `<div class="page loose">${parts.join('')}</div>`;
  }
};

// Repetition counter for today's new portion: the whole area is one tap target.
const CounterScreen = {
  title: 'عدّاد التكرار',
  render(X) {
    const { S, t, p } = X, n = S.counter && S.counter.day === t ? S.counter.n : 0, target = S.settings.repTarget, done = n >= target;
    const it = p.newItem;
    return `<div class="page" style="gap:16px">
      ${it ? `<div class="lede">${rangeText(it.from, it.to)} · ${pagesText(it.from, it.to)}</div>` : ''}
      <button class="tapper ${done ? 'done' : ''}" data-a="count" aria-label="تكرار، العدد ${n} من ${target}">
        <span class="big">${n}</span><span style="font-size:18px" class="${done ? 't-on-2' : 't-2'}">${done ? 'أتممت ' + counted(target, 'تكراراً واحداً', 'تكرارين', 'تكرارات', 'تكراراً') : 'من ' + target}</span>
        <span class="track" style="width:60%;${done ? 'background:rgba(255,255,255,.15)' : ''}"><span style="width:${Math.min(100, n / target * 100)}%;${done ? 'background:var(--tx-on-strong)' : ''}"></span></span>
        <span class="t-cap" style="margin-top:12px">اضغط في أي مكان بعد كل قراءة</span></button>
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px">${C.btn('تصفير', 'countReset', null, { kind: 'ghost', icon: 'arrow-counter-clockwise', size: 's', disabled: !n })}<span style="display:flex;align-items:center;gap:10px"><span class="t-meta">الهدف</span>${C.stepperSmall(target, 'countTarget', 5, 100)}</span></div></div>`;
  }
};
