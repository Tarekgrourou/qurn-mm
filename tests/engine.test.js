// Engine and view-model tests. Run: node qurn-mm/tests/engine.test.js
// Loads the same scripts the app loads (no DOM needed) and checks the review engine's rules.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
global.location = { search: '' };
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const src = ['js/reference.js', 'js/format.js', 'js/model.js', 'js/viewmodel.js', 'js/knowledge.js', 'js/knowledge_mut.js', 'js/audiocheck.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join(';\n');

// eslint-disable-next-line no-eval
(0, eval)(src + `;globalThis.__api = { THUMUN, TOTAL_AYAT, toG, pageOf, ayahName, rangeText, shortRange, pagesText, iso,
  defaultState, migrateV1, KUFAN_COUNTS, finishOnboarding, editMemorized, selectionOf, resetStrengths, entriesMinutes,
  nextInterval, levelDue, plan, nextNew, applyEntries, saveDaily, replaceDaily, confusions, backupDue, reportData, parseImport,
  VM, RECENT_REVIEWS, SCHEMA_VERSION, todayNum, exportPayload, ABSENCE_DAYS, backfillDays, quickDone, catchupState, TAJWID, newRec, countRecording, recCountBlock, recStats, MUTASHABIHAT, NUZUL, SURAH_THEMES, SURAH_TYPE, AHZAB7, kbFor, kbG, AYAH_COUNTS, toG, rmsFrames, peaksOf, detect, suggestBounds, segmentsOf, hesitations, paceWpm, suggestRating, planPieces, planStatus, setAyahResult, recMistakes, wordsIn, ayahWords, recUnsure, recordFix, allMistakes, myMutashabihat, hydrate, confusions, milestones, newMilestones, markMilestones, finishEstimate, hizbThumun, prunableClips, recAyahStats, recThumunStats, recStrengthKey, recPriority, drillQueue, blindAyat, blindCompare, REC_SCORE, KB_WAQF, KB_USUL, KB_SAJDAT, KB_ADAB, KB_ENDINGS, KB_OPENINGS, KB_STORIES, KB_RIWAYA, KB_BETWEEN, KB_COUNT, MUT_BAQARA, AYAH_TH };`);
const E = global.__api;

let failed = 0, passed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); } };
const t = 20000;
const fresh = () => { const s = E.defaultState(); s.onboarded = true; return s; };
const memTh = (o = {}) => ({ mem: true, memDay: null, strength: 'S', last: t, due: t + 9, iv: 9, reviews: 1, recentN: E.RECENT_REVIEWS, hist: [], ...o });
const rev = (id, rating, status = 0, extra = {}) => ({ kind: 'review', ids: [id], from: E.THUMUN[id].start, to: E.THUMUN[id].end, status, rating, errors: [], ...extra });

// ---- reference data -------------------------------------------------------------------------
ok('Warsh reference: 6214 ayat, 480 contiguous thumun, pages 3–640', () => {
  assert.strictEqual(E.TOTAL_AYAT, 6214); assert.strictEqual(E.THUMUN.length, 480);
  E.THUMUN.forEach((T, i) => { if (i) assert.ok(T.start === E.THUMUN[i - 1].end + 1 || (T.mid && T.start === E.THUMUN[i - 1].end)); });
  assert.strictEqual(E.pageOf(0), 3); assert.strictEqual(E.pageOf(E.TOTAL_AYAT - 1), 640);
});
ok('numeric runs are direction-isolated and unbreakable', () => {
  const s = E.pagesText(E.THUMUN[0].start, E.THUMUN[0].end);
  assert.ok(s.includes('⁦') && s.includes('⁩') && s.includes('⁠'));
  assert.strictEqual(E.shortRange(5, 5), E.ayahName(5));
});

// ---- migration and import --------------------------------------------------------------------
ok('v1 → v2 migration re-addresses ayat by surah:ayah', () => {
  const off = E.KUFAN_COUNTS.reduce((a, n, i) => (a.push(a[i] + n), a), [0]);
  const st = E.migrateV1({ version: 1, settings: {}, th: {}, partial: {}, sessions: [], postponed: {}, errors: [{ day: 1, g: off[1] + 285, th: 0, confused: off[2] + 96 }] });
  assert.strictEqual(E.ayahName(st.errors[0].g), 'البقرة 285');
  assert.strictEqual(E.ayahName(st.errors[0].confused), 'آل عمران 97');
});
ok('import: v1 files migrate, newer format is rejected', () => {
  const r = E.parseImport(JSON.stringify({ app: 'qurn-mm', format: 1, state: { version: 1, settings: {}, th: { 0: { mem: true } }, partial: {}, errors: [], sessions: [], postponed: {} } }));
  assert.ok(r.ok); assert.strictEqual(r.state.version, E.SCHEMA_VERSION); assert.strictEqual(r.mem, 1);
  assert.strictEqual(E.parseImport(JSON.stringify({ app: 'qurn-mm', format: 99, state: {} })).reason, 'newer');
  assert.strictEqual(E.parseImport('nope').reason, 'invalid');
});

// ---- scheduling ------------------------------------------------------------------------------
ok('intervals: strong grows (faster with a teacher), medium settles, weak is next day', () => {
  assert.deepStrictEqual([E.nextInterval('S', 3), E.nextInterval('S', 6), E.nextInterval('S', 12), E.nextInterval('S', 40)], [6, 12, 24, 60]);
  assert.strictEqual(E.nextInterval('S', 6, true), 15);
  assert.strictEqual(E.nextInterval('M', 24), 7); assert.strictEqual(E.nextInterval('W', 24), 1);
});
ok('load levelling moves long intervals to a quieter nearby day, never short ones', () => {
  const st = fresh();
  for (let i = 0; i < 10; i++) st.th[i] = { mem: true, due: t + 20 };
  const d = E.levelDue(st, t + 20, 20, 99);
  assert.ok(d !== t + 20 && Math.abs(d - (t + 20)) <= 3);
  assert.strictEqual(E.levelDue(st, t + 3, 3, 99), t + 3);
});
ok('cycle mode brings everything round within cycleDays', () => {
  const st = fresh(); st.settings.reviewMode = 'cycle'; st.settings.cycleDays = 7;
  for (let id = 0; id < 56; id++) st.th[id] = memTh({ last: null, due: t + 50, iv: 30 });
  const seen = new Set();
  for (let d = 0; d < 7; d++) {
    const entries = E.plan(st, t + d).review.map(r => ({ kind: 'review', ids: r.ids, from: r.from, to: r.to, status: 0, rating: 0, errors: [] }));
    entries.forEach(e => e.ids.forEach(id => seen.add(id)));
    E.applyEntries(st, entries, t + d, 'daily');
  }
  assert.strictEqual(seen.size, 56); assert.ok(Object.values(st.th).every(x => x.iv <= 7));
});
ok('a partial review counts only fully covered thumun, and uses its rating', () => {
  const st = fresh(); st.th[8] = memTh({ strength: 'M', due: t }); st.th[9] = memTh({ strength: 'M', due: t });
  const e = { kind: 'review', ids: [8, 9], from: E.THUMUN[8].start, to: E.THUMUN[9].end, status: 1, rating: 2, lastAyah: E.THUMUN[8].end, errors: [] };
  E.applyEntries(st, [e], t, 'daily');
  assert.strictEqual(st.th[8].strength, 'W'); assert.strictEqual(st.th[8].last, t);
  assert.strictEqual(st.th[9].last, t, 'shared mid-ayah boundary') ;
});

// ---- plan ----------------------------------------------------------------------------------
ok('plan: pressure when more is due than the daily amount', () => {
  const st = fresh(); st.settings.reviewAmount = 4;
  for (let id = 100; id < 110; id++) st.th[id] = memTh({ due: t });
  const p = E.plan(st, t);
  assert.strictEqual(p.dueTotal, 10); assert.ok(p.pressure);
  assert.strictEqual(p.review.reduce((n, r) => n + r.ids.length, 0), 4);
});
ok('plan: new memorization can be paused; review continues', () => {
  const st = fresh(); st.th[100] = memTh({ due: t }); st.settings.newAmount = 0;
  const p = E.plan(st, t);
  assert.strictEqual(p.newItem, null); assert.ok(p.newPaused); assert.strictEqual(p.review.length, 1);
});
ok('linking: three memorized ayat before the new portion, same surah only', () => {
  const st = fresh(); st.th[0] = memTh();
  const n = E.plan(st, t).newItem;
  assert.deepStrictEqual([E.ayahName(n.link.from), E.ayahName(n.link.to), n.link.side], ['البقرة 13', 'البقرة 15', 'before']);
  assert.strictEqual(E.plan(fresh(), t).newItem.link, null);
});

// ---- onboarding and editing ----------------------------------------------------------------
ok('onboarding v2: ayah selection → whole thumun memorized, prefix → new-memorization start', () => {
  const st = fresh(), sel = new Uint8Array(E.TOTAL_AYAT);
  sel.fill(1, 0, E.toG(2, 20) + 1); // al-Fātiḥa to al-Baqarah 20
  E.finishOnboarding(st, { direction: 'fwd', sel, strength: { 0: 'S' }, newAmount: 1, reviewAmount: 8, reminderOn: false, reminderTime: '05:30' }, t);
  assert.deepStrictEqual(Object.keys(st.th).map(Number), [0]);
  assert.strictEqual(st.th[0].strength, 'S'); assert.strictEqual(st.partial[1], 5);
  assert.strictEqual(E.ayahName(E.plan(st, t).newItem.from), 'البقرة 21');
});
ok('onboarding staggers first reviews one daily amount per day, weakest first', () => {
  const st = fresh(), sel = new Uint8Array(E.TOTAL_AYAT), strength = {};
  sel.fill(1, 0, E.THUMUN[39].end + 1); for (let id = 32; id < 40; id++) strength[id] = 'W';
  E.finishOnboarding(st, { direction: 'fwd', sel, strength, newAmount: 1, reviewAmount: 8, reminderOn: false, reminderTime: '05:30' }, t);
  const dues = Object.values(st.th).map(x => x.due);
  assert.strictEqual(Math.min(...dues), t); assert.strictEqual(Math.max(...dues), t + 4);
  for (let id = 32; id < 40; id++) assert.strictEqual(st.th[id].due, t);
});
ok('editing what is memorized: adds, removes (history kept) and round-trips the selection', () => {
  const st = fresh(); st.th[5] = memTh({ reviews: 4 });
  const sel = E.selectionOf(st);
  sel.fill(0, E.THUMUN[5].start, E.THUMUN[5].end + 1);
  sel.fill(1, E.THUMUN[20].start, E.THUMUN[20].end + 1);
  const r = E.editMemorized(st, sel, t);
  assert.deepStrictEqual([r.added, r.removed], [1, 1]);
  assert.strictEqual(st.th[5].mem, false); assert.strictEqual(st.th[5].reviews, 4);
  assert.ok(st.th[20].mem);
});
ok('reset strengths: all memorized back to medium, history kept', () => {
  const st = fresh(); st.th[3] = memTh({ strength: 'W', reviews: 7 }); E.resetStrengths(st);
  assert.strictEqual(st.th[3].strength, 'M'); assert.strictEqual(st.th[3].reviews, 7);
});

// ---- recording, edit today, report, backup -------------------------------------------------
ok('editing today replays from before the daily save, keeping later extras', () => {
  const st = fresh();
  st.th[10] = memTh({ strength: 'M', last: t - 5, due: t, iv: 3, reviews: 2 });
  st.th[20] = memTh({ strength: 'M', last: t - 5, due: t + 2, iv: 3, reviews: 2 });
  E.saveDaily(st, [rev(10, 2)], t, false);
  E.applyEntries(st, [rev(20, 0)], t, 'extra', false);
  const fixed = E.replaceDaily(st, [rev(10, 0)], t, false);
  assert.strictEqual(fixed.th[10].strength, 'S'); assert.strictEqual(fixed.th[10].reviews, 3);
  assert.strictEqual(fixed.th[20].reviews, 3); assert.strictEqual(fixed.sessions.filter(s => s.day === t).length, 2);
});
ok('confusions pair ayat both ways and count distinct days', () => {
  const st = fresh(), a = E.toG(2, 102), b = E.toG(2, 48);
  st.errors.push({ day: t - 2, g: a, th: 9, confused: b }, { day: t - 1, g: b, th: 4, confused: a }, { day: t - 1, g: a, th: 9, confused: b });
  const c = E.confusions(st, t); assert.strictEqual(c.length, 1); assert.strictEqual(c[0].n, 2);
});
ok('report merges new ranges and counts reviews per thumun', () => {
  const st = fresh(); st.th[5] = memTh({ strength: 'M', due: t, iv: 3, reviews: 0 });
  E.saveDaily(st, [{ kind: 'new', ids: [0], from: E.THUMUN[0].start, to: E.THUMUN[0].end, status: 1, lastAyah: E.THUMUN[0].start + 5, errors: [] },
    rev(5, 2, 0, { errors: [{ g: E.THUMUN[5].start, type: 'forget', confused: null }] })], t, true);
  E.applyEntries(st, [{ kind: 'new', ids: [0], from: E.THUMUN[0].start + 6, to: E.THUMUN[0].end, status: 0, errors: [] }], t, 'extra');
  const r = E.reportData(st, t);
  assert.deepStrictEqual(r.newRanges, [[E.THUMUN[0].start, E.THUMUN[0].end]]);
  assert.deepStrictEqual([r.rev.W, r.rev.teacher, r.errors, r.teacherSessions, r.daysDone], [1, 1, 1, 1, 1]);
  assert.ok(E.entriesMinutes(st.sessions[0].entries) > 0);
});
ok('backup nudge after 14 unexported days; snooze holds', () => {
  const st = fresh();
  for (let d = 0; d < 14; d++) st.sessions.push({ day: t - d, kind: 'daily', entries: [] });
  assert.ok(E.backupDue(st, t)); st.backupSnooze = t + 14; assert.ok(!E.backupDue(st, t + 13));
});

// ---- view-model ------------------------------------------------------------------------------
ok('view-model keeps strength and timing as separate channels', () => {
  const st = fresh();
  st.th[0] = memTh({ strength: 'S', due: t });               // strong and due
  st.th[1] = memTh({ strength: 'W', due: t + 3 });           // weak, not due
  st.th[2] = memTh({ strength: null, memDay: t - 2, recentN: 1, due: t + 1 }); // recent, unrated
  assert.deepStrictEqual(E.VM.cell(st, 0, t), { s: 'S', t: 'due' });
  assert.deepStrictEqual(E.VM.cell(st, 1, t), { s: 'W', t: null });
  assert.deepStrictEqual(E.VM.cell(st, 2, t), { s: 'U', t: 'recent' });
  const snap = E.VM.snapshot(st, t, E.plan(st, t));
  assert.deepStrictEqual([snap.counts.mem, snap.counts.strong, snap.counts.due, snap.counts.recent], [3, 1, 1, 1]);
  assert.ok(E.VM.matches(snap.cells[0], 'strong') && E.VM.matches(snap.cells[0], 'due'));
});

// ---- edge cases ------------------------------------------------------------------------------
ok('nothing memorized: only the first new portion, no review, no pressure', () => {
  const p = E.plan(fresh(), t);
  assert.strictEqual(p.newItem.ids[0], 0); assert.deepStrictEqual([p.review.length, p.recent.length, p.dueTotal, p.pressure, p.done], [0, 0, 0, false, false]);
});
ok('everything memorized: no new portion, flagged complete, not "paused"', () => {
  const st = fresh(); E.THUMUN.forEach(T => { st.th[T.id] = memTh({ due: t + 30 }); });
  const p = E.plan(st, t);
  assert.strictEqual(p.newItem, null); assert.ok(p.allMemorized); assert.ok(!p.newPaused);
});
ok('backward direction starts from hizb 60, then works back hizb by hizb', () => {
  const st = fresh(); st.settings.direction = 'bwd';
  assert.strictEqual(E.nextNew(st).ids[0], 59 * 8);
  for (let k = 0; k < 8; k++) st.th[59 * 8 + k] = memTh();
  assert.strictEqual(E.nextNew(st).ids[0], 58 * 8);
});
ok('half a thumun, then the rest; two thumun join only when contiguous', () => {
  const st = fresh(); st.settings.newAmount = 0.5;
  const a = E.nextNew(st), T0 = E.THUMUN[0];
  assert.strictEqual(a.from, T0.start); assert.ok(a.to < T0.end);
  st.partial[0] = a.to - T0.start + 1;
  const b = E.nextNew(st); assert.strictEqual(b.from, a.to + 1); assert.strictEqual(b.to, T0.end);
  st.partial = {}; st.settings.newAmount = 2;
  const c = E.nextNew(st); assert.deepStrictEqual(c.ids, [0, 1]); assert.strictEqual(c.to, E.THUMUN[1].end);
});
ok('daily amount larger than what is due: reviews only what is due', () => {
  const st = fresh(); st.settings.reviewAmount = 24;
  st.th[100] = memTh({ due: t }); st.th[200] = memTh({ due: t + 5 });
  const p = E.plan(st, t);
  assert.deepStrictEqual(p.review.flatMap(r => r.ids), [100]); assert.ok(!p.pressure);
});
ok('absence of 3+ days marks the return state; 2 days does not', () => {
  const st = fresh(); st.th[100] = memTh({ due: t });
  st.sessions.push({ day: t - E.ABSENCE_DAYS, kind: 'daily', entries: [] });
  assert.ok(E.plan(st, t).returning);
  st.sessions.push({ day: t - 2, kind: 'daily', entries: [] });
  assert.ok(!E.plan(st, t).returning);
});
ok('a thumun memorized today is not reviewed today; recent ones come back next days', () => {
  const st = fresh();
  E.saveDaily(st, [{ kind: 'new', ids: [0], from: E.THUMUN[0].start, to: E.THUMUN[0].end, status: 0, errors: [] }], t, false);
  assert.ok(E.plan(st, t).done);
  assert.strictEqual(E.plan(st, t).review.length + E.plan(st, t).recent.length, 0);
  assert.deepStrictEqual(E.plan(st, t + 1).recent.flatMap(r => r.ids), [0]);
});
ok('day starts at dayStart, not midnight', () => {
  const st = fresh(), realNow = Date.now;
  try {
    Date.now = () => new Date(2026, 9, 8, 2, 30).getTime(); st.settings.dayStart = '03:00';
    const before = E.todayNum(st);
    Date.now = () => new Date(2026, 9, 8, 3, 30).getTime();
    assert.strictEqual(E.todayNum(st), before + 1);
  } finally { Date.now = realNow; }
});
ok('export → import round trip keeps everything but the draft and the edit-today snapshot', () => {
  const st = fresh(); st.th[3] = memTh({ strength: 'W' }); st.settings.reviewAmount = 12;
  E.saveDaily(st, [rev(3, 0)], t, true);
  const r = E.parseImport(E.exportPayload(st));
  assert.ok(r.ok); assert.strictEqual(r.state.th[3].strength, 'S'); assert.strictEqual(r.state.settings.reviewAmount, 12);
  assert.strictEqual(r.state.sessions.length, 1); assert.strictEqual(r.state.preDaily, null);
});
ok('import tolerates unknown fields and fills missing settings', () => {
  const st = fresh(); const payload = JSON.parse(E.exportPayload(st));
  payload.state.futureField = 1; delete payload.state.settings.textSize; payload.extra = { x: 1 };
  const r = E.parseImport(JSON.stringify(payload));
  assert.ok(r.ok); assert.strictEqual(r.state.settings.textSize, 'default');
});

// ---- 0.11: missed days, quick done, catch-up, notes ----------------------------------------
ok('missed days: last 3 days after the latest recording, oldest first; none once today has anything', () => {
  const st = fresh(); st.th[100] = memTh({ due: t - 2 });
  assert.deepStrictEqual(E.backfillDays(st, t), [t - 3, t - 2, t - 1]);
  st.sessions.push({ day: t - 2, kind: 'daily', entries: [] });
  assert.deepStrictEqual(E.backfillDays(st, t), [t - 1]);
  st.sessions.push({ day: t, kind: 'extra', entries: [] });
  assert.deepStrictEqual(E.backfillDays(st, t), []);
});
ok('recording a missed day dates the reviews to that day', () => {
  const st = fresh(); st.th[100] = memTh({ strength: 'S', last: t - 10, due: t - 1, iv: 9 });
  const day = t - 1, p = E.plan(st, day);
  E.saveDaily(st, p.review.map(r => ({ kind: 'review', ids: r.ids, from: r.from, to: r.to, status: 0, rating: 0, errors: [] })), day, false);
  assert.strictEqual(st.th[100].last, day); assert.ok(st.th[100].due >= day + 15);
  assert.strictEqual(st.sessions[0].day, day);
  assert.ok(!E.plan(st, t).done, 'today is still open');
});
ok('quick done: records the day\'s plan as done and strong; refuses twice or for a closed day', () => {
  const st = fresh(); st.th[100] = memTh({ strength: 'M', due: t, iv: 3 });
  assert.ok(E.quickDone(st, t, t));
  assert.ok(E.plan(st, t).done); assert.strictEqual(st.th[100].strength, 'S');
  const s0 = st.sessions[0]; assert.ok(s0.entries.some(e => e.kind === 'new' && e.status === 0));
  assert.ok(!E.quickDone(st, t, t), 'already recorded');
  assert.ok(!E.quickDone(st, t - 1, t), 'a later session exists');
  const st2 = fresh(); st2.th[100] = memTh({ due: t - 1 });
  assert.ok(E.quickDone(st2, t - 1, t), 'yesterday from a late tap');
  assert.ok(!E.quickDone(fresh(), t - 9, t), 'too old');
});
ok('catch-up: spreads the backlog over the chosen days, can pause new, ends by itself', () => {
  const st = fresh(); st.settings.reviewAmount = 4;
  for (let id = 100; id < 130; id++) st.th[id] = memTh({ due: t - 5 });
  st.catchup = { start: t, days: 5, pauseNew: true };
  const n = d => E.plan(st, d).review.reduce((a, r) => a + r.ids.length, 0);
  assert.strictEqual(n(t), 6); assert.strictEqual(E.plan(st, t).newItem, null);
  assert.deepStrictEqual([E.plan(st, t).catchup.dayN, E.plan(st, t).catchup.daysLeft], [1, 5]);
  assert.strictEqual(n(t + 4), 30, 'last day takes what is left');
  assert.strictEqual(E.plan(st, t + 5).catchup, null); assert.strictEqual(n(t + 5), 4);
  assert.ok(E.plan(st, t + 5).newItem);
  st.catchup.pauseNew = false; assert.ok(E.plan(st, t).newItem);
});
ok('notes survive export/import and are untouched by editing today', () => {
  const st = fresh(); st.th[3] = memTh({ due: t });
  E.saveDaily(st, [rev(3, 1)], t, false);
  st.notes[3] = { text: 'لا تخلط بين 102 و 48', day: t }; st.settings.theme = 'dark';
  const fixed = E.replaceDaily(st, [rev(3, 0)], t, false);
  assert.strictEqual(fixed.notes[3].text, 'لا تخلط بين 102 و 48'); assert.strictEqual(fixed.settings.theme, 'dark');
  const r = E.parseImport(E.exportPayload(fixed));
  assert.strictEqual(r.state.notes[3].text, 'لا تخلط بين 102 و 48');
});

// ---- 0.12: recordings («التلاوة») ------------------------------------------------------------
ok('recordings: logged in state, exported, kept when today is edited', () => {
  const st = fresh(); st.th[3] = memTh({ due: t });
  E.saveDaily(st, [rev(3, 1)], t, false);
  st.recs[111] = E.newRec([3], t, 90000, 'tajwid');
  const fixed = E.replaceDaily(st, [rev(3, 0)], t, false);
  assert.strictEqual(fixed.recs[111].ms, 90000);
  const r = E.parseImport(E.exportPayload(fixed));
  assert.deepStrictEqual(r.state.recs[111].ids, [3]); assert.strictEqual(r.state.recs[111].from, E.THUMUN[3].start);
});
ok('a memorization check counts once, today only, memorized only, with its mistakes', () => {
  const st = fresh(); st.th[20] = memTh({ strength: 'S', due: t + 5, iv: 10, reviews: 2 });
  const g = E.THUMUN[20].start + 2;
  st.recs[1] = { ...E.newRec([20, 21], t, 60000, 'hifz'), rating: 2 }; E.setAyahResult(st.recs[1], g, 'forget');
  assert.strictEqual(E.recCountBlock(st, st.recs[1], t), '');
  assert.ok(E.countRecording(st, 1, t));
  assert.strictEqual(st.th[20].strength, 'W'); assert.strictEqual(st.th[20].due, t + 1); assert.strictEqual(st.th[20].reviews, 3);
  assert.ok(!st.th[21], 'not memorized: untouched');
  const s = st.sessions[st.sessions.length - 1];
  assert.deepStrictEqual([s.kind, s.src, s.rec], ['extra', 'rec', 1]); assert.strictEqual(st.errors[0].g, g);
  assert.strictEqual(E.recCountBlock(st, st.recs[1], t), 'counted'); assert.ok(!E.countRecording(st, 1, t));
  st.recs[2] = { ...E.newRec([20], t - 1, 60000, 'hifz'), rating: 0 };
  assert.strictEqual(E.recCountBlock(st, st.recs[2], t), 'old');
  st.recs[3] = { ...E.newRec([20], t, 60000, 'tajwid'), rating: 0 };
  assert.strictEqual(E.recCountBlock(st, st.recs[3], t), 'tajwid');
  st.recs[4] = E.newRec([20], t, 60000, 'hifz');
  assert.strictEqual(E.recCountBlock(st, st.recs[4], t), 'noRating');
  st.recs[5] = { ...E.newRec([300], t, 60000, 'hifz'), rating: 0 };
  assert.strictEqual(E.recCountBlock(st, st.recs[5], t), 'notMem');
});
ok('recording stats: this month vs last, per tajwid aspect, per week', () => {
  const st = fresh();
  const add = (id, day, ms, aspects, rating = -1) => { st.recs[id] = { ...E.newRec([5], day, ms, 'both'), aspects, rating }; };
  add(1, t, 120000, { mudud: 1, waqf: 0 }, 0);
  add(2, t - 3, 60000, { mudud: 0 });
  add(3, t - 10, 60000, {});
  add(4, t - 40, 60000, { mudud: 1 }); add(5, t - 45, 60000, { mudud: 1 });
  const r = E.recStats(st, t);
  assert.deepStrictEqual([r.total, r.count, r.minutes, r.assessed], [5, 3, 4, 2]);
  const m = r.aspects.find(a => a.key === 'mudud');
  assert.deepStrictEqual([m.cur.n, m.cur.work, m.cur.rate, m.prev.rate], [2, 1, 0.5, 1]);
  assert.strictEqual(m.trend, -0.5, 'improving');
  assert.strictEqual(r.aspects.find(a => a.key === 'waqf').trend, null, 'too little data');
  assert.strictEqual(r.worst.key, 'mudud');
  assert.deepStrictEqual(r.weeks.map(w => w.n), [0, 1, 1, 0, 0, 0, 1, 2], "oldest week first");
  assert.deepStrictEqual(r.ratings, [1, 0, 0]);
  assert.strictEqual(r.top[0].n, 5);
});

// ---- 0.13: «عن القرآن» ---------------------------------------------------------------------
ok('knowledge: every reference is a real Warsh ayah, ahzab cover 2–114 once, 86 Makki', () => {
  const refs = [...E.MUTASHABIHAT.flatMap(m => [...m.sides.map(x => x.ref), ...(m.also || [])]), ...E.NUZUL.map(n => n.ref)];
  refs.forEach(([s, a]) => { assert.ok(s >= 1 && s <= 114 && a >= 1 && a <= E.AYAH_COUNTS[s - 1], `${s}:${a}`); assert.strictEqual(E.kbG([s, a]), E.toG(s, a)); });
  assert.strictEqual(new Set(E.MUTASHABIHAT.map(m => m.id)).size, E.MUTASHABIHAT.length);
  const cover = E.AHZAB7.flatMap(h => Array.from({ length: h.to - h.from + 1 }, (_, i) => h.from + i));
  assert.deepStrictEqual(cover, Array.from({ length: 113 }, (_, i) => i + 2));
  assert.strictEqual(E.SURAH_TYPE.length, 114); assert.strictEqual([...E.SURAH_TYPE].filter(c => c === 'k').length, 86);
  Object.keys(E.SURAH_THEMES).forEach(s => assert.ok(+s >= 1 && +s <= 114));
});
ok('knowledge heads-ups: found inside a range, not outside; surah theme only at its start', () => {
  const g = E.toG(7, 164), hit = E.kbFor(g - 2, g + 2);
  assert.ok(hit.some(h => h.kind === 'mut' && h.item.id === 'walaallahum'));
  assert.ok(!E.kbFor(E.toG(7, 170), E.toG(7, 172)).some(h => h.item.id === 'walaallahum'));
  assert.ok(E.kbFor(E.toG(26, 1), E.toG(26, 3)).some(h => h.kind === 'theme' && h.item.s === 26));
  assert.ok(!E.kbFor(E.toG(26, 2), E.toG(26, 3)).some(h => h.kind === 'theme'));
  assert.ok(E.kbFor(E.THUMUN[0].start, E.THUMUN[E.THUMUN.length - 1].end).length >= E.MUTASHABIHAT.length + E.NUZUL.length);
});

// ---- 0.14: self-tasmīʿ analysis and plans ---------------------------------------------------
// Synthetic loudness: speech (0.5) and silence (0.01) runs, in 50 ms frames.
const pattern = runs => runs.flatMap(([ms, on]) => Array(Math.round(ms / 50)).fill(on ? 0.5 : 0.01));
ok('analysis: speech/silence, gaps between ayat, long pauses, trim edges', () => {
  // 1 s lead-in, ayah (4 s), gap 0.6 s, ayah (3 s) with a 2 s pause inside, gap 0.8 s, ayah (2 s), 1.5 s tail
  const rms = pattern([[1000, 0], [4000, 1], [600, 0], [1500, 1], [2000, 0], [1500, 1], [800, 0], [2000, 1], [1500, 0]]);
  const d = E.detect(rms);
  assert.strictEqual(d.start, 1000); assert.strictEqual(d.end, 1000 + 4000 + 600 + 1500 + 2000 + 1500 + 800 + 2000);
  assert.strictEqual(d.speechMs, 4000 + 1500 + 1500 + 2000);
  assert.deepStrictEqual(d.gaps.map(g => g.len), [600, 2000, 800]);
  assert.deepStrictEqual(d.pauses.map(p => p.len), [2000]);
  assert.strictEqual(E.detect([]).speechMs, 0);
  assert.strictEqual(E.detect(Array(40).fill(0.01)).speechMs, 0, 'silence only');
});
ok('analysis: tiny blips and holes are ignored', () => {
  const d = E.detect(pattern([[1000, 1], [100, 0], [1000, 1], [2000, 0], [100, 1], [2000, 0], [1000, 1]]));
  assert.deepStrictEqual(d.gaps.map(g => g.len), [4100], 'a 100 ms hole is not a gap; a 100 ms blip is not speech');
});
ok('analysis: suggested boundaries are the n−1 longest gaps, in time order', () => {
  const gaps = [{ at: 5000, len: 600 }, { at: 9000, len: 2000 }, { at: 12000, len: 800 }, { at: 15000, len: 400 }];
  assert.deepStrictEqual(E.suggestBounds(gaps, 3), [9000, 12000]);
  assert.deepStrictEqual(E.suggestBounds(gaps, 9), [5000, 9000, 12000, 15000], 'fewer gaps than needed');
  assert.deepStrictEqual(E.suggestBounds(gaps, 1), []);
});
ok('analysis: with word counts, a long mid-ayah pause is not taken for an ayah end', () => {
  // ayat of 10, 20, 10 words at even pace: ends at 10 s and 30 s of speech; a 3 s hesitation at 20 s.
  const gaps = [{ at: 11000, len: 600, sp: 10000 }, { at: 23000, len: 3000, sp: 20000 }, { at: 34000, len: 600, sp: 30000 }];
  assert.deepStrictEqual(E.suggestBounds(gaps, 3, [10, 20, 10], 40000), [11000, 34000]);
  assert.deepStrictEqual(E.suggestBounds(gaps, 3), [11000, 23000], 'without words: longest gaps (ties: earliest)');
  const d = E.detect(pattern([[500, 0], [2000, 1], [600, 0], [3000, 1]]));
  assert.strictEqual(d.gaps[0].sp, 2000, 'speech before the gap');
});
ok('analysis: segments from marks and trim; hesitations only inside an ayah', () => {
  const segs = E.segmentsOf([5000, 12000, 99999], 20000, [1000, 18000]);
  assert.deepStrictEqual(segs, [{ from: 1000, to: 5000 }, { from: 5000, to: 12000 }, { from: 12000, to: 18000 }]);
  const pauses = [{ at: 5100, len: 1500 }, { at: 8000, len: 2000 }, { at: 17900, len: 1200 }];
  assert.deepStrictEqual(E.hesitations(pauses, segs).map(h => h.length), [0, 1, 0]);
  assert.deepStrictEqual(E.segmentsOf([], 3000, null), [{ from: 0, to: 3000 }]);
});
ok('analysis: pace, rating suggestion, waveform peaks, RMS framing', () => {
  assert.strictEqual(E.paceWpm(120, 60000), 120); assert.strictEqual(E.paceWpm(50, 0), 0);
  assert.deepStrictEqual([0, 1, 2, 3, 7].map(E.suggestRating), [0, 1, 1, 2, 2]);
  const pk = E.peaksOf([0, 1, 0.5, 0.25], 2); assert.deepStrictEqual(pk, [1, 0.5]);
  const fr = E.rmsFrames(new Float32Array([1, -1, 1, -1, 0, 0, 0, 0]), 80, 50); assert.deepStrictEqual(fr, [1, 0]);
  assert.strictEqual(E.wordsIn(E.toG(108, 1), E.toG(108, 3)), [1, 2, 3].reduce((n, a) => n + E.ayahWords(E.toG(108, a)), 0));
});
ok('self-check: per-ayah results become the marked mistakes; stats per 100 ayat', () => {
  const st = fresh(); const r = st.recs[1] = { ...E.newRec([0], t, 60000, 'hifz'), checked: t, an: { wpm: 90, hes: 2 } };
  for (let g = r.from; g <= r.to; g++) E.setAyahResult(r, g, 'ok');
  E.setAyahResult(r, r.from + 2, 'forget'); E.setAyahResult(r, r.from + 4, 'hesitate', 'توقفت');
  assert.deepStrictEqual(r.errors, [r.from + 2, r.from + 4]);
  assert.deepStrictEqual(E.recMistakes(r).map(m => m.res), ['forget', 'hesitate']);
  E.setAyahResult(r, r.from + 2, null); assert.deepStrictEqual(r.errors, [r.from + 4]);
  const s = E.recStats(st, t);
  const n = r.to - r.from;  // one ayah result was cleared
  assert.deepStrictEqual([s.self.cur.n, s.self.cur.ayat, s.self.cur.mistakes, s.self.cur.wpm, s.self.cur.hes], [1, n, 1, 90, 2]);
  assert.strictEqual(s.self.cur.per100, Math.round(1 / n * 1000) / 10);
  assert.strictEqual(s.wrongTop[0].g, r.from + 4); assert.strictEqual(s.weeks[7].checks, 1);
});
ok('plans: pieces of 1–2 thumun within a hizb; next piece; done when all clean', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 4 + i);   // hizb 1 k5–8, hizb 2 k1–6
  const pieces = E.planPieces(ids, 2);
  assert.deepStrictEqual(pieces.map(p => p.join('.')), ['4.5', '6.7', '8.9', '10.11', '12.13']);
  assert.deepStrictEqual(E.planPieces([6, 7, 8], 2).map(p => p.join('.')), ['6.7', '8'], 'never across a hizb');
  const plan = { id: 1, ids: [0, 1, 2], piece: 1 };
  const recs = {};
  let ps = E.planStatus(plan, recs);
  assert.deepStrictEqual([ps.none, ps.next.ids[0], ps.done], [3, 0, false]);
  const T = E.THUMUN, rec = (id, th, res) => { const r = recs[id] = { ...E.newRec([th], t, 1000, 'hifz') }; if (res) { r.checked = t; for (let g = r.from; g <= r.to; g++) E.setAyahResult(r, g, 'ok'); if (res === 'bad') E.setAyahResult(r, r.from + 1, 'forget'); } };
  rec(10, 0, 'clean'); rec(11, 1, 'bad'); rec(12, 2, null);
  ps = E.planStatus(plan, recs);
  assert.deepStrictEqual(ps.pieces.map(p => p.state), ['clean', 'mistakes', 'recorded']);
  assert.strictEqual(ps.next.ids[0], 2, 'unchecked before mistakes');
  rec(13, 2, 'clean'); ps = E.planStatus(plan, recs); assert.strictEqual(ps.next.ids[0], 1);
  rec(14, 1, 'clean'); ps = E.planStatus(plan, recs); assert.ok(ps.done); assert.strictEqual(ps.next, null);
  // A wider recording covers a piece too.
  const wide = { 20: { ...E.newRec([0, 1], t, 1000, 'hifz') } };
  assert.strictEqual(E.planStatus({ id: 2, ids: [0, 1], piece: 1 }, wide).recorded, 2);
});
ok('plans and recording checks are exported and survive editing today', () => {
  const st = fresh(); st.th[3] = memTh({ due: t }); E.saveDaily(st, [rev(3, 1)], t, false);
  st.recPlans.push({ id: 7, name: 'الحزب 1', ids: [0, 1], piece: 1, created: t, done: null });
  st.recs[5] = { ...E.newRec([0], t, 1000, 'hifz'), marks: [1200, 3400], bookmarks: [{ ms: 800, note: 'مد' }] };
  const fixed = E.replaceDaily(st, [rev(3, 0)], t, false);
  assert.strictEqual(fixed.recPlans[0].id, 7);
  const r = E.parseImport(E.exportPayload(fixed));
  assert.deepStrictEqual(r.state.recs[5].marks, [1200, 3400]); assert.strictEqual(r.state.recPlans[0].name, 'الحزب 1');
});

// ---- 0.15: verdict gate, categories, corrections, متشابهاتي ---------------------------------
ok('verdicts: ✓ / ؟ / ✗ with a category; ؟ is neither clean nor a mistake; 0.14 «confuse» becomes «jump»', () => {
  const r = E.newRec([0], t, 1000, 'hifz'), a = r.from;
  E.setAyahResult(r, a, 'ok'); E.setAyahResult(r, a + 1, 'unsure'); E.setAyahResult(r, a + 2, 'subst', { note: 'بدّلت كلمة' });
  E.setAyahResult(r, a + 3, 'jump', { confused: E.toG(3, 83) });
  assert.deepStrictEqual(E.recMistakes(r).map(m => [m.g - a, m.res, m.status]), [[2, 'subst', 'open'], [3, 'jump', 'open']]);
  assert.deepStrictEqual(E.recUnsure(r), [a + 1]); assert.deepStrictEqual(r.errors, [a + 2, a + 3]);
  assert.strictEqual(r.ayahs[a + 3].confused, E.toG(3, 83));
  E.setAyahResult(r, a + 3, 'forget'); assert.strictEqual(r.ayahs[a + 3].confused, undefined, '«اشتبه بـ» only for انتقال');
  const old = E.hydrate({ ...E.defaultState(), recs: { 9: { ...E.newRec([0], t, 1, 'hifz'), ayahs: { [a]: { res: 'confuse' } } } } });
  assert.strictEqual(old.recs[9].ayahs[a].res, 'jump');
});
ok('corrections: re-record attempts are kept; clean resolves; a resolved mistake keeps its history', () => {
  const st = fresh(); const r = st.recs[1] = E.newRec([0], t, 1000, 'hifz'), g = r.from + 1;
  E.setAyahResult(r, g, 'omit');
  assert.ok(E.recordFix(st, 1, g, 50, 'wrong', t)); assert.strictEqual(r.ayahs[g].status, 'open');
  assert.ok(E.recordFix(st, 1, g, 51, 'clean', t + 1));
  assert.deepStrictEqual([r.ayahs[g].status, r.ayahs[g].resolved, r.ayahs[g].fixes.map(f => f.verdict)], ['resolved', t + 1, ['wrong', 'clean']]);
  E.setAyahResult(r, g, 'omit', { note: 'تعديل الملاحظة' }); assert.strictEqual(r.ayahs[g].status, 'resolved', 'editing the note keeps it resolved');
  assert.ok(!E.recordFix(st, 1, r.from, 52, 'clean', t), 'not a mistake');
  st.recs[2] = { ...E.newRec([0], t, 500, 'hifz', g, g), fixOf: { rec: 1, g } };
  assert.strictEqual(E.allMistakes(st).length, 1, 'fix recordings are not listed');
  const s = E.recStats(st, t); assert.deepStrictEqual([s.mistakesStatus.open, s.mistakesStatus.resolved, s.count], [0, 1, 1]);
});
ok('plans: ؟ and open mistakes keep a piece from being clean; resolving makes it clean', () => {
  const recs = {}, plan = { id: 1, ids: [0], piece: 1 };
  const r = recs[5] = { ...E.newRec([0], t, 1000, 'hifz'), checked: t };
  for (let g = r.from; g <= r.to; g++) E.setAyahResult(r, g, 'ok');
  E.setAyahResult(r, r.from, 'unsure');
  assert.strictEqual(E.planStatus(plan, recs).pieces[0].state, 'mistakes');
  E.setAyahResult(r, r.from, 'forget'); assert.strictEqual(E.planStatus(plan, recs).pieces[0].state, 'mistakes');
  const st = { recs }; E.recordFix(st, 5, r.from, 6, 'clean', t);
  assert.strictEqual(E.planStatus(plan, recs).pieces[0].state, 'clean');
});
ok('متشابهاتي: jump mistakes paired both ways, ranked by count then recency; counted ones reach the engine', () => {
  const st = fresh(); st.th[0] = memTh({ due: t });
  const A = E.toG(2, 135), B = E.toG(3, 83), C = E.toG(7, 164), D = E.toG(6, 47);
  const mk = (id, day, g, other) => { const r = st.recs[id] = { ...E.newRec([E.THUMUN.find(T => g >= T.start && g <= T.end).id], day, 1, 'hifz') }; E.setAyahResult(r, g, 'jump', { confused: other }); return r; };
  mk(1, t - 3, A, B); mk(2, t - 1, B, A); mk(3, t, C, D);
  const pairs = E.myMutashabihat(st);
  assert.deepStrictEqual(pairs.map(p => [p.a, p.b, p.n]), [[A, B, 2], [D, C, 1]]);
  assert.strictEqual(pairs[0].last, t - 1);
  const r = st.recs[4] = { ...E.newRec([0], t, 1, 'hifz'), rating: 1 }; E.setAyahResult(r, r.from + 1, 'jump', { confused: A });
  assert.ok(E.countRecording(st, 4, t));
  const e = st.errors[st.errors.length - 1]; assert.deepStrictEqual([e.g, e.type, e.confused], [r.from + 1, 'confuse', A]);
});

// ---- milestones and the finish estimate ---------------------------------------------------------
ok('milestones: reached from real state, announced once, kept if the memorized set shrinks', () => {
  const st = fresh();
  assert.deepStrictEqual(E.newMilestones(st, t), []);
  E.hizbThumun(1).forEach(id => { st.th[id] = memTh(); });
  assert.deepStrictEqual(E.newMilestones(st, t).map(m => m.id), ['th1', 'h1']);
  assert.deepStrictEqual(E.markMilestones(st, t, t).map(m => m.id), ['th1', 'h1']);
  assert.deepStrictEqual(E.newMilestones(st, t), []);
  const h1 = E.milestones(st, t).find(m => m.id === 'h1'); assert.ok(h1.reached && h1.seen); assert.strictEqual(h1.day, t);
  const h5 = E.milestones(st, t).find(m => m.id === 'h5'); assert.ok(!h5.reached); assert.deepStrictEqual([h5.have, h5.n], [1, 5]);
  st.th[0].mem = false;
  assert.ok(E.milestones(st, t).find(m => m.id === 'h1').reached);
});
ok('milestones: what was memorized before is noted silently (day 0), a clean self-check counts', () => {
  const st = fresh(); st.th[0] = memTh();
  E.markMilestones(st, t, 0);
  assert.strictEqual(st.prefs.ms.th1, 0); assert.strictEqual(E.milestones(st, t).find(m => m.id === 'th1').day, null);
  const r = st.recs[1] = { ...E.newRec([0], t, 1000, 'hifz'), checked: t };
  assert.deepStrictEqual(E.newMilestones(st, t), []); // checked but no verdicts yet
  E.setAyahResult(r, r.from, 'forget'); assert.deepStrictEqual(E.newMilestones(st, t), []);
  E.setAyahResult(r, r.from, 'ok'); assert.deepStrictEqual(E.newMilestones(st, t).map(m => m.id), ['chk1']);
  assert.ok(E.hydrate(JSON.parse(JSON.stringify(st))).prefs.ms.th1 === 0);
});
ok('finish estimate: remaining over the daily amount; none while new memorization is paused', () => {
  assert.deepStrictEqual(E.finishEstimate(480, 1, t), { days: 480, day: t + 480 });
  assert.deepStrictEqual(E.finishEstimate(5, 2, t), { days: 3, day: t + 3 });
  assert.deepStrictEqual(E.finishEstimate(3, 0.5, t), { days: 6, day: t + 6 });
  assert.strictEqual(E.finishEstimate(10, 0, t), null);
  assert.deepStrictEqual(E.finishEstimate(0, 1, t), { days: 0, day: t });
});

// ---- recorder: storage rule, voice-note flag ---------------------------------------------------------
ok('storage rule: only reviewed takes with nothing open, older than the limit; off by default', () => {
  const st = fresh(); assert.strictEqual(st.settings.recKeepDays, 0);
  const mk = (id, day, extra) => { st.recs[id] = { ...E.newRec([0], day, 1000, 'hifz'), ...extra }; return st.recs[id]; };
  mk(1, t - 70, { checked: t - 69 });                                   // clean and old: goes
  mk(2, t - 70, {});                                                    // never reviewed: stays
  const open = mk(3, t - 70, { checked: t - 69 }); E.setAyahResult(open, open.from, 'forget');     // open mistake: stays
  const q = mk(4, t - 70, { checked: t - 69 }); E.setAyahResult(q, q.from, 'unsure');              // «؟»: stays
  mk(5, t - 10, { checked: t - 9 });                                    // clean but recent: stays
  const fixed = mk(6, t - 70, { checked: t - 69 }); E.setAyahResult(fixed, fixed.from, 'omit');
  mk(7, t - 65, { fixOf: { rec: 6, g: fixed.from }, checked: t - 65 }); E.recordFix(st, 6, fixed.from, 7, 'clean', t - 65);  // resolved: both go
  mk(8, t - 65, { fixOf: { rec: 3, g: open.from }, checked: t - 65 }); E.recordFix(st, 3, open.from, 8, 'wrong', t - 65);    // still open: stays
  mk(9, t - 70, { purpose: 'tajwid' }); mk(10, t - 70, { purpose: 'tajwid', aspects: { mudud: 0 } });                       // tajwid: only once assessed
  const meta = Object.keys(st.recs).map(id => ({ id: +id, day: st.recs[id].day, size: 100 })).concat([{ id: 99, day: t - 400, size: 5 }]); // 99: no log entry, untouched
  assert.deepStrictEqual(E.prunableClips(st, meta, t, 60).map(c => c.id), [1, 6, 7, 10]);
  assert.deepStrictEqual(E.prunableClips(st, meta, t, 0), []);
  assert.deepStrictEqual(E.prunableClips(st, meta, t, 90), []);
});
ok('a spoken note stays with the mistake when its kind changes, and goes when the ayah is cleared', () => {
  const r = E.newRec([0], t, 1000, 'hifz'); assert.deepStrictEqual(r.hes, []);
  E.setAyahResult(r, r.from, 'forget', { vn: { ms: 4000 } });
  E.setAyahResult(r, r.from, 'subst', { note: 'x' });
  assert.deepStrictEqual(r.ayahs[r.from].vn, { ms: 4000 });
  E.setAyahResult(r, r.from, 'subst', { vn: null }); assert.ok(!('vn' in r.ayahs[r.from]));
  E.setAyahResult(r, r.from, 'forget', { vn: { ms: 1 } }); E.setAyahResult(r, r.from, 'ok'); assert.ok(!('vn' in r.ayahs[r.from]));
});

// ---- strength, priorities, drill and blind pass from self-checks ---------------------------------------
const checked = (st, id, th, day, results) => { const r = st.recs[id] = { ...E.newRec([th], day, 1000, 'hifz'), checked: day }; for (let g = r.from; g <= r.to; g++) E.setAyahResult(r, g, results[g - r.from] || 'ok'); return r; };
ok('recording strength: clean is 1, a mistake weakens, older and corrected mistakes count less, unchecked is absent', () => {
  const st = fresh(), r = checked(st, 1, 0, t, ['forget', 'hesitate']), a = E.recAyahStats(st, t);
  assert.strictEqual(a[r.from].strength, 0); assert.ok(Math.abs(a[r.from + 1].strength - 0.7) < 1e-9); assert.strictEqual(a[r.from + 2].strength, 1);
  assert.strictEqual(E.recAyahStats(st, t)[E.THUMUN[1].start], undefined);
  const later = E.recAyahStats(st, t + 21); assert.ok(Math.abs(later[r.from].strength - 0.5) < 1e-9);       // half-life 21 days
  E.recordFix(st, 1, r.from, 2, 'clean', t); assert.ok(Math.abs(E.recAyahStats(st, t)[r.from].strength - 0.5) < 1e-9); // corrected: half
  checked(st, 3, 0, t, []);                                                                                 // a second, clean review
  assert.ok(Math.abs(E.recAyahStats(st, t)[r.from].strength - 0.75) < 1e-9);
  assert.deepStrictEqual([E.recStrengthKey(null), E.recStrengthKey(0.9), E.recStrengthKey(0.7), E.recStrengthKey(0.2)], [null, 'strong', 'medium', 'weak']);
  const T0 = E.THUMUN[0], th = E.recThumunStats(st, t)[0];
  assert.strictEqual(th.checked, T0.end - T0.start + 1); assert.strictEqual(th.total, th.checked); assert.strictEqual(th.open, 1); assert.ok(th.strength > 0.9 && th.strength < 1);
});
ok('what to revise next: open mistakes and weakness first, then time since the last check; not what was done today', () => {
  const st = fresh();
  checked(st, 1, 0, t - 5, ['forget', 'subst', 'omit']);     // weak, three open
  checked(st, 2, 1, t - 40, []);                             // clean but long ago
  checked(st, 3, 2, t - 2, []);                              // clean and recent: below the threshold
  checked(st, 4, 3, t, ['forget']);                          // today: not suggested
  st.recs[5] = E.newRec([4], t - 10, 1000, 'hifz');          // recorded, never checked
  const p = E.recPriority(st, t, 5);
  assert.deepStrictEqual(p.map(x => x.id), [4, 1, 0]);
  assert.deepStrictEqual(p.map(x => x.why), ['stale', 'stale', 'open']);
  assert.ok(p.every(x => x.score >= E.REC_SCORE.minPriority));
  assert.strictEqual(E.recPriority(st, t, 1).length, 1);
  assert.deepStrictEqual(E.recPriority(fresh(), t), []);
});
ok('mistake drill: open mistakes only, oldest first, capped', () => {
  const st = fresh(), a = checked(st, 1, 0, t - 3, ['forget']), b = checked(st, 2, 1, t - 9, ['omit', 'add']);
  E.recordFix(st, 2, b.from + 1, 7, 'clean', t);
  assert.deepStrictEqual(E.drillQueue(st), [{ rec: 2, g: b.from, res: 'omit' }, { rec: 1, g: a.from, res: 'forget' }]);
  assert.strictEqual(E.drillQueue(st, 1).length, 1);
});
ok('blind pass: taps map to the ayah just before them; caught, missed and false alarms', () => {
  const segs = [{ from: 0, to: 4000, g1: 10 }, { from: 4000, to: 9000, g1: 11 }, { from: 9000, to: 12000, g1: 12 }];
  assert.deepStrictEqual(E.blindAyat([4500, 10500, 11000, 99999], segs), [10, 12]); // 4500 − 1200 is still in the first ayah
  assert.deepStrictEqual(E.blindCompare([10, 12], [10, 11]), { caught: 1, missed: 1, extra: 1 });
  assert.deepStrictEqual(E.blindCompare([], []), { caught: 0, missed: 0, extra: 0 });
  const st = fresh(), r = checked(st, 1, 0, t, ['forget']); r.blind = { marks: [1], day: t, res: { caught: 1, missed: 1, extra: 0 } };
  const s = E.recStats(st, t).blind; assert.deepStrictEqual([s.n, s.rate], [1, 50]);
});

// ---- «عن القرآن»: the research added in 1.4.0 -------------------------------------------------------
ok('knowledge: every reference is a real Warsh ayah, every entry names its source', () => {
  const valid = ([s, a]) => s >= 1 && s <= 114 && a >= 1 && a <= E.AYAH_COUNTS[s - 1];
  const refs = [...E.MUTASHABIHAT.flatMap(m => [...m.sides.map(x => x.ref), ...(m.also || [])]), ...E.NUZUL.map(n => n.ref), ...E.KB_WAQF.map(w => w.ref), ...E.KB_SAJDAT,
    ...E.KB_USUL.flatMap(u => [u.ref, ...(u.ref2 ? [u.ref2] : [])]), ...E.KB_ENDINGS.flatMap(e => e.refs || []), ...Object.values(E.KB_ADAB).flat().flatMap(e => e.refs || [])];
  refs.forEach(r => assert.ok(valid(r), 'bad reference ' + r));
  assert.strictEqual(E.MUT_BAQARA.length, 20); assert.ok(E.MUT_BAQARA.every(m => m.src && m.note && m.sides.length >= 2));
  assert.strictEqual(new Set(E.MUTASHABIHAT.map(m => m.id)).size, E.MUTASHABIHAT.length);
  assert.ok(E.NUZUL.length === 5 && E.NUZUL.every(n => n.src && n.grade));
  assert.ok([...E.KB_WAQF, ...E.KB_STORIES, ...E.KB_RIWAYA, ...E.KB_BETWEEN, ...E.KB_COUNT, ...Object.values(E.KB_ADAB).flat()].every(e => e.title && e.text && e.src));
  assert.strictEqual(E.KB_SAJDAT.length, 11); assert.strictEqual(E.KB_USUL.length, 10); assert.strictEqual(E.KB_OPENINGS.length, 8);
  assert.deepStrictEqual(Object.keys(E.KB_ADAB), ['tilawa', 'hamil', 'methods', 'tathbit', 'ahkam', 'khatm']);
});
ok('knowledge heads-ups: similar ayat, a stop, a sajdah and a reason of revelation are found in their range', () => {
  const kinds = (s, a) => E.kbFor(E.toG(s, a), E.toG(s, a)).map(h => h.kind + ':' + (h.item.id || h.item.ref[0]));
  assert.ok(kinds(2, 85).includes('mut:b-ishtaraw') && kinds(2, 85).includes('mut:b-yunsarun'));
  assert.deepStrictEqual(kinds(6, 37), ['waqf:anam']);
  assert.deepStrictEqual(kinds(7, 206), ['sajda:7']);
  assert.ok(kinds(2, 185).includes('nuzul:qarib') && kinds(2, 157).includes('nuzul:safa') && kinds(5, 95).includes('nuzul:taimu'));
  assert.deepStrictEqual(E.kbFor(E.toG(2, 20), E.toG(2, 24)), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
