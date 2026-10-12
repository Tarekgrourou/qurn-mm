// Numbers, counted nouns, ayah, range and page labels.
'use strict';

// Every displayed number goes through ar(). Numbers are shown in Western digits (0–9).
const ar = n => String(n);
// Isolate a numeric run (ranges, fractions, times) so RTL text cannot reorder or wrap it: 85–97 stays 85–97.
const iso = s => '⁦' + String(s).replace(/ /g, ' ').replace(/[–/]/g, m => '⁠' + m + '⁠') + '⁩';

// Counted noun: 1 → one, 2 → two, 3–10 → few (plural), 11+ → many (accusative singular).
function counted(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return ar(n) + ' ' + few;
  return ar(n) + ' ' + many;
}
const thumunWord = n => counted(n, 'ثُمن واحد', 'ثُمنان', 'أثمان', 'ثُمناً');
const hizbWord = n => counted(n, 'حزب واحد', 'حزبان', 'أحزاب', 'حزباً');
const daysWord = n => counted(n, 'يوم', 'يومين', 'أيام', 'يوماً');
const segWord = n => counted(n, 'مقطع واحد', 'مقطعان', 'مقاطع', 'مقطعاً');
const monthsWord = n => counted(n, 'شهر', 'شهرين', 'أشهر', 'شهراً');
const yearsWord = n => counted(n, 'سنة', 'سنتين', 'سنوات', 'سنة');
const recWord = n => counted(n, 'تسجيل واحد', 'تسجيلان', 'تسجيلات', 'تسجيلاً');
const minutesWord = n => counted(n, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة');

function durationText(min) {
  min = Math.max(1, Math.round(min));
  if (min < 60) return minutesWord(min);
  const h = Math.floor(min / 60), m = min % 60;
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : ar(h) + ' ساعات';
  return m ? hs + ' و' + minutesWord(m) : hs;
}

const ayahName = g => { const { s, a } = fromG(g); return SURAH_NAMES[s - 1] + ' ' + ar(a); };

// "من البقرة 263 إلى البقرة 267" with light connectors.
const rangeHTML = (from, to) =>
  `<span class="rl">من </span>${ayahName(from)}<span class="rl"> إلى </span>${ayahName(to)}`;
const rangeText = (from, to) => 'من ' + ayahName(from) + ' إلى ' + ayahName(to);

// Compact thumun range: "البقرة 75–82" within one surah, full form otherwise.
function shortRange(from, to) {
  const a = fromG(from), b = fromG(to);
  if (from === to) return ayahName(from);
  return a.s === b.s ? SURAH_NAMES[a.s - 1] + ' ' + iso(ar(a.a) + '–' + ar(b.a)) : rangeText(from, to);
}

// Muṣḥaf pages for a range: "ص 12" or "ص 12–13".
function pagesText(from, to) {
  const a = pageOf(from), b = pageOf(to);
  return 'ص ' + (a === b ? ar(a) : iso(ar(a) + '–' + ar(b)));
}

// "الحزب 5 · الثُّمن 1–2"
function thumunMeta(ids) {
  const ts = ids.map(id => THUMUN[id]);
  const h = ts[0].hizb, ks = ts.map(t => t.k);
  const k = ks.length > 1 ? iso(ar(ks[0]) + '–' + ar(ks[ks.length - 1])) : ar(ks[0]);
  return 'الحزب ' + ar(h) + ' · الثُّمن ' + k;
}

function timeText(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'صباحاً' : h < 18 ? 'ظهراً' : 'مساءً';
  return ar(h % 12 || 12) + ':' + ar(String(m).padStart(2, '0')) + ' ' + suffix;
}

const dateText = (dayNum, opts) =>
  new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: 'UTC', ...(opts || { weekday: 'long', day: 'numeric', month: 'long' }) })
    .format(dayDate(dayNum)).replace('،', '');

const amountLabel = a => a === 0.5 ? 'نصف ثُمن' : a === 2 ? 'ثُمنان' : 'ثُمن';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
