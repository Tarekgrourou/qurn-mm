// Bottom sheets and the guided tour. Sheets read ui state; saving goes through the engine in app.js.
'use strict';

const REC_LABEL = { new: 'الحفظ الجديد', recent: 'القريب', review: 'المراجعة' };
const recPending = e => e.status < 0 || (e.status === 1 && e.lastAyah == null) || (e.kind !== 'new' && e.status !== 2 && e.rating < 0);
const ayahNo = g => fromG(g).a;

const Sheets = {
  render(X, sh) {
    const fn = { reason: Sheets.reason, record: Sheets.record, error: Sheets.error, confused: Sheets.confused, extra: Sheets.extra,
      confirm: Sheets.confirm, welcome: Sheets.welcome, tourEnd: Sheets.tourEnd, time: Sheets.time,
      missed: Sheets.missed, catchup: Sheets.catchup, note: Sheets.note, recorder: RecSheets.recorder, pick: RecSheets.pick, plan: RecSheets.plan, bmNote: RecSheets.bmNote, mistake: RecSheets.mistake, milestone: Sheets.milestone }[sh.t];
    if (!fn) return '';
    const size = { record: 'tall', extra: 'tall', error: 'mid', pick: 'tall' }[sh.t] || '';
    const bare = sh.t === 'milestone';
    return `<div class="overlay"><div class="scrim" data-a="closeSheet" aria-hidden="true"></div><div class="sheet ${size} ${bare ? 'bare' : ''}" role="dialog" aria-modal="true">${bare ? '' : '<div class="handle"></div>'}${fn(X, sh)}</div></div>`;
  },
  head(title, sub, extra = '') {
    return `<div class="sheet-head"><div class="tx"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${extra}${C.iconBtn('x', 'closeSheet', null, 'إغلاق', { size: 22 })}</div>`;
  },

  reason(X, sh) {
    const it = X.p.review[sh.i];
    if (!it) return '<div class="sheet-pad">—</div>';
    const ts = it.ids.map(id => X.S.th[id]), lasts = ts.map(t => t.last).filter(d => d != null);
    const strengthKey = ts.some(t => t.strength === 'W') ? 'weak' : ts.every(t => t.strength === 'S') ? 'strong' : ts.some(t => !t.strength) ? 'unknown' : 'medium';
    const T0 = THUMUN[it.ids[0]];
    const line1 = (lasts.length ? `آخر مراجعة ${agoText(X.t - Math.min(...lasts))}.` : 'لم يُراجَع هذا الموضع في التطبيق بعد.') + (strengthKey === 'weak' ? ' وكان تقييمك فيها ضعيفاً.' : '');
    return `<div class="sheet-pad" style="gap:16px;padding-top:14px"><div class="t-title-l">لماذا هذه المراجعة؟</div>
      <div class="inset-panel"><span class="t-title-s" style="font-size:17px">${rangeText(it.from, it.to)}</span><span class="t-meta">${thumunMetaDual(it.ids)} · ${pagesText(it.from, it.to)}</span></div>
      <div class="chips">${C.statusChip(strengthKey, 'القوة: ' + STATE_AR[strengthKey])}${C.statusChip('due', 'المراجعة: مستحقة')}</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:16px;text-wrap:pretty"><span>${line1}</span><span class="t-2">${it.reason.text}. أصبح هذا الموضع من أكثر محفوظك حاجةً للمراجعة الآن.</span></div>
      <div class="btn-row">${C.btn('حسناً', 'closeSheet', null, { flex: true })}${C.btn('عرض الحزب', 'go', `hizb:${T0.hizb}:${T0.k}`, { kind: 'tonal', flex: true })}</div>
      ${C.btn('ليس اليوم', 'postpone', it.ids.join(','), { kind: 'ghost', size: 's', full: true })}</div>`;
  },

  record(X) {
    const rec = X.ui.rec, n = rec.entries.filter(recPending).length;
    const day = rec.day ?? X.t;
    const title = rec.mode === 'edit' ? 'عدّل تسجيل اليوم' : rec.mode === 'extra' ? 'سجّل مراجعة' : day !== X.t ? 'سجّل ورد يوم فائت' : 'سجّل الورد';
    const items = rec.entries.map((e, i) => {
      const pend = recPending(e), isNew = e.kind === 'new';
      const ayat = []; for (let g = e.from; g < e.to; g++) ayat.push(g);
      return `<div class="rec-item ${rec.missing && pend ? 'missing' : ''}">
        <div class="card-head"><span class="t-meta" style="font-weight:500">${e.label}</span>${pend ? '' : icon('check-circle-fill', 20).replace('class="ic"', 'class="ic done-ic"')}</div>
        <div style="display:flex;flex-direction:column"><span class="t-title-m">${rangeText(e.from, e.to)}</span><span class="t-meta">${thumunMetaDual(e.ids)} · ${pagesText(e.from, e.to)}</span></div>
        ${C.noteLine(X.S, e.ids)}${C.kbLine(X.S, e.from, e.to)}
        ${C.picks('recStatus', (isNew ? [['0', 'حُفظ'], ['1', 'حُفظ بعضه'], ['2', 'لم يُحفظ']] : [['0', 'تمّ'], ['1', 'جزئي'], ['2', 'لم يتم']]).map(([v, l]) => [i + ':' + v, l]), i + ':' + e.status)}
        ${e.status === 1 ? `<div style="display:flex;flex-direction:column;gap:8px"><span class="t-meta t-2">${isNew ? 'آخر آية وصلت إليها' : 'توقفت عند الآية'}</span><div class="ayah-chips">${ayat.map(g => `<button class="ayah-chip num ${e.lastAyah === g ? 'on' : ''}" data-a="recAyah" data-v="${i}:${g}">${ayahNo(g)}</button>`).join('')}</div></div>` : ''}
        ${!isNew && (e.status === 0 || e.status === 1) ? `<div style="display:flex;flex-direction:column;gap:8px"><span class="t-meta t-2">كيف كان؟</span>${C.picks('recRating', [['0', 'متقن'], ['1', 'متوسط'], ['2', 'ضعيف']].map(([v, l]) => [i + ':' + v, l]), i + ':' + e.rating)}</div>` : ''}
        ${!isNew ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">${C.btn('أضف خطأ', 'errorSheet', i, { kind: 'link', size: 'xs', icon: 'plus', iconSize: 16 }).replace('class="btn', 'style="margin-inline-start:-8px" class="btn')}${e.errors.length ? `<span class="tag warn">${errWord(e.errors.length)}</span>` : ''}</div>` : ''}
        ${rec.missing && pend ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--fb-warning-fg)">${icon('warning-circle', 16)}يحتاج هذا المقطع إلى تحديد</div>` : ''}</div>`;
    }).join('');
    return `${Sheets.head(title, `${dateText(day)} · ${segWord(rec.entries.length)}`, n ? C.btn('الكل تمّ', 'recAll', null, { kind: 'tonal', size: 'xs' }) : '')}
      <div class="sheet-body" data-k="rec">
        ${rec.entries.some(e => e.kind !== 'new') ? `<div class="note subtle row-note" style="padding:12px 16px">${icon('chalkboard-teacher', 22).replace('class="ic"', 'class="ic t-brand"')}<span style="flex:1;display:flex;flex-direction:column"><span style="font-size:15px;font-weight:500;color:var(--tx-1)">سمّعت على شيخ</span><span class="t-cap">يُحفظ مصدر التحقق مع الجلسة</span></span>${C.switch(rec.teacher, 'recTeacher', null, 'سمّعت على شيخ')}</div>` : ''}
        ${items}</div>
      <div class="sheet-foot">${rec.missing && n ? '<div style="font-size:13px;color:var(--fb-warning-fg);text-align:center">أكمل المقاطع المحدّدة باللون البرتقالي ثم احفظ.</div>' : ''}${C.btn(n ? `بقي تقييم ${segWord(n)}` : 'حفظ', 'recSave', null, { kind: n ? 'pending' : 'primary', size: 'l', full: true })}</div>`;
  },

  error(X, sh) {
    const e = X.ui.rec.entries[sh.entry], ayat = []; for (let g = e.from; g <= e.to; g++) ayat.push(g);
    return `${Sheets.head('أضف خطأ', rangeText(e.from, e.to))}
      <div class="sheet-body pad20">${X.tipOn('err') ? C.tip('err', 'يكفي تحديد الآية. نوع الخطأ اختياري.') : ''}
        <div style="display:flex;flex-direction:column;gap:10px"><span class="t-title-s" style="font-size:15px">اختر الآية</span><div class="ayah-grid">${ayat.map(g => `<button class="num ${sh.g === g ? 'on' : ''}" data-a="errAyah" data-v="${g}" aria-label="${ayahName(g)}">${ayahNo(g)}</button>`).join('')}</div></div>
        <div style="display:flex;flex-direction:column;gap:10px"><span class="t-title-s" style="font-size:15px">نوع الخطأ <span class="t-meta" style="font-weight:400">· اختياري</span></span>${C.picks('errType', [['forget', 'نسيان'], ['hesitate', 'تردّد'], ['confuse', 'اشتباه'], ['none', 'دون تحديد']], sh.type || '', 'grid2')}
        ${sh.type === 'confuse' ? `<button class="row card r22" style="padding:12px 16px;margin-top:4px" data-a="sheet" data-v="confused"><span class="tx"><span class="c">اشتبهت بـ · اختياري</span><span class="l">${sh.confused != null ? ayahName(sh.confused) : 'اختر الآية'}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>` : ''}</div></div>
      <div class="sheet-foot">${C.btn(sh.g == null ? 'اختر الآية أولاً' : 'أضف الخطأ · ' + ayahName(sh.g), 'errAdd', null, { kind: sh.g == null ? 'pending' : 'primary', size: 'l', full: true })}</div>`;
  },

  confused(X, sh) {
    const parent = X.ui.sheets[X.ui.sheets.length - 2], cur = parent && parent.confused != null ? fromG(parent.confused) : fromG(X.ui.rec.entries[parent.entry].from);
    return `${Sheets.head('اشتبهت بـ', 'الآية التي خلطت بها')}
      <div class="sheet-body" style="flex-direction:row;gap:8px;padding-top:8px"><label style="flex:2;display:flex;flex-direction:column;gap:6px"><span class="t-meta">السورة</span><select id="cf-s" class="field">${SURAH_NAMES.map((nm, k) => `<option value="${k + 1}" ${k + 1 === cur.s ? 'selected' : ''}>${k + 1} · ${nm}</option>`).join('')}</select></label>
        <label style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="t-meta">الآية</span><input id="cf-a" class="field num" type="number" inputmode="numeric" min="1" value="${cur.a}"></label></div>
      <div class="sheet-foot">${C.btn('تم', 'confusedSave', null, { size: 'l', full: true })}</div>`;
  },

  extra(X) {
    const x = X.ui.extra, picked = x.opts[x.pick];
    const need = x.pick == null ? 'اختر ما راجعته' : x.status < 0 ? 'حدّد الإنجاز' : x.status === 1 && x.lastAyah == null ? 'حدّد آخر آية' : x.status !== 2 && x.rating < 0 ? 'بقي تقييم المقطع' : '';
    const ayat = []; if (picked) for (let g = picked.from; g < picked.to; g++) ayat.push(g);
    return `${Sheets.head('سجّل مراجعة أخرى', 'خارج ورد اليوم')}
      <div class="sheet-body"><span class="t-title-s" style="font-size:15px;padding:0 4px">ماذا راجعت؟</span>
        ${x.opts.map((o, k) => C.radioRow(rangeText(o.from, o.to), o.meta, 'extraPick', k, x.pick === k)).join('')}
        ${C.btn('ابحث عن سورة أو حزب آخر', 'extraSearch', null, { kind: 'link', size: 'xs', icon: 'magnifying-glass', iconSize: 18 }).replace('class="btn', 'style="align-self:flex-start" class="btn')}
        ${picked ? `<div class="card r24 p18"><span class="t-meta t-2">الإنجاز</span>${C.picks('extraStatus', [['0', 'تمّ'], ['1', 'جزئي'], ['2', 'لم يتم']], String(x.status))}
          ${x.status === 1 ? `<span class="t-meta t-2">توقفت عند الآية</span><div class="ayah-chips">${ayat.map(g => `<button class="ayah-chip num ${x.lastAyah === g ? 'on' : ''}" data-a="extraAyah" data-v="${g}">${ayahNo(g)}</button>`).join('')}</div>` : ''}
          ${x.status === 0 || x.status === 1 ? `<span class="t-meta t-2">كيف كان؟</span>${C.picks('extraRating', [['0', 'متقن'], ['1', 'متوسط'], ['2', 'ضعيف']], String(x.rating))}` : ''}</div>` : ''}</div>
      <div class="sheet-foot">${C.btn(need || 'حفظ المراجعة', 'extraSave', null, { kind: need ? 'pending' : 'primary', size: 'l', full: true })}</div>`;
  },

  // Days that can still be recorded after the fact (oldest first).
  missed(X) {
    const days = backfillDays(X.S, X.t);
    return `${Sheets.head('سجّل ورد يوم فائت', 'إن كنت قرأته ونسيت تسجيله')}
      <div class="sheet-body">${days.map(d => `<button class="row card r22" style="padding:14px 18px" data-a="recordDay" data-v="${d}">${icon('calendar-plus', 22).replace('class="ic"', 'class="ic t-brand"')}<span class="tx"><span class="l">${dateText(d)}</span><span class="c">${agoText(X.t - d)}</span></span>${icon('caret-left', 18).replace('class="ic"', 'class="ic chev"')}</button>`).join('')}
        <div class="t-meta" style="padding:4px 4px 0">ابدأ بالأقدم: بعد تسجيل يوم لا يمكن تسجيل ما قبله.</div></div>`;
  },

  // Spread a review backlog over a few days. Only the daily amount changes while it runs.
  catchup(X) {
    const cu = X.ui.cu, due = X.p.dueTotal, base = X.S.settings.reviewAmount;
    const per = n => Math.max(base, Math.ceil(due / n));
    return `${Sheets.head('خطة تعويض', `لديك ${thumunWord(due)} مستحقة · مقدارك المعتاد ${thumunWord(base)}`)}
      <div class="sheet-body pad20">
        <span class="t-body-s">وزّع المستحق على أيام قليلة. يرتفع مقدار المراجعة اليومي خلالها ثم يعود وحده، ولا يتغيّر ترتيب الأولوية ولا المواعيد.</span>
        <div style="display:flex;flex-direction:column;gap:8px">${[3, 5, 7].map(n => C.radioRow(`على ${daysWord(n)}`, `نحو ${thumunWord(per(n))} يومياً · ≈ ${durationText(per(n) * MIN_REVIEW)}`, 'cuDays', n, cu.days === n)).join('')}</div>
        <div class="note subtle row-note" style="padding:12px 16px"><span style="flex:1;display:flex;flex-direction:column"><span style="font-size:15px;font-weight:500;color:var(--tx-1)">أوقف الحفظ الجديد خلال الخطة</span><span class="t-cap">يعود تلقائياً عند انتهائها</span></span>${C.switch(cu.pauseNew, 'cuPause', null, 'أوقف الحفظ الجديد خلال الخطة')}</div></div>
      <div class="sheet-foot">${C.btn('ابدأ الخطة', 'catchupStart', null, { size: 'l', full: true })}</div>`;
  },

  // A personal note on one thumun.
  note(X, sh) {
    const T0 = THUMUN[sh.th], cur = X.S.notes[sh.th];
    return `${Sheets.head('ملاحظتي', `${rangeText(T0.start, T0.end)}`)}
      <div class="sheet-body"><textarea id="note-in" class="field" maxlength="500" dir="auto" aria-label="ملاحظتي على هذا الثُّمن" placeholder="مثلاً: لا تخلط بين آية 102 وآية 48، أو موضع الوقف هنا.">${esc(sh.text ?? (cur ? cur.text : ''))}</textarea>
        <span class="t-cap">تظهر ملاحظتك على هذا الثُّمن في «اليوم» وعند تسجيل الورد.</span></div>
      <div class="sheet-foot">${C.btn('حفظ', 'noteSave', sh.th, { size: 'l', full: true })}${cur ? C.btn('حذف الملاحظة', 'noteDelete', sh.th, { kind: 'ghost', size: 's', full: true }) : ''}</div>`;
  },

  confirm(X, sh) {
    return `<div class="sheet-pad" role="alertdialog" style="gap:12px"><div class="t-title-l" style="text-wrap:pretty">${sh.title}</div><div class="t-body" style="font-size:15px">${sh.body}</div>
      <div class="btn-row" style="padding-top:8px">${C.btn(sh.ok, 'confirmOk', null, { kind: sh.danger ? 'danger' : 'primary', flex: true })}${C.btn('إلغاء', 'closeSheet', null, { kind: 'outline', flex: true })}</div></div>`;
  },
  welcome() {
    return `<div class="sheet-pad">${C.brandMark(40, BRAND)}<div class="t-title-l" style="font-size:26px">أهلاً بك</div><div class="t-body">كل ما تحتاجه يومياً في مكان واحد: نعرض لك ما تحفظه وما يحتاج المراجعة، ثم تسجّل ما أنجزته.</div>
      <div class="btn-row" style="padding-top:6px">${C.btn('ابدأ الجولة', 'tourStart', null, { flex: true })}${C.btn('استكشف بنفسي', 'tourSkip', null, { kind: 'tonal', flex: true })}</div><div class="t-meta" style="text-align:center">يمكنك إعادة الجولة لاحقاً من الإعدادات.</div></div>`;
  },
  tourEnd() {
    return `<div class="sheet-pad"><span class="icon-box xl">${icon('check-bold', 24)}</span><div class="t-title-l" style="font-size:26px">أصبحت جاهزاً</div><div class="t-body">افتح «اليوم» لمعرفة وردك، ثم سجّله بعد الانتهاء.</div>
      <div class="btn-row" style="padding-top:6px">${C.btn('اذهب إلى اليوم', 'go', 'tab:today', { flex: true })}${C.btn('استكشاف المزيد', 'closeSheet', null, { kind: 'tonal', flex: true })}</div><div class="t-meta" style="text-align:center">دليل الاستخدام متاح دائماً في الإعدادات ← المساعدة.</div></div>`;
  },
  time(X, sh) {
    const cur = sh.target === 'ob' ? X.ui.ob.reminderTime : sh.target === 'reminder' ? X.S.settings.reminderTime : X.S.settings.dayStart;
    const title = sh.target === 'dayStart' ? 'بداية اليوم' : 'وقت التذكير';
    return `${Sheets.head(title)}<div class="sheet-body"><input id="time-in" class="field num" type="time" aria-label="${title}" value="${cur}" style="font-size:24px;text-align:center;direction:ltr"></div><div class="sheet-foot">${C.btn('تم', 'timeSave', sh.target, { size: 'l', full: true })}</div>`;
  },
  // A milestone just reached: one calm sheet, no counters to keep up.
  milestone(X, sh) {
    const m = milestones(X.S, X.t).find(x => x.id === sh.id);
    if (!m) return '';
    const [title, fact] = msText(m);
    return `<div class="ms-sheet has-aurora">${C.aurora('deep')}<span class="k">إنجاز جديد</span>${C.brandMark(44)}
      <div class="t">${title}</div><div class="b">${fact} بارك الله لك فيما حفظت.</div>
      <div class="btn-row" style="padding-top:10px">${C.btn('متابعة', 'closeSheet', null, { flex: true })}${C.btn('سلّم الإنجازات', 'go', 'progMs', { kind: 'ghost', flex: true })}</div></div>`;
  }
};

// Guided tour: nine short steps across the four sections (from the app design).
const TOUR = [
  { s: 'today', t: 'summary', title: 'ورد اليوم', body: 'هنا تجد الحفظ والمراجعة المقترحين لك اليوم.' },
  { s: 'today', t: 'range', title: 'اقرأ من مصحفك', body: 'نعرض لك المدى بالسورة والآية والصفحة، وأنت تقرأ وتراجع من مصحفك.' },
  { s: 'today', t: 'reason', title: 'لماذا هذا الموضع؟', body: 'كل مراجعة لها سبب واضح، مثل آخر مراجعة أو موضع ضعف متكرر.' },
  { s: 'today', t: 'record', title: 'بعد أن تنتهي', body: 'ارجع وسجّل ما أنجزته وكيف كانت المراجعة.', next: 'التالي: المحفوظ' },
  { s: 'mem', t: 'views', title: 'محفوظك بأكثر من طريقة', body: 'تصفّح محفوظك بالسور أو الأجزاء أو الأحزاب، أو شاهده كاملاً في الخريطة.' },
  { s: 'mem', t: 'states', title: 'الحالة في لمحة', body: 'التعبئة تبيّن قوة المحفوظ، والعلامة فوقها تبيّن موعد مراجعته.', legend: true, next: 'التالي: التقدّم' },
  { s: 'prog', t: 'overview', title: 'راقب تطوّرك', body: 'تابع مقدار محفوظك وقوته ونشاط المراجعة ومواضع الضعف.' },
  { s: 'prog', t: 'weak', title: 'مواضع الضعف', body: 'تظهر هنا الآيات التي يتكرر فيها الخطأ لتعرف أين تركز مراجعتك.', next: 'التالي: الإعدادات' },
  { s: 'set', t: 'plan', title: 'اجعل الورد مناسباً لك', body: 'يمكنك تعديل مقدار الحفظ والمراجعة والتذكير متى شئت.', next: 'إنهاء الجولة' }
];
const Tour = {
  render(i) {
    const st = TOUR[i];
    const leg = st.legend ? `<div class="note subtle" style="display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:16px;font-size:13px">
      <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="t-3" style="min-width:84px">قوة الحفظ</span>${['strong', 'medium', 'weak'].map(k => `<span style="display:flex;align-items:center;gap:4px">${C.stateCell(k, 14)}${STATE_AR[k]}</span>`).join('')}</span>
      <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="t-3" style="min-width:84px">حالة المراجعة</span>${['recent', 'due'].map(k => `<span style="display:flex;align-items:center;gap:4px">${C.stateCell(k, 14)}${STATE_AR[k]}</span>`).join('')}</span></div>` : '';
    return `<div class="tour"><div class="spot none" id="tour-spot"></div><div class="tip-card" id="tour-tip" role="dialog" aria-live="polite" style="top:300px">
      <div style="display:flex;align-items:center;justify-content:space-between"><span class="t-cap">${i + 1} من ${TOUR.length}</span>${C.btn('تخطّي الجولة', 'tourSkip', null, { kind: 'ghost', size: 's' }).replace('class="btn', 'style="margin:-10px -8px -10px 0" class="btn')}</div>
      <span style="font-size:19px;font-weight:500;line-height:1.4">${st.title}</span><span class="t-body" style="font-size:15px">${st.body}</span>${leg}
      <div class="btn-row" style="padding-top:6px">${C.btn(st.next || 'التالي', 'tourNext', null, { flex: true, size: 's' }).replace('btn s', 'btn')}${i > 0 ? C.btn('السابق', 'tourBack', null, { kind: 'tonal' }) : ''}</div></div></div>`;
  },
  // Position the spotlight on the step's target once the screen has rendered.
  place(i, app) {
    const st = TOUR[i], el = app.querySelector(`[data-tour="${st.t}"]`), spot = app.querySelector('#tour-spot'), tip = app.querySelector('#tour-tip');
    if (!spot || !tip) return;
    if (!el) { spot.className = 'spot none'; spot.removeAttribute('style'); tip.style.top = '300px'; tip.style.bottom = ''; return; }
    const sc = app.querySelector('.scroller'), ar = app.getBoundingClientRect();
    let r = el.getBoundingClientRect();
    if (sc && sc.contains(el) && (r.top - ar.top < 64 || r.bottom - ar.top > ar.height - 300)) { sc.scrollTop += r.top - ar.top - 96; r = el.getBoundingClientRect(); }
    const top = r.top - ar.top, left = Math.max(6, r.left - ar.left - 6), w = Math.min(ar.width - 12 - left, r.width + 12);
    spot.className = 'spot';
    spot.style.cssText = `top:${top - 6}px;left:${left}px;width:${w}px;height:${r.height + 12}px`;
    const below = top + r.height + 260 < ar.height - 20;
    if (below) { tip.style.top = Math.min(ar.height - 260, top + r.height + 18) + 'px'; tip.style.bottom = ''; }
    else { tip.style.bottom = Math.min(ar.height - 120, ar.height - top + 18) + 'px'; tip.style.top = ''; }
  }
};
