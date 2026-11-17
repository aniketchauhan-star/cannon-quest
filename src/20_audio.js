
// =====================================================================
//  AUDIO — real recorded CC0 foley (embedded), teen-style music tracks,
//  waterside ambience, voice-over + captions. Synth = fallback only.
// =====================================================================
const Sound = {
  ctx: null, master: null, sfx: null, verb: null, noiseBuf: null, muted: false, buf: {}, ambientOn: false, ambient: null,
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.95; this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(comp);
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < ctx.sampleRate * 0.012 ? 0 : 1); }
    this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(comp);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    if (typeof SFX_DATA !== 'undefined') for (const [k, b64] of Object.entries(SFX_DATA)) {
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        ctx.decodeAudioData(u.buffer).then((b) => { this.buf[k] = b; if (k === 'water' && this.ambientOn) this.startAmbient(); }).catch(() => {});
      } catch (e) { /* keep synth fallback */ }
    }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.95, this.ctx.currentTime, 0.05);
    Music.setMuted(m);
    if (m) VO.stop();
  },
  play(key, { vol = 1, rate = 1, t = 0, verb = 0.08, pan = null, vary = 0.04 } = {}) {
    const b = this.buf[key];
    if (!this.ctx || !b) return false;
    const c = this.ctx, t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = b;
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = c.createGain(); g.gain.value = vol * (1 + (Math.random() * 2 - 1) * vary * 1.5);
    let node = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan ?? (Math.random() * 2 - 1) * 0.15; g.connect(p); node = p; }
    s.connect(g); node.connect(this.sfx);
    if (verb) { const v = c.createGain(); v.gain.value = verb; node.connect(v); v.connect(this.verb); }
    s.start(t0);
    return true;
  },
  tone({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.2, vol = 0.25, attack = 0.005 }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.sfx); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise({ t = 0, dur = 0.3, vol = 0.2, type = 'lowpass', f = 1200, f2 = null, q = 1, attack = 0.004 }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  },
  // ---- game sound effects (recorded samples, gently varied) ----
  pop(p = 1) { if (!this.play('plop', { vol: 0.55, rate: 1.05 * p })) this.tone({ f: 520 * p, f2: 1180 * p, dur: 0.11, vol: 0.2 }); this.play('pluck', { vol: 0.25, rate: p }); },
  whoosh(d = 0.35) { if (!this.play(d < 0.5 ? 'air' : 'airmid', { vol: d < 0.5 ? 0.45 : 0.4, rate: d < 0.5 ? 1.15 : 1 })) this.noise({ dur: d, vol: 0.1, type: 'bandpass', f: 380, f2: 2400, q: 1.2, attack: d * 0.5 }); },
  clunk() { if (!this.play('latch', { vol: 0.7, verb: 0.12 })) this.tone({ type: 'triangle', f: 210, f2: 85, dur: 0.16, vol: 0.35 }); this.play('woodhit', { vol: 0.35, rate: 1.3, t: 0.004 }); },
  unload() { if (!this.play('pluck', { vol: 0.4, rate: 0.82 })) this.tone({ f: 980, f2: 460, dur: 0.14, vol: 0.16 }); this.play('air', { vol: 0.3, rate: 1.35 }); },
  settle() { this.play('woodhit2', { vol: 0.32, rate: 1.45, vary: 0.08 }); },
  nope() { if (!this.play('wooden', { vol: 0.5, rate: 0.7 })) this.tone({ type: 'square', f: 170, dur: 0.12, vol: 0.05 }); },
  ready() { if (!this.play('bell', { vol: 0.5, verb: 0.25 })) this.tone({ type: 'triangle', f: 1175, dur: 0.3, vol: 0.12 }); },
  press() { this.play('toggle', { vol: 0.75, vary: 0.02 }); },
  tick() { if (!this.play('tick', { vol: 0.45 })) this.tone({ f: 1500, dur: 0.05, vol: 0.05 }); },
  click() { this.play('click', { vol: 0.6 }); },
  boom() {
    const ok = this.play('boom', { vol: 1, rate: 0.82, verb: 0.35, vary: 0.03, pan: 0 });
    this.play('shot', { vol: 0.5, rate: 0.62, verb: 0.2, pan: 0 });
    this.play('thunder', { vol: 0.42, rate: 1.1, t: 0.03, verb: 0.25, pan: 0 });
    this.tone({ f: 78, f2: 34, dur: 0.6, vol: ok ? 0.5 : 0.7, attack: 0.003 });
    if (!ok) this.noise({ dur: 0.75, vol: 0.7, type: 'lowpass', f: 2400, f2: 90, attack: 0.002 });
  },
  whistle() { if (!this.play('airmid', { vol: 0.5, rate: 1.3 })) this.tone({ f: 520, f2: 1500, dur: 0.6, vol: 0.05, attack: 0.08 }); },
  ding(i = 0) { const r = [1, 1.26, 1.5, 2][i % 4]; if (!this.play(i % 2 ? 'glass2' : 'glass1', { vol: 0.55, rate: r, verb: 0.3, vary: 0.01 })) this.tone({ f: 1318 * r, dur: 0.6, vol: 0.12 }); },
  sparkle() { [1.5, 1.68, 2, 2.24, 2.52].forEach((r, i) => { if (!this.play('glass2', { vol: 0.28, rate: r, t: i * 0.05, verb: 0.4, vary: 0.005 })) this.tone({ type: 'triangle', f: 1568 * r / 1.5, t: i * 0.045, dur: 0.22, vol: 0.05 }); }); },
  unlock() { if (!this.play('key', { vol: 0.85, verb: 0.15, pan: 0 })) this.noise({ dur: 0.05, vol: 0.2, type: 'highpass', f: 2500 }); },
  creak() { this.play('creak', { vol: 0.55, rate: 1.15, verb: 0.2 }); },
  spring() { this.play('spring', { vol: 0.5, rate: 1.1, verb: 0.15 }); },
  fanfare() {
    if (!this.play('bellbig', { vol: 0.55, verb: 0.35, pan: 0 })) this.tone({ type: 'triangle', f: 1046, dur: 1, vol: 0.1 });
    [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => this.play('glass1', { vol: 0.42, rate: r, t: 0.05 + i * 0.085, verb: 0.35, vary: 0.004 }));
    this.play('plop', { vol: 0.55, rate: 0.75, pan: 0 });
    this.play('bell', { vol: 0.35, rate: 1.5, t: 0.5, verb: 0.4 });
  },
  rattle() {
    this.play('pot', { vol: 0.5, rate: 1.1, verb: 0.15 });
    for (let i = 0; i < 9; i++) this.play(i % 2 ? 'metal2' : 'metal3', { vol: 0.42 - i * 0.025, rate: rr(0.92, 1.18), t: 0.08 + i * 0.105, pan: i % 2 ? 0.2 : -0.2, vary: 0.06 });
    this.play('tools', { vol: 0.35, t: 0.3 });
  },
  wobble() { if (!this.play('springlow', { vol: 0.42, rate: 0.78, verb: 0.2 })) this.tone({ f: 330, f2: 247, dur: 0.55, vol: 0.05, attack: 0.04 }); },
  swoosh() { if (!this.play('airlong', { vol: 0.32, rate: 1.15 })) this.noise({ dur: 1.2, vol: 0.08, type: 'bandpass', f: 300, f2: 1600, q: 0.8, attack: 0.5 }); },
  land() { this.play('woodhit2', { vol: 0.38, rate: 0.72 }); if (!this.play('cloth', { vol: 0.5 })) this.tone({ type: 'triangle', f: 160, f2: 80, dur: 0.18, vol: 0.2 }); },
  cheer() { [1, 1.26, 1.5, 2].forEach((r, i) => this.play('glass2', { vol: 0.3, rate: r, t: i * 0.07, verb: 0.35 })); },
  startAmbient() { // gentle lake-side water bed
    this.ambientOn = true;
    const b = this.buf.water;
    if (!this.ctx || !b || this.ambient) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = 0.06; s.loopEnd = b.duration - 0.06;
    const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.08, this.ctx.currentTime, 2);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start();
    this.ambient = s;
  },
};

// ---------- background music: teen-style chill electronic track ----------
const TRACKS = { chill: 'assets/music/chillwave.mp3' };
const Music = {
  el: null, choice: 'chill', level: 0.36, target: 0, on: false, paused: false,
  start() { this.on = true; this.setTrack(this.choice); },
  setTrack(name) {
    this.choice = name;
    if (this.el) { this.el.pause(); this.el = null; }
    if (name === 'off' || !this.on) return;
    const a = new Audio(TRACKS[name] || TRACKS.chill);
    a.loop = true; a.preload = 'auto'; a.volume = 0; a.muted = Sound.muted;
    this.el = a; this.target = this.level;
    if (!this.paused) { const p = a.play(); if (p && p.catch) p.catch(() => { const retry = () => { if (this.el === a && !this.paused) a.play().catch(() => {}); removeEventListener('pointerdown', retry); }; addEventListener('pointerdown', retry); }); }
  },
  duck(on) { this.target = on ? this.level * 0.4 : this.level; },
  setMuted(m) { if (this.el) this.el.muted = m; },
  pause() { this.paused = true; if (this.el) this.el.pause(); },
  resume() { this.paused = false; if (this.el) this.el.play().catch(() => {}); },
  update(dt) { if (this.el) { const v = this.el.volume; this.el.volume = clamp(v + clamp(this.target - v, -dt * 0.4, dt * 0.4), 0, 1); } },
};

// ---------- voice-over + captions (drop recordings in assets/vo/<id>.mp3) ----------
const VO = {
  voice: null, token: 0, missing: new Set(), cur: null,
  pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices(); if (!vs.length) return;
    const prefs = ['Microsoft Aria Online', 'Microsoft Jenny Online', 'Microsoft Ana Online', 'Google US English', 'Samantha', 'Google UK English Female', 'Karen', 'Moira', 'Tessa'];
    for (const p of prefs) { const v = vs.find((x) => x.name.includes(p)); if (v) { this.voice = v; return; } }
    this.voice = vs.find((v) => /^en[-_]/i.test(v.lang)) || null;
  },
  speakTTS(text, finish) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (!this.voice) this.pickVoice();
      if (this.voice) u.voice = this.voice;
      u.rate = 0.98; u.pitch = 1.05; u.onend = finish; u.onerror = finish;
      speechSynthesis.speak(u);
    } catch (e) { /* captions still show */ }
  },
  async say(text, hold = 0.5, id = null) {
    const my = ++this.token, cap = $('#cap');
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; } // never let two lines overlap
    cap.querySelector('.txt').textContent = text;
    cap.classList.add('on');
    Music.duck(true);
    const est = 0.9 + text.length * 0.058;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      if (Sound.muted) { wait(est).then(finish); return; }
      wait(est + 2.5).then(finish);
      if (id && typeof VO_FILES !== 'undefined' && VO_FILES.includes(id) && !this.missing.has(id)) {
        const a = new Audio(`assets/vo/${id}.mp3`); this.cur = a;
        const fail = () => { this.missing.add(id); if (this.cur === a && !done) this.speakTTS(text, finish); };
        a.addEventListener('ended', finish, { once: true }); a.addEventListener('error', fail, { once: true });
        const p = a.play(); if (p && p.catch) p.catch((err) => { if (!err || err.name !== 'AbortError') fail(); }); // AbortError = we stopped it on purpose
      } else this.speakTTS(text, finish);
    });
    await wait(hold);
    if (my === this.token) { cap.classList.remove('on'); Music.duck(false); }
  },
  stop() {
    this.token++;
    $('#cap').classList.remove('on');
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    Music.duck(false);
  },
  pause() { if (window.speechSynthesis) speechSynthesis.pause(); if (this.cur) this.cur.pause(); },
  resume() { if (window.speechSynthesis) speechSynthesis.resume(); if (this.cur) this.cur.play().catch(() => {}); },
};
if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = () => VO.pickVoice(); VO.pickVoice(); }
