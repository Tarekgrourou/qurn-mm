// Onboarding (4 short steps) and editing what is memorized. Both use the same ayah-level
// selection; the engine turns it into thumun (finishOnboarding / editMemorized).
'use strict';

const Sel = {
  state(sel, a, b) { let n = 0; for (let g = a; g <= b; g++) n += sel[g]; return n === 0 ? 'none' : n === b - a + 1 ? 'all' : 'part'; },
  count(sel) { return THUMUN.filter(T => Sel.state(sel, T.start, T.end) === 'all').length; },
  set(sel, a, b, v) { sel.fill(v ? 1 : 0, a, b + 1); },
  newOb() {
    return { step: 'dir', mode: 'surah', dir: null, sel: new Uint8Array(TOTAL_AYAT), refine: null, pHizb: 1, strength: {},
      newAmount: 1, reviewAmount: 8, reminderOn: true, reminderTime: '05:00', edit: false };
  },
  // Consecutive selected thumun inside one juz form a group with one initial strength.
  groups(ob) {
    const out = [];
    THUMUN.forEach(T => {
      if (Sel.state(ob.sel, T.start, T.end) !== 'all') return;
      const j = Math.ceil(T.hizb / 2), g = out[out.length - 1];
      if (g && g.j === j && g.last === T.id - 1) { g.last = T.id; g.ids.push(T.id); } else out.push({ j, ids: [T.id], last: T.id, key: 'g' + T.id });
    });
    return out;
  }
};

// «متى تتفرّغ؟»: times of day for the one daily reminder.
const OB_SLOTS = [['05:00', 'الفجر'], ['07:30', 'الصباح'], ['18:30', 'المساء'], ['21:00', 'الليل']];
// "نحو 14 شهراً" for a number of days.
function spanWord(days) {
  if (days < 45) return daysWord(days);
  const months = Math.round(days / 30);
  return months > 24 ? yearsWord(Math.round(months / 12)) : monthsWord(months);
}

const Onboarding = {
  STEP: { dir: 1, sel: 2, strength: 3, plan: 4 },

  head(ob) {
    const n = Onboarding.STEP[ob.step];
    return `<div class="onb-head"><div class="bar">${n > 1 ? C.iconBtn('arrow-right', 'obBack', null, 'رجوع', { size: 24 }).replace('class="iconbtn', 'style="margin-inline-start:-12px" class="iconbtn') : '<span></span>'}<span class="brand-row">${C.brandMark(22)}${BRAND}</span><span class="t-meta">الخطوة ${n} من 4</span></div>
      <div class="steps">${[1, 2, 3, 4].map(k => `<span class="${k <= n ? 'on' : ''}"></span>`).join('')}</div></div>`;
  },

  render(X) {
    const ob = X.ui.ob;
    const body = { dir: Onboarding.dir, sel: Onboarding.sel, strength: Onboarding.strength, plan: Onboarding.plan }[ob.step](X, ob);
    return (ob.edit ? '' : Onboarding.head(ob)) + body;
  },
  // Bottom action for the current step: label, enabled, action.
  cta(X) {
    const ob = X.ui.ob;
    if (ob.step === 'dir') return [ob.dir ? 'التالي' : 'اختر اتجاهاً للمتابعة', !!ob.dir, 'obNext'];
    if (ob.step === 'sel') {
      const n = Sel.count(ob.sel);
      if (ob.edit) { const ch = X.ui.ob.changed; return [ch ? 'حفظ التغييرات' : 'لا توجد تغييرات بعد', ch, 'editSave']; }
      return [n ? `التالي · ${thumunWord(n)}` : 'حدّد شيئاً أو اختر «لا أحفظ شيئاً بعد»', n > 0, 'obNext'];
    }
    if (ob.step === 'strength') return ['التالي', true, 'obNext'];
    return ['ابدأ', true, 'obFinish'];
  },

  dir(X, ob) {
    const card = (v, l, s, ic) => `<button class="big-choice ${ob.dir === v ? 'on' : ''}" data-a="obDir" data-v="${v}" role="radio" aria-checked="${ob.dir === v}"><span class="icon-box">${icon(ic, 26)}</span><span style="flex:1;display:flex;flex-direction:column"><span style="font-size:19px;font-weight:500">${l}</span><span class="t-body-s">${s}</span></span></button>`;
    return `<div class="page" style="gap:14px;padding-top:24px">
      <div class="onb-intro has-aurora">${C.aurora('dawn')}<span style="font-size:20px;font-weight:500;line-height:1.4">رفيقك للحفظ والمراجعة</span><span class="t-body-s" style="color:var(--tx-2)">يرتّب لك ورداً يومياً من الحفظ الجديد والمراجعة، وتقرأ أنت من مصحفك ثم تسجّل ما أنجزته.</span></div>
      <h1 class="h-onb">من أين تحفظ عادة؟</h1><div class="lede" style="padding:0 4px 10px">يحدّد هذا ترتيب الحفظ الجديد. يمكنك تغييره لاحقاً من الإعدادات.</div>
      <div role="radiogroup" style="display:flex;flex-direction:column;gap:14px">${card('fwd', 'من البقرة نزولاً', 'تبدأ من أول المصحف وتتقدّم نحو آخره', 'arrow-down')}${card('bwd', 'من الناس صعوداً', 'تبدأ من قصار السور وتعود نحو أول المصحف', 'arrow-up')}</div></div>`;
  },

  sel(X, ob) {
    const n = Sel.count(ob.sel);
    const mode = { surah: Onboarding.bySurah, hizb: Onboarding.byHizb, precise: Onboarding.precise }[ob.mode](X, ob);
    return `<div class="page" style="gap:14px;padding-top:${ob.edit ? 4 : 20}px">
      ${ob.edit ? '' : '<h1 class="h-onb">ما الذي تحفظه الآن؟</h1>'}
      ${C.seg('obMode', [['surah', 'بالسور'], ['hizb', 'بالأحزاب'], ['precise', 'تحديد دقيق']], ob.mode, { h44: true })}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 6px;min-height:48px"><span class="t-title-s" style="font-size:15px">${n ? thumunWord(n) + ' محدداً' : 'لم يُحدَّد شيء بعد'}</span>${ob.edit ? '' : C.btn('لا أحفظ شيئاً بعد', 'obNone', null, { kind: 'link', size: 'xs' })}</div>
      ${mode}</div>`;
  },
  bySurah(X, ob) {
    return `<div class="group">${SURAH_NAMES.map((name, k) => {
      const s = k + 1, a = surahStart(s), b = surahEnd(s), n = b - a + 1, st = Sel.state(ob.sel, a, b);
      let up = 0; while (up < n && ob.sel[a + up]) up++;
      const refining = ob.refine === s;
      return `<div style="background:var(--surface)"><div style="display:flex;align-items:center;gap:4px;padding:4px 8px 4px 4px">
        <button style="flex:1;min-width:0;display:flex;align-items:center;gap:14px;min-height:60px;padding:6px 12px;text-align:right" data-a="obSurah" data-v="${s}" role="checkbox" aria-checked="${st === 'all' ? 'true' : st === 'part' ? 'mixed' : 'false'}">${C.chk(st)}<span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s">${s} · ${name}</span><span class="t-cap">${st === 'part' ? (up ? `محفوظ حتى الآية ${up} من ${n}` : 'محدّد جزئياً') : ayatWord(n)}</span></span></button>
        ${st !== 'none' || refining ? C.btn('حدّد الآيات', 'obRefine', s, { kind: 'tonal', size: 'xs' }).replace('btn tonal', 'btn tonal').replace('class="btn', 'style="background:var(--surface-subtle)" class="btn') : ''}</div>
        ${refining ? `<div style="margin:0 12px 12px;padding:14px;border-radius:18px;background:var(--surface-subtle);display:flex;flex-direction:column;gap:10px"><span class="t-title-s" style="font-size:14px;text-align:center">${up ? `من الآية 1 إلى الآية ${up}` : 'لا شيء'}</span>
          <div class="btn-row">${[['+10', 10], ['+1', 1], ['−1', -1], ['−10', -10]].map(([l, d]) => `<button class="btn outline s flex num" style="border-radius:14px" data-a="obSurahUpTo" data-v="${s}:${Math.max(0, Math.min(n, up + d))}">${l}</button>`).join('')}</div></div>` : ''}</div>`;
    }).join('')}</div>`;
  },
  byHizb(X, ob) {
    return `<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">${Array.from({ length: 60 }, (_, k) => {
      const h = k + 1, ids = hizbThumun(h), n = ids.filter(i => Sel.state(ob.sel, THUMUN[i].start, THUMUN[i].end) === 'all').length;
      const st = n === 8 ? 'all' : n || ids.some(i => Sel.state(ob.sel, THUMUN[i].start, THUMUN[i].end) === 'part') ? 'part' : 'none';
      const bg = st === 'all' ? 'background:var(--brand);color:var(--on-brand)' : st === 'part' ? 'background:var(--brand-subtle);box-shadow:inset 0 0 0 1.5px var(--brand-text)' : 'background:var(--surface);box-shadow:inset 0 0 0 1px var(--bd-2)';
      return `<button style="height:60px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;font-size:16px;font-weight:500;transition:all 140ms;${bg}" data-a="obHizb" data-v="${h}" aria-pressed="${st === 'all'}"><span class="num">${h}</span><span style="font-size:11px;font-weight:400" class="num">${st === 'part' ? n + '/8' : ''}</span></button>`;
    }).join('')}</div><div class="foot-note">اضغط على الحزب لتحديده كاملاً. للحزب المحفوظ جزئياً استخدم «تحديد دقيق».</div>`;
  },
  precise(X, ob) {
    const h = ob.pHizb, ids = hizbThumun(h), all = ids.every(i => Sel.state(ob.sel, THUMUN[i].start, THUMUN[i].end) === 'all');
    return `<div class="card r24" style="flex-direction:row;align-items:center;gap:10px;padding:12px">${C.iconBtn('caret-right', 'obPHizb', h > 1 ? h - 1 : 60, 'الحزب السابق', { kind: 'subtle', size: 20 })}<span style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center"><span class="t-title-m">الحزب ${h}</span><span class="t-cap">${rangeText(THUMUN[ids[0]].start, THUMUN[ids[7]].end)}</span></span>${C.iconBtn('caret-left', 'obPHizb', h < 60 ? h + 1 : 1, 'الحزب التالي', { kind: 'subtle', size: 20 })}</div>
      ${C.btn(all ? 'إلغاء تحديد الحزب' : 'تحديد الحزب كاملاً', 'obHizb', h, { kind: 'tonal', size: 'xs' }).replace('class="btn', 'style="align-self:flex-start" class="btn')}
      <div class="group">${ids.map(i => { const T = THUMUN[i], st = Sel.state(ob.sel, T.start, T.end); return `<button class="row" style="min-height:64px" data-a="obThumun" data-v="${i}" role="checkbox" aria-checked="${st === 'all'}">${C.chk(st)}<span class="tx"><span class="l">${rangeText(T.start, T.end)}</span><span class="c">الثُّمن ${T.k} · ${pagesText(T.start, T.end)}</span></span></button>`; }).join('')}</div>`;
  },

  strength(X, ob) {
    const groups = Sel.groups(ob);
    return `<div class="page" style="gap:14px;padding-top:20px"><h1 class="h-onb">كيف ترى قوة محفوظك؟</h1>
      <div class="note info" style="display:flex;flex-direction:column"><span>هذا تقدير أولي فقط.</span><span>سيتعلم التطبيق من مراجعاتك الفعلية.</span></div>
      <div class="btn-row">${[['S', 'قوي'], ['M', 'متوسط'], ['W', 'ضعيف']].map(([v, l]) => C.btn('الكل ' + l, 'obStrengthAll', v, { kind: 'outline', size: 'xs', flex: true })).join('')}</div>
      ${groups.map(g => { const T0 = THUMUN[g.ids[0]], T1 = THUMUN[g.ids[g.ids.length - 1]], cur = ob.strength[g.ids[0]] || 'M';
        return `<div class="card r22 p16" style="gap:10px"><span style="display:flex;flex-direction:column"><span class="t-title-s">${rangeText(T0.start, T1.end)}</span><span class="t-cap">الجزء ${g.j} · ${thumunWord(g.ids.length)}</span></span>${C.seg('obStrength', [['S', 'قوي'], ['M', 'متوسط'], ['W', 'ضعيف']].map(([v, l]) => [g.key + ':' + v, l]), g.key + ':' + cur)}</div>`; }).join('')}</div>`;
  },

  plan(X, ob) {
    const remaining = THUMUN.length - Sel.count(ob.sel), est = finishEstimate(remaining, ob.newAmount, X.t);
    const custom = !OB_SLOTS.some(([v]) => v === ob.reminderTime);
    const finish = !remaining ? '<span class="big">أتممت الحفظ</span><span class="t-body-s">يبقى ورد المراجعة لتثبيت المحفوظ.</span>'
      : `<span class="t-meta t-2">إن استمررت هكذا تختم في</span><span class="big">${dateText(est.day, { month: 'long', year: 'numeric' })}</span><span class="t-body-s">بقي ${thumunWord(remaining)} · نحو ${spanWord(est.days)}. تقدير تقريبي يتغيّر مع وتيرتك.</span>`;
    return `<div class="page" style="gap:16px;padding-top:20px"><h1 class="h-onb">وردك المعتاد</h1>
      <div class="card r24 p18"><span style="display:flex;justify-content:space-between"><span class="t-title-s">كم تحفظ في اليوم؟</span><span class="t-meta">≈ ${minutesWord(Math.round(MIN_NEW * ob.newAmount))}</span></span>${C.seg('obNewAmt', [['0.5', 'نصف ثُمن'], ['1', 'ثُمن'], ['2', 'ثُمنان']], String(ob.newAmount), { h44: true })}<span class="t-cap">ابدأ بأقل مما تظن. الاستمرار أهم من الكمية.</span></div>
      <div class="card r24 p18" style="flex-direction:row;align-items:center;gap:12px"><span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s">المراجعة</span><span class="t-meta">المقترح: 8 أثمان · نحو ${minutesWord(revMinutes(ob.reviewAmount))}</span></span>${C.stepperSmall(ob.reviewAmount, 'obRevAmt', 2, 24)}</div>
      <div class="card r24 p18" style="gap:14px"><div style="display:flex;align-items:center;gap:12px"><span style="flex:1;display:flex;flex-direction:column"><span class="t-title-s">متى تتفرّغ؟</span><span class="t-meta">${ob.reminderOn ? 'تذكير واحد في اليوم · ' + timeText(ob.reminderTime) : 'دون تذكير'}</span></span>${C.switch(ob.reminderOn, 'obReminder', null, 'التذكير')}</div>
        <div class="chips" style="${ob.reminderOn ? '' : 'opacity:.4;pointer-events:none'}">${OB_SLOTS.map(([v, l]) => `<button class="chip-btn ${ob.reminderTime === v ? 'on' : ''}" data-a="obRemTime" data-v="${v}" aria-pressed="${ob.reminderTime === v}">${l}</button>`).join('')}<button class="chip-btn ${custom ? 'on' : ''}" data-a="sheet" data-v="time:ob">${custom ? timeText(ob.reminderTime) : 'وقت آخر…'}</button></div></div>
      <div class="plan-sum"><span class="t-title-s">خطتك جاهزة</span>${finish}
        <dl><dt>البداية</dt><dd>${ob.dir === 'bwd' ? 'من الناس صعوداً' : 'من البقرة نزولاً'}</dd><dt>الوتيرة</dt><dd>${amountLabel(ob.newAmount)} يومياً · مراجعة ${thumunWord(ob.reviewAmount)}</dd><dt>الوقت</dt><dd>${ob.reminderOn ? timeText(ob.reminderTime) : 'دون تذكير'}</dd></dl></div></div>`;
  }
};
