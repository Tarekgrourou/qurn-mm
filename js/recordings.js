// Your own recitation recordings, kept on this device only (IndexedDB). They are not part of
// exports or backups: audio is large, and the backup file stays small and readable.
// Analysis results (waveform peaks, pauses) are cached next to each clip, also device-only.
// Two more stores: 'draft' holds the take being recorded, second by second, so a crash or a
// killed app loses at most the last second; 'vnotes' holds spoken notes on mistakes.
'use strict';

const Clips = {
  supported: !!(window.indexedDB && window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  meta: [],          // [{ id, ids, day, ms, size, type, peaks?, det? }], newest first; blobs load only to play
  vn: {},            // spoken notes: "recId:g" -> { ms, size }
  dbName: (typeof PREVIEW_STORE_KEY !== 'undefined' ? PREVIEW_STORE_KEY : STORE_KEY) + '-recordings',
  _db: null,

  open() {
    if (this._db) return this._db;
    this._db = new Promise((resolve, reject) => {
      const rq = indexedDB.open(this.dbName, 2);
      rq.onupgradeneeded = () => {
        const db = rq.result, has = n => db.objectStoreNames.contains(n);
        if (!has('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        ['blobs', 'draft', 'vnotes'].forEach(n => { if (!has(n)) db.createObjectStore(n); }); // existing clips are kept
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return this._db;
  },
  async tx(stores, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode), out = fn(t);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  },
  async init() {
    if (!window.indexedDB) return;
    try {
      const all = await this.tx(['meta'], 'readonly', t => t.objectStore('meta').getAll());
      this.meta = (all || []).map(c => c.ids ? c : { ...c, ids: [c.th] }).sort((a, b) => b.id - a.id); // 0.11 clips covered one thumun
    } catch (e) { this.meta = []; }
    try {
      const keys = await this.tx(['vnotes'], 'readonly', t => t.objectStore('vnotes').getAllKeys());
      const vals = await this.tx(['vnotes'], 'readonly', t => t.objectStore('vnotes').getAll());
      this.vn = {}; (keys || []).forEach((k, i) => { this.vn[k] = { ms: vals[i].ms, size: vals[i].size }; });
    } catch (e) { this.vn = {}; }
  },
  get(id) { return this.meta.find(c => c.id === id) || null; },
  has(id) { return this.meta.some(c => c.id === id); },
  forThumun(id) { return this.meta.filter(c => c.ids.includes(id)); },
  bytes() { return this.meta.reduce((s, c) => s + (c.size || 0), 0) + Object.values(this.vn).reduce((s, v) => s + (v.size || 0), 0); },
  async add(ids, day, ms, blob) {
    const c = { id: Date.now(), ids, day, ms, size: blob.size, type: blob.type };
    await this.tx(['meta', 'blobs'], 'readwrite', t => { t.objectStore('meta').put(c); t.objectStore('blobs').put(blob, c.id); });
    this.meta.unshift(c);
    return c;
  },
  async saveMeta(c) { await this.tx(['meta'], 'readwrite', t => { t.objectStore('meta').put(c); }); },
  // Removing a take removes the spoken notes made on it.
  async remove(id) {
    const notes = Object.keys(this.vn).filter(k => k.startsWith(id + ':'));
    await this.tx(['meta', 'blobs', 'vnotes'], 'readwrite', t => { t.objectStore('meta').delete(id); t.objectStore('blobs').delete(id); notes.forEach(k => t.objectStore('vnotes').delete(k)); });
    this.meta = this.meta.filter(c => c.id !== id);
    notes.forEach(k => { delete this.vn[k]; });
  },
  async removeAll() {
    await this.tx(['meta', 'blobs', 'vnotes'], 'readwrite', t => { t.objectStore('meta').clear(); t.objectStore('blobs').clear(); t.objectStore('vnotes').clear(); });
    this.meta = []; this.vn = {};
  },

  // Spoken notes on mistakes.
  vnHas(key) { return !!this.vn[key]; },
  async vnPut(key, blob, ms) { await this.tx(['vnotes'], 'readwrite', t => { t.objectStore('vnotes').put({ blob, ms, size: blob.size }, key); }); this.vn[key] = { ms, size: blob.size }; },
  async vnBlob(key) { const v = await this.tx(['vnotes'], 'readonly', t => t.objectStore('vnotes').get(key)); return v ? v.blob : null; },
  async vnRemove(key) { delete this.vn[key]; await this.tx(['vnotes'], 'readwrite', t => { t.objectStore('vnotes').delete(key); }).catch(() => {}); },

  // The take in progress: a header (what is being recited, marks, elapsed time) and its chunks.
  draftStart(head) { return this.tx(['draft'], 'readwrite', t => { const s = t.objectStore('draft'); s.clear(); s.put(head, 'head'); }).catch(() => {}); },
  draftPut(i, blob, head) { return this.tx(['draft'], 'readwrite', t => { const s = t.objectStore('draft'); if (blob) s.put(blob, i); s.put(head, 'head'); }).catch(() => {}); },
  draftClear() { return this.tx(['draft'], 'readwrite', t => { t.objectStore('draft').clear(); }).catch(() => {}); },
  // { head, blob } of a take that was never finished, or null.
  async draftLoad() {
    if (!window.indexedDB) return null;
    try {
      const head = await this.tx(['draft'], 'readonly', t => t.objectStore('draft').get('head'));
      const chunks = await this.tx(['draft'], 'readonly', t => t.objectStore('draft').getAll(IDBKeyRange.bound(0, Number.MAX_SAFE_INTEGER)));
      if (!head || !chunks || !chunks.length) return null;
      return { head, blob: new Blob(chunks, { type: head.type || 'audio/webm' }) };
    } catch (e) { return null; }
  },
  async blob(id) { return this.tx(['blobs'], 'readonly', t => t.objectStore('blobs').get(id)); },

  // Decode once at 8 kHz mono (light on memory), then loudness → waveform peaks and pauses.
  async analyze(id) {
    const c = this.get(id);
    if (!c) return null;
    if (c.det && c.peaks) return c;
    const b = await this.blob(id);
    if (!b) return null;
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const buf = await new Off(1, 1, 8000).decodeAudioData(await b.arrayBuffer());
    const rms = rmsFrames(buf.getChannelData(0), buf.sampleRate);
    c.peaks = peaksOf(rms);
    c.det = detect(rms);
    c.durMs = Math.round(buf.duration * 1000);
    await this.saveMeta(c).catch(() => {});
    return c;
  }
};

// The recorder: pause/resume, a live input level, and ayah marks and hesitation marks tapped while
// reciting. Times count only recorded audio, so marks line up with playback even after pauses.
// With a draft header, every second of audio is also written to storage as it arrives.
// onInterrupt(kind): 'mute' (a call or another app took the microphone), 'unmute', 'ended'.
const Mic = {
  rec: null, stream: null, chunks: [], acc: 0, segStart: 0, running: false, marks: [], hes: [], ctx: null, an: null, buf: null,
  draft: null, n: 0, onInterrupt: null,
  async start(draft) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    this.chunks = []; this.marks = []; this.hes = []; this.acc = 0; this.n = 0;
    this.draft = draft ? { ...draft, type: this.rec.mimeType || type || 'audio/webm' } : null;
    if (this.draft) Clips.draftStart(this.head());
    this.rec.ondataavailable = e => { if (!e.data.size) return; this.chunks.push(e.data); if (this.draft) Clips.draftPut(this.n++, e.data, this.head()); };
    const track = this.stream.getAudioTracks()[0], tell = kind => { if (this.onInterrupt && this.rec) this.onInterrupt(kind); };
    // A brief mute while the microphone starts or switches is not an interruption: wait and look again.
    if (track) { track.onmute = () => setTimeout(() => { if (track.muted && track.readyState === 'live') tell('mute'); }, 700); track.onunmute = () => tell('unmute'); track.onended = () => tell('ended'); }
    this.rec.start(1000);
    this.segStart = Date.now(); this.running = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC(); this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024;
      this.ctx.createMediaStreamSource(this.stream).connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
    } catch (e) { this.an = null; }
  },
  head() { return { ...this.draft, ms: this.elapsed(), marks: [...this.marks], hes: [...this.hes] }; },
  keep() { if (this.draft) Clips.draftPut(null, null, this.head()); },
  elapsed() { return this.acc + (this.running ? Date.now() - this.segStart : 0); },
  live() { return !!this.rec && this.rec.state !== 'inactive'; },
  pause() { if (this.live() && this.running) { this.rec.pause(); this.acc += Date.now() - this.segStart; this.running = false; this.keep(); } },
  resume() { if (this.live() && !this.running) { this.rec.resume(); this.segStart = Date.now(); this.running = true; } },
  mark() { if (this.rec && this.running) { this.marks.push(this.elapsed()); this.keep(); } return this.marks.length; },
  unmark() { this.marks.pop(); this.keep(); return this.marks.length; },
  // «تردّدت هنا»: your own signal while reciting.
  hesMark() { if (this.rec && this.running) { this.hes.push(this.elapsed()); this.keep(); } return this.hes.length; },
  // 0..1 input level for the meter.
  level() {
    if (!this.an || !this.running) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0; for (const v of this.buf) s += v * v;
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  },
  stop() {
    return new Promise(resolve => {
      if (!this.rec) return resolve(null);
      const ms = this.elapsed(), marks = [...this.marks], hes = [...this.hes];
      const done = () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
        this.release();
        resolve({ blob, ms, marks, hes });
      };
      if (this.rec.state === 'inactive') return done(); // the microphone was taken away: keep what was recorded
      this.rec.onstop = done;
      if (this.rec.state === 'paused') this.rec.resume();
      this.rec.stop();
    });
  },
  release() {
    if (this.stream) this.stream.getTracks().forEach(t => { t.onmute = t.onunmute = t.onended = null; t.stop(); });
    if (this.ctx) this.ctx.close().catch(() => {});
    this.stream = null; this.rec = null; this.chunks = []; this.ctx = null; this.an = null; this.running = false; this.draft = null;
  }
};

// One player for the whole app: play/pause, seek, ±5 s, speed, one-ayah segments, A–B loop.
// The time, the seek bar and the waveform playhead update in place; playback never re-renders.
const Player = {
  audio: null, id: null, url: null, rate: 1, stopAt: null, loop: null, raf: 0, onSegmentEnd: null,
  async load(id, blob) {
    if (this.id === id && this.audio) return;
    this.stop();
    const b = blob || await Clips.blob(id);
    if (!b) throw new Error('missing');
    this.url = URL.createObjectURL(b);
    const a = this.audio = new Audio(this.url);
    this.id = id;
    a.playbackRate = this.rate;
    a.onended = () => { this.halt(); render(); };
    await new Promise(res => { a.onloadedmetadata = res; a.onerror = res; });
    // Recorder output often has no duration until the end is probed; seeking needs it.
    if (!isFinite(a.duration)) {
      await new Promise(res => { a.ondurationchange = () => { if (isFinite(a.duration)) res(); }; a.currentTime = 1e101; setTimeout(res, 1500); });
      a.ondurationchange = null; a.currentTime = 0;
    }
  },
  // Play the clip, optionally only [from, to] ms (one ayah), then stop there.
  async play(id, blob, from, to) {
    await this.load(id, blob);
    const a = this.audio;
    if (from != null) a.currentTime = from / 1000;
    this.stopAt = to != null ? to : null;
    a.playbackRate = this.rate;
    await a.play();
    this.tick();
  },
  tick() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      const a = this.audio;
      if (!a || a.paused) return;
      const ms = a.currentTime * 1000;
      if (this.loop && ms >= this.loop[1]) a.currentTime = this.loop[0] / 1000;
      else if (this.stopAt != null && ms >= this.stopAt) { a.pause(); this.stopAt = null; this.paint(); const f = this.onSegmentEnd; this.onSegmentEnd = null; if (f) f(); else render(); return; }
      this.paint();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },
  playing(id) { return this.id === id && this.audio && !this.audio.paused; },
  pause() { if (this.audio) this.audio.pause(); cancelAnimationFrame(this.raf); },
  halt() { this.pause(); this.stopAt = null; },
  toggle(id, blob) { return this.playing(id) ? Promise.resolve(this.pause()) : this.play(id, blob); },
  durMs() { const a = this.audio; return a && isFinite(a.duration) ? a.duration * 1000 : 0; },
  posMs() { return this.audio ? this.audio.currentTime * 1000 : 0; },
  seekMs(ms) { const a = this.audio; if (a) { a.currentTime = Math.max(0, ms / 1000); this.paint(); } },
  seek(frac) { if (this.durMs()) this.seekMs(frac * this.durMs()); },
  skip(sec) { const a = this.audio; if (a) { a.currentTime = Math.max(0, Math.min((this.durMs() / 1000 || 0) - 0.1, a.currentTime + sec)); this.paint(); } },
  setRate(r) { this.rate = r; if (this.audio) this.audio.playbackRate = r; },
  // Updates [data-player="<id>"] .pos, the seek bar and the waveform playhead without a render.
  paint() {
    const a = this.audio; if (!a) return;
    const dur = this.durMs(), ms = a.currentTime * 1000;
    document.querySelectorAll(`[data-player="${this.id}"]`).forEach(el => {
      const pos = el.querySelector('.pos'), bar = el.querySelector('input[type=range]'), head = el.querySelector('.wave .head');
      if (pos) pos.textContent = clipTime(ms);
      if (bar && dur && document.activeElement !== bar) bar.value = Math.round(ms / dur * 1000);
      if (head && dur) head.style.insetInlineStart = (ms / dur * 100).toFixed(2) + '%';
    });
  },
  stop() {
    this.halt();
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null; this.url = null; this.id = null; this.loop = null; this.onSegmentEnd = null;
  }
};

const clipTime = ms => { const s = Math.round(ms / 1000); return iso(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')); };
const secText = ms => iso((Math.round(ms / 100) / 10).toFixed(1) + ' ث');
const sizeText = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' ك.ب' : (b / 1048576).toFixed(1) + ' م.ب';
