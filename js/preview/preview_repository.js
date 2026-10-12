// DEVELOPMENT PREVIEW ONLY — never loaded by index.html.
//
// Substitutes the storage boundary for the live preview: the real loadState/saveState from
// model.js are replaced so the preview reads and writes its own localStorage key, and starts
// from a seeded Today plan instead of onboarding. Models, scheduling, the plan, recording and
// every screen are the unchanged production code.
'use strict';

const PREVIEW_STORE_KEY = 'qurn-mm-preview';

// Seeded plan, built from reference thumun ids:
//   new     hizb 1 · thumun 2            (next unmemorized in forward order)
//   recent  hizb 1 · thumun 1            review 4 of 7
//   review  hizb 1 · thumun 8            last reviewed 12 days ago
//   review  the thumun holding آل عمران 97, a repeated error there (weak spot)
//   hizb 60 memorized and strong, due over the next days — material for "سجّل مراجعة أخرى"
function previewSeed() {
  const st = defaultState();
  st.onboarded = true;
  st.settings.direction = 'fwd';
  const t = todayNum(st);
  const thumun = (h, k) => (h - 1) * 8 + (k - 1);

  st.th[thumun(1, 1)] = { mem: true, memDay: t - 3, strength: 'M', last: t - 1, due: t, reviews: 3, recentN: 3,
    hist: [[t - 3, 'M'], [t - 2, 'M'], [t - 1, 'M']] };
  st.th[thumun(1, 8)] = { mem: true, memDay: null, strength: 'S', last: t - 12, due: t - 10, reviews: 5, recentN: RECENT_REVIEWS,
    hist: [[t - 40, 'M'], [t - 30, 'S'], [t - 20, 'S'], [t - 12, 'S']] };
  const weakAyah = toG(3, 97), weakId = thumunOf(weakAyah).id;
  st.th[weakId] = { mem: true, memDay: null, strength: 'M', last: t - 4, due: t, reviews: 6, recentN: RECENT_REVIEWS,
    hist: [[t - 9, 'M'], [t - 4, 'M']] };
  st.errors.push({ day: t - 9, g: weakAyah, th: weakId, type: 'hesitate', confused: null },
    { day: t - 4, g: weakAyah, th: weakId, type: 'forget', confused: null });
  for (let k = 1; k <= 8; k++) {
    st.th[thumun(60, k)] = { mem: true, memDay: null, strength: 'S', last: t - 8 + k, due: t + k, reviews: 8, recentN: RECENT_REVIEWS,
      hist: [[t - 8 + k, 'S']] };
  }
  // Recent daily sessions, so Today opens in its ordinary state rather than "welcome back".
  [3, 2, 1].forEach(d => st.sessions.push({ day: t - d, kind: 'daily', entries: [] }));
  return st;
}

loadState = function () {
  try {
    const raw = localStorage.getItem(PREVIEW_STORE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      if (st && st.version === SCHEMA_VERSION) return hydrate(st); // same defaults as the real loadState
    }
  } catch (e) { /* fall through to the seed */ }
  const seeded = previewSeed();
  saveState(seeded);
  return seeded;
};

saveState = function (st) {
  try { localStorage.setItem(PREVIEW_STORE_KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable */ }
};
