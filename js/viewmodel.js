// View-model: read-only projections of the engine state (model.js) for the screens.
// Nothing here schedules, rates or stores; it only describes what the engine already decided.
'use strict';

// Thumun of every ayah (the earlier one where a thumun starts mid-ayah).
const AYAH_TH = (() => {
  const a = new Uint16Array(TOTAL_AYAT);
  for (let i = THUMUN.length - 1; i >= 0; i--) a.fill(i, THUMUN[i].start, THUMUN[i].end + 1);
  return a;
})();
const surahStart = s => SURAH_OFFSET[s - 1];
const surahEnd = s => SURAH_OFFSET[s] - 1;
const juzThumun = j => Array.from({ length: 16 }, (_, k) => (j - 1) * 16 + k);
const hizbThumun = h => Array.from({ length: 8 }, (_, k) => (h - 1) * 8 + k);

const STATE_AR = { strong: 'قوي', medium: 'متوسط', weak: 'ضعيف', unknown: 'لم يُقيَّم', due: 'يحتاج مراجعة', recent: 'قريب', learning: 'قيد الحفظ', none: 'غير محفوظ' };
const STRENGTH_KEY = { S: 'strong', M: 'medium', W: 'weak', U: 'unknown' };

const VM = {
  // Two channels per thumun (design system §19): s = strength fill, t = review timing marker.
  // s: 'S' | 'M' | 'W' | 'U' (memorized, not yet rated) | 'L' (being memorized) | '0' (not memorized)
  // t: 'recent' | 'due' | null
  cell(st, id, today, newIds) {
    const t = st.th[id];
    if (!t || !t.mem) return { s: (st.partial[id] || (newIds && newIds.includes(id))) ? 'L' : '0', t: null };
    const recent = t.memDay === today || isRecent(t, today);
    return { s: t.strength || 'U', t: recent ? 'recent' : (t.due <= today ? 'due' : null) };
  },

  // All 480 thumun for this render, with counts per state.
  snapshot(st, today, p) {
    const newIds = p && p.newItem ? p.newItem.ids : [];
    const cells = THUMUN.map(T => VM.cell(st, T.id, today, newIds));
    const c = { strong: 0, medium: 0, weak: 0, unknown: 0, due: 0, recent: 0, learning: 0, none: 0, mem: 0 };
    cells.forEach(x => {
      if (x.s === '0') c.none++;
      else if (x.s === 'L') c.learning++;
      else { c.mem++; c[STRENGTH_KEY[x.s]]++; if (x.t) c[x.t]++; }
    });
    let fullHizb = 0;
    for (let h = 1; h <= 60; h++) if (hizbThumun(h).every(i => cells[i].s !== '0' && cells[i].s !== 'L')) fullHizb++;
    let fullJuz = 0;
    for (let j = 1; j <= 30; j++) if (juzThumun(j).every(i => cells[i].s !== '0' && cells[i].s !== 'L')) fullJuz++;
    return { cells, counts: c, fullHizb, fullJuz };
  },

  isMem: x => x.s !== '0' && x.s !== 'L',
  // Does a cell match a filter chip (strong, medium, weak, due, recent, none, all)?
  matches(x, f) {
    if (f === 'all') return true;
    if (f === 'none') return x.s === '0' || x.s === 'L';
    if (f === 'due' || f === 'recent') return x.t === f;
    return VM.isMem(x) && STRENGTH_KEY[x.s] === f;
  },
  // One label for a cell where only one fits (chips in lists): timing first, then strength.
  key(x) {
    if (x.s === '0') return 'none';
    if (x.s === 'L') return 'learning';
    return x.t || STRENGTH_KEY[x.s];
  },
  summary(cells) {
    const c = {};
    cells.forEach(x => { if (VM.isMem(x)) { const k = STRENGTH_KEY[x.s]; c[k] = (c[k] || 0) + 1; if (x.t) c[x.t] = (c[x.t] || 0) + 1; } });
    const parts = ['strong', 'medium', 'weak', 'unknown', 'due', 'recent'].filter(k => c[k]).map(k => c[k] + ' ' + STATE_AR[k]);
    return parts.length ? parts.join(' · ') : (cells.some(x => x.s === 'L') ? 'قيد الحفظ' : 'غير محفوظ');
  },
  // Distribution for stacked bars: strength of memorized, plus learning and empty.
  dist(cells) {
    const c = { strong: 0, medium: 0, weak: 0, unknown: 0, learning: 0, none: 0 };
    cells.forEach(x => { if (x.s === '0') c.none++; else if (x.s === 'L') c.learning++; else c[STRENGTH_KEY[x.s]]++; });
    return c;
  },

  // Per-ayah projection for a surah strip: each ayah shows its thumun's state; within the thumun
  // being memorized, the memorized prefix counts as memorized and the rest as learning.
  ayahCell(st, g, snap) {
    const id = AYAH_TH[g], x = snap.cells[id];
    if (x.s === 'L' || x.s === '0') {
      const p = st.partial[id] || 0;
      if (p && g < THUMUN[id].start + p) return { s: 'U', t: 'recent' };
      return x;
    }
    return x;
  },
  surahs(st, snap) {
    return SURAH_NAMES.map((name, k) => {
      const s = k + 1, a = surahStart(s), b = surahEnd(s), n = b - a + 1;
      let mem = 0, learning = 0;
      const c = {};
      for (let g = a; g <= b; g++) {
        const x = VM.ayahCell(st, g, snap);
        if (VM.isMem(x)) { mem++; const kk = STRENGTH_KEY[x.s]; c[kk] = (c[kk] || 0) + 1; if (x.t) c[x.t] = (c[x.t] || 0) + 1; }
        else if (x.s === 'L') learning++;
      }
      return { s, name, n, mem, learning, c, pct: Math.round(mem / n * 100), a, b };
    });
  },

  // Recorded sessions, newest first, for history and progress.
  sessions(st) {
    return st.sessions.map((s, i) => ({ ...s, i })).sort((x, y) => y.day - x.day || y.i - x.i).map(s => ({
      ...s, min: entriesMinutes(s.entries),
      errs: (s.entries || []).flatMap(e => Array.isArray(e.errors) ? e.errors : [])
    }));
  },
  // Minutes per day for the last 30 days (both the daily wird and extra reviews).
  activity(st, today) {
    const by = {};
    st.sessions.forEach(s => { by[s.day] = (by[s.day] || 0) + entriesMinutes(s.entries); });
    return Array.from({ length: 30 }, (_, i) => { const day = today - 29 + i; return { day, min: by[day] || 0, has: by[day] != null }; });
  },

  // Weak spots with the details the list shows.
  weakList(st, today) {
    const TYPE = { forget: 'نسيان', hesitate: 'تردّد', confuse: 'اشتباه' };
    return weakSpots(st, today).map(w => {
      const errs = st.errors.filter(e => e.g === w.g && today - e.day < 30).sort((a, b) => b.day - a.day);
      const last = errs[0] || {};
      return { ...w, n: errs.length, lastDays: today - (last.day ?? today), type: TYPE[last.type] || 'دون تحديد', with: errs.find(e => e.confused != null)?.confused ?? null };
    });
  }
};

// Arabic relative day ("اليوم", "أمس", "قبل 3 أيام").
const agoText = d => d <= 0 ? 'اليوم' : d === 1 ? 'أمس' : d === 2 ? 'قبل يومين' : 'قبل ' + daysWord(d);
const inDaysText = d => d <= 0 ? 'اليوم' : d === 1 ? 'غداً' : 'بعد ' + daysWord(d);
const surahWord = n => counted(n, 'سورة واحدة', 'سورتين', 'سور', 'سورة');
const ayatWord = n => counted(n, 'آية واحدة', 'آيتان', 'آيات', 'آية');
const errWord = n => counted(n, 'خطأ واحد', 'خطآن', 'أخطاء', 'خطأً');
const placeWord = n => counted(n, 'موضع واحد', 'موضعان', 'مواضع', 'موضعاً');
const hizbFullWord = n => n === 0 ? 'لا أحزاب كاملة بعد' : counted(n, 'حزب واحد كامل', 'حزبان كاملان', 'أحزاب كاملة', 'حزباً كاملاً');
// "الحزب 31 · الثُّمنان 1–2" for a range inside one hizb.
function thumunMetaDual(ids) {
  const ts = ids.map(id => THUMUN[id]);
  return ts.length > 1 ? `الحزب ${ts[0].hizb} · الثُّمنان ${iso(ts[0].k + '–' + ts[ts.length - 1].k)}` : `الحزب ${ts[0].hizb} · الثُّمن ${ts[0].k}`;
}
