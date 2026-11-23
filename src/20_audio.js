
// =====================================================================
//  AUDIO — real recorded CC0 foley (js/sfx.js), teen-style music tracks,
//  waterside ambience, voice-over (a real person's recordings) + captions.
//  Synth = fallback only, for an effect not decoded yet.
// =====================================================================
// a test robot (Playwright, headless Chrome: navigator.webdriver) never makes a sound: no music, no effects, no voice
const SILENT = !!navigator.webdriver;
const Sound = {
  ctx: null, master: null, sfx: null, verb: null, noiseBuf: null, muted: SILENT, buf: {}, dec: {}, ambientOn: false, ambient: null,
  // made at boot, so the start screen can be heard. A browser keeps a page silent until its first tap or key (its
  // autoplay rule; an app's web view or a returning visitor may be let through at once), so the sound may start
  // "suspended": listen() wakes it on that first touch, wherever it lands
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.95; this.master.connect(ctx.destination);
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
    this.loadSfx();
  },
  // the recorded effects (SFX_DATA): the start screen's few come with the page (js/sfx_title.js), the rest once it is
  // up (js/sfx.js, fetched by boot). Each is decoded once, as soon as the sound is made and its data is here,
  // whichever comes last (each file calls this as it arrives). Until then a game effect falls back to the synth.
  loadSfx() {
    if (!this.ctx || typeof SFX_DATA === 'undefined') return;
    for (const [k, b64] of Object.entries(SFX_DATA)) {
      if (this.dec[k]) continue;
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        this.dec[k] = this.ctx.decodeAudioData(u.buffer).then((b) => { this.buf[k] = b; if (k === 'water' && this.ambientOn) this.startAmbient(); }).catch(() => {});
      } catch (e) { this.dec[k] = Promise.resolve(); /* keep synth fallback */ }
    }
  },
  ready() { return Promise.all(Object.values(this.dec)); }, // every effect whose data is here, decoded
  // can a sound be heard right now? (the browser lets the page play, and the sound is on). A sound started while the
  // page is still held silent would wait, then burst out with all the others on the first tap: the start screen asks first
  live() { return !!this.ctx && this.ctx.state === 'running' && !this.muted && !Motion.skipping; },
  // wake the sound on the first tap, click or key anywhere (the browser allows it from then on). On iOS a silent
  // sound started inside that touch is what really opens it
  listen() {
    if (!this.ctx || this.ctx.state === 'running') return;
    const evs = ['pointerdown', 'touchend', 'keydown'];
    const off = () => { for (const e of evs) removeEventListener(e, wake, true); };
    const wake = () => {
      const c = this.ctx; if (!c) return;
      try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch (e) { /* ignore */ }
      const p = c.state === 'suspended' ? c.resume() : null;
      if (p && p.then) p.then(() => { if (c.state === 'running') off(); }).catch(() => {});
      else if (c.state === 'running') off();
    };
    for (const e of evs) addEventListener(e, wake, true);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
  setMuted(m) {
    m = m || SILENT;
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.95, this.ctx.currentTime, 0.05);
    Music.setMuted(m);
    if (m) VO.stop();
  },
  play(key, { vol = 1, rate = 1, t = 0, verb = 0.08, pan = null, vary = 0.04 } = {}) {
    if (Motion.skipping) return true; // a skipped shot is silent (and no synth fallback either)
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
    if (!this.ctx || Motion.skipping) return;
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.sfx); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise({ t = 0, dur = 0.3, vol = 0.2, type = 'lowpass', f = 1200, f2 = null, q = 1, attack = 0.004 }) {
    if (!this.ctx || Motion.skipping) return;
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
  // a real cannon: a close farm-gun crack for the attack, a recorded boom for the body and rumble, and a
  // distant shot's echo rolling back off the lake (all recordings; no synth layer). v = how big
  boom(v = 1) {
    const alt = Math.random() < 0.35;
    this.play('blast', { vol: 0.75 * v, rate: 0.9, verb: 0.15, vary: 0.04, pan: 0 });
    this.play(alt ? 'cannonb' : 'cannon', { vol: 1 * v, rate: alt ? 0.92 : 0.86, verb: 0.3, vary: 0.03, pan: 0, t: 0.004 });
    this.play('echo', { vol: 0.9 * v, rate: 0.95, t: 0.09, verb: 0.35, vary: 0.04, pan: 0.25 });
  },
  whistle() { this.play('whoosh', { vol: 0.55, rate: 1.15, vary: 0.05 }); }, // the ball rushing out of the barrel (a real swung metal tube)
  // the cannon winds up: a short rising whoosh into the blast
  charge() { this.play('air', { vol: 0.3, rate: 1.55, vary: 0.02 }); this.play('whoosh', { vol: 0.22, rate: 1.7, vary: 0.02 }); },
  ding(i = 0) { const r = [1, 1.26, 1.5, 2][i % 4]; if (!this.play(i % 2 ? 'glass2' : 'glass1', { vol: 0.55, rate: r, verb: 0.3, vary: 0.01 })) this.tone({ f: 1318 * r, dur: 0.6, vol: 0.12 }); },
  sparkle() { [1.5, 1.68, 2, 2.24, 2.52].forEach((r, i) => { if (!this.play('glass2', { vol: 0.28, rate: r, t: i * 0.05, verb: 0.4, vary: 0.005 })) this.tone({ type: 'triangle', f: 1568 * r / 1.5, t: i * 0.045, dur: 0.22, vol: 0.05 }); }); },
  // x pushing on its cage's bars (i = 0, 1: the second push harder): the cage's metal groans
  strain(i = 0) {
    this.play('creak', { vol: 0.42 + 0.12 * i, rate: 1.05 + 0.12 * i, verb: 0.2, pan: 0 });
    this.play('metal3', { vol: 0.16 + 0.08 * i, rate: 0.8, t: 0.05, verb: 0.15, pan: 0 });
  },
  // the cage breaking: its lock snaps, an iron bar's clang (pitched up: a small golden cage), then its bars clatter down
  cageBreak() {
    if (!this.play('key', { vol: 0.7, rate: 0.85, verb: 0.15, pan: 0 })) this.noise({ dur: 0.05, vol: 0.2, type: 'highpass', f: 2500 });
    this.play('clang', { vol: 0.62, rate: 1.3, t: 0.01, verb: 0.3, pan: 0 });
    [0.14, 0.26, 0.4, 0.55, 0.72].forEach((t, i) => this.play(i % 2 ? 'metal2' : 'metal3', { vol: 0.34 - i * 0.05, rate: rr(1.05, 1.35), t, pan: i % 2 ? 0.35 : -0.35, verb: 0.2, vary: 0.06 }));
  },
  // the cloud bursting: a soft, airy puff (recorded air whooshes and a cloth flap) with a faint twinkle
  poof() {
    if (!this.play('airmid', { vol: 0.4, rate: 0.82, verb: 0.25, pan: 0 })) this.noise({ dur: 0.7, vol: 0.08, type: 'bandpass', f: 900, f2: 300, q: 0.7, attack: 0.03 });
    this.play('cloth', { vol: 0.32, rate: 0.72, verb: 0.2, pan: 0 });
    this.play('air', { vol: 0.25, rate: 0.62, t: 0.03, pan: 0 });
    [2, 2.52, 3].forEach((r, i) => this.play('glass2', { vol: 0.08, rate: r, t: 0.08 + i * 0.07, verb: 0.5, vary: 0.01 }));
  },
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
  // ---- the start screen's entrance (Title.cues): each piece arrives with its own recorded sound, never a synth
  // stand-in (CREDITS.md: swish = a wooden sheet swung through the air, knock = a wooden gavel, thud = a jump on a
  // wooden pontoon, clang = an iron bar falling, roll = a hand truck rolling, cork = a champagne cork popping)
  swish(v = 1, rate = 1, pan = 0) { this.play('swish', { vol: 0.5 * v, rate, pan, verb: 0.12, vary: 0.03 }); },
  // the CANNON QUEST sign drops in: a wooden knock with some body (b = which bounce: 0 the first, loudest)
  signLand(b) {
    const v = [1, 0.42, 0.18][b] ?? 0;
    this.play('knock', { vol: 0.72 * v, rate: 1 + 0.05 * b, verb: 0.2, pan: 0 });
    if (!b) this.play('thud', { vol: 0.32, rate: 1.35, t: 0.004, verb: 0.15, pan: 0 });
  },
  // the cannon slides in over the deck on its wooden base, and plants itself with a heavy thud (its iron fittings knock)
  rollIn() { this.play('roll', { vol: 0.42, rate: 0.9, verb: 0.08, pan: -0.35, vary: 0.02 }); },
  cannonLand() {
    this.play('thud', { vol: 0.85, rate: 0.88, verb: 0.15, pan: -0.3 });
    this.play('latch', { vol: 0.2, rate: 0.78, t: 0.02, pan: -0.3 });
  },
  // the golden cage drops onto the deck and bounces: a metal clang + the wood under it, its bars ringing (b = which bounce)
  cageLand(b) {
    if (b === 0) {
      this.play('clang', { vol: 0.5, rate: 0.84, verb: 0.22, pan: 0.35 });
      this.play('thud', { vol: 0.55, rate: 1.1, t: 0.003, verb: 0.12, pan: 0.35 });
      this.play('metal2', { vol: 0.16, rate: 1.1, t: 0.07, pan: 0.45 });
    } else if (b === 1) {
      this.play('clang', { vol: 0.22, rate: 0.92, verb: 0.2, pan: 0.35 });
      this.play('woodhit2', { vol: 0.18, rate: 0.9, pan: 0.35 });
    } else if (b === 2) this.play('metal3', { vol: 0.12, rate: 1.2, pan: 0.35 });
  },
  cork() { this.play('cork', { vol: 0.45, rate: 0.92, verb: 0.18, pan: 0, vary: 0.02 }); }, // Play pops up
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

// ---------- background music: "New Shoes" (HoliznaCC0, CC0 public domain, see CREDITS.md) ----------
// The user, 20 Nov: "the BGM is too heavy… I want light music, not high music". So the 170 bpm guitar + synth track
// (Bravery Run) gave way to a light, happy lo-fi tune: ~81 bpm, very little bass, no drums pounding. It is cut into
// a seamless loop (its fade-out replaced by a 3 s crossfade into its own start) and stored 3 dB quieter than the
// old track (−17 LUFS). It plays at its own speed, at 20% volume (level; the user, 20 Nov: "40% only", then "20%"), and dips
// to 40% of that while the voice speaks (duck), so it always sits softly UNDER the lesson.
const TRACKS = { game: 'assets/music/newshoes.webm' };
// a short buzz on phones that support it (never when muted or with reduced motion)
const Haptic = { buzz(p) { if (Sound.muted || Motion.still() || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (e) { /* ignore */ } } };

const Music = {
  el: null, choice: 'game', level: 0.2, rate: 1, target: 0, on: false, paused: false, vol: 0, hitT: 0,
  start() { this.on = true; this.setTrack(this.choice); },
  setTrack(name) {
    this.choice = name;
    if (this.el) { this.el.pause(); this.el = null; }
    if (name === 'off' || !this.on) return;
    const a = new Audio(TRACKS[name] || TRACKS.game);
    a.loop = true; a.preload = 'auto'; a.volume = 0; a.muted = Sound.muted;
    a.preservesPitch = a.webkitPreservesPitch = true; a.defaultPlaybackRate = a.playbackRate = this.rate;
    this.el = a; this.target = this.level;
    if (!this.paused) { const p = a.play(); if (p && p.catch) p.catch(() => { const retry = () => { if (this.el === a && !this.paused) a.play().catch(() => {}); removeEventListener('pointerdown', retry); }; addEventListener('pointerdown', retry); }); }
  },
  duck(on) { this.target = on ? this.level * 0.4 : this.level; },
  setMuted(m) { if (this.el) this.el.muted = m; },
  pause() { this.paused = true; if (this.el) this.el.pause(); },
  resume() { this.paused = false; if (this.el) this.el.play().catch(() => {}); },
  // the music dips for a moment under each cannon blast, so the boom hits harder (a volume dip, not a filter:
  // routing the <audio> through Web Audio would silence it when the game is opened from disk)
  punch() { this.hitT = 1; },
  update(dt) {
    if (!this.el) return;
    this.vol = clamp(this.vol + clamp(this.target - this.vol, -dt * 0.4, dt * 0.4), 0, 1);
    this.hitT = Math.max(0, this.hitT - dt * 2.5);
    const v = clamp(this.vol * (1 - 0.55 * Math.sin(Math.min(1, this.hitT * 1.25) * Math.PI / 2)), 0, 1);
    if (Math.abs(v - this.el.volume) > 0.002) this.el.volume = v;
  },
};

// ---------- the caption board (what the voice is saying): the wooden board on the left (CSS #cap) ----------
// It comes WITH the voice, and only with it (the user, 20 Nov: "the question template comes word by word, with the
// voiceover… otherwise this will not come"). Nothing shows until a line's voice really starts (its recorded clip
// playing): then the board rises in (ease-out) with the first word, and each word pops in as it is said (upTo,
// driven by the word clock Said, below). A line whose voice never starts (sound off, no clip recorded yet, a clip
// that fails) shows no board at all. The board is sized for the whole line before its first word
// (fit makes the text box exactly as wide as the line's longest row), so it never grows while the words come. A new
// line while the board is up: the old words fade out and the board (.bg) glides from its old box to the new one
// (FLIP: position + size, as it stays centred on its line), then the new words come. After the line it sinks away
// (ease-in). GSAP, transform + opacity only (animation skill); under reduced motion or a Skip each step lands at once.
// The board is the user's question template (assets/img/question_board.webp, cut by tools/cut_question_board.py)
// as a 9-slice, painted by paint() into the canvas .bg in whole device pixels, so its nine pieces meet exactly
// (a CSS border-image leaves faint lines across the cream at the stage's fractional scales). SLICE: where the
// template's rounded corners end, in WebP px (top right bottom left); EDGE: the same in art px, drawn at half the
// WebP (0.25 of the template), the template's own proportions, so its whole thick wooden frame shows.
const BOARD = { SLICE: [96, 100, 81, 100], EDGE: [48, 50, 40.5, 50] };
const Caption = {
  el: null, bg: null, txt: null, pic: null, words: [], want: 0, shown: 0, ready: false, id: 0,
  init() {
    if (this.el) return;
    this.el = $('#cap'); this.bg = this.el.querySelector('.bg'); this.txt = this.el.querySelector('.txt');
    this.pic = new Image(); this.pic.onload = () => this.paint(); this.pic.src = IMG + 'question_board.webp';
    addEventListener('resize', () => requestAnimationFrame(() => this.paint())); // (after Stage.resize has rescaled the stage)
  },
  // the 9-slice, at the board's size (its layout box) in device px: the stage's scale × the screen's pixel ratio
  paint() {
    const { el, bg: c, pic: im } = this;
    if (!c || !im || !im.naturalWidth) return;
    const w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
    const k = ($('#stageTop').getBoundingClientRect().width / DW || 1) * (window.devicePixelRatio || 1);
    const W = Math.round(w * k), H = Math.round(h * k), iw = im.naturalWidth, ih = im.naturalHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const [st, sr, sb, sl] = BOARD.SLICE, [et, er, eb, ek] = BOARD.EDGE.map((v) => Math.round(v * k));
    const sx = [0, sl, iw - sr, iw], sy = [0, st, ih - sb, ih], dx = [0, ek, W - er, W], dy = [0, et, H - eb, H];
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H); g.imageSmoothingQuality = 'high';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      g.drawImage(im, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
  },
  // wrapped text would keep the board at its full max-width (empty wood at the right): measure the lines it really
  // has and make the text box that wide (in layout px: the stage and the board's own entrance are scaled)
  fit() {
    const t = this.txt; t.style.width = '';
    const r = document.createRange(); r.selectNodeContents(t);
    const rs = [...r.getClientRects()]; if (!rs.length) return;
    const k = t.getBoundingClientRect().width / (t.offsetWidth || 1) || 1;
    const w = Math.max(...rs.map((q) => q.right)) - Math.min(...rs.map((q) => q.left));
    t.style.width = Math.ceil(w / k + 0.5) + 'px';
  },
  // the line laid out with every word hidden: each word is its own span (.w), so it can pop in on its own, and a
  // one-letter word (x) never ends a row: it shares an unbreakable group (.nw) with the word after it. The board is
  // fitted and painted for the whole line first, and only then are the words shrunk for their pop (a shrunk word
  // would measure narrower and the line could wrap once they grow)
  lay(text) {
    const t = this.txt, m = String(text).match(/\S+/g) || [], n = m.length;
    gsap.killTweensOf(this.words);
    t.textContent = '';
    const ws = (this.words = m.map((s) => { const w = document.createElement('span'); w.className = 'w'; w.textContent = s; return w; }));
    for (let i = 0; i < n;) {
      if (i) t.append(' ');
      let j = i; while (j < n - 1 && [...m[j]].length === 1) j++;
      if (j === i) t.append(ws[i]);
      else { const g = document.createElement('span'); g.className = 'nw'; for (let k = i; k <= j; k++) { if (k > i) g.append(' '); g.append(ws[k]); } t.append(g); }
      i = j + 1;
    }
    this.fit(); this.paint();
    gsap.set(ws, { opacity: 0, y: 12, scale: 0.92 });
  },
  up() { return !!this.el && this.el.classList.contains('on'); },
  // the line's voice has started: the board comes in (or glides over from the line before), its words still hidden
  start(text) {
    this.init();
    const { el, bg, txt } = this, id = ++this.id, up = this.up() && +gsap.getProperty(el, 'opacity') > 0.05;
    this.want = 0; this.shown = 0; this.ready = false;
    el.classList.add('on');
    gsap.killTweensOf(el);
    if (!up) { // enter: the board is laid out before it shows
      gsap.killTweensOf([txt, bg]); this.lay(text);
      gsap.set(txt, { opacity: 1, y: 0 }); gsap.set(bg, { x: 0, y: 0, scaleX: 1, scaleY: 1 }); gsap.set(el, { y: 14, scale: 0.97 });
      this.ready = true;
    } else { // the old words fade out, the board glides from the old box to the new one, the new words come as said
      gsap.killTweensOf(txt);
      Motion.to(txt, { opacity: 0, y: -5, duration: Motion.DUR.FAST * 0.8, ease: Motion.EASE.IN, onComplete: () => {
        if (id !== this.id) return;
        const a = el.getBoundingClientRect();
        this.lay(text);
        const b = el.getBoundingClientRect(), k = b.width / (el.offsetWidth || 1) || 1;
        gsap.killTweensOf(bg);
        if (b.width && b.height) gsap.set(bg, { x: (a.left - b.left) / k, y: (a.top - b.top) / k, scaleX: a.width / b.width, scaleY: a.height / b.height });
        Motion.to(bg, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: Motion.DUR.NORMAL + 0.05, ease: Motion.EASE.OUT });
        gsap.set(txt, { opacity: 1, y: 0 });
        this.ready = true; this.upTo(0); // the words already said while it glided
      } });
    }
    Motion.to(el, { opacity: 1, y: 0, scale: 1, duration: Motion.DUR.SLOW * 0.75, ease: Motion.EASE.OUT });
  },
  // the first n words are up: the ones not yet shown pop in (a playful back.out; a few at once ripple 0.06 s apart)
  upTo(n) {
    n = Math.min(n, this.words.length);
    if (n > this.want) this.want = n;
    if (!this.ready || this.want <= this.shown) return;
    this.words.slice(this.shown, this.want).forEach((w, k) =>
      Motion.to(w, { opacity: 1, y: 0, scale: 1, duration: Motion.DUR.NORMAL * 0.8, ease: Motion.EASE.POP, delay: Motion.d(k * 0.06) }));
    this.shown = this.want;
  },
  hide() {
    this.init();
    this.id++;
    if (!this.el.classList.contains('on')) return;
    this.el.classList.remove('on');
    gsap.killTweensOf(this.el);
    Motion.to(this.el, { opacity: 0, y: -6, scale: 0.98, duration: Motion.DUR.FAST + 0.03, ease: Motion.EASE.IN });
  },
};

// ---------- voice-over + its board, by key (localization skill) ----------
// Every line is said in a real person's voice, never a made-up one (the user, 20 Nov 2026: "natural voiceovers,
// not AI generated"): no TTS studio, no AI voice, and not the device's own voice either. The clips are cut from
// a recording of the lines read aloud (docs/VO_RECORD.txt) by tools/vo_split.py: I18n.voice(key) =
// assets/VO/en/<key>.webm. VO_FILES (build.sh, from tools/vo_takes.json, the record of each cut) lists the keys
// that have a clip; VO_WORDS, when each word of a clip starts. A line with no clip yet, or a clip the browser
// can't play, is not voiced: no voice, so no board, and its pause stays.
// ---------- the word clock: which word of the line the voice is saying (it drives the board's words) ----------
// A clip: the recording's own word starts (VO_WORDS, heard by tools/vo_split.py), or, without them, its play time
// spread over the words by their weight: its letters (at least 3: "x" is said "ex"), a gap, and a breath after
// , ; : . ! ? inside the line. A test robot (SILENT, no clip playing) runs on a clock at a speaking pace (cps:
// weight a second). Pausing the game pauses the clock (and the clip).
const Said = {
  my: 0, text: '', at: [], from: [], total: 1, cps: 17, t: 0, heard: false, on: false, done: true, clip: null, words: null,
  begin(my, text, key) {
    this.stop();
    const w = typeof VO_WORDS !== 'undefined' && VO_WORDS[key];
    Object.assign(this, { my, text, t: 0, heard: false, done: false, clip: null, at: [], from: [], words: w || null });
    const ms = [...String(text).matchAll(/\S+/g)];
    let c = 0;
    ms.forEach((m, i) => {
      this.at.push(m.index); this.from.push(c);
      c += Math.max(3, (m[0].match(/[\p{L}\p{N}]/gu) || []).length) + 1;
      if (i < ms.length - 1) c += /[.!?]$/.test(m[0]) ? 5 : /[,;:]$/.test(m[0]) ? 3 : 0;
    });
    this.total = Math.max(1, c);
  },
  // the voice has started: the board comes in with the first word
  go(clip) {
    if (this.done || this.on || this.my !== VO.token) return;
    this.on = this.heard = true; this.clip = clip || null; this.t = 0;
    Caption.start(this.text);
    gsap.ticker.add(this.tick);
    this.step();
  },
  tick: (time, dms) => Said.step(dms),
  step(dms = 0) {
    if (!this.on) return;
    if (!Clock.paused) this.t += (Math.min(dms, 250) / 1000) * (SILENT ? window.__cqSpeed || 1 : 1);
    const a = this.clip, ws = this.words;
    let n = 0;
    if (a && ws && ws.length === this.from.length) { // the recording's own word starts (a word pops a beat early: its pop takes a moment)
      while (n < ws.length && ws[n] <= a.currentTime + 0.05) n++;
    } else {
      const k = a && isFinite(a.duration) && a.duration > 0
        ? ((a.currentTime - 0.08) / Math.max(0.3, a.duration - 0.3)) * this.total // (a clip's lead-in and tail are quiet)
        : this.t * this.cps;
      while (n < this.from.length && this.from[n] <= k) n++;
    }
    Caption.upTo(Math.max(1, n));
  },
  // the line has been said: every word is up
  end() {
    if (this.on) Caption.upTo(Infinity);
    this.stop();
  },
  stop() { gsap.ticker.remove(this.tick); this.on = false; this.done = true; this.clip = null; },
};
const VO = {
  token: 0, missing: new Set(), cur: null, finish: null, busy: null,
  // say a line by key: its recorded clip, and the board, whose words come as they are said; resolves when it has
  // been said, or at once when stopped. No voice (sound off, no clip yet, a clip that fails): no board, the pause stays
  async say(key, hold = 0.5) {
    const text = T(key), my = ++this.token;
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; } // never let two lines overlap
    if (this.finish) this.finish();
    Said.begin(my, text, key);
    // the line before's board stays until this line's voice starts (then glides over to it); if none starts soon, it goes
    if (Caption.up()) wait(1.2).then(() => { if (my === this.token && !Said.heard) Caption.hide(); });
    const clip = typeof VO_FILES !== 'undefined' && VO_FILES.includes(key) && !this.missing.has(key);
    if (clip) Music.duck(true);
    const est = 0.9 + text.length * 0.058, t0 = performance.now();
    const spoken = new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; if (this.finish === finish) this.finish = null; if (my === this.token) Said.end(); resolve(); } };
      this.finish = finish;
      if (SILENT) { Said.go(); wait(est).then(finish); return; } // a test robot: no sound, but the board runs as if spoken
      if (Sound.muted || !clip) { wait(est).then(finish); return; }
      wait(est + 2.5).then(finish); // (in case a clip's 'ended' never comes)
      let a = null;
      const fail = () => { // a clip that can't play: the line's pause still runs its course, unvoiced
        this.missing.add(key); if (Said.clip === a) Said.clip = null;
        if (a && this.cur === a && !done) wait(Math.max(0, est - (performance.now() - t0) / 1000)).then(finish);
      };
      a = I18n.say(key, { onended: finish, onerror: fail });
      a.addEventListener('playing', () => { if (this.cur === a && !done) Said.go(a); });
      this.cur = a;
    });
    this.busy = spoken;
    await spoken;
    if (this.busy === spoken) this.busy = null;
    if (my !== this.token) return;
    await wait(hold);
    if (my === this.token) { Caption.hide(); Music.duck(false); }
  },
  // say a line once the one being said has ended, so lines follow each other instead of cutting each other
  // off (a newer line, or stop(), drops it: the newest moment wins)
  async sayAfter(key, hold = 0.5) {
    const my = this.token;
    if (this.busy) await Promise.race([this.busy, wait(5)]);
    if (my !== this.token) return;
    await this.say(key, hold);
  },
  stop() {
    this.token++;
    Said.stop(); Caption.hide();
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; }
    const f = this.finish; this.finish = null; if (f) f();
    Music.duck(false);
  },
  // (a clip that has already ended stays ended: resuming the game never says its line again)
  pause() { if (this.cur && !this.cur.ended) this.cur.pause(); },
  resume() { if (this.cur && this.cur.paused && !this.cur.ended) this.cur.play().catch(() => {}); },
};
