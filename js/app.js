// App shell: navigation, overlays, actions, theme and display, reminders, native bridge.
// Screens (js/screens) render from a context; the engine (model.js) owns every decision.
'use strict';

const BRAND = 'وِرْد';
const NATIVE = window.WirdAndroid || null; // Android shell bridge; absent in a browser
if (NATIVE) document.documentElement.classList.add('native'); // full-screen layout, never the desktop phone frame
let S = loadState();
const app = document.getElementById('app');
const T = () => todayNum(S);

const ui = {
  tab: 'today', stack: [], sheets: [], snack: null, anim: 'enter-fade',
  rec: null, extra: null, ob: S.onboarded ? null : Sel.newOb(),
  memView: 'surah', memFilter: 'all', weakSort: 'all', q: '', openThumun: null,
  showNew: false, pressureOff: false, reportSpan: 'month', repWeak: true, repSess: true, tour: null,
  cu: null, mic: null, autoErr: null, pick: null, recFilter: 'all', recTh: null, kbSec: 'mut', kbJump: false, kbq: '', kbMine: false,
  recView: null, chkI: 0, planOpen: null, planNew: null, mkStatus: 'open', mkCat: 'all', drill: null
};

const SCREENS = {
  today: TodayScreen, mem: MemScreen, rec: ReciteScreen, prog: ProgScreen, set: SetScreen, recd: RecDetailScreen, progRec: ProgRecScreen, know: KnowScreen, recMistakes: RecMistakesScreen,
  counter: CounterScreen, surah: SurahScreen, juz: JuzScreen, hizb: HizbScreen, search: SearchScreen, weak: WeakScreen,
  progMem: ProgMemScreen, progAct: ProgActScreen, progStr: ProgStrScreen, progMs: ProgMsScreen, history: HistoryScreen, session: SessionScreen,
  setNew: SetNewScreen, setRev: SetRevScreen, setMode: SetModeScreen, setRem: SetRemScreen, setDisp: SetDispScreen,
  setData: SetDataScreen, setRec: SetRecScreen, setTeacher: SetTeacherScreen, howReview: HowReviewScreen, setAdv: SetAdvScreen,
  guide: GuideScreen, legend: LegendScreen, privacy: PrivacyScreen,
  editMem: { title: 'تعديل المحفوظ', render: X => Onboarding.sel(X, ui.ob) }
};
const TAB_OF = { mem: ['surah', 'juz', 'hizb', 'search', 'weak', 'know'], rec: ['recd', 'recMistakes'], prog: ['progMem', 'progAct', 'progStr', 'progRec', 'progMs', 'history', 'session'], set: ['setNew', 'setRev', 'setMode', 'setRem', 'setDisp', 'setData', 'setRec', 'setTeacher', 'howReview', 'setAdv', 'guide', 'legend', 'privacy'] };
const current = () => ui.stack.length ? ui.stack[ui.stack.length - 1] : ui.tab;

function ctx() {
  const t = T(), p = plan(S, t), snap = VM.snapshot(S, t, p);
  let sur = null;
  return { S, t, p, snap, ui, surahs: () => sur || (sur = VM.surahs(S, snap)), tipOn: k => S.onboarded && ui.tour == null && !S.prefs.tips[k] };
}
function save() { saveState(S); publish(); }

// The Android widget and the reminder's "done" action cannot read the web app's storage, so a
// small status line is handed to the shell after every save.
function publish() {
  if (!NATIVE || !NATIVE.publishStatus) return;
  try {
    const t = T(), p = plan(S, t), n = list => list.reduce((s, x) => s + x.ids.length, 0);
    const parts = [p.newItem ? 'حفظ جديد' : '', p.recent.length ? 'قريب ' + thumunWord(n(p.recent)) : '', p.review.length ? 'مراجعة ' + thumunWord(n(p.review)) : ''].filter(Boolean);
    NATIVE.publishStatus(JSON.stringify({ day: t, onboarded: S.onboarded, done: p.done, note: p.done ? '' : wirdNote(p), nextDay: t + 1, nextNote: wirdNote(plan(S, t + 1)),
      title: p.done ? 'تم ورد اليوم ✓' : 'ورد اليوم · نحو ' + durationText(p.total),
      line: p.done ? 'وردك التالي غداً' : parts.length ? parts.join(' · ') : 'لا مراجعة مستحقة اليوم' }));
  } catch (e) { /* the widget simply keeps its last status */ }
}

// The reminder's text: what the wird holds and about how long it takes. No pressure, no exclamation.
function wirdNote(p) {
  const n = list => list.reduce((s, x) => s + x.ids.length, 0), rv = n(p.recent) + n(p.review);
  const bits = [p.newItem ? 'حفظ ' + shortRange(p.newItem.from, p.newItem.to).replace(/[\u2066-\u2069\u2060]/g, '') : '', rv ? 'مراجعة ' + thumunWord(rv) : ''].filter(Boolean);
  return bits.length ? bits.join(' و') + '، نحو ' + durationText(p.total) + '.' : '';
}

// Milestones: what was already memorized is noted silently; what a save has just reached is
// announced once, calmly.
function seedMilestones() { markMilestones(S, T(), 0); }
function celebrate() {
  const fresh = markMilestones(S, T(), T());
  if (!fresh.length) return false;
  saveState(S);
  const top = [...fresh].reverse().find(m => m.kind !== 'check') || fresh[0];
  ui.sheets = [{ t: 'milestone', id: top.id }];
  return true;
}

// Weekly automatic backup to a folder chosen once (Android only; the data lives in this page).
const AutoBackup = {
  available: () => !!(NATIVE && NATIVE.backupFolderName),
  folder() { try { return NATIVE.backupFolderName() || ''; } catch (e) { return ''; } },
  run(force) {
    if (!AutoBackup.available() || !S.onboarded || !AutoBackup.folder()) return false;
    if (!force && S.lastAutoBackup != null && T() - S.lastAutoBackup < 7) return false;
    const d = new Date(), name = `wird-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    let ok = false;
    try { ok = NATIVE.writeBackup(name, exportPayload(S)); } catch (e) { ok = false; }
    if (ok) { S.lastAutoBackup = T(); S.lastExport = T(); ui.autoErr = null; saveState(S); }
    else ui.autoErr = 'تعذّر الحفظ في المجلد. اختره من جديد.';
    return ok;
  }
};

// Keep the screen on while reciting (counter, recording the wird, recording yourself).
let awake = false, wakeLock = null;
function setAwake(on) {
  if (on === awake) return;
  awake = on;
  if (NATIVE && NATIVE.keepAwake) { NATIVE.keepAwake(on); return; }
  if (!('wakeLock' in navigator)) return;
  if (on) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => { awake = false; });
  else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// ---- theme and display -------------------------------------------------------------------------

function applyTheme() {
  const st = S.settings, h = document.documentElement;
  const dark = st.theme === 'dark' || (st.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  h.dataset.theme = dark ? 'dark' : 'light';
  h.dataset.hc = st.stateColors !== 'default' ? 'on' : 'off';
  h.dataset.cvd = st.stateColors === 'cvd' ? 'on' : 'off';
  h.dataset.motion = st.motion;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0E1311' : '#F3F4F0';
  if (NATIVE && applyTheme.last !== dark) { applyTheme.last = dark; NATIVE.setTheme(dark); }
}
const zoomOf = st => ({ small: .92, default: 1, large: 1.12, xl: 1.25 }[st.textSize] || 1) * (st.density === 'compact' ? .94 : 1);

// ---- render ---------------------------------------------------------------------------------

const scrollMem = {};
let lastOverlay = '';
function render() {
  app.querySelectorAll('[data-k]').forEach(el => { scrollMem[el.dataset.k] = el.scrollTop; });
  const focus = document.activeElement && document.activeElement.id ? { id: document.activeElement.id, pos: document.activeElement.selectionStart } : null;
  applyTheme();
  const X = ctx(), zoom = zoomOf(S.settings);
  let html;
  if (!S.onboarded) {
    const [label, on, a] = Onboarding.cta(X);
    html = `<div class="scroller onb" data-k="onb-${ui.ob.step}-${ui.ob.mode}" style="zoom:${zoom}"><div class="${ui.anim}">${Onboarding.render(X)}</div></div>
      <div class="onb-dock">${C.btn(label, a, null, { kind: on ? 'primary' : 'pending', size: 'l', full: true })}</div>`;
  } else {
    const [name, ...args] = current().split(':');
    const scr = SCREENS[name] || SCREENS.today, root = !ui.stack.length;
    const title = root ? '' : C.topBar(typeof scr.title === 'function' ? scr.title(X, ...args) : scr.title || '');
    const cta = root && name === 'today' && !X.p.done && (X.snap.counts.mem || X.p.newItem)
      ? `<div class="cta-dock">${C.btn('سجّل الورد', 'record', null, { size: 'l', icon: 'check-circle', iconSize: 22, tour: 'record' })}${C.btn('سجّل مراجعة أخرى', 'extraSheet', null, { kind: 'raised', size: 'l' })}</div>` : '';
    const editDock = name === 'editMem' ? (() => { const [label, on, a] = Onboarding.cta(X); return `<div class="onb-dock">${C.btn(label, a, null, { kind: on ? 'primary' : 'pending', size: 'l', full: true })}</div>`; })() : '';
    html = `<div class="scroller ${cta ? 'with-cta' : ''} ${editDock ? 'onb' : ''}" data-k="${current()}" style="zoom:${zoom}">${title}<div class="${ui.anim}">${scr.render(X, ...args)}</div></div>${cta}${editDock}${editDock ? '' : nav()}`;
  }
  const sh = ui.sheets[ui.sheets.length - 1];
  if (sh) html += Sheets.render(X, sh);
  if (ui.snack) html += `<div class="snack ${sh || !S.onboarded || current() === 'editMem' ? 'low' : ''}" role="status">${icon('check-circle-fill', 20)}<span>${ui.snack.text}</span>${ui.snack.undo ? '<button data-a="undo">تراجع</button>' : ''}</div>`;
  if (ui.tour != null) html += Tour.render(ui.tour);
  app.innerHTML = html;

  app.querySelectorAll('[data-k]').forEach(el => { if (scrollMem[el.dataset.k]) el.scrollTop = scrollMem[el.dataset.k]; });
  // Overlays are rebuilt on every render; animate them only when they first appear.
  const ov = sh ? sh.t + ':' + ui.sheets.length : '';
  if (ov && ov === lastOverlay) app.querySelectorAll('.sheet, .overlay .scrim').forEach(el => { el.style.animation = 'none'; });
  lastOverlay = ov;
  if (focus) { const el = document.getElementById(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.pos, focus.pos); } catch (e) { /* not a text field */ } } }
  if (ui.kbJump) { ui.kbJump = false; const f = app.querySelector('.kb-focus'); if (f) f.scrollIntoView({ block: 'start' }); }
  if (ui.tour != null) Tour.place(ui.tour, app); // layout is ready right after innerHTML
  ui.anim = '';
  setAwake(!document.hidden && S.onboarded && (current() === 'counter' || !!(sh && (sh.t === 'record' || sh.t === 'recorder')) || !!(Player.audio && !Player.audio.paused)));
  if (current().startsWith('recd:')) ensureAnalysis(curRecId());
}

// The highlighted tab follows the screen shown (a hizb opened from Today highlights المحفوظ).
function nav() {
  const items = [['today', 'اليوم', 'sun-horizon'], ['mem', 'المحفوظ', 'books'], ['rec', 'التلاوة', 'microphone'], ['prog', 'التقدّم', 'chart-bar'], ['set', 'الإعدادات', 'sliders-horizontal']];
  const name = current().split(':')[0];
  const tab = ui.stack.length ? (Object.keys(TAB_OF).find(k => TAB_OF[k].includes(name)) || ui.tab) : ui.tab;
  return `<div class="nav-wrap"><nav class="nav">${items.map(([k, l, ic]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-v="${k}" aria-current="${tab === k ? 'page' : 'false'}">${icon(tab === k ? ic + '-fill' : ic, 24)}<span>${l}</span></button>`).join('')}</nav></div>`;
}

// ---- feedback --------------------------------------------------------------------------------

let snackTimer;
function snack(text, undo) {
  ui.snack = { text, undo: undo || null };
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { ui.snack = null; render(); }, undo ? 5000 : 3200);
}
const hap = ms => { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* no haptics */ } };
const snapshotState = () => JSON.stringify(S);
function confirmSheet(c) { ui.sheets.push({ t: 'confirm', ...c }); }

// ---- navigation --------------------------------------------------------------------------------

function go(v) {
  if (v.startsWith('tab:')) return A.tab(v.slice(4));
  if (v === 'memMap') { ui.tab = 'mem'; ui.stack = []; ui.memView = 'map'; ui.anim = 'enter-fade'; return; }
  const [name, , k] = v.split(':');
  ui.sheets = []; ui.snack = null;
  if (name === 'recd') { ui.recView = null; ui.chkI = 0; Player.loop = null; }
  ui.openThumun = name === 'hizb' && k ? +k : null;
  if (current() !== v) ui.stack.push(v);
  ui.anim = 'enter-push';
}

// ---- recording ---------------------------------------------------------------------------------

const toEngine = e => ({ kind: e.kind, ids: e.ids, from: e.from, to: e.to, status: e.status, rating: e.rating, lastAyah: e.lastAyah, errors: e.errors });
function planItems(p) {
  const collapsed = p.returning && !ui.showNew;
  return [...(p.newItem && !collapsed ? [p.newItem] : []), ...p.recent, ...p.review];
}
// day: a missed day (recorded after the fact); today when omitted. Drafts are kept for today only.
function openRecord(day) {
  const t = T(), dy = day ?? t, p = plan(S, dy);
  const items = dy === t ? planItems(p) : [...(p.newItem ? [p.newItem] : []), ...p.recent, ...p.review];
  const key = planKey(items), d = S.draft;
  ui.rec = dy === t && d && d.day === t && d.mode === 'daily' && d.key === key ? { mode: 'daily', day: t, key, teacher: d.teacher, entries: d.entries, missing: false }
    : { mode: 'daily', day: dy, key, teacher: false, missing: false, entries: items.map(it => ({ kind: it.kind, label: REC_LABEL[it.kind], ids: it.ids, from: it.from, to: it.to, status: -1, rating: -1, lastAyah: null, errors: [] })) };
  ui.sheets = [{ t: 'record' }];
}
function keepDraft() {
  const r = ui.rec;
  if (!r || r.mode !== 'daily' || r.day !== T()) return;
  const touched = r.teacher || r.entries.some(e => e.status >= 0 || e.errors.length);
  S.draft = touched ? { day: T(), mode: 'daily', key: r.key, teacher: r.teacher, entries: r.entries } : null;
  save();
}
// Options for "another review": a given range, or suggestions then memorized hizbs.
function extraOptions(ids) {
  const t = T(), mem = memIds(S), opt = list => {
    const T0 = THUMUN[list[0]], T1 = THUMUN[list[list.length - 1]];
    return { ids: list, from: T0.start, to: T1.end, meta: `${T0.hizb === T1.hizb ? thumunMetaDual(list) : 'الحزب ' + iso(T0.hizb + '–' + T1.hizb)} · ${VM.summary(list.map(i => VM.cell(S, i, t)))}` };
  };
  if (ids) return segment(ids.filter(i => S.th[i] && S.th[i].mem)).length > 2 ? [opt(ids)] : segment(ids).map(opt);
  const done = new Set(mem.filter(i => S.th[i].last === t));
  const post = (S.postponed[t] || []).filter(i => S.th[i] && S.th[i].mem);
  const weak = mem.filter(i => S.th[i].strength === 'W' && !done.has(i) && !post.includes(i));
  const soon = mem.filter(i => { const x = S.th[i]; return x.due > t && x.due - t <= 3 && !done.has(i); });
  const sugg = [...segment(post), ...segment(weak), ...segment(soon)].slice(0, 3).map(opt);
  const hizbs = [...new Set(mem.map(i => THUMUN[i].hizb))].map(h => opt(mem.filter(i => THUMUN[i].hizb === h)));
  return [...sugg, ...hizbs];
}

// ---- actions -----------------------------------------------------------------------------------

const A = {
  go,
  back() {
    if (current() === 'editMem') {
      if (ui.ob && ui.ob.changed) {
        confirmSheet({ title: 'تجاهل التغييرات؟', body: 'لم تُحفظ التغييرات على المحفوظ بعد. إن خرجت الآن يبقى المحفوظ كما كان.', ok: 'تجاهل وخروج', danger: true,
          run: () => { ui.ob.changed = false; A.back(); } });
        return;
      }
      ui.ob = null;
    }
    ui.stack.pop(); ui.snack = null; ui.openThumun = null; ui.anim = 'enter-pop';
  },
  tab(v) { ui.tab = v; ui.stack = []; ui.sheets = []; ui.snack = null; ui.memFilter = v === 'mem' ? ui.memFilter : 'all'; ui.anim = 'enter-fade'; scrollMem[v] = 0; },
  closeSheet() {
    const sh = ui.sheets.pop();
    if (sh && sh.t === 'record') keepDraft();
    if (sh && sh.t === 'error') ui.sheets.push({ t: 'record' });
    if (sh && sh.t === 'welcome') { S.prefs.tour = 'skipped'; save(); }
    if (sh && sh.t === 'recorder') {
      const m = ui.mic;
      if (m && (m.state === 'rec' || m.state === 'paused' || m.state === 'done') && !sh.sure) {
        ui.sheets.push(sh);
        confirmSheet({ title: 'تجاهل هذا التسجيل؟', body: 'لم يُحفظ بعد. إن خرجت الآن يُحذف ما سجّلته.', ok: 'تجاهل التسجيل', danger: true, run: () => { sh.sure = true; A.closeSheet(); } });
        return;
      }
      stopMicLoop(); Mic.release(); micBusy(false); Player.stop(); ui.mic = null; ui.drill = null; Clips.draftClear();
    }
    if (sh && sh.t === 'mistake') {
      if (sh.vnRec) { clearInterval(vnTimer); Mic.release(); micBusy(false); }
      const x = S.recs[sh.id] && S.recs[sh.id].ayahs[sh.g];
      if (sh.vn && !(x && x.vn)) Clips.vnRemove(sh.id + ':' + sh.g); // recorded, but the mistake was not saved
      if (Player.id === 'vn:' + sh.id + ':' + sh.g) Player.stop();
    }
  },
  sheet(v) {
    if (v === 'confused') { const parent = ui.sheets.pop(); ui.sheets.push(parent, { t: 'confused', parent }); }
    else if (v.startsWith('time:')) ui.sheets.push({ t: 'time', target: v.slice(5) });
  },
  undo() {
    const u = ui.snack && ui.snack.undo; ui.snack = null;
    if (typeof u === 'string') { S = hydrate(JSON.parse(u)); save(); Reminder.schedule(); }
    else if (typeof u === 'function') u();
  },
  dismissTip(k) { S.prefs.tips[k] = 1; save(); },

  // «عن القرآن»
  kbSec(v) { ui.kbSec = v; const i = ui.stack.length - 1; if (i >= 0 && ui.stack[i].startsWith('know')) ui.stack[i] = 'know'; },
  kbOpen(v) { const [sec, id] = v.split(':'); ui.kbSec = sec; ui.kbq = ''; ui.kbMine = false; go('know:' + sec + ':' + id); ui.kbJump = true; },
  kbGroup(v) { const g = KB_GROUPS.find(x => x[0] === v); if (g) A.kbSec(g[2][0][0]); },
  kbMine(v) { ui.kbMine = v === '1'; },
  kbClear() { ui.kbq = ''; },

  // A missed day (recorded after the fact)
  missed() { const days = backfillDays(S, T()); if (days.length === 1) openRecord(days[0]); else if (days.length) ui.sheets = [{ t: 'missed' }]; },
  recordDay(d) { openRecord(+d); },

  // Catch-up plan
  catchupSheet() { ui.cu = { days: 5, pauseNew: true }; ui.sheets = [{ t: 'catchup' }]; },
  cuDays(v) { ui.cu.days = +v; },
  cuPause() { ui.cu.pauseNew = !ui.cu.pauseNew; },
  catchupStart() {
    const snap = snapshotState();
    S.catchup = { start: T(), days: ui.cu.days, pauseNew: ui.cu.pauseNew };
    ui.sheets = []; ui.pressureOff = true; save(); hap(20);
    snack('بدأت خطة التعويض · ' + daysWord(ui.cu.days), snap);
  },
  catchupStop() { const snap = snapshotState(); S.catchup = null; save(); snack('أُوقفت خطة التعويض', snap); },

  // Personal notes
  noteSheet(id) { ui.sheets = [{ t: 'note', th: +id }]; },
  noteSave(id) {
    const el = document.getElementById('note-in'), v = (el ? el.value : '').trim().slice(0, 500), snap = snapshotState();
    if (v) S.notes[+id] = { text: v, day: T() }; else delete S.notes[+id];
    ui.sheets = []; save();
    snack(v ? 'حُفظت الملاحظة' : 'حُذفت الملاحظة', v ? null : snap);
  },
  noteDelete(id) { const snap = snapshotState(); delete S.notes[+id]; ui.sheets = []; save(); snack('حُذفت الملاحظة', snap); },

  // «التلاوة»: choose what to record, record it, then assess it
  recPick() { const m = memIds(S); ui.pick = { ids: null, purpose: 'both', h: m.length ? THUMUN[m[0]].hizb : 1 }; ui.sheets = [{ t: 'pick' }]; },
  pickIds(v) { const ids = String(v).split('.').map(Number); ui.pick.ids = ids; if (ids.length === 1) ui.pick.h = THUMUN[ids[0]].hizb; },
  pickH(d) { ui.pick.h = Math.min(60, Math.max(1, ui.pick.h + +d)); },
  pickPurpose(v) { ui.pick.purpose = v; },
  pickGo() { openRecorder(ui.pick.ids, ui.pick.purpose); },
  recThumun(id) {
    const n = Object.values(S.recs).filter(r => r.ids.includes(+id)).length;
    if (n) { A.tab('rec'); ui.recTh = +id; } else openRecorder([+id], 'both');
  },
  recFilter(v) { ui.recFilter = v; },
  recTh() { ui.recTh = null; },
  recTop(v) { const [from] = v.split(':').map(Number); A.tab('rec'); ui.recTh = AYAH_TH[from]; },
  recPlay(id) {
    id = +id; const tr = S.recs[id] && S.recs[id].trim;
    if (Player.playing(id)) { Player.pause(); return; }
    const at = tr && (Player.id !== id || Player.posMs() < tr[0] || Player.posMs() >= tr[1] - 200) ? tr[0] : null;
    Player.play(id, null, at, tr ? tr[1] : null).then(render).catch(() => { snack('تعذّر تشغيل التسجيل'); render(); });
  },
  recSkip(d) { Player.skip(+d); },
  recRate(v) { Player.setRate(+v); },
  recRate1(v) { const [id, r] = v.split(':').map(Number); S.recs[id].rating = S.recs[id].rating === r ? -1 : r; save(); },
  recErr(v) { const [id, g] = v.split(':').map(Number), e = S.recs[id].errors; S.recs[id].errors = e.includes(g) ? e.filter(x => x !== g) : [...e, g].sort((a, b) => a - b); save(); },
  recAspect(v) { const [id, k, val] = v.split(':'), a = S.recs[+id].aspects; if (a[k] === +val) delete a[k]; else a[k] = +val; save(); },
  recPurpose(v) { const [id, p] = v.split(':'); S.recs[+id].purpose = p; save(); },
  recCount(id) {
    const snap = snapshotState();
    if (countRecording(S, +id, T())) { save(); hap(20); snack('احتُسبت مراجعة لهذا الموضع', snap); Reminder.schedule(); }
  },
  recAgain(id) { const r = S.recs[+id]; openRecorder(r.ids, r.purpose); },
  recDelete(id) {
    confirmSheet({ title: 'حذف هذا التسجيل؟', body: 'يُحذف الصوت وتقييمك وملاحظتك. ما احتُسب منه مراجعةً يبقى في سجلّك.', ok: 'حذف', danger: true,
      run: () => { if (Player.id === +id) Player.stop(); Clips.remove(+id).catch(() => {}); delete S.recs[+id]; save(); if (current().startsWith('recd:')) A.back(); snack('حُذف التسجيل'); } });
  },
  micStart() {
    Player.stop(); stopMicLoop();
    ui.mic = { state: 'idle', ms: 0, blob: null, error: null, marks: 0, hes: 0, away: false };
    const sh = ui.sheets[ui.sheets.length - 1];
    // The header lets an unfinished take be offered back after a crash.
    const draft = { day: T(), sheet: { ids: sh.ids, purpose: sh.purpose, plan: sh.plan || null, fix: sh.fix || null, from: sh.from ?? null, to: sh.to ?? null } };
    Mic.onInterrupt = micInterrupt;
    Mic.start(draft).then(() => { ui.mic.state = 'rec'; micBusy(true); render(); startMicLoop(); })
      .catch(e => { Mic.release(); ui.mic.error = micErrorText(e); render(); });
  },
  micPause() { Mic.pause(); ui.mic.state = 'paused'; ui.mic.away = false; },
  micResume() { if (!Mic.live()) return; Mic.resume(); ui.mic.state = 'rec'; ui.mic.away = false; startMicLoop(); },
  micNext() { ui.mic.marks = Mic.mark(); hap(10); },
  micUndo() { ui.mic.marks = Mic.unmark(); },
  micHes() { ui.mic.hes = Mic.hesMark(); hap(16); },
  micStop() {
    stopMicLoop(); micBusy(false);
    return Mic.stop().then(r => { if (r && ui.mic) ui.mic = { state: 'done', ms: r.ms, blob: r.blob, marks: r.marks.length, markList: r.marks, hes: r.hes.length, hesList: r.hes, error: null }; render(); });
  },
  micPlay() { Player.toggle('new', ui.mic.blob).then(render).catch(() => {}); },
  micSave(v) {
    const sh = ui.sheets[ui.sheets.length - 1], m = ui.mic, day = T();
    Player.stop();
    return Clips.add(sh.ids, day, m.ms, m.blob).then(c => {
      const r = S.recs[c.id] = newRec(sh.ids, day, m.ms, sh.purpose);
      if (m.markList && m.markList.length) { r.marks = m.markList; r.marksSrc = 'tap'; }
      if (m.hesList && m.hesList.length) r.hes = m.hesList;
      if (sh.plan) r.plan = sh.plan;
      save(); Clips.draftClear();
      ui.mic = null; ui.sheets = []; hap(20);
      if (v === 'later') { ensureAnalysis(c.id); return c.id; }
      A.tab('rec'); go('recd:' + c.id);
      ui.recView = sh.purpose === 'tajwid' ? 'listen' : 'check'; ui.chkI = 0;
      snack('حُفظ التسجيل · افتح مصحفك وراجعه آية بآية'); render();
      ensureAnalysis(c.id);
      return c.id;
    }).catch(() => { snack('تعذّر حفظ التسجيل'); render(); return null; });
  },
  micDiscard() { Player.stop(); Clips.draftClear(); ui.mic = { state: 'idle', ms: 0, blob: null, error: null, marks: 0, hes: 0 }; },

  // Recording detail: views, the per-ayah self-check, listening tools
  recView(v) { ui.recView = v; Player.loop = null; Player.halt(); },
  chkGo(i) { ui.chkI = +i; Player.halt(); },
  chkJump(k) { ui.recView = 'check'; ui.chkI = Math.max(0, +k); Player.halt(); },
  chkPlay(i) {
    const id = curRecId(), r = S.recs[id], c = Clips.get(id);
    if (Player.playing(id)) { Player.halt(); return; }
    const sg = recSegments(r, c && c.durMs)[+i];
    if (!sg) return;
    Player.loop = null;
    Player.play(id, null, sg.from, sg.to).then(render).catch(() => { snack('تعذّر تشغيل التسجيل'); render(); });
  },
  chkPause(v) { const id = curRecId(); Player.loop = null; Player.play(id, null, Math.max(0, +v - 1000), +v + 3500).then(render).catch(() => {}); },
  // The verdict gate: ✓ / ؟ here, ✗ through the mistake sheet. Moves on only if you turned that on.
  chkRes(v) {
    const id = curRecId(), r = S.recs[id], c = Clips.get(id), segs = recSegments(r, c && c.durMs);
    const i = Math.min(ui.chkI || 0, segs.length - 1), sg = segs[i];
    if (r.ayahs[sg.g1] && r.ayahs[sg.g1].vn) Clips.vnRemove(id + ':' + sg.g1);
    setAyahResult(r, sg.g1, v);
    save(); hap(8); Player.halt();
    if (S.settings.recAutoNext) A.chkNext();
  },
  chkNext() {
    const id = curRecId(), r = S.recs[id], c = Clips.get(id), segs = recSegments(r, c && c.durMs), i = Math.min(ui.chkI || 0, segs.length - 1);
    if (i >= segs.length - 1) return;
    ui.chkI = i + 1; const nx = segs[i + 1];
    Player.loop = null; Player.play(id, null, nx.from, nx.to).then(render).catch(() => {});
  },
  chkWrong() {
    const id = curRecId(), r = S.recs[id], c = Clips.get(id), segs = recSegments(r, c && c.durMs), sg = segs[Math.min(ui.chkI || 0, segs.length - 1)];
    const own = !r.ayahs[sg.g1] && (r.hes || []).some(h => h >= sg.from && h < sg.to);
    Player.halt(); ui.sheets = [{ t: 'mistake', id, g: sg.g1, ...(own ? { cat: 'hesitate' } : {}) }];
  },
  // Listen around a «تردّدت هنا» mark: the hesitation comes just before the tap.
  chkHes(v) { const id = curRecId(); Player.loop = null; Player.play(id, null, Math.max(0, +v - 4000), +v + 1500).then(render).catch(() => {}); },
  mkCat(v) { const sh = ui.sheets[ui.sheets.length - 1]; sh.cat = v; const n = document.getElementById('mk-note'); if (n) sh.text = n.value; },
  mkSave() {
    const top = ui.sheets[ui.sheets.length - 1];
    if (!top || !(top.cat || isMistake((S.recs[top.id].ayahs[top.g] || {}).res))) return; // a kind must be chosen first
    const sh = ui.sheets.pop(), r = S.recs[sh.id], cur = r.ayahs[sh.g] || {}, cat = sh.cat || cur.res;
    const note = (sh.text ?? cur.note ?? '').trim().slice(0, 200);
    let confused = null;
    if (cat === 'jump') {
      const se = document.getElementById('mj-s'), ae = document.getElementById('mj-a');
      const s = se ? +se.value : 0, a = ae ? Math.round(+ae.value) : 0;
      if (s && a >= 1 && a <= AYAH_COUNTS[s - 1]) confused = toG(s, a);
    }
    setAyahResult(r, sh.g, cat, { note, ...(confused != null ? { confused } : {}), ...(sh.vn !== undefined ? { vn: sh.vn } : {}) });
    if (Player.id === 'vn:' + sh.id + ':' + sh.g) Player.stop();
    save(); hap(10);
    if (S.settings.recAutoNext) A.chkNext();
  },
  mkClear() { const sh = ui.sheets.pop(); Clips.vnRemove(sh.id + ':' + sh.g); setAyahResult(S.recs[sh.id], sh.g, null); save(); },
  // A spoken note on the mistake (up to 30 s): say what went wrong instead of typing it.
  vnStart() {
    const sh = ui.sheets[ui.sheets.length - 1], n = document.getElementById('mk-note');
    if (n) sh.text = n.value;
    Player.stop(); sh.vnErr = null;
    Mic.onInterrupt = () => A.vnStop();
    Mic.start(null).then(() => {
      sh.vnRec = true; micBusy(true); render();
      clearInterval(vnTimer);
      vnTimer = setInterval(() => { const el = document.getElementById('vn-time'), ms = Mic.elapsed(); if (el) el.textContent = clipTime(ms); if (ms >= 30000) A.vnStop(); }, 250);
    }).catch(e => { Mic.release(); sh.vnErr = micErrorText(e); render(); });
  },
  vnStop() {
    const sh = ui.sheets.find(x => x.t === 'mistake');
    clearInterval(vnTimer); micBusy(false);
    if (!sh || !sh.vnRec) return;
    sh.vnRec = false;
    Mic.stop().then(r => {
      if (!r || r.ms < 500) { render(); return; }
      return Clips.vnPut(sh.id + ':' + sh.g, r.blob, r.ms).then(() => { sh.vn = { ms: r.ms }; render(); });
    }).catch(() => { sh.vnErr = 'تعذّر حفظ الملاحظة الصوتية.'; render(); });
  },
  vnPlay(key) {
    const pid = 'vn:' + key;
    if (Player.playing(pid)) { Player.pause(); return; }
    Clips.vnBlob(key).then(b => { if (!b) throw new Error('missing'); Player.loop = null; return Player.play(pid, b); }).then(render).catch(() => { snack('الملاحظة الصوتية غير موجودة على هذا الجهاز'); render(); });
  },
  vnDel() { const sh = ui.sheets[ui.sheets.length - 1], key = sh.id + ':' + sh.g; if (Player.id === 'vn:' + key) Player.stop(); Clips.vnRemove(key); sh.vn = null; },

  // Storage rule for recordings
  recKeep(v) {
    const days = +v, list = prunableClips(S, Clips.meta, T(), days);
    const apply = () => { S.settings.recKeepDays = days; save(); pruneClips(); };
    if (!days || !list.length) { apply(); return; }
    confirmSheet({ title: `حذف صوت التسجيلات المراجَعة بعد ${days} يوماً؟`, body: `يُحذف الآن صوت ${recWord(list.length)} (${sizeText(list.reduce((s, c) => s + (c.size || 0), 0))}) مما راجعتَه ولم يبقَ فيه خطأ مفتوح. تبقى نتائج المراجعة والملاحظات والإحصاءات. لا يمكن استعادة الصوت.`, ok: 'فعّل واحذف', danger: true, run: apply });
  },
  recAutoNext() { S.settings.recAutoNext = !S.settings.recAutoNext; save(); },
  // First listen without the muṣḥaf
  recBlind() { S.settings.recBlind = !S.settings.recBlind; save(); },
  blindMark(id) {
    id = +id; const r = S.recs[id];
    if (Player.id !== id || !Player.posMs()) { snack('شغّل التسجيل أولاً'); return; }
    r.blind = r.blind || { marks: [], day: null };
    r.blind.marks.push(Math.round(Player.posMs())); save(); hap(14);
  },
  blindUndo(id) { const b = S.recs[+id].blind; if (b) { b.marks.pop(); save(); } },
  blindDone(id) {
    const r = S.recs[+id];
    r.blind = { marks: (r.blind && r.blind.marks) || [], day: T() };
    Player.halt(); ui.recView = 'check'; ui.chkI = 0; save();
    snack('افتح مصحفك الآن وراجع آية بآية');
  },
  // «اقترح للتسميع» and «تمرين الأخطاء»
  recSuggest(id) { openRecorder([+id], 'hifz'); },
  drillStart() {
    const queue = drillQueue(S);
    if (!queue.length) { snack('لا أخطاء مفتوحة'); return; }
    ui.drill = { queue, i: 0, fixed: 0, total: queue.length, tries: {} };
    drillOpen();
  },
  drillSkip() { Player.stop(); Clips.draftClear(); ui.mic = null; drillNext('skip'); },
  recReview(id) { A.tab('rec'); go('recd:' + id); ui.recView = 'check'; ui.chkI = 0; },
  mkStatus(v) { ui.mkStatus = v; },
  mkCatFilter(v) { ui.mkCat = v; },
  // Play just that ayah from the take where the mistake was found.
  mkPlay(v) {
    const [id, g] = v.split(':').map(Number), r = S.recs[id], c = Clips.get(id);
    if (!r || !c) { snack('الصوت غير موجود على هذا الجهاز'); return; }
    const run = () => { const sg = recSegments(r, c.durMs).find(s => g >= s.g1 && g <= s.g2); if (sg) { Player.loop = null; Player.play(id, null, sg.from, sg.to).then(render).catch(() => {}); } };
    if (c.det || r.marks.length) run(); else Clips.analyze(id).then(() => { refreshAnalysis(id); run(); }).catch(run);
  },
  // Re-record only the mistaken ayah; you judge the new take.
  recFix(v) { const [id, g] = v.split(':').map(Number); openRecorder([AYAH_TH[g]], 'hifz', null, { fix: { rec: id, g }, from: g, to: g }); },
  micFix(verdict) {
    const sh = ui.sheets[ui.sheets.length - 1], m = ui.mic, day = T(), f = sh.fix;
    Player.stop();
    Clips.add(sh.ids, day, m.ms, m.blob).then(c => {
      S.recs[c.id] = { ...newRec(sh.ids, day, m.ms, 'hifz', f.g, f.g), fixOf: f, checked: day };
      recordFix(S, f.rec, f.g, c.id, verdict, day); save(); Clips.draftClear();
      ui.mic = null; ui.sheets = []; hap(20);
      snack(verdict === 'clean' ? 'صُحّح الخطأ في ' + ayahName(f.g) : 'بقي الخطأ مفتوحاً · حاول مرة أخرى لاحقاً');
      if (sh.drill) drillNext(verdict);
      render();
    }).catch(() => { snack('تعذّر حفظ التسجيل'); render(); });
  },
  // «راجع لاحقاً»: save, and remind at the chosen time (Android notification).
  micLater(at) {
    at = +at;
    A.micSave('later').then(id => {
      if (id == null) return;
      S.recs[id].reviewAt = at; save();
      const r = S.recs[id];
      if (NATIVE && NATIVE.setReviewReminder) NATIVE.setReviewReminder(String(id), at, 'راجع تسميعك: ' + shortRange(r.from, r.to).replace(/[⁦-⁩⁠]/g, ''));
      A.tab('rec'); snack('ستُذكَّر بمراجعته · افتح مصحفك حينها'); render();
    });
  },
  chkNudge(d) {
    const id = curRecId(), r = S.recs[id], i = ui.chkI || 0, mk = [...(r.marks || [])].sort((a, b) => a - b), k = i - 1;
    if (k < 0 || k >= mk.length) return;
    const lo = (mk[k - 1] || 0) + 300, hi = (mk[k + 1] || r.ms) - 300;
    mk[k] = Math.max(lo, Math.min(hi, mk[k] + +d)); r.marks = mk; Player.halt(); refreshAnalysis(id); save();
  },
  chkMerge(i) { const id = curRecId(), r = S.recs[id], mk = [...(r.marks || [])].sort((a, b) => a - b); mk.splice(+i - 1, 1); r.marks = mk; ui.chkI = Math.max(0, +i - 1); refreshAnalysis(id); save(); },
  chkSplit(id) {
    id = +id; const r = S.recs[id];
    if (Player.id !== id || !Player.posMs()) { snack('شغّل الآية وأوقفها عند نهايتها، ثم اضغط «قسّم هنا»'); return; }
    const ms = Math.round(Player.posMs());
    r.marks = [...(r.marks || []), ms].sort((a, b) => a - b); r.marksSrc = r.marksSrc || 'tap';
    Player.halt(); refreshAnalysis(id); save(); snack('قُسّم المقطع عند ' + clipTime(ms));
  },
  chkFinish(id) {
    id = +id; const r = S.recs[id];
    if (r.checked == null) { r.checked = T(); if (r.rating < 0) r.rating = suggestRating(recMistakes(r).length); }
    if (r.blind && r.blind.day != null) { const c = Clips.get(id); r.blind.res = blindCompare(blindAyat(r.blind.marks, recSegments(r, c && c.durMs)), recMistakes(r).filter(m => m.res !== 'tajwid').map(m => m.g)); }
    if (r.reviewAt && NATIVE && NATIVE.cancelReviewReminder) NATIVE.cancelReviewReminder(String(id));
    ui.recView = 'result'; Player.halt(); save();
    const finished = S.recPlans.filter(p => !p.done && planStatus(p, S.recs).done);
    finished.forEach(p => { p.done = T(); });
    if (finished.length) { save(); snack('أتممت ' + finished.map(p => p.name).join('، ') + ' دون أخطاء'); }
    else snack(recMistakes(r).length ? 'انتهت المراجعة · ' + errWord(recMistakes(r).length) : 'انتهت المراجعة · دون أخطاء');
    celebrate();
  },
  loopA(id) { id = +id; if (Player.id !== id) { snack('شغّل التسجيل أولاً'); return; } const p = Player.posMs(), b = Player.loop ? Player.loop[1] : Math.min(Player.durMs(), p + 5000); Player.loop = [Math.min(p, b - 500), Math.max(b, p + 500)]; },
  loopB(id) { id = +id; if (Player.id !== id) { snack('شغّل التسجيل أولاً'); return; } const p = Player.posMs(), a = Player.loop ? Player.loop[0] : Math.max(0, p - 5000); Player.loop = [Math.min(a, p - 500), Math.max(p, a + 500)]; },
  loopClear() { Player.loop = null; },
  bmAdd(id) {
    id = +id; if (Player.id !== id) { snack('شغّل التسجيل ثم اضغط «علامة» عند الموضع'); return; }
    const r = S.recs[id], ms = Math.round(Player.posMs());
    r.bookmarks = [...(r.bookmarks || []), { ms }].sort((a, b) => a.ms - b.ms); save(); snack('أُضيفت علامة عند ' + clipTime(ms));
  },
  bmJump(v) { const [id, i] = v.split(':').map(Number), b = S.recs[id].bookmarks[i]; Player.loop = null; Player.play(id, null, Math.max(0, b.ms - 1500)).then(render).catch(() => {}); },
  bmDel(v) { const [id, i] = v.split(':').map(Number), snap = snapshotState(); S.recs[id].bookmarks.splice(i, 1); save(); snack('حُذفت العلامة', snap); },
  bmNote(v) { const [id, i] = v.split(':').map(Number); ui.sheets = [{ t: 'bmNote', id, i }]; },
  bmNoteSave() { const sh = ui.sheets[ui.sheets.length - 1], el = document.getElementById('bm-in'), b = S.recs[sh.id].bookmarks[sh.i]; b.note = (el ? el.value : '').trim().slice(0, 200); ui.sheets = []; save(); },
  trimApply(id) { id = +id; const c = Clips.get(id), r = S.recs[id], dur = c.durMs || r.ms; r.trim = [Math.max(0, c.det.start - 250), Math.min(dur, c.det.end + 300)]; refreshAnalysis(id); save(); snack('سيُتخطّى الصمت عند التشغيل'); },
  trimClear(id) { S.recs[+id].trim = null; refreshAnalysis(+id); save(); },

  // Recitation plans
  planNew() { const m = memIds(S); ui.planNew = { unit: 'hizb', n: m.length ? THUMUN[m[0]].hizb : 1, piece: 1 }; ui.sheets = [{ t: 'plan' }]; },
  planUnit(v) { ui.planNew.unit = v; ui.planNew.n = Math.min(ui.planNew.n, { hizb: 60, juz: 30, surah: 114 }[v]); },
  planNum(d) { const k = ui.planNew; k.n = Math.max(1, Math.min({ hizb: 60, juz: 30, surah: 114 }[k.unit], k.n + +d)); },
  planPiece(v) { ui.planNew.piece = +v; },
  planCreate() {
    const k = ui.planNew, ids = planIds(k.unit, k.n);
    const name = 'تسميع ' + (k.unit === 'hizb' ? 'الحزب ' + k.n : k.unit === 'juz' ? 'الجزء ' + k.n : 'سورة ' + SURAH_NAMES[k.n - 1]);
    const plan = { id: Date.now(), name, ids, piece: k.piece, created: T(), done: null };
    S.recPlans.push(plan); ui.sheets = []; ui.planOpen = plan.id; save(); hap(20); snack('أُنشئت ' + name);
  },
  planOpen(id) { ui.planOpen = ui.planOpen === +id ? null : +id; },
  planNext(id) { const plan = S.recPlans.find(p => p.id === +id), nx = plan && planStatus(plan, S.recs).next; if (nx) planGoPiece(plan, nx); },
  planPieceGo(v) { const [pid, i] = v.split(':').map(Number), plan = S.recPlans.find(p => p.id === pid); if (plan) planGoPiece(plan, planStatus(plan, S.recs).pieces[i]); },
  planArchive(id) { const snap = snapshotState(), p = S.recPlans.find(x => x.id === +id); p.done = p.done || T(); ui.planOpen = null; save(); snack('أُرشفت الخطة', snap); },
  planDelete(id) {
    confirmSheet({ title: 'حذف هذه الخطة؟', body: 'تُحذف الخطة فقط؛ تبقى تسجيلاتك ونتائج مراجعتها.', ok: 'حذف الخطة', danger: true,
      run: () => { S.recPlans = S.recPlans.filter(x => x.id !== +id); ui.planOpen = null; save(); } });
  },
  clipsDeleteAll() { confirmSheet({ title: 'حذف أصوات كل التسجيلات؟', body: `${Clips.meta.length} · ${sizeText(Clips.bytes())}. يُحذف الصوت من جهازك ولا يمكن استعادته. تبقى تقييماتك وملاحظاتك.`, ok: 'حذف الأصوات', danger: true, run: () => { Player.stop(); Clips.removeAll().then(render); } }); },

  // Automatic backup (Android)
  autoPick() { NATIVE.pickBackupFolder(); },
  autoNow() { if (AutoBackup.run(true)) snack('حُفظت نسخة في المجلد'); },
  autoOff() { NATIVE.clearBackupFolder(); ui.autoErr = null; snack('أُوقف النسخ الاحتياطي التلقائي'); },

  // Today
  toggleNew() { ui.showNew = !ui.showNew; },
  pressureOff() { ui.pressureOff = true; },
  lighterNew() {
    const snap = snapshotState(); S.settings.newAmount = 0.5; ui.pressureOff = true; save();
    snack('أصبح الحفظ الجديد نصف ثُمن يومياً', snap);
  },
  reasonSheet(i) { ui.sheets = [{ t: 'reason', i: +i }]; },
  postpone(v) {
    const t = T(), ids = v.split(',').map(Number), snap = snapshotState();
    S.postponed = Object.fromEntries(Object.entries(S.postponed).filter(([d]) => +d >= t - 1));
    S.postponed[t] = [...new Set([...(S.postponed[t] || []), ...ids])];
    ui.sheets = []; save();
    snack('أُجّلت هذه المراجعة لليوم', snap);
  },
  record() { openRecord(); },
  recStatus(v) { const [i, s] = v.split(':').map(Number), e = ui.rec.entries[i]; e.status = s; if (s === 2) e.rating = -1; if (s !== 1) e.lastAyah = null; hap(6); },
  recRating(v) { const [i, r] = v.split(':').map(Number); ui.rec.entries[i].rating = r; hap(6); },
  recAyah(v) { const [i, g] = v.split(':').map(Number); ui.rec.entries[i].lastAyah = g; },
  recAll() { ui.rec.entries.forEach(e => { if (e.status < 0) e.status = 0; if (e.status === 0 && e.kind !== 'new' && e.rating < 0) e.rating = 0; }); hap(10); },
  recTeacher() { ui.rec.teacher = !ui.rec.teacher; },
  recSave() {
    const rec = ui.rec;
    if (rec.entries.some(recPending)) { rec.missing = true; hap(14); return; }
    const t = T(), day = rec.mode === 'edit' ? t : rec.day ?? t, snap = snapshotState(), entries = rec.entries.map(toEngine);
    if (rec.mode === 'edit') S = replaceDaily(S, entries, t, rec.teacher) || S;
    else saveDaily(S, entries, day, rec.teacher);
    ui.sheets = []; ui.rec = null; ui.showNew = false; save(); hap(20);
    snack(rec.mode === 'edit' ? 'عُدّل تسجيل اليوم' : day !== t ? 'سُجّل ورد ' + dateText(day) : 'تم تسجيل الورد', snap);
    celebrate();
    Reminder.schedule(); AutoBackup.run();
  },
  editToday() {
    const daily = S.sessions.find(s => s.day === T() && s.kind === 'daily');
    if (!daily) return;
    ui.rec = { mode: 'edit', teacher: !!daily.teacher, missing: false, entries: daily.entries.map(e => ({ ...e, label: REC_LABEL[e.kind], rating: e.rating ?? -1, lastAyah: e.status === 1 ? e.lastAyah : null, errors: Array.isArray(e.errors) ? e.errors.map(x => ({ ...x })) : [] })) };
    ui.sheets = [{ t: 'record' }];
  },
  errorSheet(i) { ui.sheets = [{ t: 'error', entry: +i, g: null, type: null, confused: null }]; },
  errAyah(g) { ui.sheets[ui.sheets.length - 1].g = +g; },
  errType(v) { const sh = ui.sheets[ui.sheets.length - 1]; sh.type = v; if (v !== 'confuse') sh.confused = null; },
  errAdd() {
    const sh = ui.sheets[ui.sheets.length - 1];
    if (sh.g == null) return;
    ui.rec.entries[sh.entry].errors.push({ g: sh.g, type: sh.type === 'none' ? null : sh.type, confused: sh.confused });
    ui.sheets = [{ t: 'record' }];
    snack('أُضيف خطأ · ' + ayahName(sh.g));
  },
  confusedSave() {
    const s = +document.getElementById('cf-s').value, a = Math.round(+document.getElementById('cf-a').value);
    const sh = ui.sheets.pop();
    if (a >= 1 && a <= AYAH_COUNTS[s - 1]) sh.parent.confused = toG(s, a);
  },

  // Another review (outside today's wird)
  extraSheet(v) {
    const ids = v && v.startsWith('ids:') ? v.slice(4).split('.').filter(Boolean).map(Number) : null;
    const opts = extraOptions(ids);
    ui.extra = { opts, pick: ids && opts.length === 1 ? 0 : null, status: -1, rating: -1, lastAyah: null };
    ui.sheets = [{ t: 'extra' }];
  },
  extraPick(k) { ui.extra.pick = +k; ui.extra.lastAyah = null; },
  extraStatus(v) { ui.extra.status = +v; if (+v === 2) ui.extra.rating = -1; },
  extraRating(v) { ui.extra.rating = +v; },
  extraAyah(g) { ui.extra.lastAyah = +g; },
  extraSearch() { ui.sheets = []; go('search'); },
  extraSave() {
    const x = ui.extra, o = x.opts[x.pick];
    if (!o || x.status < 0 || (x.status === 1 && x.lastAyah == null) || (x.status !== 2 && x.rating < 0)) return;
    const snap = snapshotState(), t = T();
    const entries = segment(o.ids).map(seg => ({ kind: 'review', ids: seg, ...segRange(seg), status: x.status, rating: x.rating, lastAyah: x.lastAyah, errors: [] }));
    applyEntries(S, entries, t, 'extra', false);
    ui.sheets = []; ui.extra = null; save(); hap(20);
    snack('سُجّلت المراجعة', snap);
  },

  // Repetition counter
  count() { const n = (S.counter && S.counter.day === T() ? S.counter.n : 0) + 1; S.counter = { day: T(), n }; save(); hap(n === S.settings.repTarget ? 40 : 8); },
  countReset() { S.counter = null; save(); },
  countTarget(v) { S.settings.repTarget = Math.min(100, Math.max(5, S.settings.repTarget + 5 * v)); save(); },

  // Memorized
  memView(v) { ui.memView = v; },
  memFilter(v) { ui.memFilter = v; },
  memFilterGo(v) { ui.tab = 'mem'; ui.stack = []; ui.memView = 'hizb'; ui.memFilter = v; ui.anim = 'enter-fade'; },
  openThumun(k) { ui.openThumun = ui.openThumun === +k ? null : +k; },
  weakSort(v) { ui.weakSort = v; },
  setQ(v) { ui.q = v; },
  clearQ() { ui.q = ''; },

  // Edit what is memorized (same selection as onboarding)
  editMem(v) {
    const [kind, n] = (v || '').split(':');
    ui.ob = { ...Sel.newOb(), step: 'sel', edit: true, sel: selectionOf(S), mode: kind === 'hizb' ? 'precise' : 'surah', refine: kind === 'surah' ? +n : null, pHizb: kind === 'hizb' ? +n : 1, changed: false };
    ui.ob.backup = ui.ob.sel.slice();
    go('editMem');
  },
  editSave() {
    const ob = ui.ob;
    if (!ob.changed) return;
    let removed = 0;
    THUMUN.forEach(T0 => { const t = S.th[T0.id]; if (t && t.mem && Sel.state(ob.sel, T0.start, T0.end) !== 'all') removed++; });
    const apply = () => {
      const snap = snapshotState(); editMemorized(S, ob.sel, T()); seedMilestones(); save();
      ui.ob = null; ui.stack.pop(); ui.anim = 'enter-pop'; hap(20);
      snack('حُدّث المحفوظ', snap);
    };
    if (removed) confirmSheet({ title: 'إزالة هذا المدى من المحفوظ؟', body: `يُزال ${thumunWord(removed)} من محفوظك. ستتغير خطة المراجعة، بينما يبقى السجل والأخطاء المسجلة.`, ok: 'إزالة وحفظ', danger: true, run: apply });
    else apply();
  },
  confirmOk() { const sh = ui.sheets.pop(); if (sh && sh.run) sh.run(); },

  // Onboarding
  obDir(v) { ui.ob.dir = v; hap(6); },
  obNext() {
    const ob = ui.ob;
    if (ob.step === 'dir' && ob.dir) ob.step = 'sel';
    else if (ob.step === 'sel' && Sel.count(ob.sel)) ob.step = 'strength';
    else if (ob.step === 'strength') ob.step = 'plan';
    ui.anim = 'enter-push';
  },
  obBack() { const ob = ui.ob; ob.step = { sel: 'dir', strength: 'sel', plan: Sel.count(ob.sel) ? 'strength' : 'sel' }[ob.step] || 'dir'; ui.anim = 'enter-pop'; },
  obNone() { ui.ob.sel = new Uint8Array(TOTAL_AYAT); ui.ob.step = 'plan'; ui.anim = 'enter-push'; },
  obMode(v) { ui.ob.mode = v; },
  obSurah(s) { const a = surahStart(+s), b = surahEnd(+s); Sel.set(ui.ob.sel, a, b, Sel.state(ui.ob.sel, a, b) !== 'all'); obChanged(); },
  obRefine(s) { ui.ob.refine = ui.ob.refine === +s ? null : +s; },
  obSurahUpTo(v) { const [s, n] = v.split(':').map(Number), a = surahStart(s); Sel.set(ui.ob.sel, a, surahEnd(s), false); if (n) Sel.set(ui.ob.sel, a, a + n - 1, true); obChanged(); },
  obHizb(h) { const ids = hizbThumun(+h), a = THUMUN[ids[0]].start, b = THUMUN[ids[7]].end; Sel.set(ui.ob.sel, a, b, Sel.state(ui.ob.sel, a, b) !== 'all'); obChanged(); },
  obPHizb(h) { ui.ob.pHizb = +h; },
  obThumun(id) { const T0 = THUMUN[+id]; Sel.set(ui.ob.sel, T0.start, T0.end, Sel.state(ui.ob.sel, T0.start, T0.end) !== 'all'); obChanged(); },
  obStrength(v) { const [key, s] = v.split(':'), g = Sel.groups(ui.ob).find(x => x.key === key); if (g) g.ids.forEach(i => { ui.ob.strength[i] = s; }); },
  obStrengthAll(s) { Sel.groups(ui.ob).forEach(g => g.ids.forEach(i => { ui.ob.strength[i] = s; })); },
  obNewAmt(v) { ui.ob.newAmount = +v; },
  obRevAmt(d) { ui.ob.reviewAmount = Math.min(24, Math.max(2, ui.ob.reviewAmount + +d)); },
  obReminder() { ui.ob.reminderOn = !ui.ob.reminderOn; },
  obRemTime(v) { ui.ob.reminderTime = v; },
  obFinish() {
    const ob = ui.ob;
    finishOnboarding(S, { direction: ob.dir || 'fwd', sel: ob.sel, strength: ob.strength, newAmount: ob.newAmount, reviewAmount: ob.reviewAmount, reminderOn: ob.reminderOn, reminderTime: ob.reminderTime }, T());
    ui.ob = null; ui.tab = 'today'; ui.stack = []; ui.anim = 'enter-fade';
    if (S.prefs.tour == null) ui.sheets = [{ t: 'welcome' }];
    seedMilestones(); save(); hap(20);
    if (S.settings.reminderOn) Reminder.ask();
    Reminder.schedule();
  },

  // Tour
  tourStart() { ui.sheets = []; ui.tour = 0; tourShow(); },
  tourNext() { hap(8); if (ui.tour + 1 < TOUR.length) { ui.tour++; tourShow(); } else A.tourEnd(false); },
  tourBack() { ui.tour = Math.max(0, ui.tour - 1); tourShow(); },
  tourSkip() { A.tourEnd(true); },
  tourEnd(skipped) { ui.tour = null; S.prefs.tour = skipped ? 'skipped' : 'done'; save(); ui.sheets = skipped ? [] : [{ t: 'tourEnd' }]; },

  // Settings
  setNewAmt(v) { S.settings.newAmount = +v; save(); },
  setRevAmt(v) { S.settings.reviewAmount = Math.min(24, Math.max(2, +v)); save(); },
  setReviewMode(v) { S.settings.reviewMode = v; save(); },
  cycleStep(d) { S.settings.cycleDays = Math.min(60, Math.max(3, S.settings.cycleDays + +d)); save(); },
  toggleReminder() { S.settings.reminderOn = !S.settings.reminderOn; save(); if (S.settings.reminderOn) Reminder.ask(); Reminder.schedule(); },
  setReminderTime(v) { S.settings.reminderTime = v; save(); Reminder.schedule(); },
  timeSave(target) {
    const v = document.getElementById('time-in').value;
    if (v && target === 'ob') ui.ob.reminderTime = v;
    else if (v) { if (target === 'reminder') S.settings.reminderTime = v; else S.settings.dayStart = v; save(); Reminder.schedule(); }
    ui.sheets.pop();
  },
  setTheme(v) { S.settings.theme = v; save(); },
  setTextSize(v) { S.settings.textSize = v; save(); },
  setDensity(v) { S.settings.density = v; save(); },
  setStateColors(v) { S.settings.stateColors = v; save(); },
  setMotion(v) { S.settings.motion = v; save(); },
  setDayStart(v) { S.settings.dayStart = v; save(); Reminder.schedule(); },
  setDirection(v) {
    if (S.settings.direction === v) return;
    const snap = snapshotState(); S.settings.direction = v; save();
    const n = nextNew(S);
    snack(n ? 'سيأتي الحفظ الجديد التالي من ' + ayahName(n.from) : 'تغيّر اتجاه الحفظ', snap);
  },
  askResetStrength() {
    confirmSheet({ title: 'إعادة ضبط تقديرات القوة؟', body: 'تعود قوة كل موضع إلى «متوسط» وتُبنى من جديد مع مراجعاتك القادمة. يبقى المحفوظ والسجل والأخطاء كما هي.', ok: 'إعادة الضبط', danger: false,
      run: () => { const snap = snapshotState(); resetStrengths(S); save(); snack('أُعيد ضبط تقديرات القوة', snap); } });
  },
  askDeleteAll() {
    confirmSheet({ title: 'حذف جميع بياناتك من هذا الجهاز؟', body: 'سيُحذف محفوظك وسجل جلساتك ومواضع الضعف والإعدادات نهائياً، ولا يمكن التراجع عن ذلك إلا من نسخة احتياطية.', ok: 'حذف البيانات', danger: true,
      run: () => { S = defaultState(); save(); ui.ob = Sel.newOb(); ui.stack = []; ui.tab = 'today'; ui.sheets = []; Reminder.schedule(); } });
  },
  reportSpan(v) { ui.reportSpan = v; },
  toggleRepWeak() { ui.repWeak = !ui.repWeak; },
  toggleRepSess() { ui.repSess = !ui.repSess; },
  printReport() { if (NATIVE) NATIVE.print('تقرير ' + BRAND); else window.print(); },
  snoozeBackup() { S.backupSnooze = T() + 14; save(); },
  export() {
    const d = new Date(), name = `wird-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    if (NATIVE) { NATIVE.saveFile(name, exportPayload(S)); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportPayload(S)], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.lastExport = T(); save();
    snack('صُدّرت نسخة إلى جهازك');
  },
  import() { document.getElementById('file-in').click(); }
};
function obChanged() {
  const ob = ui.ob;
  if (ob.edit) { ob.changed = false; for (let i = 0; i < ob.sel.length; i++) if (ob.sel[i] !== ob.backup[i]) { ob.changed = true; break; } }
}
function tourShow() { const st = TOUR[ui.tour]; ui.tab = st.s; ui.stack = []; if (st.s === 'mem') { ui.memView = 'surah'; ui.memFilter = 'all'; } scrollMem[st.s] = 0; }

// ---- native bridge callbacks, back button, reminder ----------------------------------------------

window.wirdNative = {
  saved(ok) { if (ok) { S.lastExport = T(); save(); snack('صُدّرت نسخة إلى جهازك'); } render(); },
  permission() { Reminder.schedule(); render(); },
  // From a home-screen shortcut, the widget or the reminder while the app is already open.
  open(v) { openFrom(v); render(); },
  // Back in the foreground: apply anything done from the notification, roll the day over.
  resume() { drainPending(); checkDay(); AutoBackup.run(); render(); },
  folderPicked(ok) { if (ok) { ui.autoErr = null; if (AutoBackup.run(true)) snack('ستُحفظ نسخة كل أسبوع في هذا المجلد'); } render(); },
  // Audio focus (Android): a call or another app took the microphone, then gave it back.
  audioLost() { micInterrupt('mute'); },
  audioBack() { micInterrupt('unmute'); }
};
function openRecorder(ids, purpose, plan, extra) {
  Player.stop();
  ui.mic = { state: 'idle', ms: 0, blob: null, error: null, marks: 0 };
  ui.sheets = [{ t: 'recorder', ids, purpose: purpose || 'both', plan: plan || null, ...(extra || {}) }];
}
// «تمرين الأخطاء»: one open mistake at a time in the correction recorder. «سليمة» resolves it;
// «ما زال فيها خطأ» sends it to the end of the queue (three tries at most).
function drillOpen() {
  const d = ui.drill, q = d.queue[d.i];
  openRecorder([AYAH_TH[q.g]], 'hifz', null, { fix: { rec: q.rec, g: q.g }, from: q.g, to: q.g, drill: true });
}
function drillNext(verdict) {
  const d = ui.drill;
  if (!d) return;
  const q = d.queue[d.i], k = q.rec + ':' + q.g;
  if (verdict === 'clean') d.fixed++;
  else if (verdict === 'wrong') { d.tries[k] = (d.tries[k] || 0) + 1; if (d.tries[k] < 3) d.queue.push(q); }
  d.i++;
  if (d.i < d.queue.length) { drillOpen(); return; }
  ui.drill = null; ui.sheets = []; ui.mic = null;
  snack(`انتهى التمرين · صحّحت ${d.fixed} من ${d.total}`);
}
// Tells the Android shell the microphone is in use, so it can report a call taking it away.
function micBusy(on) { try { if (NATIVE && NATIVE.micActive) NATIVE.micActive(on); } catch (e) { /* older shell */ } }
let vnTimer = 0;
// A call or another app took the microphone ('mute'), gave it back ('unmute'), or it is gone ('ended').
// Recording pauses and never resumes by itself.
function micInterrupt(kind) {
  const sh = ui.sheets.find(x => x.t === 'mistake' && x.vnRec);
  if (sh) { if (kind !== 'unmute') A.vnStop(); return; }
  const m = ui.mic;
  if (!m) return;
  if (kind === 'mute' && m.state === 'rec') { Mic.pause(); m.state = 'paused'; m.away = 'call'; render(); }
  else if (kind === 'unmute' && m.away === 'call') { m.away = 'back'; render(); }
  else if (kind === 'ended' && (m.state === 'rec' || m.state === 'paused')) A.micStop().then(() => { if (ui.mic) { ui.mic.cut = true; render(); } });
}
// A take that was being recorded when the app closed: offer it back, to save or discard.
function offerRecovery(d) {
  const h = d.head, sh = h.sheet || {};
  if (!S.onboarded || !Array.isArray(sh.ids) || !sh.ids.length || ui.mic) return false;
  const fix = sh.fix && S.recs[sh.fix.rec] && S.recs[sh.fix.rec].ayahs[sh.fix.g] ? sh.fix : null;
  ui.tour = null;
  ui.mic = { state: 'done', ms: h.ms || 0, blob: d.blob, error: null, marks: (h.marks || []).length, markList: h.marks || [], hes: (h.hes || []).length, hesList: h.hes || [], recovered: true };
  ui.sheets = [{ t: 'recorder', ids: sh.ids, purpose: fix ? 'hifz' : sh.purpose || 'both', plan: sh.plan && S.recPlans.some(p => p.id === sh.plan) ? sh.plan : null, ...(fix ? { fix, from: sh.from, to: sh.to } : {}) }];
  return true;
}
// The storage rule, applied when the app opens and when the rule changes.
function pruneClips() {
  const list = prunableClips(S, Clips.meta, T(), S.settings.recKeepDays);
  if (!list.length) return;
  const bytes = list.reduce((s, c) => s + (c.size || 0), 0);
  Promise.all(list.map(c => { if (Player.id === c.id) Player.stop(); return Clips.remove(c.id).catch(() => {}); }))
    .then(() => { snack(`حُذف صوت ${recWord(list.length)} مما راجعتَه · ${sizeText(bytes)}`); render(); });
}
// Why the microphone could not start, in words the user can act on (the error name helps support).
function micErrorText(e) {
  const n = (e && e.name) || 'Error';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات التطبيق ثم أعد المحاولة.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'لم يُعثر على ميكروفون في هذا الجهاز.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'تعذّر تشغيل الميكروفون؛ قد يستخدمه تطبيق آخر أو مكالمة. أغلقه ثم أعد المحاولة.';
  if (!Clips.supported) return 'التسجيل غير مدعوم في هذا المتصفح.';
  return 'تعذّر بدء التسجيل (' + n + '). أعد المحاولة.';
}
// Live timer and level meter while recording, updated in place.
let micRaf = 0;
function startMicLoop() {
  cancelAnimationFrame(micRaf);
  const step = () => {
    if (!ui.mic || (ui.mic.state !== 'rec' && ui.mic.state !== 'paused')) return;
    ui.mic.ms = Mic.elapsed();
    const el = app.querySelector('.mic .time'), lv = app.querySelector('.mic .lv');
    if (el) el.textContent = clipTime(ui.mic.ms);
    if (lv) lv.style.setProperty('--l', Mic.level().toFixed(2));
    micRaf = requestAnimationFrame(step);
  };
  micRaf = requestAnimationFrame(step);
}
function stopMicLoop() { cancelAnimationFrame(micRaf); }
const curRecId = () => +current().split(':')[1];
// Decode once, then suggest ayah boundaries (if none were tapped) and keep a small summary.
const analyzing = new Set();
function ensureAnalysis(id) {
  const c = Clips.get(id), r = S.recs[id];
  if (!c || !r || c.failed || analyzing.has(id)) return;
  if (c.det && c.peaks) { refreshAnalysis(id); return; }
  analyzing.add(id);
  Clips.analyze(id).then(() => { analyzing.delete(id); refreshAnalysis(id); save(); render(); })
    .catch(() => { analyzing.delete(id); c.failed = true; render(); });
}
function refreshAnalysis(id) {
  const c = Clips.get(id), r = S.recs[id];
  if (!c || !c.det || !r) return;
  if (!r.marksSrc && !(r.marks || []).length && r.purpose !== 'tajwid' && r.to > r.from) { r.marks = suggestBounds(c.det.gaps, r.to - r.from + 1, recAyat(r).map(ayahWords), c.det.speechMs); r.marksSrc = 'auto'; }
  const an = recAnalysis(r, c, recSegments(r, c.durMs));
  r.an = { speechMs: an.speechMs, wpm: an.wpm, hes: an.hes };
}
function planGoPiece(plan, pc) {
  if (!pc) return;
  if (pc.state === 'recorded' && pc.lastId) { A.tab('rec'); go('recd:' + pc.lastId); ui.recView = 'check'; ui.chkI = 0; }
  else if (pc.state === 'none' || pc.state === 'mistakes') openRecorder(pc.ids, 'hifz', plan.id);
  else if (pc.lastId) { A.tab('rec'); go('recd:' + pc.lastId); }
}
// 0.11 recordings were audio only: give each one a log entry so it can be assessed.
function syncRecs() {
  let added = 0;
  Clips.meta.forEach(c => { if (!S.recs[c.id]) { S.recs[c.id] = newRec(c.ids, c.day, c.ms, 'both'); added++; } });
  if (added) save();
}
function openFrom(v) {
  if (!S.onboarded) return;
  ui.sheets = []; ui.tour = null; A.tab('today');
  if (v === 'counter') go('counter');
  else if (v.startsWith('review:')) { const id = +v.slice(7); if (S.recs[id]) A.recReview(id); }
  else if (v === 'record' && !plan(S, T()).done) openRecord();
}
// "Recited everything" tapped on the reminder while the app was closed.
function drainPending() {
  if (!NATIVE || !NATIVE.takePending) return;
  let cmds = [];
  try { cmds = JSON.parse(NATIVE.takePending() || '[]'); } catch (e) { return; }
  const snap = snapshotState(), t = T();
  const days = cmds.filter(c => c.cmd === 'all').map(c => c.day).sort((a, b) => a - b).filter(d => quickDone(S, d, t));
  if (!days.length) { publish(); return; }
  save(); Reminder.schedule(); celebrate();
  snack(days.length === 1 && days[0] === t ? 'سُجّل ورد اليوم من التذكير: قرأته كاملاً' : 'سُجّل الورد من التذكير · ' + days.map(d => dateText(d, { weekday: 'long' })).join('، '), snap);
}
// System back: close the app's own layers first; false lets Android exit.
window.wirdBack = () => {
  if (ui.tour != null) A.tourEnd(true);
  else if (ui.sheets.length) A.closeSheet();
  else if (ui.stack.length) A.back();
  else if (!S.onboarded && ui.ob && ui.ob.step !== 'dir') A.obBack();
  else if (S.onboarded && ui.tab !== 'today') A.tab('today');
  else return false;
  render();
  return true;
};

// Daily reminder. In a browser it can fire only while the app is open; the Android shell
// schedules it with the OS (and skips it once today is recorded).
const Reminder = {
  timer: null,
  supported: () => !!NATIVE || 'Notification' in window,
  ask() {
    if (NATIVE) { NATIVE.requestNotifications(); return; }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => render());
  },
  note() {
    if (NATIVE) return NATIVE.notificationsAllowed() ? 'لا يصلك التذكير إذا سجّلت وردك قبل موعده.' : 'الإشعارات غير مسموح بها. اسمح بها ليصلك التذكير.';
    if (!('Notification' in window)) return 'هذا المتصفح لا يدعم الإشعارات.';
    if (Notification.permission === 'denied') return 'الإشعارات محجوبة لهذا التطبيق في إعدادات المتصفح.';
    return 'في نسخة الويب يصل التذكير ما دام التطبيق مفتوحاً. لا يصلك إذا سجّلت وردك قبل موعده.';
  },
  schedule() {
    clearTimeout(this.timer);
    const st = S.settings;
    if (NATIVE) {
      NATIVE.setReminder(!!(S.onboarded && st.reminderOn), st.reminderTime, st.dayStart);
      if (S.onboarded && plan(S, T()).done) NATIVE.dayDone(T());
      return;
    }
    if (!S.onboarded || !st.reminderOn) return;
    const [h, m] = st.reminderTime.split(':').map(Number), now = new Date(), at = new Date(now);
    at.setHours(h, m, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    this.timer = setTimeout(() => { this.fire(); this.schedule(); }, at - now);
  },
  fire() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || plan(S, T()).done) return;
    const opts = { body: wirdNote(plan(S, T())) || 'افتح التطبيق لترى ورد اليوم.', lang: 'ar', dir: 'rtl', tag: 'qurn-mm-daily', icon: 'assets/branding/png/wird_icon_192.png' };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification('ورد اليوم جاهز', opts));
    else new Notification('ورد اليوم جاهز', opts);
  }
};

// ---- events ------------------------------------------------------------------------------------

app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (!fn) return;
  fn(el.dataset.v);
  render();
});
app.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; render(); }
  else if (e.target.id === 'kbq') { ui.kbq = e.target.value; render(); }
  else if (e.target.id === 'note-in') { const sh = ui.sheets[ui.sheets.length - 1]; if (sh) sh.text = e.target.value; } // survives re-renders
  else if (e.target.id === 'ayah-note') { const r = S.recs[+e.target.dataset.id], x = r && r.ayahs[+e.target.dataset.g]; if (x) { x.note = e.target.value.slice(0, 200); clearTimeout(noteSaveT); noteSaveT = setTimeout(save, 600); } }
  else if (e.target.id === 'mk-note') { const sh = ui.sheets[ui.sheets.length - 1]; if (sh) sh.text = e.target.value; }
  else if (e.target.id === 'bm-in') { const sh = ui.sheets[ui.sheets.length - 1]; if (sh) sh.text = e.target.value; }
  else if (e.target.id === 'rec-note') { const r = S.recs[+e.target.dataset.id]; if (r) { r.note = e.target.value; clearTimeout(noteSaveT); noteSaveT = setTimeout(save, 600); } }
  else if (e.target.id === 'seek') {
    const id = +e.target.dataset.id, f = e.target.value / 1000;
    if (Player.id === id) Player.seek(f); else Player.play(id).then(() => { Player.seek(f); render(); }).catch(() => {});
  }
});
let noteSaveT;
app.addEventListener('keydown', e => {
  if (e.target.id === 'q' && e.key === 'Enter') { const r = SearchScreen.results(ctx(), ui.q.trim()); if (r[0]) { e.target.blur(); go(r[0].to); render(); } }
});
document.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && current() === 'counter' && !ui.sheets.length && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); A.count(); render(); return; }
  if (e.key === 'Escape' && window.wirdBack()) e.preventDefault();
});
document.getElementById('file-in').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  f.text().then(text => {
    const r = parseImport(text);
    if (!r.ok) confirmSheet({ title: 'تعذّر استيراد الملف', body: (r.reason === 'newer' ? 'صدر هذا الملف عن إصدار أحدث من التطبيق. حدّث التطبيق ثم أعد المحاولة.' : 'هذا الملف ليس نسخة صالحة من التطبيق.') + ' لم يتغيّر شيء في سجلّك.', ok: 'حسناً', run: () => {} });
    else confirmSheet({ title: 'استبدال بياناتك الحالية؟', body: `<span class="latin" dir="ltr">${esc(f.name)}</span> · ${thumunWord(r.mem)} محفوظ · ${counted(r.sessions, 'جلسة واحدة', 'جلستان', 'جلسات', 'جلسة')}<br>ستحلّ بيانات النسخة المستوردة محل محفوظك وسجل جلساتك وإعداداتك على هذا الجهاز. صدّر نسخة من بياناتك الحالية أولاً إن أردت الاحتفاظ بها.`, ok: 'استيراد واستبدال', danger: true,
      run: () => { S = r.state; seedMilestones(); save(); ui.stack = []; ui.tab = 'today'; Reminder.schedule(); snack('استُوردت النسخة · ' + thumunWord(r.mem) + ' محفوظ'); } });
    render();
  });
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
// Re-render when the day rolls over while the app stays open, and as soon as it comes back to
// the foreground (timers are paused while the phone app is in the background).
let lastDay = T();
const checkDay = () => { const t = T(); if (t !== lastDay) { lastDay = t; ui.showNew = false; ui.pressureOff = false; Reminder.schedule(); render(); } };
setInterval(checkDay, 60000);
// Tap the waveform to seek (time runs right to left).
app.addEventListener('click', e => {
  const w = e.target.closest('[data-wave]');
  if (!w) return;
  const id = +w.dataset.wave, rect = w.getBoundingClientRect(), c = Clips.get(id), dur = (c && c.durMs) || S.recs[id].ms;
  const ms = Math.max(0, Math.min(dur, (rect.right - e.clientX) / rect.width * dur));
  if (Player.id === id) Player.seekMs(ms); else Player.play(id, null, ms).then(render).catch(() => {});
});
document.addEventListener('visibilitychange', () => {
  // Android stops a WebView's microphone in the background: pause, and offer to resume on return.
  if (document.hidden && ui.mic && ui.mic.state === 'rec') { Mic.pause(); ui.mic.state = 'paused'; ui.mic.away = true; }
  if (document.hidden) { setAwake(false); return; }
  checkDay(); render(); // render re-applies the wake lock, which the browser drops when hidden
});

// First run with milestones: what is already memorized is not announced.
if (S.prefs.ms == null) { seedMilestones(); saveState(S); }
// First run of this design for someone already onboarded: offer the tour once.
if (S.onboarded && S.prefs.tour == null) ui.sheets = [{ t: 'welcome' }];
drainPending();
AutoBackup.run();
const openParam = new URLSearchParams(location.search).get('open');
if (openParam) openFrom(openParam);
Reminder.schedule();
publish();
render();
Clips.init().then(() => { syncRecs(); pruneClips(); return Clips.draftLoad(); })
  .then(d => { if (d) offerRecovery(d); if (d || Clips.meta.length) render(); });
