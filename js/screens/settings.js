// Settings (الإعدادات): meaningful choices only, grouped, with progressive sub-pages.
'use strict';

const NEW_LABEL = { 0.5: 'نصف ثُمن كل يوم', 1: 'ثُمن كل يوم', 2: 'ثُمنان كل يوم', 0: 'متوقف مؤقتاً' };
const THEME_LABEL = { system: 'بحسب الجهاز', light: 'فاتح', dark: 'داكن' };
const SIZE_LABEL = { small: 'صغير', default: 'افتراضي', large: 'كبير', xl: 'كبير جداً' };
const DENS_LABEL = { compact: 'مضغوطة', comfortable: 'مريحة' };
const COL_LABEL = { default: 'افتراضية', hc: 'تباين عالٍ', cvd: 'مناسبة لصعوبة تمييز الألوان' };
const revMinutes = n => Math.round(n * MIN_REVIEW);

const SetScreen = {
  render(X) {
    const st = X.S.settings;
    const g = (title, rows, tour) => `<div class="sec" style="gap:8px"${tour ? ` data-tour="${tour}"` : ''}>${C.secH(title)}<div class="group">${rows.map(r => C.row({ ...r, cls: 'set' })).join('')}</div></div>`;
    const lastExp = X.S.lastExport != null ? 'آخر نسخة ' + agoText(X.t - X.S.lastExport) : 'لم تُصدَّر نسخة بعد';
    return `<div class="page">
      <h1 class="h1">الإعدادات</h1>
      <div class="note subtle row-note" style="color:var(--tx-2)">${icon('lock-simple', 20).replace('class="ic"', 'class="ic t-brand"')}بياناتك على جهازك فقط · دون حساب ودون مزامنة</div>
      ${g('الورد اليومي', [
        { icon: 'plant', label: 'مقدار الحفظ', sub: NEW_LABEL[st.newAmount], a: 'go', v: 'setNew' },
        { icon: 'repeat', label: 'طريقة المراجعة', sub: st.reviewMode === 'cycle' ? 'دورة كل ' + daysWord(st.cycleDays) : 'بحسب قوة الحفظ', a: 'go', v: 'setMode' },
        ...(st.reviewMode === 'cycle' ? [] : [{ icon: 'arrows-clockwise', label: 'مقدار المراجعة', sub: `${thumunWord(st.reviewAmount)} · نحو ${minutesWord(revMinutes(st.reviewAmount))}`, a: 'go', v: 'setRev' }]),
        { icon: 'bell', label: 'وقت التذكير', sub: st.reminderOn ? timeText(st.reminderTime) : 'متوقف', a: 'go', v: 'setRem' }], 'plan')}
      ${g('الحفظ', [{ icon: st.direction === 'bwd' ? 'arrow-up' : 'arrow-down', label: 'اتجاه الحفظ', sub: st.direction === 'bwd' ? 'من الناس صعوداً' : 'من البقرة نزولاً', a: 'go', v: 'setAdv' },
        { icon: 'pencil-simple', label: 'تعديل المحفوظ', sub: 'أضف أو أزل ما تحفظه', a: 'editMem', v: '' }])}
      ${g('العرض', [
        { icon: 'circle-half', label: 'المظهر', sub: THEME_LABEL[st.theme], a: 'go', v: 'setDisp' },
        { icon: 'text-aa', label: 'حجم النص', sub: SIZE_LABEL[st.textSize], a: 'go', v: 'setDisp' },
        { icon: 'rows', label: 'كثافة الواجهة', sub: DENS_LABEL[st.density], a: 'go', v: 'setDisp' },
        { icon: 'palette', label: 'ألوان الحالات', sub: COL_LABEL[st.stateColors], a: 'go', v: 'setDisp' }])}
      ${g('البيانات', [{ icon: 'archive', label: 'التصدير والاستيراد', sub: lastExp, a: 'go', v: 'setData' }, { icon: 'file-text', label: 'تقرير للمعلّم', a: 'go', v: 'setTeacher' }])}
      ${g('المساعدة', [
        { icon: 'compass', label: 'دليل الاستخدام', a: 'go', v: 'guide' },
        { icon: 'book-open', label: 'عن القرآن', sub: 'البنية والمقاصد والمتشابهات', a: 'go', v: 'know' },
        { icon: 'question', label: 'كيف تعمل المراجعة؟', a: 'go', v: 'howReview' },
        { icon: 'squares-four', label: 'معاني الحالات', a: 'go', v: 'legend' },
        { icon: 'shield-check', label: 'الخصوصية والبيانات', a: 'go', v: 'privacy' },
        { icon: 'play-circle', label: 'إعادة الجولة', sub: 'جولة قصيرة في أقسام التطبيق', a: 'tourStart' }])}
      ${g('متقدّم', [{ icon: 'clock-countdown', label: 'بداية اليوم', sub: timeText(st.dayStart), a: 'go', v: 'setAdv' }])}
      <div class="app-foot">${C.brandMark(30)}<span style="font-size:17px;font-weight:500;color:var(--tx-2)">${BRAND}</span><span class="latin num">${APP_VERSION}</span><span>ورش عن نافع من طريق الأزرق · المصحف المحمدي</span></div></div>`;
  }
};

const SetNewScreen = {
  title: 'مقدار الحفظ',
  render(X) {
    const cur = X.S.settings.newAmount;
    const next = nextNew({ ...X.S, settings: { ...X.S.settings, newAmount: cur || 1 } });
    const remaining = THUMUN.length - X.snap.counts.mem, est = finishEstimate(remaining, cur, X.t);
    return `<div class="page tight"><div class="lede" style="padding-bottom:6px">كم تحفظ من الجديد كل يوم؟ يُضاف المقدار التالي بحسب اتجاه حفظك.</div>
      ${[[0.5, 'نصف ثُمن', '≈ 6 دقائق يومياً'], [1, 'ثُمن', '≈ 12 دقيقة يومياً'], [2, 'ثُمنان', '≈ 24 دقيقة يومياً'], [0, 'إيقاف الحفظ الجديد مؤقتاً', 'تبقى المراجعة كما هي']].map(([v, l, s]) => C.radioRow(l, s, 'setNewAmt', v, cur === v)).join('')}
      ${next ? `<div class="inset-panel" style="margin-top:8px"><span class="t-meta">الحفظ التالي</span><span class="t-title-s">${rangeText(next.from, next.to)}</span><span class="t-cap">${thumunMetaDual(next.ids)} · ${pagesText(next.from, next.to)}</span></div>` : ''}
      ${est && remaining ? `<div class="inset-panel"><span class="t-meta">إن استمررت هكذا تختم في</span><span class="t-title-s">${dateText(est.day, { month: 'long', year: 'numeric' })}</span><span class="t-cap">بقي ${thumunWord(remaining)} · نحو ${spanWord(est.days)}. تقدير تقريبي.</span></div>` : ''}</div>`;
  }
};

const SetRevScreen = {
  title: 'مقدار المراجعة',
  render(X) {
    const n = X.S.settings.reviewAmount, mem = X.snap.counts.mem, sug = Math.min(24, Math.max(2, Math.round(mem / 30)));
    return `<div class="page" style="gap:16px">
      <div class="card p24" style="align-items:center;gap:16px;border-radius:32px">
        <div class="stepper-big">${C.iconBtn('plus-bold', 'setRevAmt', n + 1, 'زيادة', { disabled: n >= 24 })}<div class="v"><b class="num">${n}</b><span>${n <= 10 ? 'أثمان يومياً' : 'ثُمناً يومياً'}</span></div>${C.iconBtn('minus-bold', 'setRevAmt', n - 1, 'إنقاص', { disabled: n <= 2 })}</div>
        <span class="t-title-s" style="font-size:17px">نحو ${minutesWord(revMinutes(n))}</span>
        <div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px;width:100%">${Array.from({ length: 24 }, (_, k) => `<span style="aspect-ratio:1;border-radius:5px;background:${k < n ? 'var(--m-strong)' : 'var(--m-empty)'};transition:background 160ms"></span>`).join('')}</div></div>
      <div class="picks">${[4, 6, 8, 12, 16].map(v => `<button class="chip-btn solid ${v === n ? 'on' : ''}" style="flex:1" data-a="setRevAmt" data-v="${v}">${v}</button>`).join('')}</div>
      ${mem ? `<div class="note info">المقترح: ${thumunWord(sug)} لمحفوظ بحجم ${thumunWord(mem)}، فيمرّ المحفوظ كله على المراجعة في نحو شهر.</div>` : ''}
      ${plan(X.S, X.t).done ? '<div class="foot-note">سُجّل ورد اليوم، فيبدأ المقدار الجديد من الغد.</div>' : '<div class="foot-note">لم يُسجَّل ورد اليوم بعد، فيُعاد ترتيبه بالمقدار الجديد.</div>'}</div>`;
  }
};

const SetModeScreen = {
  title: 'طريقة المراجعة',
  render(X) {
    const st = X.S.settings, mem = X.snap.counts.mem, per = Math.ceil(mem / st.cycleDays);
    return `<div class="page tight"><div class="lede" style="padding-bottom:6px">كيف يختار التطبيق ما تراجعه كل يوم؟</div>
      ${C.radioRow('بحسب قوة الحفظ', 'يعود الضعيف سريعاً، ويتباعد القوي. مقدار يومي ثابت.', 'setReviewMode', 'adaptive', st.reviewMode !== 'cycle')}
      ${C.radioRow('دورة ثابتة', 'يمرّ محفوظك كله في عدد أيام تحدّده، ويُضاف إليه الضعيف.', 'setReviewMode', 'cycle', st.reviewMode === 'cycle')}
      ${st.reviewMode === 'cycle' ? `<div class="card" style="flex-direction:row;align-items:center;gap:12px;margin-top:8px"><span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s">طول الدورة</span><span class="t-meta">${daysWord(st.cycleDays).replace(/^يوم$/, 'يوم واحد')}${mem ? ' · نحو ' + thumunWord(per) + ' يومياً' : ''}</span></span>${C.stepperSmall(st.cycleDays, 'cycleStep', 3, 60)}</div>` : ''}</div>`;
  }
};

const SetRemScreen = {
  title: 'التذكير',
  render(X) {
    const st = X.S.settings, [time, ampm] = (() => { const s = timeText(st.reminderTime).split(' '); return [s[0], s.slice(1).join(' ')]; })();
    const presets = ['04:30', '05:00', '05:30', '06:00', '06:30', '21:00'];
    return `<div class="page" style="gap:16px">
      <div class="card r24 p18" style="flex-direction:row;align-items:center;gap:14px"><span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s">تذكير يومي</span><span class="t-meta">إشعار واحد في اليوم، دون إلحاح</span></span>${C.switch(st.reminderOn, 'toggleReminder', null, 'تذكير يومي')}</div>
      <div style="display:flex;flex-direction:column;gap:16px;transition:opacity 200ms;${st.reminderOn ? '' : 'opacity:.4;pointer-events:none'}">
        <div class="hero mint" style="padding:28px;align-items:center;gap:4px"><span style="font-size:72px;font-weight:300;line-height:1;direction:ltr" class="num">${time}</span><span class="t-2" style="font-size:17px">${ampm}</span></div>
        <div class="chips">${presets.map(p => `<button class="chip-btn ${st.reminderTime === p ? 'on' : ''}" data-a="setReminderTime" data-v="${p}">${timeText(p)}</button>`).join('')}<button class="chip-btn ${presets.includes(st.reminderTime) ? '' : 'on'}" data-a="sheet" data-v="time:reminder">وقت آخر…</button></div></div>
      <div class="foot-note">${Reminder.note()}</div></div>`;
  }
};

const SetDispScreen = {
  title: 'العرض وإمكانية الوصول',
  render(X) {
    const st = X.S.settings;
    const prev = ['strong', 'medium', 'weak', 'recent', 'due', 'none'].map(k => `<span style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;line-height:1.3;text-align:center" class="t-2">${C.stateCell(k, 28)}${STATE_AR[k]}</span>`).join('');
    const block = (title, inner) => `<div class="sec" style="gap:8px">${C.secH(title)}${inner}</div>`;
    return `<div class="page">
      <div class="card" style="gap:12px;padding:18px"><span class="t-meta">معاينة</span><span class="t-title-m">${rangeText(toG(10, 37), toG(10, 60))}</span><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">${prev}</div></div>
      ${block('المظهر', C.seg('setTheme', [['system', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']], st.theme, { h44: true }))}
      ${block('حجم النص', C.seg('setTextSize', [['small', 'صغير'], ['default', 'افتراضي'], ['large', 'كبير'], ['xl', 'كبير جداً']], st.textSize, { h44: true }))}
      ${block('كثافة الواجهة', C.seg('setDensity', [['compact', 'مضغوط'], ['comfortable', 'مريح']], st.density, { h44: true }))}
      ${block('ألوان الحالات', [['default', 'افتراضي', 'تعبئة وعلامات بألوان الهوية'], ['hc', 'تباين عالٍ', 'حدود واضحة لكل خلية'], ['cvd', 'مناسب لصعوبة تمييز الألوان', 'يعتمد على النقش والعلامة قبل اللون']].map(([v, l, s]) => C.radioRow(l, s, 'setStateColors', v, st.stateColors === v)).join(''))}
      ${block('الحركة', C.seg('setMotion', [['default', 'افتراضي'], ['reduced', 'تقليل الحركة']], st.motion, { h44: true }))}
      <div class="foot-note">تُعرض الأرقام دائماً بالشكل 0 1 2 3 4 5 6 7 8 9.</div></div>`;
  }
};

// «تسجيلات تلاوتك»: how much space the audio takes, and an optional rule to free it.
const SetRecScreen = {
  title: 'تسجيلات تلاوتك',
  render(X) {
    const { S, t } = X, cur = S.settings.recKeepDays || 0, notes = Object.keys(Clips.vn).length;
    const minutes = Math.round(Clips.meta.reduce((s, c) => s + (c.ms || 0), 0) / 60000);
    const would = d => prunableClips(S, Clips.meta, t, d);
    const sub = d => { const l = would(d); return l.length ? `ينطبق الآن على ${recWord(l.length)} · ${sizeText(l.reduce((s, c) => s + (c.size || 0), 0))}` : 'لا ينطبق على شيء الآن'; };
    return `<div class="page tight">
      <div class="grid3"><div class="tile"><b class="num">${Clips.meta.length}</b><span>تسجيلاً</span></div><div class="tile"><b class="num" style="font-size:20px">${Clips.meta.length || notes ? sizeText(Clips.bytes()) : '—'}</b><span>على الجهاز</span></div><div class="tile"><b class="num">${minutes}</b><span>دقيقة</span></div></div>
      <span class="t-cap" style="padding:0 6px">${notes ? `منها ${notes} ${notes === 1 ? 'ملاحظة صوتية' : notes === 2 ? 'ملاحظتان صوتيتان' : notes <= 10 ? 'ملاحظات صوتية' : 'ملاحظة صوتية'}. ` : ''}ساعة من التسجيل نحو 20 م.ب. الصوت على هذا الجهاز فقط ولا يدخل في النسخ الاحتياطية.</span>
      <div class="sec" style="gap:8px;margin-top:8px">${C.secH('حذف الصوت القديم تلقائياً')}
        ${C.radioRow('لا تحذف شيئاً', 'يبقى كل صوت حتى تحذفه بنفسك', 'recKeep', 0, cur === 0)}
        ${[30, 60, 90].map(d => C.radioRow(`بعد ${d} يوماً`, sub(d), 'recKeep', d, cur === d)).join('')}
        <div class="note subtle row-note" style="font-size:13px">${icon('info', 18)}<span>يُحذف صوت التسجيل فقط إذا راجعتَه ولم يبقَ فيه خطأ مفتوح ولا آية «للتأكد». التسجيلات التي لم تُراجَع أو فيها أخطاء مفتوحة تبقى دائماً. نتائج المراجعة والملاحظات والإحصاءات لا تُحذف.</span></div></div>
      ${Clips.meta.length ? `<div class="sec" style="gap:8px;margin-top:12px">${C.secH('حذف يدوي')}<button class="danger-row" data-a="clipsDeleteAll">${icon('trash', 22)}<span style="flex:1;font-size:16px;font-weight:500">حذف صوت كل التسجيلات</span></button></div>` : ''}</div>`;
  }
};

const SetDataScreen = {
  title: 'البيانات',
  render(X) {
    const S = X.S;
    return `<div class="page tight">
      <div class="hero sage" style="border-radius:28px;padding:22px;gap:6px;box-shadow:none">${icon('device-mobile', 28).replace('class="ic"', 'class="ic t-brand"')}<span class="t-title-m">بياناتك محفوظة على هذا الجهاز.</span><span class="t-body-s">لا حساب ولا مزامنة. صدّر نسخة قبل تغيير الهاتف أو حذف التطبيق، ثم استوردها على الجهاز الجديد.</span></div>
      <button class="card r24 p18 row" data-a="export"><span class="icon-box l">${icon('export', 22)}</span><span class="tx"><span class="l">التصدير</span><span class="s">احفظ نسخة من بياناتك في ملف تختار مكانه.</span><span class="c">${S.lastExport != null ? 'آخر نسخة ' + agoText(X.t - S.lastExport) : 'لم تُصدَّر نسخة بعد'}</span></span></button>
      <button class="card r24 p18 row" data-a="import"><span class="icon-box l">${icon('download-simple', 22)}</span><span class="tx"><span class="l">الاستيراد</span><span class="s">استعد بياناتك من نسخة سابقة. تحلّ محل بياناتك الحالية بعد التأكيد.</span></span></button>
      ${SetDataScreen.auto(X)}
      ${Clips.supported || Clips.meta.length ? `<button class="card r24 p18 row" data-a="go" data-v="setRec"><span class="icon-box l">${icon('microphone', 22)}</span><span class="tx"><span class="l">تسجيلات تلاوتك</span><span class="s">${Clips.meta.length ? `${recWord(Clips.meta.length)} · ${sizeText(Clips.bytes())} على هذا الجهاز` : 'لا تسجيلات بعد'}</span><span class="c">${S.settings.recKeepDays ? `يُحذف صوت المراجَع منها بعد ${S.settings.recKeepDays} يوماً` : 'لا يُحذف شيء تلقائياً'}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>` : ''}
      <div class="sec" style="gap:8px;margin-top:12px">${C.secH('منطقة حساسة')}<button class="danger-row" data-a="askDeleteAll">${icon('trash', 22)}<span style="flex:1;font-size:16px;font-weight:500">حذف جميع البيانات</span></button></div></div>`;
  },
  // Weekly automatic backup to a folder you choose (Android app only).
  auto(X) {
    if (!AutoBackup.available()) return '';
    const folder = AutoBackup.folder(), S = X.S;
    if (!folder) return `<div class="card r24 p18" style="gap:10px"><div class="row" style="padding:0;min-height:0"><span class="icon-box l">${icon('folder-simple', 22)}</span><span class="tx"><span class="l">نسخ احتياطي تلقائي</span><span class="s">اختر مجلداً مرة واحدة، فيحفظ التطبيق نسخة فيه كل أسبوع عند فتحه. مجلد يزامنه Drive يحفظها خارج الهاتف أيضاً.</span></span></div>${C.btn('اختر مجلداً', 'autoPick', null, { kind: 'tonal', size: 's' }).replace('class="btn', 'style="align-self:flex-start" class="btn')}</div>`;
    const status = X.ui.autoErr ? `<span class="c" style="color:var(--fb-warning-fg)">${X.ui.autoErr}</span>` : `<span class="c">${S.lastAutoBackup != null ? 'آخر نسخة ' + agoText(X.t - S.lastAutoBackup) : 'لم تُحفظ نسخة بعد'} · تُحفظ آخر 4 نسخ</span>`;
    return `<div class="card r24 p18" style="gap:10px"><div class="row" style="padding:0;min-height:0"><span class="icon-box l">${icon('folder-simple', 22)}</span><span class="tx"><span class="l">نسخ احتياطي تلقائي · كل أسبوع</span><span class="s">إلى المجلد «${esc(folder)}» عند فتح التطبيق.</span>${status}</span></div>
      <div class="btn-row wrap">${C.btn('انسخ الآن', 'autoNow', null, { kind: 'tonal', size: 's' })}${C.btn('غيّر المجلد', 'autoPick', null, { kind: 'outline', size: 's' })}${C.btn('إيقاف', 'autoOff', null, { kind: 'ghost', size: 's' })}</div></div>`;
  }
};

const SetTeacherScreen = {
  title: 'تقرير المعلّم',
  render(X) {
    const ui = X.ui, span = ui.reportSpan;
    const first = X.S.sessions.length ? Math.min(...X.S.sessions.map(s => s.day)) : X.t;
    const days = span === 'week' ? 7 : span === 'month' ? 30 : Math.max(1, X.t - first + 1);
    return `<div class="page" style="gap:16px">
      <div class="lede">ملخص تشاركه مع معلّمك أو شيخك. يُنشأ على جهازك، وتطبعه أو تحفظه ملف PDF.</div>
      <div class="sec" style="gap:8px">${C.secH('الفترة')}${C.seg('reportSpan', [['week', 'آخر أسبوع'], ['month', 'آخر شهر'], ['all', 'الكل']], span)}</div>
      <div class="group"><div class="row">${'<span class="tx"><span class="l" style="font-weight:400">مواضع الضعف</span></span>'}${C.switch(ui.repWeak, 'toggleRepWeak', null, 'مواضع الضعف')}</div><div class="row"><span class="tx"><span class="l" style="font-weight:400">سجل الجلسات</span></span>${C.switch(ui.repSess, 'toggleRepSess', null, 'سجل الجلسات')}</div></div>
      ${Report.html(X, days)}
      ${C.btn('اطبع أو احفظ PDF', 'printReport', null, { size: 'l', full: true, icon: 'printer' })}</div>`;
  }
};

const HowReviewScreen = {
  title: 'كيف تعمل المراجعة؟',
  render(X) {
    const factors = [['clock-counter-clockwise', 'متى راجعته آخر مرة'], ['gauge', 'تقييمك في المراجعات'], ['warning-diamond', 'الأخطاء المتكررة'], ['plant', 'هل المحفوظ حديث أم قديم']];
    const concepts = [['recent', 'القريب', 'محفوظ حديث يُراجَع يومياً سبع مرات حتى يثبت.'], ['strong', 'البعيد', 'محفوظ استقر وأصبحت مراجعته متباعدة، تتسع كلما أتقنته.'], ['due', 'يحتاج مراجعة', 'محفوظ حان وقت مراجعته أو تأخر عنها.'], ['medium', 'قوي / متوسط / ضعيف', 'تصف قوة المحفوظ بناءً على تقييمك في كل مراجعة.']];
    return `<div class="page">
      <div class="hero lav" style="gap:16px;box-shadow:none"><span class="t-title" style="line-height:1.5;text-wrap:pretty">يختار التطبيق ما يحتاج المراجعة بناءً على:</span>${factors.map(([ic, l]) => `<span style="display:flex;align-items:center;gap:12px;font-size:16px"><span class="icon-box lav">${icon(ic, 20)}</span>${l}</span>`).join('')}</div>
      ${concepts.map(([k, tt, s]) => `<div class="card r24 p18" style="flex-direction:row;align-items:center;gap:16px">${C.stateCell(k, 28)}<span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s" style="font-size:17px">${tt}</span><span class="t-body-s">${s}</span></span></div>`).join('')}
      <div class="note subtle" style="display:flex;flex-direction:column;gap:6px"><span style="font-weight:500;color:var(--tx-1)">القوة غير التوقيت</span><span>قوي ومتوسط وضعيف تصف تمكّنك من الموضع. قريب ويحتاج مراجعة تصفان موعد مراجعته. قد يكون الموضع قوياً ويحتاج مراجعة في الوقت نفسه.</span></div>
      <div class="note subtle" style="display:flex;flex-direction:column;gap:6px"><span style="font-weight:500;color:var(--tx-1)">بحسب القوة أو بدورة ثابتة</span><span>في الوضع الافتراضي تتسع الفترة بين المراجعات مع الإتقان، وتُوزَّع لتتجنب الأيام المزدحمة. ويمكنك اختيار دورة ثابتة من «طريقة المراجعة».</span></div>
      <div style="padding:6px 6px 0;font-size:16px;font-weight:500;text-wrap:pretty">التطبيق يقترح ما يحتاج المراجعة، وأنت تقرر ما تنجزه.</div></div>`;
  }
};

const SetAdvScreen = {
  title: 'الإعدادات المتقدمة',
  render(X) {
    const st = X.S.settings;
    return `<div class="page">
      <div class="sec" style="gap:8px">${C.secH('بداية اليوم')}${[['00:00', 'منتصف الليل'], ['02:00', ''], ['03:00', 'المقترح'], ['04:00', '']].map(([v, s]) => C.radioRow(v === '00:00' ? '12:00 صباحاً' : timeText(v), '', 'setDayStart', v, st.dayStart === v, s ? `<span class="t-meta">${s}</span>` : '')).join('')}<span class="foot-note">ما تسجّله بعد منتصف الليل وقبل هذا الوقت يُحسب لليوم السابق.</span></div>
      <div class="sec" style="gap:8px">${C.secH('اتجاه الحفظ')}${C.radioRow('من البقرة نزولاً', '', 'setDirection', 'fwd', st.direction !== 'bwd')}${C.radioRow('من الناس صعوداً', '', 'setDirection', 'bwd', st.direction === 'bwd')}</div>
      <button class="card r24 p18 row" data-a="go" data-v="howReview">${icon('question', 22).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l">كيف تعمل المراجعة؟</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>
      <button class="card r24 p18 row" data-a="askResetStrength">${icon('arrow-counter-clockwise', 22).replace('class="ic"', 'class="ic" style="color:var(--fb-warning-ic)"')}<span class="tx"><span class="l">إعادة ضبط تقديرات القوة</span><span class="c">يبقى المحفوظ والسجل كما هما</span></span></button></div>`;
  }
};

const GuideScreen = {
  title: 'دليل الاستخدام',
  render() {
    const items = [
      ['flag', 'ابدأ هنا', 'افتح «اليوم» لمعرفة وردك، واقرأ المدى من مصحفك، ثم ارجع وسجّل ما أنجزته.', null],
      ['sun-horizon', 'ورد اليوم', 'الحفظ الجديد والقريب والمراجعة، مع تقدير للوقت. اضغط على السبب لتعرف لماذا اختير الموضع.', 'tab:today'],
      ['check-circle', 'تسجيل الورد', 'لكل مقطع: هل تمّ؟ ثم كيف كان؟ وإن توقفت حدّد آخر آية. الأخطاء اختيارية: يكفي تحديد الآية.', null],
      ['hand-tap', 'عدّاد التكرار', 'من بطاقة الحفظ الجديد: اضغط في أي مكان بعد كل قراءة حتى تبلغ هدفك.', null],
      ['books', 'المحفوظ', 'تصفّح محفوظك بالسور أو الأجزاء أو الأحزاب، وابحث عن أي سورة أو آية أو حزب.', 'tab:mem'],
      ['book-open', 'عن القرآن', 'بنية المصحف (الأجزاء والأحزاب والأثمان)، ومقاصد بعض السور، وأسباب نزول، وآيات متشابهة يُنبَّه إليها في «اليوم» وعند التسجيل. من «المحفوظ» أو الإعدادات.', 'know'],
      ['microphone', 'التلاوة', 'سجّل تلاوتك واستمع إليها، ثم قيّم حفظك وتجويدك ودوّن ملاحظاتك. يمكنك احتساب التسميع المسجّل مراجعة، وتتابع تحسّنك في «التقدّم».', 'tab:rec'],
      ['grid-four', 'الخريطة', 'القرآن كاملاً في 60 حزباً، لكل حزب 8 أثمان. اضغط على الحزب لرؤية أثمانه.', 'memMap'],
      ['squares-four', 'القوة وحالة المراجعة', 'القوة تصف تمكّنك من الموضع، والحالة تصف موعد مراجعته.', 'legend'],
      ['warning-diamond', 'مواضع الضعف', 'آيات تكرر فيها الخطأ خلال آخر 30 يوماً، والآيات التي تختلط عليك.', 'weak'],
      ['chart-bar', 'التقدّم', 'مقدار محفوظك وقوته ونشاطك وتقدير تقريبي للختم.', 'tab:prog'],
      ['question', 'كيف تعمل المراجعة؟', 'ما الذي يعتمد عليه التطبيق في اقتراح المراجعة.', 'howReview'],
      ['archive', 'البيانات والنسخ الاحتياطي', 'بياناتك على هذا الجهاز. صدّر نسخة قبل تغيير الهاتف.', 'setData']];
    return `<div class="page tight">
      <div class="hero mint" style="border-radius:28px;padding:20px;flex-direction:row;align-items:center;gap:14px;box-shadow:none"><span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s" style="font-size:17px">جولة سريعة</span><span class="t-body-s">دقيقة واحدة في أقسام التطبيق الأربعة.</span></span>${C.btn('إعادة الجولة', 'tourStart', null, { size: 's' })}</div>
      <div class="group">${items.map(([ic, tt, b, to]) => C.row({ icon: ic, label: tt, sub: b, a: to ? 'go' : null, v: to, cls: 'top' })).join('')}</div></div>`;
  }
};

const LegendScreen = {
  title: 'معاني الحالات',
  render() {
    const sec = (title, rows) => `<div class="sec" style="gap:8px">${C.secH(title)}<div class="group">${rows.map(([k, tx]) => `<div class="row" style="gap:16px">${C.stateCell(k, 32)}<span class="tx"><span class="l">${STATE_AR[k]}</span><span class="s" style="font-size:14px;text-wrap:pretty">${tx}</span></span></div>`).join('')}</div></div>`;
    return `<div class="page" style="gap:16px"><div class="lede">تجمع كل خلية بين التعبئة والإطار والعلامة، فلا تعتمد الحالة على اللون وحده.</div>
      ${sec('قوة الحفظ', [['strong', 'محفوظ مستقر في مراجعاتك الأخيرة.'], ['medium', 'محفوظ جيد لكنه يحتاج متابعة معتادة.'], ['weak', 'ظهر فيه ضعف في آخر مراجعة أو تكرر فيه الخطأ.'], ['unknown', 'محفوظ لم تُقيّم قوته بعد في التطبيق.']])}
      ${sec('حالة المراجعة', [['recent', 'محفوظ حديث ما زال في مرحلة التثبيت.'], ['due', 'حان وقت مراجعته أو تأخر عنها.']])}
      ${sec('الحفظ', [['learning', 'ضمن الحفظ الجديد الآن.'], ['none', 'لم يُسجّل ضمن محفوظك بعد.']])}</div>`;
  }
};

const PrivacyScreen = {
  title: 'الخصوصية والبيانات',
  render() {
    const line = (ic, tx, warn) => `<div class="row" style="font-size:15px">${icon(ic, 22).replace('class="ic"', `class="ic" style="color:${warn ? 'var(--fb-warning-ic)' : 'var(--tx-2)'}"`)}${tx}</div>`;
    return `<div class="page tight">
      <div class="hero sage" style="border-radius:28px;padding:22px;gap:6px;box-shadow:none">${icon('shield-check', 28).replace('class="ic"', 'class="ic t-brand"')}<span class="t-title-m">بياناتك محفوظة على هذا الجهاز.</span></div>
      <div class="group">${line('user-circle-minus', 'لا حساب ولا تسجيل دخول.')}${line('cloud-slash', 'لا مزامنة ولا خوادم. يعمل التطبيق دون اتصال.')}${line('eye-slash', 'لا إعلانات ولا تتبّع للاستخدام.')}${line('warning', 'حذف التطبيق يحذف بياناتك. احتفظ بنسخة احتياطية.', true)}</div>
      <button class="card r24 p18 row" data-a="go" data-v="setData">${icon('archive', 22).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l">التصدير والاستيراد</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>
      <div class="sec" style="gap:8px;margin-top:8px">${C.secH('مصادر')}<div class="group">${C.row({ label: 'بيانات المرجع', sub: 'ورش · المصحف المحمدي · 6214 آية', cap: `<span class="latin">${REF_SOURCE}</span>` })}${C.row({ label: 'الخطوط', sub: '<span class="latin">Basis Grotesque Arabic Pro · IBM Plex Sans</span>' })}${C.row({ label: 'الأيقونات', sub: '<span class="latin">Phosphor Icons · MIT</span>' })}</div></div></div>`;
  }
};

// Teacher report: shared by the preview above and printing.
const Report = {
  html(X, span) {
    const r = reportData(X.S, X.t, span), s = r.stats;
    const fmt = d => dateText(d, { day: 'numeric', month: 'long', year: 'numeric' });
    const sec = (title, body) => `<section><h2>${title}</h2>${body}</section>`;
    const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    const reviewed = r.rev.S + r.rev.M + r.rev.W;
    const typed = ['نسيان', 'تردّد', 'اشتباه'].map((l, i) => r.errTypes[i] ? l + ' ' + r.errTypes[i] : '').filter(Boolean).join(' · ');
    return `<article class="report" dir="rtl"><header><span class="brand-row">${C.brandMark(22)}${BRAND}</span><h1>تقرير الحفظ والمراجعة</h1><p>من ${fmt(r.since)} إلى ${fmt(r.today)}</p></header>
      ${sec('المحفوظ', `<p class="big">${s.mem ? thumunWord(s.mem) : 'لا محفوظ بعد'}${s.full ? ' · ' + hizbWord(s.full) + ' كاملاً' : ''}</p>`)}
      ${sec('الحفظ الجديد', r.newRanges.length ? list(r.newRanges.map(([a, b]) => `${rangeText(a, b)} · ${pagesText(a, b)}`)) : '<p>لا حفظ جديد في هذه المدة.</p>')}
      ${sec('الانتظام', `<p>سُجّل الورد في ${daysWord(r.daysDone).replace(/^يوم$/, 'يوم واحد')} من ${span}.${r.teacherSessions ? ` سُمّع على شيخ في ${counted(r.teacherSessions, 'جلسة واحدة', 'جلستين', 'جلسات', 'جلسة')}.` : ''}</p>`)}
      ${X.ui.repSess ? sec('المراجعة', reviewed || r.rev.partial ? `<p>${thumunWord(reviewed)} تمّت مراجعتها: متقن ${r.rev.S} · متوسط ${r.rev.M} · ضعيف ${r.rev.W}${r.rev.partial || r.rev.missed ? ` · جزئي ${r.rev.partial} · لم يتم ${r.rev.missed}` : ''}</p>` : '<p>لا مراجعة مسجّلة في هذه المدة.</p>') : ''}
      ${sec('الأخطاء', r.errors ? `<p>${errWord(r.errors)}${typed ? ': ' + typed : ''}</p>` : '<p>لا أخطاء مسجّلة.</p>')}
      ${X.ui.repWeak ? sec('مواضع الضعف', r.weak.length ? list(r.weak.map(w => `${ayahName(w.g)} · تكرر الخطأ في ${daysWord(w.nDays)} · ص ${pageOf(w.g)}`)) : '<p>لا مواضع ضعف.</p>') : ''}
      ${X.ui.repWeak && r.confusions.length ? sec('آيات تختلط', list(r.confusions.map(p => `${ayahName(p.a)} ↔ ${ayahName(p.b)}`))) : ''}
      <footer>أُعدّ على الجهاز دون اتصال · ${BRAND} ${APP_VERSION} · ورش · المصحف المحمدي</footer></article>`;
  }
};
