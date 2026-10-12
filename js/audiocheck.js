// Self-tasmīʿ analysis and recitation plans. Pure functions (no DOM, no audio APIs): the audio is
// decoded elsewhere into loudness frames; everything here is arithmetic and is unit-tested.
// All of it is approximate and the UI says so: a pause is not always a hesitation.
'use strict';

const FRAME_MS = 50;      // one loudness value per 50 ms
const GAP_MS = 300;       // a silence this long can separate two ayat
const PAUSE_MS = 1200;    // a silence this long inside an ayah is worth a look (possible hesitation)
const EDGE_MS = 350;      // a pause this close to an ayah boundary belongs to the boundary

// Root-mean-square loudness per frame from mono samples.
function rmsFrames(samples, sampleRate, frameMs = FRAME_MS) {
  const n = Math.max(1, Math.round(sampleRate * frameMs / 1000)), out = [];
  for (let i = 0; i < samples.length; i += n) {
    let s = 0; const end = Math.min(samples.length, i + n);
    for (let j = i; j < end; j++) s += samples[j] * samples[j];
    out.push(Math.sqrt(s / (end - i)));
  }
  return out;
}

// Downsample loudness to a fixed number of bars for the waveform (0..1).
function peaksOf(rms, bars = 160) {
  const max = Math.max(1e-6, ...rms), step = rms.length / bars, out = [];
  for (let b = 0; b < bars; b++) {
    const a = Math.floor(b * step), z = Math.max(a + 1, Math.floor((b + 1) * step));
    out.push(Math.round(Math.max(...rms.slice(a, z)) / max * 100) / 100);
  }
  return out;
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };

// Speech vs silence with a threshold between the noise floor and the voice level.
// Returns ms values: { durMs, speechMs, start, end, gaps: [{ at, len }], pauses, thr }.
function detect(rms, frameMs = FRAME_MS) {
  const durMs = rms.length * frameMs;
  if (!rms.length) return { durMs: 0, speechMs: 0, start: 0, end: 0, gaps: [], pauses: [], thr: 0 };
  const floor = pct(rms, 0.1), voice = pct(rms, 0.9), thr = floor + 0.25 * (voice - floor);
  const on = rms.map(v => v > thr && voice > floor * 1.5);
  // Close tiny holes (< 150 ms) inside speech, drop tiny blips (< 150 ms).
  const run = (val, minFrames) => { for (let i = 0; i < on.length;) { let j = i; while (j < on.length && on[j] === on[i]) j++; if (on[i] === val && j - i < minFrames && i > 0 && j < on.length) for (let k = i; k < j; k++) on[k] = !val; i = j; } };
  run(false, 3); run(true, 3);
  const first = on.indexOf(true), last = on.lastIndexOf(true);
  if (first < 0) return { durMs, speechMs: 0, start: 0, end: durMs, gaps: [], pauses: [], thr };
  // Each gap also records how much speech came before it (sp), to place it in the recitation.
  const gaps = [];
  let spoken = 0;
  for (let i = first; i <= last;) {
    if (on[i]) { spoken++; i++; continue; }
    let j = i; while (j <= last && !on[j]) j++;
    const len = (j - i) * frameMs;
    if (len >= GAP_MS) gaps.push({ at: i * frameMs + len / 2, len, sp: spoken * frameMs });
    i = j;
  }
  const speechMs = on.filter(Boolean).length * frameMs;
  return { durMs, speechMs, start: first * frameMs, end: (last + 1) * frameMs, gaps, pauses: gaps.filter(g => g.len >= PAUSE_MS), thr };
}

// Suggested ayah boundaries. With the words per ayah, each boundary is expected where that share
// of the words has been spoken; gaps are matched to those expectations in order (dynamic
// programming), preferring longer gaps a little. A long pause in mid-ayah is then not mistaken
// for an ayah end. Without word counts: the n−1 longest gaps. Fewer gaps → fewer boundaries.
function suggestBounds(gaps, nAyat, words, speechMs) {
  const need = Math.max(0, nAyat - 1);
  if (!need) return [];
  if (gaps.length <= need) return gaps.map(g => Math.round(g.at));
  if (!words || words.length !== nAyat || !speechMs || gaps.some(g => g.sp == null)) {
    return [...gaps].sort((a, b) => b.len - a.len).slice(0, need).map(g => Math.round(g.at)).sort((a, b) => a - b);
  }
  const total = words.reduce((a, b) => a + b, 0), exp = [];
  for (let k = 0, acc = 0; k < need; k++) { acc += words[k]; exp.push(acc / total * speechMs); }
  const m = gaps.length, cost = (k, g) => Math.abs(gaps[g].sp - exp[k]) / speechMs - 0.08 * Math.min(gaps[g].len, 2000) / 2000;
  // best[k][g]: least cost placing boundary k at gap g (gaps strictly increasing with k).
  const best = Array.from({ length: need }, () => Array(m).fill(Infinity)), from = Array.from({ length: need }, () => Array(m).fill(-1));
  for (let g = 0; g < m; g++) best[0][g] = cost(0, g);
  for (let k = 1; k < need; k++) {
    let run = Infinity, arg = -1;
    for (let g = k; g < m; g++) {
      if (best[k - 1][g - 1] < run) { run = best[k - 1][g - 1]; arg = g - 1; }
      best[k][g] = run + cost(k, g); from[k][g] = arg;
    }
  }
  let g = best[need - 1].indexOf(Math.min(...best[need - 1]));
  const pick = [];
  for (let k = need - 1; k >= 0; k--) { pick.push(g); g = from[k][g]; }
  return pick.reverse().map(i => Math.round(gaps[i].at));
}

// Ayah segments [from, to] in ms from boundary marks, inside the trimmed part of the take.
function segmentsOf(marks, durMs, trim) {
  const a = trim ? trim[0] : 0, z = trim ? trim[1] : durMs;
  const cuts = (marks || []).filter(m => m > a && m < z).sort((x, y) => x - y);
  const edges = [a, ...cuts, z];
  return edges.slice(0, -1).map((f, i) => ({ from: f, to: edges[i + 1] }));
}

// Long pauses that fall inside an ayah (not at its edges): possible hesitations, per segment.
function hesitations(pauses, segs) {
  return segs.map(sg => pauses.filter(p => p.at - p.len / 2 > sg.from + EDGE_MS && p.at + p.len / 2 < sg.to - EDGE_MS));
}

// Words per minute of actual speaking time.
const paceWpm = (words, speechMs) => speechMs > 0 ? Math.round(words / (speechMs / 60000)) : 0;

// Suggested rating from the number of mistakes found: 0 متقن, 1–2 متوسط, 3+ ضعيف.
const suggestRating = mistakes => mistakes === 0 ? 0 : mistakes <= 2 ? 1 : 2;

// ---- recitation plans ------------------------------------------------------------------------
// plan: { id, name, ids: [thumun ids], piece: 1|2, created, done }

// Pieces of `piece` consecutive thumun, never across a hizb boundary.
function planPieces(ids, piece) {
  const out = [];
  [...ids].sort((a, b) => a - b).forEach(id => {
    const last = out[out.length - 1];
    if (last && last.length < piece && last[last.length - 1] === id - 1 && THUMUN[id].hizb === THUMUN[last[0]].hizb) last.push(id);
    else out.push([id]);
  });
  return out;
}

// Where each piece stands from the recordings that cover it: none → recorded → checked → clean.
function planStatus(plan, recs) {
  const list = Object.entries(recs || {}).map(([id, r]) => ({ id: +id, ...r })).sort((a, b) => a.id - b.id);
  const pieces = planPieces(plan.ids, plan.piece).map(ids => {
    const from = THUMUN[ids[0]].start, to = THUMUN[ids[ids.length - 1]].end;
    const covering = list.filter(r => r.from <= from && r.to >= to);
    const checked = covering.filter(r => r.checked != null);
    const last = checked[checked.length - 1];
    const lastMistakes = last ? Object.entries(last.ayahs || {}).filter(([g, x]) => +g >= from && +g <= to && x.res && x.res !== 'ok' && x.status !== 'resolved').length : null;  // ؟ and open mistakes
    const state = !covering.length ? 'none' : !last ? 'recorded' : lastMistakes ? 'mistakes' : 'clean';
    return { ids, from, to, state, recs: covering.length, lastId: last ? last.id : covering.length ? covering[covering.length - 1].id : null, lastMistakes };
  });
  const count = k => pieces.filter(p => p.state === k).length;
  // Next: the first piece never checked, then the first whose last check had mistakes.
  const next = pieces.find(p => p.state === 'none' || p.state === 'recorded') || pieces.find(p => p.state === 'mistakes') || null;
  return { pieces, next, clean: count('clean'), mistakes: count('mistakes'), recorded: count('recorded'), none: count('none'), done: pieces.length > 0 && count('clean') === pieces.length };
}

// ---- blind first pass ---------------------------------------------------------------------------
// You listen once without the muṣḥaf and tap where you think you slipped; the tap comes a moment
// after the slip, so it is moved back before it is matched to an ayah segment.
const BLIND_LEAD_MS = 1200;
// segs: [{ from, to, g1 }] — the ayat you flagged by ear.
function blindAyat(marks, segs) {
  const out = new Set();
  (marks || []).forEach(ms => {
    const at = Math.max(0, ms - BLIND_LEAD_MS), sg = segs.find(s => at >= s.from && at < s.to) || segs[segs.length - 1];
    if (sg) out.add(sg.g1);
  });
  return [...out].sort((a, b) => a - b);
}
// Against the mistakes found with the muṣḥaf open: caught by ear, missed, and false alarms.
function blindCompare(flagged, mistakes) {
  const f = new Set(flagged), m = new Set(mistakes), caught = [...m].filter(g => f.has(g)).length;
  return { caught, missed: m.size - caught, extra: [...f].filter(g => !m.has(g)).length };
}
