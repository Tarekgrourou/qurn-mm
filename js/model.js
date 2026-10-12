// State, persistence, scheduling and the daily plan. No DOM here.
'use strict';

const SCHEMA_VERSION = 2;   // 2: Warsh (Madani count) reference data
const APP_VERSION = '1.4.0';
const STORE_KEY = 'qurn-mm';

const MIN_NEW = 12;      // minutes per thumun of new memorization
const MIN_RECENT = 3;    // minutes per thumun of recent review
const MIN_REVIEW = 5.6;  // minutes per thumun of far review (8 ≈ 45 min)
const RECENT_REVIEWS = 7;
const HEAVY_SEGMENTS = 7;
const ABSENCE_DAYS = 3;
const MAX_INTERVAL = 60;
const CYCLE_WEAK_EXTRA = 2;   // weak thumun added on top of the cycle quota

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    onboarded: false,
    settings: {
      direction: 'fwd', newAmount: 1, reviewAmount: 8, reminderOn: true, reminderTime: '05:30', dayStart: '03:00',
      reviewMode: 'adaptive', cycleDays: 14, theme: 'system', repTarget: 20,
      textSize: 'default', density: 'comfortable', stateColors: 'default', motion: 'default',
      recAutoNext: false, // self-check: move to the next ayah after a verdict (off: the verdict gate waits)
      recKeepDays: 0,     // storage rule: remove the audio of clean, reviewed takes after this many days (0: never)
      recBlind: false     // self-check: start with a first listen without the muṣḥaf
    },
    prefs: { tour: null, tips: {}, ms: null }, // guided tour status ('done'|'skipped'), dismissed tips, milestones seen
    counter: null, // { day, n } — repetitions of today's new portion
    th: {},        // thumun id -> { mem, memDay, strength, last, due, iv, reviews, recentN, hist: [[day, rating, teacher?]] }
    partial: {},   // thumun id -> ayat already memorized from its start
    errors: [],    // { day, g, th, type, confused }
    sessions: [],  // { day, kind: 'daily'|'extra', teacher, entries: [{ kind, ids, from, to, status, rating, lastAyah, errors }] }
    postponed: {}, // day -> [thumun ids]
    draft: null,   // { day, mode, key, teacher, entries } — an unsaved recording
    preDaily: null,// { day, snap } — state before today's daily save, so today can be edited
    lastExport: null,
    backupSnooze: null,
    lastAutoBackup: null, // day of the last automatic backup (Android folder backup)
    notes: {},     // thumun id -> { text, day } — personal notes
    catchup: null, // { start, days, pauseNew } — temporary plan to clear a review backlog
    recs: {},      // clip id -> recording log and self-check (audio itself stays on the device)
    recPlans: []   // recitation plans: { id, name, ids, piece, created, done }
  };
}

function hydrate(st) {
  const d = defaultState();
  return { ...d, ...st, settings: { ...d.settings, ...st.settings }, prefs: { ...d.prefs, ...st.prefs, tips: { ...(st.prefs && st.prefs.tips) } }, notes: { ...st.notes }, recs: migrateRecResults({ ...st.recs }), recPlans: [...(st.recPlans || [])] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      let st = JSON.parse(raw);
      if (st && st.version === 1) st = migrateV1(st);
      if (st && st.version === SCHEMA_VERSION) return hydrate(st);
    }
  } catch (e) { /* fall through to a fresh state */ }
  return defaultState();
}

function saveState(st) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable */ }
}

// ---- migration ------------------------------------------------------------------------------

// v1 used Kufan (Hafs) ayah counts. Positions are re-addressed by surah and ayah; an ayah number
// that no longer exists in the Madani count is clamped to the surah's last ayah.
const KUFAN_COUNTS = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29,
  18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50,
  40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6,
  3, 5, 4, 5, 6];

function migrateV1(st) {
  const off = KUFAN_COUNTS.reduce((acc, n, i) => (acc.push(acc[i] + n), acc), [0]);
  const remap = g => {
    if (g == null) return g;
    let s = 1;
    while (off[s] <= g) s++;
    return toG(s, Math.min(g - off[s - 1] + 1, AYAH_COUNTS[s - 1]));
  };
  st.errors = (st.errors || []).map(e => {
    const g = remap(e.g);
    return { ...e, g, th: thumunOf(g).id, confused: remap(e.confused) };
  });
  st.sessions = (st.sessions || []).map(s => ({
    ...s, entries: (s.entries || []).map(e => ({ ...e, from: remap(e.from), to: remap(e.to), lastAyah: remap(e.lastAyah), errors: [] }))
  }));
  Object.keys(st.partial || {}).forEach(id => {
    const T = THUMUN[id];
    if (st.partial[id] >= T.end - T.start + 1) delete st.partial[id];
  });
  st.version = SCHEMA_VERSION;
  return st;
}

// ---- days -------------------------------------------------------------------------------

// Dev aid: ?day=+3 shifts "today" to test absence, recent windows and due dates.
const DAY_SHIFT = (() => { const m = /[?&]day=([+-]?\d+)/.exec(location.search); return m ? +m[1] : 0; })();

function todayNum(st) {
  const [h, m] = st.settings.dayStart.split(':').map(Number);
  const d = new Date(Date.now() - (h * 60 + m) * 60000);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + DAY_SHIFT;
}
const dayDate = n => new Date(n * 86400000);

// ---- thumun state -------------------------------------------------------------------------

const memIds = st => Object.keys(st.th).map(Number).filter(id => st.th[id].mem).sort((a, b) => a - b);

function isRecent(t, today) {
  return !!(t && t.mem && t.memDay != null && t.memDay < today && (t.recentN || 0) < RECENT_REVIEWS && today - t.memDay <= RECENT_REVIEWS + 3);
}

// Map code: 0 not memorized · R recent · N needs review · S strong · M medium · W weak
function mapState(st, id, today) {
  const t = st.th[id];
  if (!t || !t.mem) return '0';
  if (t.memDay === today || isRecent(t, today)) return 'R';
  if (!t.strength || today - t.due > 3) return 'N';
  return t.strength;
}

function order(dir) {
  const ids = THUMUN.map(t => t.id);
  if (dir !== 'bwd') return ids;
  const out = [];
  for (let h = 59; h >= 0; h--) for (let k = 0; k < 8; k++) out.push(h * 8 + k);
  return out;
}

// ---- scheduling ----------------------------------------------------------------------------

// Next interval grows from the previous one: strong doubles (more when recited to a teacher),
// medium settles at a short interval, weak comes back tomorrow.
function nextInterval(rating, prevIv, teacher) {
  const prev = prevIv || 3;
  if (rating === 'S') return Math.min(MAX_INTERVAL, Math.max(4, Math.round(prev * (teacher ? 2.5 : 2))));
  if (rating === 'M') return Math.min(teacher ? 10 : 7, Math.max(2, Math.round(prev * 0.5) + 1));
  return 1;
}

// Spread load: an interval of 4+ days may move by ~15% to the least-loaded nearby day.
function levelDue(st, base, iv, exceptId) {
  if (iv < 4) return base;
  const f = Math.max(1, Math.round(iv * 0.15));
  const load = {};
  Object.entries(st.th).forEach(([id, t]) => { if (t.mem && +id !== exceptId) load[t.due] = (load[t.due] || 0) + 1; });
  let best = base;
  for (let d = base - f; d <= base + f; d++) {
    const a = load[d] || 0, b = load[best] || 0;
    if (a < b || (a === b && Math.abs(d - base) < Math.abs(best - base))) best = d;
  }
  return best;
}

// ---- weak spots and confusions ---------------------------------------------------------------

function weakSpots(st, today) {
  const by = {};
  st.errors.filter(e => today - e.day < 30).forEach(e => {
    (by[e.g] = by[e.g] || { g: e.g, th: e.th, days: new Set() }).days.add(e.day);
  });
  return Object.values(by).filter(w => w.days.size >= 2).map(w => {
    const lastErr = Math.max(...w.days);
    const hist = (st.th[w.th] && st.th[w.th].hist) || [];
    const clean = hist.filter(([d, r]) => d > lastErr && r !== 'P').length;
    return { ...w, nDays: w.days.size, clean, recovering: clean === 1 };
  }).filter(w => w.clean < 2).sort((a, b) => b.nDays - a.nDays || a.g - b.g);
}

// Pairs of ayat confused with each other in the last 90 days, by number of days it happened.
function confusions(st, today) {
  const by = {};
  st.errors.filter(e => e.confused != null && today - e.day < 90).forEach(e => {
    const [a, b] = e.g < e.confused ? [e.g, e.confused] : [e.confused, e.g];
    const p = by[a + ':' + b] = by[a + ':' + b] || { a, b, days: new Set(), last: 0 };
    p.days.add(e.day);
    p.last = Math.max(p.last, e.day);
  });
  return Object.values(by).map(p => ({ ...p, n: p.days.size, thA: thumunOf(p.a).id, thB: thumunOf(p.b).id }))
    .sort((x, y) => y.n - x.n || y.last - x.last);
}

// ---- plan ----------------------------------------------------------------------------------

function nextNew(st) {
  const ord = order(st.settings.direction);
  const i = ord.findIndex(id => !(st.th[id] && st.th[id].mem));
  if (i < 0) return null;
  const amt = st.settings.newAmount;
  if (!amt) return null;
  const id = ord[i], T = THUMUN[id], from = T.start + (st.partial[id] || 0), ids = [id];
  let to = T.end;
  if (amt === 0.5) to = Math.min(T.end, from + Math.ceil((T.end - T.start + 1) / 2) - 1);
  if (amt === 2) {
    const j = ord.slice(i + 1).find(x => !(st.th[x] && st.th[x].mem));
    if (j != null && THUMUN[j].start <= T.end + 1) { ids.push(j); to = THUMUN[j].end; }
  }
  const size = (to - from + 1) / (T.end - T.start + 1);
  return { kind: 'new', ids, from, to, min: Math.max(5, Math.round(MIN_NEW * Math.min(size, ids.length))) };
}

// ---- linking (الربط) -------------------------------------------------------------------------

const LINK_AYAT = 3;

function isMemAyah(st, g) {
  const T = thumunOf(g), t = st.th[T.id];
  if (t && t.mem) return true;
  const p = st.partial[T.id];
  return !!p && g < T.start + p;
}

// The memorized ayat that join the new portion to what is already known: up to three ayat
// just before it in the same surah, or, failing that, just after it.
function linkFor(st, item) {
  const a1 = fromG(item.from).a;
  if (a1 > 1 && isMemAyah(st, item.from - 1)) {
    let g = item.from - 1;
    while (g > item.from - LINK_AYAT && g > item.from - a1 + 1 && isMemAyah(st, g - 1)) g--;
    return { side: 'before', from: g, to: item.from - 1 };
  }
  const { s, a } = fromG(item.to), last = AYAH_COUNTS[s - 1];
  if (a < last && isMemAyah(st, item.to + 1)) {
    let g = item.to + 1;
    while (g < item.to + LINK_AYAT && g < item.to + last - a && isMemAyah(st, g + 1)) g++;
    return { side: 'after', from: item.to + 1, to: g };
  }
  return null;
}

// Pair consecutive thumun in the same hizb into segments of at most two.
function segment(ids) {
  const sorted = [...ids].sort((a, b) => a - b), out = [];
  sorted.forEach(id => {
    const last = out[out.length - 1];
    if (last && last.length < 2 && last[last.length - 1] === id - 1 && THUMUN[id].hizb === THUMUN[last[0]].hizb) last.push(id);
    else out.push([id]);
  });
  return out;
}
const segRange = seg => ({ from: THUMUN[seg[0]].start, to: THUMUN[seg[seg.length - 1]].end });

function reviewReason(st, ids, today, weak) {
  const ws = weak.find(w => ids.includes(w.th) && !w.recovering);
  if (ws) return { text: 'تكرر الخطأ في ' + ayahName(ws.g), weak: true };
  const ts = ids.map(id => st.th[id]);
  if (ts.some(t => t.strength === 'W')) return { text: 'كان ضعيفاً في آخر مراجعة', weak: true };
  const lasts = ts.map(t => t.last).filter(d => d != null);
  if (!lasts.length) return { text: 'أول مراجعة له في التطبيق', icon: 'fiber_new' };
  return { text: 'آخر مراجعة قبل ' + daysWord(today - Math.min(...lasts)) };
}

// Thumun for far review today. Adaptive: due items by priority, capped by the daily amount.
// Cycle: the longest-unreviewed share of everything memorized, so all of it comes round every
// cycleDays days, plus a couple of weak thumun on top.
function reviewIds(st, today, candidates, weakTh, cap) {
  const set = st.settings;
  if (set.reviewMode === 'cycle') {
    const quota = Math.ceil(candidates.length / set.cycleDays);
    const byAge = [...candidates].sort((a, b) => (st.th[a].last ?? -1e9) - (st.th[b].last ?? -1e9) || a - b);
    const picked = byAge.slice(0, quota);
    const weak = candidates.filter(id => !picked.includes(id) && (st.th[id].strength === 'W' || weakTh.has(id)) && st.th[id].due <= today);
    return [...picked, ...weak.slice(0, CYCLE_WEAK_EXTRA)];
  }
  const prio = id => {
    const t = st.th[id];
    return (today - t.due) + (t.strength === 'W' ? 6 : 0) + (weakTh.has(id) ? 8 : 0) + (!t.strength ? 2 : 0);
  };
  return candidates.filter(id => st.th[id].due <= today)
    .sort((a, b) => prio(b) - prio(a) || a - b)
    .slice(0, cap);
}

function plan(st, today) {
  const weak = weakSpots(st, today);
  const post = st.postponed[today] || [];
  const ids = memIds(st);
  const cu = st.settings.reviewMode === 'cycle' ? null : catchupState(st, today);
  const newItem = cu && cu.pauseNew ? null : nextNew(st);
  if (newItem) newItem.link = linkFor(st, newItem);

  const recentIds = ids.filter(id => isRecent(st.th[id], today));
  const recent = segment(recentIds).map(seg => {
    const n = Math.min(RECENT_REVIEWS, Math.max(...seg.map(id => st.th[id].recentN || 0)) + 1);
    return { kind: 'recent', ids: seg, ...segRange(seg),
      reason: { text: 'قريب · المراجعة ' + ar(n) + ' من ' + ar(RECENT_REVIEWS) }, min: Math.round(MIN_RECENT * seg.length) };
  });

  const weakTh = new Set(weak.filter(w => !w.recovering).map(w => w.th));
  const candidates = ids.filter(id => !recentIds.includes(id) && st.th[id].memDay !== today && !post.includes(id));
  const dueTotal = candidates.filter(id => st.th[id].due <= today).length;
  const cap = cu ? Math.max(st.settings.reviewAmount, Math.ceil(dueTotal / cu.daysLeft)) : st.settings.reviewAmount;
  const chosen = reviewIds(st, today, candidates, weakTh, cap);
  const rank = id => chosen.indexOf(id);
  const review = segment(chosen)
    .map(seg => ({ kind: 'review', ids: seg, ...segRange(seg), reason: reviewReason(st, seg, today, weak),
      min: Math.round(MIN_REVIEW * seg.length), r: Math.min(...seg.map(rank)) }))
    .sort((a, b) => a.r - b.r);

  const lastDaily = st.sessions.filter(s => s.kind === 'daily').map(s => s.day);
  const lastDay = lastDaily.length ? Math.max(...lastDaily) : null;
  return {
    newItem, recent, review, weak,
    done: lastDaily.includes(today),
    returning: lastDay != null && today - lastDay >= ABSENCE_DAYS,
    heavy: review.length >= HEAVY_SEGMENTS,
    dueTotal, pressure: st.settings.reviewMode !== 'cycle' && dueTotal > chosen.length, catchup: cu,
    newPaused: !st.settings.newAmount && ids.length < THUMUN.length,
    allMemorized: ids.length === THUMUN.length,
    total: (newItem ? newItem.min : 0) + [...recent, ...review].reduce((s, x) => s + x.min, 0)
  };
}

// A stable key for a list of plan items, so a saved draft is reused only for the same plan.
const planKey = items => items.map(it => it.kind + it.ids.join('.') + ':' + it.from + '-' + it.to).join('|');

// ---- recording ---------------------------------------------------------------------------

// entry: { kind, ids, from, to, status: 0 done | 1 partial | 2 not, rating: 0 S | 1 M | 2 W, lastAyah, errors: [{ g, type, confused }] }
function applyEntries(st, entries, today, kind, teacher) {
  const R = ['S', 'M', 'W'];
  const cycle = st.settings.reviewMode === 'cycle' ? st.settings.cycleDays : null;
  entries.forEach(e => {
    if (e.kind === 'new') {
      if (e.status === 2) return;
      const upto = e.status === 0 ? e.to : e.lastAyah;
      e.ids.forEach(id => {
        const T = THUMUN[id];
        if (T.end <= upto) {
          const prev = st.th[id] || {};
          st.th[id] = { ...prev, mem: true, memDay: today, strength: null, last: null, due: today + 1, iv: 1, reviews: prev.reviews || 0, recentN: 0, hist: prev.hist || [] };
          delete st.partial[id];
        } else if (T.start <= upto) st.partial[id] = upto - T.start + 1;
      });
      return;
    }
    // Errors first, so a new weak spot already shortens this review's interval.
    e.errors.forEach(er => st.errors.push({ day: today, g: er.g, th: thumunOf(er.g).id, type: er.type, confused: er.confused }));
    if (e.status === 2) return;
    const weakNow = new Set(weakSpots(st, today).filter(w => !w.recovering).map(w => w.th));
    e.ids.forEach(id => {
      const t = st.th[id];
      if (!t) return;
      if (e.status === 1 && THUMUN[id].end > e.lastAyah) return; // only fully covered thumun count
      const rating = e.rating >= 0 ? R[e.rating] : (t.strength || 'M');
      const recent = isRecent(t, today);
      t.hist = [...(t.hist || []), teacher ? [today, e.status === 0 ? rating : 'P', 1] : [today, e.status === 0 ? rating : 'P']];
      t.reviews = (t.reviews || 0) + 1;
      t.last = today;
      t.strength = rating;
      if (recent) t.recentN = (t.recentN || 0) + 1;
      let iv = e.status === 0 ? nextInterval(rating, t.iv, teacher) : (t.iv || 3);
      if (recent && t.recentN < RECENT_REVIEWS) iv = 1;
      if (weakNow.has(id)) iv = Math.min(iv, 3);
      if (cycle) iv = Math.min(iv, cycle);
      t.iv = iv;
      t.due = levelDue(st, today + iv, iv, id);
    });
  });
  st.sessions.push({ day: today, kind, teacher: !!teacher, entries: entries.map(e => ({
    kind: e.kind, ids: e.ids, from: e.from, to: e.to, status: e.status, rating: e.rating, lastAyah: e.lastAyah,
    errors: e.errors.map(er => ({ g: er.g, type: er.type, confused: er.confused }))
  })) });
}

// Save today's daily recording, keeping the state before it so the day can be edited later.
function saveDaily(st, entries, today, teacher) {
  const { draft, preDaily, ...rest } = st;
  st.preDaily = { day: today, snap: JSON.stringify(rest) };
  applyEntries(st, entries, today, 'daily', teacher);
  st.draft = null;
}

// Re-record today: start again from the state before the daily save, apply the corrected
// entries, then replay today's later extra reviews. Returns the new state.
function replaceDaily(st, entries, today, teacher) {
  if (!st.preDaily || st.preDaily.day !== today) return null;
  const extras = st.sessions.filter(s => s.day === today && s.kind === 'extra');
  const base = hydrate(JSON.parse(st.preDaily.snap));
  // Things that are not part of the recording keep their current values.
  ['settings', 'prefs', 'notes', 'recs', 'recPlans', 'catchup', 'counter', 'lastExport', 'backupSnooze', 'lastAutoBackup', 'onboarded'].forEach(k => { base[k] = st[k]; });
  saveDaily(base, entries, today, teacher);
  extras.forEach(s => applyEntries(base, s.entries, today, 'extra', s.teacher));
  return base;
}

const canEditToday = (st, today) => !!(st.preDaily && st.preDaily.day === today && st.sessions.some(s => s.day === today && s.kind === 'daily'));

// Days that can still be recorded after the fact: any of the last BACKFILL_DAYS days on or after
// which nothing at all has been recorded, so the past is never rewritten or replayed.
const BACKFILL_DAYS = 3;
function backfillDays(st, today) {
  if (!st.onboarded) return [];
  const lastAny = st.sessions.length ? Math.max(...st.sessions.map(s => s.day)) : -Infinity;
  const out = [];
  for (let d = today - BACKFILL_DAYS; d < today; d++) if (d > lastAny) out.push(d); // oldest first
  return out;
}

// "Recited everything" (from the reminder notification): the day's plan, all done and strong.
// Returns false when that day is already recorded or can no longer be recorded.
function quickDone(st, day, today) {
  if (!st.onboarded || st.sessions.some(s => s.day === day && s.kind === 'daily')) return false;
  if (day !== today && !backfillDays(st, today).includes(day)) return false;
  if (day === today && st.sessions.some(s => s.day > today)) return false;
  const p = plan(st, day);
  const items = [...(p.newItem ? [p.newItem] : []), ...p.recent, ...p.review];
  if (!items.length) return false;
  saveDaily(st, items.map(it => ({ kind: it.kind, ids: it.ids, from: it.from, to: it.to, status: 0, rating: it.kind === 'new' ? -1 : 0, lastAyah: null, errors: [] })), day, false);
  return true;
}

// ---- recordings («التلاوة») --------------------------------------------------------------
// rec: { ids, from, to, day, ms, purpose: 'hifz'|'tajwid'|'both', rating: -1|0 S|1 M|2 W,
//        errors: [g], aspects: { key: 0 good | 1 needs work }, note, counted: day|null }

const TAJWID = [
  ['makharij', 'مخارج الحروف'], ['mudud', 'المدود'], ['ghunna', 'الغنّة'], ['nun', 'أحكام النون والميم الساكنتين'],
  ['tafkhim', 'التفخيم والترقيق'], ['waqf', 'الوقف والابتداء'], ['pace', 'الإيقاع وسرعة القراءة']
];
// from/to narrow the range (a re-recording of one ayah to correct a mistake).
const newRec = (ids, day, ms, purpose, from, to) => ({ ids, from: from ?? THUMUN[ids[0]].start, to: to ?? THUMUN[ids[ids.length - 1]].end, day, ms,
  purpose: purpose || 'both', rating: -1, errors: [], aspects: {}, note: '', counted: null,
  marks: [], hes: [], ayahs: {}, bookmarks: [], trim: null, checked: null, an: null });

// hes: [ms] — «تردّدت هنا» tapped while reciting (your own signal, shown on the waveform).
// Self-check verdict per ayah (the verdict gate): { res, note?, confused?, status?, fixes?, resolved?, vn? }
//   vn: { ms } — a spoken note on the mistake (its audio stays on the device, like the take).
//   res: 'ok' ✓ | 'unsure' ؟ | a mistake category ✗ (MISTAKE_AR).
//   Mistakes are 'open' until a re-recording of that ayah is judged clean ('resolved').
//   fixes: [{ id, day, verdict: 'clean' | 'wrong' }] — every attempt is kept.
const MISTAKE_AR = { forget: 'نسيان', subst: 'تبديل', omit: 'حذف', add: 'زيادة', jump: 'انتقال', hesitate: 'تردّد', tajwid: 'تجويد' };
const MISTAKE_HINT = { forget: 'توقّفت أو نسيت', subst: 'كلمة مكان كلمة', omit: 'سقطت كلمة أو جملة', add: 'كلمة زائدة', jump: 'انتقلت إلى آية متشابهة', hesitate: 'تردّدت ثم أصبت', tajwid: 'خطأ في الأداء' };
const isMistake = res => !!res && res !== 'ok' && res !== 'unsure';
const recMistakes = r => Object.entries(r.ayahs || {}).filter(([, x]) => isMistake(x.res)).map(([g, x]) => ({ g: +g, ...x, status: x.status || 'open' })).sort((a, b) => a.g - b.g);
const recUnsure = r => Object.entries(r.ayahs || {}).filter(([, x]) => x.res === 'unsure').map(([g]) => +g).sort((a, b) => a - b);
// Mistakes found in the self-check become the recording's marked mistakes (used when counted).
function setAyahResult(r, g, res, extra) {
  r.ayahs = r.ayahs || {};
  if (res == null) delete r.ayahs[g];
  else {
    const prev = r.ayahs[g] || {};
    const x = { res, ...(typeof extra === 'string' ? { note: extra } : extra || {}) };
    if (!x.note) delete x.note;
    if (isMistake(res)) { x.status = prev.status === 'resolved' && isMistake(prev.res) ? 'resolved' : 'open'; if (prev.fixes) x.fixes = prev.fixes; if (prev.resolved != null) x.resolved = prev.resolved; if (prev.vn && x.vn === undefined) x.vn = prev.vn; }
    if (!x.vn) delete x.vn;
    if (res !== 'jump') delete x.confused;
    r.ayahs[g] = x;
  }
  r.errors = recMistakes(r).map(m => m.g);
}
// 0.14 used 'confuse' for what is now 'jump' (انتقال).
function migrateRecResults(recs) {
  Object.values(recs || {}).forEach(r => Object.values(r.ayahs || {}).forEach(x => { if (x.res === 'confuse') x.res = 'jump'; }));
  return recs;
}
// A re-recording of a mistaken ayah, judged by the user: clean resolves the mistake.
function recordFix(st, recId, g, fixId, verdict, today) {
  const r = st.recs[recId], x = r && r.ayahs && r.ayahs[g];
  if (!x || !isMistake(x.res)) return false;
  x.fixes = [...(x.fixes || []), { id: fixId, day: today, verdict }];
  if (verdict === 'clean') { x.status = 'resolved'; x.resolved = today; } else x.status = 'open';
  return true;
}
// Every mistake across recordings (fix recordings themselves excluded), newest recording first.
function allMistakes(st) {
  const out = [];
  Object.entries(st.recs || {}).forEach(([id, r]) => { if (!r.fixOf) recMistakes(r).forEach(m => out.push({ rec: +id, day: r.day, ...m })); });
  return out.sort((a, b) => b.rec - a.rec || a.g - b.g);
}
// «متشابهاتي»: jump mistakes grouped by unordered ayah pair, most frequent then most recent.
function myMutashabihat(st) {
  const by = {};
  allMistakes(st).filter(m => m.res === 'jump' && m.confused != null).forEach(m => {
    const [a, b] = m.g < m.confused ? [m.g, m.confused] : [m.confused, m.g], k = a + '-' + b;
    const e = by[k] = by[k] || { a, b, n: 0, last: -Infinity, open: 0 };
    e.n++; e.last = Math.max(e.last, m.day); if (m.status !== 'resolved') e.open++;
  });
  return Object.values(by).sort((x, y) => y.n - x.n || y.last - x.last);
}
const recAssessed = r => r.rating >= 0 || Object.keys(r.aspects || {}).length > 0 || r.checked != null;

// Storage rule: which clips' audio may be removed. Only takes with nothing left to do: reviewed,
// no open mistake, no «؟» ayah, and older than `days`. A correction clip goes once the mistake it
// corrected is resolved (or its take is gone). Review results and notes are never removed.
// meta: [{ id, day, size }] as kept by the clip store.
function prunableClips(st, meta, today, days) {
  if (!(days > 0)) return [];
  return meta.filter(c => {
    const r = st.recs[c.id];
    if (!r || today - r.day < days) return false;
    if (r.fixOf) { const p = st.recs[r.fixOf.rec], x = p && p.ayahs && p.ayahs[r.fixOf.g]; return !x || !isMistake(x.res) || x.status === 'resolved'; }
    if (r.purpose === 'tajwid') return recAssessed(r);
    return r.checked != null && recUnsure(r).length === 0 && recMistakes(r).every(m => m.status === 'resolved');
  });
}

// Why a recording cannot count as a review, or '' when it can.
function recCountBlock(st, r, today) {
  if (r.counted != null) return 'counted';
  if (r.purpose === 'tajwid') return 'tajwid';
  if (r.day !== today) return 'old';
  if (!r.ids.some(i => st.th[i] && st.th[i].mem)) return 'notMem';
  if (r.rating < 0) return 'noRating';
  return '';
}

// Self-check categories as the engine's error types (weak spots and confusions read these).
const ENGINE_ERR = { forget: 'forget', hesitate: 'hesitate', jump: 'confuse' };
// A memorization check counted as one extra review of the memorized thumun it covers, with its
// rating and marked mistakes. Once per recording, on the day it was recorded.
function countRecording(st, id, today) {
  const r = st.recs[id];
  if (!r || recCountBlock(st, r, today)) return false;
  const ids = r.ids.filter(i => st.th[i] && st.th[i].mem);
  const entries = segment(ids).map(seg => {
    const { from, to } = segRange(seg);
    return { kind: 'review', ids: seg, from, to, status: 0, rating: r.rating, lastAyah: null,
      errors: recMistakes(r).filter(m => m.g >= from && m.g <= to).map(m => ({ g: m.g, type: ENGINE_ERR[m.res] || null, confused: m.res === 'jump' && m.confused != null ? m.confused : null })) };
  });
  applyEntries(st, entries, today, 'extra', false);
  Object.assign(st.sessions[st.sessions.length - 1], { src: 'rec', rec: +id });
  r.counted = today;
  return true;
}

// Tracking for Progress: the last 30 days against the 30 before, per tajwid aspect, per week.
function recStats(st, today) {
  const all = Object.entries(st.recs || {}).filter(([, r]) => !r.fixOf).map(([id, r]) => ({ id: +id, ...r }));
  const cur = all.filter(r => today - r.day < 30 && r.day <= today), prev = all.filter(r => today - r.day >= 30 && today - r.day < 60);
  const aspect = (list, key) => {
    const marked = list.filter(r => r.aspects && r.aspects[key] != null), work = marked.filter(r => r.aspects[key] === 1).length;
    return { n: marked.length, work, rate: marked.length ? work / marked.length : null };
  };
  const aspects = TAJWID.map(([key, label]) => {
    const c = aspect(cur, key), p = aspect(prev, key);
    return { key, label, cur: c, prev: p, trend: c.n >= 2 && p.n >= 2 ? c.rate - p.rate : null };
  });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const w = all.filter(r => Math.floor((today - r.day) / 7) === 7 - i && r.day <= today);
    return { n: w.length, min: Math.round(w.reduce((s, r) => s + r.ms, 0) / 60000) };
  });
  const ratings = [0, 1, 2].map(k => cur.filter(r => r.rating === k).length);
  // Self-checks: mistakes per 100 ayat checked, pace and hesitations, this month vs last.
  const checks = list => {
    const c = list.filter(r => r.checked != null);
    const ayat = c.reduce((n, r) => n + Object.keys(r.ayahs || {}).length, 0), mis = c.reduce((n, r) => n + recMistakes(r).length, 0);
    const an = c.filter(r => r.an && r.an.wpm);
    return { n: c.length, ayat, mistakes: mis, unsure: c.reduce((n, r) => n + recUnsure(r).length, 0), per100: ayat ? Math.round(mis / ayat * 1000) / 10 : null,
      wpm: an.length ? Math.round(an.reduce((s, r) => s + r.an.wpm, 0) / an.length) : null,
      hes: an.length ? Math.round(an.reduce((s, r) => s + (r.an.hes || 0), 0) / an.length * 10) / 10 : null };
  };
  const self = { cur: checks(cur), prev: checks(prev) };
  weeks.forEach((w, i) => { w.checks = all.filter(r => r.checked != null && Math.floor((today - r.day) / 7) === 7 - i && r.day <= today).length; });
  const wrong = {};
  all.forEach(r => recMistakes(r).forEach(m => { (wrong[m.g] = wrong[m.g] || { g: m.g, n: 0, types: {} }).n++; wrong[m.g].types[m.res] = (wrong[m.g].types[m.res] || 0) + 1; }));
  const wrongTop = Object.values(wrong).sort((a, b) => b.n - a.n || a.g - b.g).slice(0, 5);
  // The first listen without the muṣḥaf: how many of the mistakes found later you had caught by ear.
  const bl = cur.filter(r => r.blind && r.blind.res).map(r => r.blind.res);
  const blind = { n: bl.length, caught: bl.reduce((s, b) => s + b.caught, 0), missed: bl.reduce((s, b) => s + b.missed, 0), extra: bl.reduce((s, b) => s + b.extra, 0) };
  blind.rate = blind.caught + blind.missed ? Math.round(blind.caught / (blind.caught + blind.missed) * 100) : null;
  const ms = allMistakes(st), fixesOpen = ms.filter(m => m.status !== 'resolved').length;
  const mistakesStatus = { open: fixesOpen, resolved: ms.length - fixesOpen };
  const by = {};
  all.forEach(r => { const k = r.from + '-' + r.to; (by[k] = by[k] || { from: r.from, to: r.to, n: 0, last: -Infinity }).n++; by[k].last = Math.max(by[k].last, r.day); });
  const top = Object.values(by).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 3);
  const worst = aspects.filter(a => a.cur.rate > 0).sort((a, b) => b.cur.rate - a.cur.rate)[0] || null;
  return { total: all.length, count: cur.length, minutes: Math.round(cur.reduce((s, r) => s + r.ms, 0) / 60000),
    assessed: cur.filter(recAssessed).length, aspects, weeks, ratings, top, worst, self, wrongTop, mistakesStatus, pairs: myMutashabihat(st), blind };
}

// ---- strength and priorities from self-checks ---------------------------------------------------
// A second view of strength, built only from your reviews of your own recordings. It sits beside
// the review-based strength and never changes the daily plan.
const REC_SCORE = {
  weight: { forget: 1, subst: 1, omit: 1, add: 0.8, jump: 1, hesitate: 0.3, tajwid: 0.2 }, // how much each kind of mistake counts
  halfLife: 21,        // days after which a mistake counts half
  resolvedFactor: 0.5, // a corrected mistake counts half
  window: 90,          // reviews this recent are counted as reviews of the ayah
  strong: 0.85, medium: 0.6, // strength bands
  wWeak: 0.6, wStale: 0.3, wOpen: 0.1, // priority = weakness, time since the last check, open mistakes
  staleDays: 30, openFull: 3, minPriority: 0.2
};
// Per ayah with at least one verdict: strength = 1 − min(1, Σ weight × decay × resolved / reviews).
// Ayat never checked are absent (not weak).
function recAyahStats(st, today) {
  const out = {}, K = REC_SCORE;
  Object.values(st.recs || {}).forEach(r => {
    if (r.fixOf || r.day > today) return;
    const day = r.checked ?? r.day, decay = Math.pow(0.5, (today - r.day) / K.halfLife);
    Object.entries(r.ayahs || {}).forEach(([g, x]) => {
      if (!x.res) return;
      const s = out[g] = out[g] || { g: +g, reviews: 0, load: 0, mistakes: 0, open: 0, last: -Infinity };
      if (today - day <= K.window) s.reviews++;
      s.last = Math.max(s.last, day);
      if (!isMistake(x.res)) return;
      const resolved = x.status === 'resolved';
      s.load += (K.weight[x.res] ?? 1) * decay * (resolved ? K.resolvedFactor : 1);
      s.mistakes++; if (!resolved) s.open++;
    });
  });
  Object.values(out).forEach(s => { s.strength = 1 - Math.min(1, s.load / Math.max(1, s.reviews)); });
  return out;
}
const recStrengthKey = v => v == null ? null : v >= REC_SCORE.strong ? 'strong' : v >= REC_SCORE.medium ? 'medium' : 'weak';
// Per thumun with at least one checked ayah: the mean of its checked ayat.
function recThumunStats(st, today, ayat) {
  const a = ayat || recAyahStats(st, today), by = {};
  Object.values(a).forEach(s => {
    const id = AYAH_TH[s.g], T = THUMUN[id], x = by[id] = by[id] || { id, sum: 0, checked: 0, total: T.end - T.start + 1, mistakes: 0, open: 0, last: -Infinity };
    x.sum += s.strength; x.checked++; x.mistakes += s.mistakes; x.open += s.open; x.last = Math.max(x.last, s.last);
  });
  Object.values(by).forEach(x => { x.strength = x.sum / x.checked; delete x.sum; });
  return by;
}
// «اقترح للتسميع»: thumun recorded at least once, ranked by weakness, time since the last check
// and open mistakes. Nothing recorded or checked today; nothing below the threshold.
function recPriority(st, today, n = 3) {
  const K = REC_SCORE, th = recThumunStats(st, today), recDay = {};
  Object.values(st.recs || {}).forEach(r => { if (!r.fixOf && r.day <= today) r.ids.forEach(id => { recDay[id] = Math.max(recDay[id] ?? -Infinity, r.day); }); });
  return Object.keys(recDay).map(Number).map(id => {
    const s = th[id] || null, last = s ? s.last : recDay[id];
    if (recDay[id] === today || last === today) return null;
    const weak = (s ? 1 - s.strength : 0.5) * K.wWeak, stale = Math.min(1, (today - last) / K.staleDays) * K.wStale, open = Math.min(1, (s ? s.open : 0) / K.openFull) * K.wOpen;
    return { id, score: weak + stale + open, strength: s ? s.strength : null, open: s ? s.open : 0, mistakes: s ? s.mistakes : 0, last, checked: !!s,
      why: s && s.open ? 'open' : s && weak >= stale ? 'weak' : 'stale' };
  }).filter(x => x && x.score >= K.minPriority).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, n);
}
// «تمرين الأخطاء»: open mistakes, oldest first.
function drillQueue(st, max = 10) {
  return allMistakes(st).filter(m => m.status !== 'resolved' && st.recs[m.rec]).sort((a, b) => a.day - b.day || a.g - b.g).slice(0, max).map(m => ({ rec: m.rec, g: m.g, res: m.res }));
}

// Catch-up plan: while active, the daily review amount rises so today's backlog clears over the
// chosen number of days. Due dates, intervals and priorities are untouched.
function catchupState(st, today) {
  const c = st.catchup;
  if (!c || today < c.start || today >= c.start + c.days) return null;
  return { ...c, dayN: today - c.start + 1, daysLeft: c.start + c.days - today };
}

// ---- stats ------------------------------------------------------------------------------

function stats(st, today) {
  const counts = { S: 0, M: 0, W: 0, N: 0, R: 0 };
  const perHizb = Array(60).fill(0);
  THUMUN.forEach(T => {
    const c = mapState(st, T.id, today);
    if (c !== '0') { counts[c]++; perHizb[T.hizb - 1]++; }
  });
  const mem = Object.values(counts).reduce((a, b) => a + b, 0);
  const full = perHizb.filter(n => n === 8).length;
  const dailyDays = new Set(st.sessions.filter(s => s.kind === 'daily').map(s => s.day));
  const days = Array.from({ length: 30 }, (_, i) => dailyDays.has(today - 29 + i));
  const newDays = Object.values(st.th).filter(t => t.mem && t.memDay != null && today - t.memDay < 30).map(t => t.memDay);
  const newLast30 = newDays.length;
  // Rate window: the last 30 days, or since the first new memorization if that is more recent.
  const rateSpan = newDays.length ? Math.min(30, today - Math.min(...newDays) + 1) : 30;
  const teacher30 = st.sessions.filter(s => s.teacher && today - s.day < 30).length;
  return { counts, perHizb, mem, full, days, daysDone: days.filter(Boolean).length, newLast30, rateSpan, teacher30 };
}

// ---- milestones ------------------------------------------------------------------------------
// Calm markers of what is memorized: reached once and kept. No consecutive-day counts.

const MS_HIZB = [1, 5, 10, 15, 20, 30, 40, 50, 60];
// The ladder with what is reached now, from real state only. prefs.ms: id -> day it was reached
// while using the app (0: it was already there when first seen).
function milestones(st, today) {
  const s = stats(st, today), seen = (st.prefs && st.prefs.ms) || {};
  const clean = Object.values(st.recs || {}).some(r => !r.fixOf && r.purpose !== 'tajwid' && r.checked != null && Object.keys(r.ayahs || {}).length > 0 && recMistakes(r).length === 0);
  return [{ id: 'th1', kind: 'thumun', n: 1, have: Math.min(1, s.mem) },
    ...MS_HIZB.map(n => ({ id: 'h' + n, kind: 'hizb', n, have: Math.min(n, s.full) })),
    { id: 'chk1', kind: 'check', n: 1, have: clean ? 1 : 0 }]
    .map(m => ({ ...m, reached: m.have >= m.n || m.id in seen, seen: m.id in seen, day: seen[m.id] || null }));
}
const newMilestones = (st, today) => milestones(st, today).filter(m => m.reached && !m.seen);
// Remember what is reached now: `day` when it was just reached, 0 to note it silently.
function markMilestones(st, today, day) {
  const fresh = newMilestones(st, today);
  st.prefs.ms = { ...(st.prefs.ms || {}) };
  fresh.forEach(m => { st.prefs.ms[m.id] = day; });
  return fresh;
}

// «إن استمررت هكذا»: days until the remaining thumun are memorized at a daily amount.
function finishEstimate(remaining, newAmount, today) {
  if (remaining <= 0) return { days: 0, day: today };
  if (!(newAmount > 0)) return null;
  const days = Math.ceil(remaining / newAmount);
  return { days, day: today + days };
}

// ---- teacher report -------------------------------------------------------------------------

// What happened in the last `span` days, for a printable summary.
function reportData(st, today, span = 30) {
  const since = today - span + 1;
  const inPeriod = st.sessions.filter(s => s.day >= since && s.day <= today);
  // New memorization: covered ranges, merged where they touch.
  const covered = [];
  inPeriod.forEach(s => s.entries.forEach(e => {
    if (e.kind !== 'new' || e.status === 2) return;
    covered.push([e.from, e.status === 0 ? e.to : e.lastAyah]);
  }));
  covered.sort((a, b) => a[0] - b[0]);
  const newRanges = covered.reduce((out, r) => {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else out.push([...r]);
    return out;
  }, []);
  // Reviews, counted per thumun.
  const rev = { S: 0, M: 0, W: 0, partial: 0, missed: 0, teacher: 0 };
  inPeriod.forEach(s => s.entries.forEach(e => {
    if (e.kind === 'new') return;
    const n = e.ids.length;
    if (e.status === 0) { rev['SMW'[e.rating]] += n; if (s.teacher) rev.teacher += n; }
    else if (e.status === 1) rev.partial += n; else rev.missed += n;
  }));
  const errors = st.errors.filter(e => e.day >= since && e.day <= today);
  const s = stats(st, today);
  return {
    since, today, span, newRanges, rev, errors: errors.length,
    errTypes: ['forget', 'hesitate', 'confuse'].map(k => errors.filter(e => e.type === k).length),
    daysDone: inPeriod.filter(x => x.kind === 'daily').length, teacherSessions: inPeriod.filter(x => x.teacher).length,
    weak: weakSpots(st, today), confusions: confusions(st, today).filter(p => p.last >= since), stats: s
  };
}

// ---- backup nudge ---------------------------------------------------------------------------

// Suggest an export after 14 recorded days with no backup, or 30+ days since the last one with
// at least a week of new records. Dismissing waits two weeks.
function backupDue(st, today) {
  if (st.backupSnooze != null && today < st.backupSnooze) return false;
  const since = st.sessions.filter(s => s.kind === 'daily' && (st.lastExport == null || s.day > st.lastExport)).length;
  if (st.lastExport == null) return since >= 14;
  return today - st.lastExport >= 30 && since >= 7;
}

// ---- onboarding -------------------------------------------------------------------------

// How much of each thumun an ayah selection covers: 'all', a prefix of n ayat, or nothing.
function coverage(sel, T) {
  let n = 0;
  for (let g = T.start; g <= T.end; g++) if (sel[g]) n++;
  if (n === T.end - T.start + 1) return { all: true, prefix: n };
  let p = 0;
  while (p < T.end - T.start + 1 && sel[T.start + p]) p++;
  return { all: false, prefix: p, any: n > 0 };
}

// The memorized ayat as a selection (for editing what is memorized).
function selectionOf(st) {
  const sel = new Uint8Array(TOTAL_AYAT);
  THUMUN.forEach(T => {
    const t = st.th[T.id];
    if (t && t.mem) sel.fill(1, T.start, T.end + 1);
    else if (st.partial[T.id]) sel.fill(1, T.start, T.start + st.partial[T.id]);
  });
  return sel;
}

// ob: { direction, sel (ayah selection), strength: { thumunId: 'S'|'M'|'W' }, newAmount, reviewAmount, reminderOn, reminderTime }
// A thumun becomes memorized only when all its ayat are selected; a selected prefix of the next
// thumun becomes the starting point of new memorization. First reviews are staggered one daily
// amount per day, weakest first, so day one is not all "needs review".
function finishOnboarding(st, ob, today) {
  st.settings.direction = ob.direction;
  st.settings.newAmount = ob.newAmount;
  st.settings.reviewAmount = ob.reviewAmount;
  st.settings.reminderOn = ob.reminderOn;
  st.settings.reminderTime = ob.reminderTime;
  st.th = {}; st.partial = {};
  const rank = { W: 0, M: 1, S: 2 };
  const ids = [];
  THUMUN.forEach(T => {
    const c = coverage(ob.sel, T);
    if (c.all) ids.push(T.id);
    else if (c.prefix) st.partial[T.id] = c.prefix;
  });
  ids.sort((a, b) => rank[ob.strength[a] || 'M'] - rank[ob.strength[b] || 'M'] || a - b);
  ids.forEach((id, i) => {
    const strength = ob.strength[id] || 'M';
    st.th[id] = { mem: true, memDay: null, strength, last: null, due: today + Math.floor(i / Math.max(1, ob.reviewAmount)),
      iv: strength === 'S' ? 7 : strength === 'M' ? 3 : 1, reviews: 0, recentN: RECENT_REVIEWS, hist: [] };
  });
  st.onboarded = true;
}

// Apply an edited selection after onboarding. Newly covered thumun join the memorized (medium,
// due today, or their previous record if they were memorized before); uncovered ones leave it
// with their history kept. Returns the counts for the confirmation and toast.
function editMemorized(st, sel, today) {
  let added = 0, removed = 0;
  THUMUN.forEach(T => {
    const c = coverage(sel, T), t = st.th[T.id];
    if (c.all) {
      if (!(t && t.mem)) {
        st.th[T.id] = t ? { ...t, mem: true, due: Math.min(t.due, today) }
          : { mem: true, memDay: null, strength: 'M', last: null, due: today, iv: 3, reviews: 0, recentN: RECENT_REVIEWS, hist: [] };
        added++;
      }
      delete st.partial[T.id];
    } else {
      if (t && t.mem) { t.mem = false; removed++; }
      if (c.prefix) st.partial[T.id] = c.prefix; else delete st.partial[T.id];
    }
  });
  return { added, removed };
}

// Advanced setting: strength estimates start again from medium; memorized, history and errors stay.
function resetStrengths(st) {
  Object.values(st.th).forEach(t => { if (t.mem) { t.strength = 'M'; t.iv = 3; } });
}

// Estimated minutes for recorded entries (the app does not time sessions; shown with ≈).
function entriesMinutes(entries) {
  return Math.round(entries.reduce((m, e) => {
    if (e.status === 2) return m;
    const f = e.status === 1 ? 0.5 : 1;
    if (e.kind === 'new') {
      const T = THUMUN[e.ids[0]];
      return m + f * MIN_NEW * Math.min(e.ids.length, (e.to - e.from + 1) / (T.end - T.start + 1));
    }
    return m + f * e.ids.length * (e.kind === 'recent' ? MIN_RECENT : MIN_REVIEW);
  }, 0));
}

// ---- import / export -----------------------------------------------------------------------

function exportPayload(st) {
  const { draft, preDaily, ...rest } = st;
  return JSON.stringify({ app: 'qurn-mm', format: SCHEMA_VERSION, appVersion: APP_VERSION, reference: REF_ID, exportedAt: new Date().toISOString(), state: rest }, null, 1);
}

// Returns { ok, state, sessions, mem } or { ok: false, reason: 'newer' | 'invalid' }
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, reason: 'invalid' }; }
  if (!data || data.app !== 'qurn-mm' || !data.state) return { ok: false, reason: 'invalid' };
  if (data.format > SCHEMA_VERSION) return { ok: false, reason: 'newer' };
  let st = { ...data.state };
  if (data.format === 1) st = migrateV1({ ...st, version: 1 });
  const state = hydrate({ ...st, version: SCHEMA_VERSION, draft: null, preDaily: null });
  return { ok: true, state, sessions: state.sessions.length, mem: memIds(state).length };
}
