# وِرْد

وِرْد هو رفيق عربي للحفظ والمراجعة وتثبيت المحفوظ، مصمم للعمل إلى جانب المصحف الورقي.

A working build of the Claude Design project *Mobile app design decisions*. It is a Qur'an
memorization companion for Warsh ʿan Nāfiʿ, used alongside a paper muṣḥaf. It covers
Onboarding, Today & recording, Memorized & progress, and Settings & system. Plain
HTML/CSS/JS with no build step. All data stays in the browser's `localStorage`. It works
offline and can be installed as an app.

## Running

From the repo root:

```bash
python -m http.server 4173
```

| URL | What |
| --- | --- |
| `http://localhost:4173/qurn-mm/` | The app |
| `http://localhost:4173/qurn-mm/preview.html` | Development preview: a seeded Today plan in a 412×915 phone, with **Reset preview** |

Add `?day=+N` to the app URL to move "today" forward by N days. Use it to test the
recent-review window, due dates and the return-after-absence state (3+ days).

## Files

| File | Holds |
| --- | --- |
| `js/reference.js` | Warsh reference data: surahs, Madani ayah counts (6,214), 480 thumun of the Muhammadi muṣḥaf |
| `js/format.js` | Numbers (Western digits, 0–9), counted nouns, range and page labels; `iso()` keeps numeric runs (`85–97`, `3/8`) intact in RTL |
| `js/model.js` | The review engine: state, migration, scheduling, the daily plan, onboarding and edits, stats, import/export |
| `js/viewmodel.js` | Read-only derivations for the UI: each thumun's strength and timing, counts, sessions, activity |
| `js/knowledge.js`, `js/screens/knowledge.js` | «عن القرآن»: structure, the 7 ahzab, six surah themes, two reasons of revelation, similar ayat and the heads-ups shown on Today, the record sheet and thumun cards |
| `js/screens/recite.js` | «التلاوة»: the recordings tab, a recording's player and self-check (memorization, tajwid checklist, notes, compare), the record sheets, and Progress → التلاوة |
| `js/audiocheck.js` | Self-tasmīʿ analysis (pure, tested): loudness → speech/pauses, word-aware ayah boundary suggestion, hesitations, pace, rating suggestion, recitation plans |
| `js/recordings.js` | Your own recitation recordings (IndexedDB, this device only; never in exports) and the recorder/player |
| `js/ui/icons.js`, `js/ui/components.js` | Phosphor icons (bundled, offline) and the shared components: cells, buttons, segmented controls, rows, chips, tips, empty states |
| `js/screens/*.js` | Today and the counter, Memorized and its detail screens, Progress, Settings and the report, Onboarding, sheets and the guided tour |
| `js/app.js` | Shell: state, routing, rendering, actions, the reminder, the Android bridge |
| `css/tokens.css` | Design tokens from the QURN-MM design system: fonts, colours (light, dark, high contrast), radii, motion |
| `css/components.css` | Every component and layout, built only on the tokens |
| `tests/engine.test.js` | Engine and view-model tests: `node qurn-mm/tests/engine.test.js` |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline cache (network first) and install metadata |
| `fonts/` | Basis Grotesque Arabic Pro (Arabic) and IBM Plex Sans Arabic (Latin and fallback) |
| `assets/branding/` | The approved وِرْد artwork (`svg/`), rasterised icons (`png/`), and staged Android launcher resources (`android/`) |
| `preview.html`, `preview-app.html`, `js/preview/` | Development preview only; never loaded by `index.html` |

## Brand

The وِرْد mark is custom artwork. It is never set in a font, redrawn, recoloured, stretched, or
given effects.

| Asset | Use |
| --- | --- |
| `svg/wird_mark.svg` (green #315D4B) | On off-white, white and light surfaces |
| `svg/wird_mark_inverse.svg` (off-white #EEEEE7) | On brand green and dark surfaces. The dark theme swaps to it automatically |
| `svg/wird_icon_dark.svg`, `svg/wird_icon_light.svg` | The two approved app-icon treatments |
| `svg/wird_icon_maskable.svg` | The dark icon without rounded corners, so the OS applies its own mask |
| `svg/wird_icon_monochrome.svg` | Themed and monochrome icons |

The four originals are byte-identical to the supplied files. The brand appears on the launcher
icon, the installed app's start-up screen (from the manifest), the first onboarding step,
About, and the teacher report. Working screens (Today, the map, progress, the navigation) carry
no logo.

PNGs are rendered from the SVGs with headless Edge. The kasra, the mark's farthest point from
the centre, sits at 0.326 of the icon size, inside the maskable safe zone of 0.40. So the
maskable icon needs no rescaling.

Former development codename: QURN-MM. It survives only in machine identifiers that must stay
stable: the `localStorage` keys `qurn-mm` and `qurn-mm-preview`, the export format id
`app: "qurn-mm"`, the offline cache name, the notification tag, and the `qurn-mm/` folder that
the installed app's address and offline scope depend on.

## Reference data

`js/reference.js` is generated from [Nur al-Hifz data](https://github.com/smartmaker-devs/nuralhifz-data)
at commit `263af0d` (`data/eighths.json`, `data/surahs.json`), licensed CC BY 4.0. The About
screen carries the attribution. All 60 hizb starts were cross-checked against the
KFGQPC-based `warsh_hizb.json` in [radouane-saddiki/Quran](https://github.com/radouane-saddiki/Quran)
and match exactly.

12 thumun begin part-way through an ayah. The app tracks whole ayat, so that ayah is shared:
it ends one thumun and starts the next, as the muṣḥaf marks it.

Saved data from version 1 (Kufan numbering) is migrated on load by surah and ayah. So are
v1 export files on import.

## «عن القرآن» content

From the user's research notes, which name their sources: المختصر في تفسير القرآن الكريم (themes),
لباب النقول للسيوطي (reasons of revelation), الضبط بالتقعيد لفواز الحنين and إعانة الحفاظ لمحمد طلحة
(similar ayat). Every ayah reference, wording and count was checked against the Warsh text of the
same Nur al-Hifz dataset (`quran_muhammadi.json`, `surahs.json` @ `263af0d`, CC BY 4.0), and
renumbered to the Madani count. Claims the text did not support were corrected or removed. Makki/
Madani comes from `surahs.json`. The page says it is an aid to review with a teacher, not tafsīr.

## Pages

Every range shows its page in the Muhammadi muṣḥaf (`ص 6–7`). The numbers are `page_mushafma` from
`data/quran_muhammadi.json` at the same commit, which the dataset says matches the printed Muhammadi
pagination: al-Fātiḥa on page 3, an-Nās on page 640. An ayah that runs across a page break counts on
the page where it begins. Check a few against a physical copy before release.

## How review works

- **By strength (default).** Intervals grow from the previous one. Strong doubles, up to 60
  days, or ×2.5 when recited to a teacher. Medium settles at 2–7 days. Weak returns the next
  day. A weak spot caps its thumun at 3 days. Intervals of 4+ days may shift by about 15% to
  the least-loaded nearby day, so reviews don't bunch up.
- **Fixed cycle.** Everything memorized comes round within N days, longest-unreviewed first.
  Up to 2 weak thumun are added on top.
- **First week.** Memorization marked during onboarding is staggered: one daily amount per
  day, flagged hizbs first.

## Memorization aids

- **Linking (الربط).** Under the new portion, Today shows up to three memorized ayat to recite with
  it: the ones just before it in the same surah, or failing that, the ones just after it.
- **Repetition counter.** The whole screen is one tap target, or Space/Enter on a keyboard. The
  target is 5–100, default 20, and the count resets each day.
- **Teacher report.** Settings → تقرير للمعلّم: 7, 30 or 90 days of new memorization, regularity,
  reviews by rating, errors by type, weak spots and confused ayat. اطبع أو احفظ PDF uses the
  browser's print dialog; the print stylesheet prints only the report.

## Icons

Icons are [Phosphor](https://phosphoricons.com) (MIT), regular weight, inlined as SVG path data in
`js/ui/icons.js` so the app needs no network. To add one, copy its `<path>` elements (256×256
viewBox) into the `ICONS` map and use `icon('name', size)`.

## Known limits

- **Web reminders fire only while the app is open,** because browsers have no reliable way
  to schedule a daily notification. A native Android build must schedule it with the OS.
- The hizb detail's overflow menu (⋮) is left out because the design doesn't define what it
  does.
