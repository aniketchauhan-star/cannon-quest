
// =====================================================================
//  AUDIO — real recorded CC0 foley (js/sfx.js), teen-style music tracks,
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
    this.loadSfx();
  },
  // the recorded effects (SFX_DATA, in js/sfx.js, which boot fetches once the start screen is up): decoded once the
  // sound is on (init, on the Play tap) and they are here, whichever comes last (js/sfx.js calls this as it arrives).
  // Until then the synth fallback plays.
  loadSfx() {
    if (!this.ctx || this.sfxIn || typeof SFX_DATA === 'undefined') return;
    this.sfxIn = true;
    for (const [k, b64] of Object.entries(SFX_DATA)) {
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        this.ctx.decodeAudioData(u.buffer).then((b) => { this.buf[k] = b; if (k === 'water' && this.ambientOn) this.startAmbient(); }).catch(() => {});
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

// ---------- background music: "Bravery Run" (OpenGameArt, CC0 public domain, see CREDITS.md) ----------
// upbeat game music, electric guitar + synth at 170 bpm (the user, 19 Nov: a gamified track for teens). It was made
// to loop (exactly 316 beats), so it is stored whole, with no fades, and loops without a seam
const TRACKS = { game: 'assets/music/braveryrun.webm' };
// a short buzz on phones that support it (never when muted or with reduced motion)
const Haptic = { buzz(p) { if (Sound.muted || Motion.still() || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (e) { /* ignore */ } } };

const Music = {
  el: null, choice: 'game', level: 0.36, target: 0, on: false, paused: false, vol: 0, hitT: 0,
  start() { this.on = true; this.setTrack(this.choice); },
  setTrack(name) {
    this.choice = name;
    if (this.el) { this.el.pause(); this.el = null; }
    if (name === 'off' || !this.on) return;
    const a = new Audio(TRACKS[name] || TRACKS.game);
    a.loop = true; a.preload = 'auto'; a.volume = 0; a.muted = Sound.muted;
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
// GSAP, transform + opacity only (animation skill): it rises in (ease-out), sinks away (ease-in), and a new
// line while it is up cross-fades its words while the board (.bg) glides from its old box to the new one (FLIP:
// position + size, as the board stays centred on its line), so it never snaps. The board hugs its words: fit()
// makes the text box exactly as wide as its longest line. Under reduced motion or a Skip every step lands at once.
const Caption = {
  el: null, bg: null, txt: null,
  init() { if (!this.el) { this.el = $('#cap'); this.bg = this.el.querySelector('.bg'); this.txt = this.el.querySelector('.txt'); } },
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
  show(text) {
    this.init();
    text = String(text).replace(/(^|\s)(\S)\s+/g, '$1$2 '); // a one-letter word (x) never ends a line: it stays with the next word
    const { el, bg, txt } = this, up = +gsap.getProperty(el, 'opacity') > 0.05;
    el.classList.add('on');
    gsap.killTweensOf(el);
    if (!up) { // enter: the words are set before it shows
      gsap.killTweensOf([txt, bg]); txt.textContent = text; this.fit();
      gsap.set(txt, { opacity: 1, y: 0 }); gsap.set(bg, { x: 0, y: 0, scaleX: 1, scaleY: 1 }); gsap.set(el, { y: 14, scale: 0.97 });
    }
    Motion.to(el, { opacity: 1, y: 0, scale: 1, duration: Motion.DUR.SLOW * 0.75, ease: Motion.EASE.OUT });
    if (up && txt.textContent !== text) this.swap(text);
  },
  swap(text) { // the old words fade out, the board glides from the old box to the new one, the new words fade in
    const { el, bg, txt } = this;
    gsap.killTweensOf(txt);
    Motion.to(txt, { opacity: 0, y: -5, duration: Motion.DUR.FAST * 0.8, ease: Motion.EASE.IN, onComplete: () => {
      const a = el.getBoundingClientRect();
      txt.textContent = text; this.fit();
      const b = el.getBoundingClientRect(), k = b.width / (el.offsetWidth || 1) || 1;
      gsap.killTweensOf(bg);
      if (b.width && b.height) gsap.set(bg, { x: (a.left - b.left) / k, y: (a.top - b.top) / k, scaleX: a.width / b.width, scaleY: a.height / b.height });
      Motion.to(bg, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: Motion.DUR.NORMAL + 0.05, ease: Motion.EASE.OUT });
      gsap.set(txt, { y: 6 });
      Motion.to(txt, { opacity: 1, y: 0, duration: Motion.DUR.NORMAL, ease: Motion.EASE.OUT, delay: Motion.d(0.04) });
    } });
  },
  hide() {
    this.init();
    if (!this.el.classList.contains('on')) return;
    this.el.classList.remove('on');
    gsap.killTweensOf(this.el);
    Motion.to(this.el, { opacity: 0, y: -6, scale: 0.98, duration: Motion.DUR.FAST + 0.03, ease: Motion.EASE.IN });
  },
};

// ---------- voice-over + captions, by key (localization skill) ----------
// Each line's text is T(key); its clip is I18n.voice(key) = assets/VO/en/<key>.webm, made in Aamir's TTS
// studio in ONE man's voice (the user's choice of 2026-11-18: see tools/vo_studio.mjs and the "voice" in
// tools/vo_lines.json). VO_FILES (build.sh) lists the keys that have a clip. A line with no clip, or a
// browser that can't play it, is read by the device's own voice: a man's, the most natural one the device
// has (Edge's "Natural" voices, then Google's, then the system's; Indian English first among equals),
// coloured by the line's mood (VO_MOOD, from tools/vo_lines.json "mood", via build.sh).
const MAN = /\b(male|man|prabhat|madhur|kunal|aarav|ravi|aman|rishi|daniel|alex|aaron|arthur|gordon|oliver|thomas|guy|ryan|andrew|brian|christopher|eric|roger|steffan|davis|jason|tony|william|liam|connor|george|david|mark|james|nathan|evan|tom)\b/i;
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|\b(fred|ralph|junior|grandpa|grandma|eddy|reed|rocko|sandy|shelley|flo)\b/i;
// how each mood colours the device's voice (the studio's clips carry their own emotion)
const MOODS = {
  hype: { rate: 1.04, pitch: 1.06 },  // welcome, round intros: upbeat
  cheer: { rate: 1.06, pitch: 1.1 },  // x is free, a high score: excited
  teach: { rate: 0.96, pitch: 1 },    // tutorial steps: calm and clear
  soft: { rate: 0.92, pitch: 0.95 },  // x stays caged: gentle, never "wrong"
  warm: { rate: 0.98, pitch: 1.03 },  // a low score: kind, encouraging
};
const VO = {
  voice: null, local: null, token: 0, missing: new Set(), cur: null, finish: null, utter: null, cancelAt: -1e9, busy: null,
  pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices(); if (!vs.length) return;
    const lang = (v) => String(v.lang || '').replace(/_/g, '-').toLowerCase();
    const quality = (v) => (/natural|neural|enhanced|premium/i.test(v.name) ? 3 : /google/i.test(v.name) ? 2 : /\baman\b/i.test(v.name) ? 1.5 : 0);
    const accent = (v) => ({ 'en-in': 1.2, 'en-gb': 0.6, 'en-us': 0.5 }[lang(v)] ?? (lang(v).startsWith('en') ? 0.2 : -99));
    const score = (v) => quality(v) * 2 + accent(v) - (NOVELTY.test(v.name) ? 20 : 0);
    const best = (list) => list.filter((v) => accent(v) > -99).sort((a, b) => score(b) - score(a))[0] || null;
    const men = vs.filter((v) => MAN.test(v.name));
    this.voice = best(men) || best(vs);
    this.local = best(men.filter((v) => v.localService)) || best(vs.filter((v) => v.localService)); // when offline
  },
  // (as in Crown Quest: cancel only what is speaking, never speak() within 120 ms of a cancel, which Chrome can
  // swallow, and keep a reference to the utterance, whose 'end' Chrome drops once it is garbage-collected)
  speakTTS(text, finish, key) {
    if (!window.speechSynthesis) return;
    try {
      const sy = speechSynthesis;
      if (sy.speaking || sy.pending) { sy.cancel(); this.cancelAt = performance.now(); }
      const u = new SpeechSynthesisUtterance(text);
      if (!this.voice) this.pickVoice();
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-IN';
      const m = MOODS[(typeof VO_MOOD !== 'undefined' && VO_MOOD[key]) || 'teach'];
      u.rate = m.rate; u.pitch = m.pitch; u.onend = finish;
      // a network voice (Google's, Edge's) that fails, e.g. offline, gives way to the device's own for good
      u.onerror = (e) => {
        const net = this.voice && !this.voice.localService && this.local && this.local !== this.voice;
        if (net && this.utter === u && !/interrupted|canceled/.test(e && e.error)) { this.voice = this.local; this.speakTTS(text, finish, key); } else finish();
      };
      this.utter = u;
      const go = () => { if (this.utter !== u) return; try { if (sy.paused) sy.resume(); sy.speak(u); } catch (e) { finish(); } };
      const since = performance.now() - this.cancelAt;
      if (since < 120) gsap.delayedCall((120 - since) / 1000, go); else go();
    } catch (e) { /* captions still show */ }
  },
  // say a line by key: caption + clip (or the device voice); resolves when it has been said, or at once when stopped
  async say(key, hold = 0.5) {
    const text = T(key), my = ++this.token;
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; } // never let two lines overlap
    if (this.finish) this.finish();
    Caption.show(text);
    Music.duck(true);
    const est = 0.9 + text.length * 0.058;
    const spoken = new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; if (this.finish === finish) this.finish = null; resolve(); } };
      this.finish = finish;
      if (Sound.muted) { wait(est).then(finish); return; }
      wait(est + 2.5).then(finish);
      if (typeof VO_FILES !== 'undefined' && VO_FILES.includes(key) && !this.missing.has(key)) {
        let a = null;
        const fail = () => { this.missing.add(key); if (a && this.cur === a && !done) this.speakTTS(text, finish, key); };
        a = I18n.say(key, { onended: finish, onerror: fail });
        this.cur = a;
      } else this.speakTTS(text, finish, key);
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
    Caption.hide();
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; }
    this.utter = null;
    if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) { speechSynthesis.cancel(); this.cancelAt = performance.now(); }
    const f = this.finish; this.finish = null; if (f) f();
    Music.duck(false);
  },
  pause() { if (window.speechSynthesis) speechSynthesis.pause(); if (this.cur) this.cur.pause(); },
  resume() { if (window.speechSynthesis) speechSynthesis.resume(); if (this.cur) this.cur.play().catch(() => {}); },
};
if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = () => VO.pickVoice(); VO.pickVoice(); }
