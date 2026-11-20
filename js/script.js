'use strict';
// =====================================================================
//  CANNON QUEST (2D) — core: helpers, tweens, exact maths engine, rounds
// =====================================================================
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBackSoft: (t) => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }, // a small overshoot (~4 %), then rest
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};
const rr = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const later = (ms) => new Promise((r) => setTimeout(r, ms)); // boot only (not motion)

// (the game clock, tween() and wait() live in 12_motion.js: GSAP-driven, time-based)
const bez = (a, c, b, e) => { const u = 1 - e; return u * u * a + 2 * u * e * c + e * e * b; };

// =====================================================================
//  Exact fractions + the equation engine. A side is an "onion" of layers
//  around x, e.g. 2(3x+1)+4 = [×3, +1, ×2, +4]. Every shot is applied
//  to the WHOLE of both sides.
// =====================================================================
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
class Frac {
  constructor(n, d = 1) {
    if (d === 0) throw new Error('division by zero');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    this.n = n / g || 0; this.d = d / g;
  }
  add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  abs() { return new Frac(Math.abs(this.n), this.d); }
  isZero() { return this.n === 0; }
  isOne() { return this.n === 1 && this.d === 1; }
}
const F = (n, d = 1) => new Frac(n, d);
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
function parseOp(s) {
  const k = s[0], n = parseInt(s.slice(1), 10);
  if (!n) throw new Error('×0 / ÷0 are never offered');
  const layer = k === '+' ? { t: 'add', v: F(n) } : k === '-' ? { t: 'add', v: F(-n) } : k === '*' ? { t: 'mul', v: F(n) } : { t: 'mul', v: F(1, n) };
  return { k, n, sym: SYM[k], label: SYM[k] + n, layer };
}
const initLayers = (spec) => spec.map(([k, n]) => parseOp(k + n).layer);
function addLayer(layers, L) {
  if (L.t === 'add') {
    const out = layers.slice(), top = out[out.length - 1];
    if (top && top.t === 'add') { const v = top.v.add(L.v); out.pop(); if (!v.isZero()) out.push({ t: 'add', v }); }
    else out.push({ t: 'add', v: L.v });
    return out;
  }
  return mulLayers(layers, L.v);
}
function mulLayers(layers, v) {
  if (!layers.length) return v.isOne() ? [] : [{ t: 'mul', v }];
  const top = layers[layers.length - 1], rest = layers.slice(0, -1);
  if (top.t === 'mul') { const nv = top.v.mul(v); return nv.isOne() ? rest : [...rest, { t: 'mul', v: nv }]; }
  return addLayer(mulLayers(rest, v), { t: 'add', v: top.v.mul(v) }); // (inner + c)·v = inner·v + c·v
}
function applyOp(eq, op) {
  const L = op.layer;
  return { layers: addLayer(eq.layers, L), rhs: L.t === 'add' ? eq.rhs.add(L.v) : eq.rhs.mul(L.v) };
}
const isSolved = (eq) => eq.layers.length === 0;

// ---------- question bank (from the brief) ----------
const ROUNDS = [
  { eq: [['+', 5]], rhs: 7, slots: 1, balls: ['+5', '-5', '*5', '/5', '+3', '-3', '+2', '-2'], guide: ['-5'] },
  { eq: [['*', 2], ['+', 3]], rhs: 11, slots: 2, balls: ['+3', '-3', '*2', '/2', '+2', '-2', '*3', '/3'] },
  { eq: [['*', 3]], rhs: 18, slots: 1, balls: ['+3', '-3', '*3', '/3', '+5', '-5', '+2', '-2'] },
  { eq: [['/', 3], ['+', 2]], rhs: 6, slots: 2, balls: ['-2', '*3', '-6', '/3', '+2', '+6', '-3', '*2'] },
  { eq: [['*', 2], ['+', 7]], rhs: 1, slots: 2, balls: ['-7', '/2', '+7', '*2', '-2', '+2', '-6', '/7'] },
  { eq: [['+', 2], ['*', 3]], rhs: 21, slots: 2, balls: ['/3', '-2', '*3', '+2', '-3', '/2', '-6', '+6'] },
];
// ball art from the asset sheet (magenta, pink, green, cyan, coral, blue, yellow, purple) + darker ink for tokens
const BALL_HEX = ['#e33bf8', '#fb2c91', '#4fbf00', '#00b8d4', '#fd5c53', '#3185fd', '#f2b800', '#a54afb'];
const BALL_INK = ['#a312c0', '#d0106d', '#2f8a00', '#0089a6', '#d8352b', '#1d5fd1', '#c27f00', '#7a22d6'];

// =====================================================================
//  Equation → HTML shown on the cloud. data-key lets tokens glide to
//  their new places when the equation changes (FLIP animation).
// =====================================================================
const IMG = 'assets/img/';
const symHTML = (s) => (s === '÷' ? '<span class="dv"></span>' : s);
const labelHTML = (op) => symHTML(op.sym) + op.n;
const cageHTML = () => `<span class="tk cage" data-key="x"><img class="cg" src="${IMG}cage_x.webp" alt="${T('altX')}" draggable="false"></span>`;
const tk = (cls, key, inner) => `<span class="tk ${cls}" data-key="${key}">${inner}</span>`;
function numHTML(fr) {
  const neg = fr.n < 0, a = Math.abs(fr.n);
  if (fr.d === 1) return (neg ? '−' : '') + a;
  return (neg ? '<span class="ng">−</span>' : '') + `<span class="frac"><span class="fn">${a}</span><span class="fb"></span><span class="fd">${fr.d}</span></span>`;
}
function sideHTML(layers) {
  let html = cageHTML(), kind = 'x';
  layers.forEach((L, i) => {
    if (L.t === 'add') {
      html += tk('op', `a${i}o`, L.v.n < 0 ? '−' : '+') + tk('num', `a${i}n`, numHTML(L.v.abs()));
      kind = 'sum';
      return;
    }
    const p = L.v.n, q = L.v.d;
    const wrapped = kind === 'sum' ? tk('paren', `p${i}l`, '(') + html + tk('paren', `p${i}r`, ')') : html;
    let numer;
    if (p === 1) numer = q !== 1 && kind === 'sum' ? html : wrapped;
    else numer = tk('num', `m${i}`, (p < 0 ? '−' : '') + (Math.abs(p) === 1 ? '' : Math.abs(p))) + wrapped;
    if (q === 1) { html = numer; kind = 'prod'; }
    else { html = `<span class="tk frac" data-key="f${i}"><span class="fn">${numer}</span><span class="fb"></span><span class="fd">${q}</span></span>`; kind = 'frac'; }
  });
  return { html, kind };
}
const eqHTML = (eq) => sideHTML(eq.layers).html + tk('op eqs', 'eq', '=') + tk('num', 'rhs', numHTML(eq.rhs));
function impactHTML(eq, op, color) {
  const S = sideHTML(eq.layers);
  const inc = (k) => `<span class="tk inc hid" data-key="${k}" style="--tok:${color}"><span class="op">${symHTML(op.sym)}</span>${op.n}</span>`;
  const left = op.layer.t === 'mul' && S.kind !== 'x' ? tk('paren', 'ipl', '(') + S.html + tk('paren', 'ipr', ')') : S.html;
  return left + inc('inL') + tk('op eqs', 'eq', '=') + tk('num', 'rhs', numHTML(eq.rhs)) + inc('inR');
}
const msgHTML = (a, b) => `<div class="tk msg" data-key="msg"><span class="m1">${a}</span><span class="m2">${b}</span></div>`;

// =====================================================================
//  MOTION: every animation's timing in one place (claude/skills/animation_skill.md)
//  • GSAP, bundled locally (libs/gsap.min.js). The game loop runs on gsap.ticker:
//    requestAnimationFrame underneath, time-based (deltaTime), never setInterval.
//  • Only transform + opacity move. Ease-out to enter, ease-in to leave, back.out
//    for playful pops. UI feedback 150–300 ms, concept reveals 400–800 ms.
//  • Each shot (and its outcome) is ONE GSAP timeline, with a Skip button that
//    jumps it to the end, silently (tl.progress(1)).
//  • prefers-reduced-motion: motion lands at once (pauses for reading stay);
//    no shake, particles, idle loops or camera drift.
// =====================================================================
const Clock = { t: 0, paused: false };
const Motion = {
  DUR: { INSTANT: 0.08, FAST: 0.18, NORMAL: 0.3, SLOW: 0.45, REVEAL: 0.7 },
  EASE: { OUT: 'power2.out', IN: 'power2.in', INOUT: 'power2.inOut', POP: 'back.out(1.25)' },
  STAGGER: 0.1,
  // THE LESSON'S PACE (seconds). On 19 Nov 2026 the user asked for slower, smoother motion "so that I can
  // understand easily": each idea in a shot is its own beat, played at the slow end of the concept-reveal
  // range (0.6–0.8 s), with a pause to read between beats. No freeze-frames (they read as lag), gentle eases,
  // no fast spins. Scene moves (a cloud sailing in or away) may take up to 1 s. Tune the whole game here.
  BEAT: {
    AIM: 0.5,        // a shot: the socket glows and the camera leans in on the cannon
    LOAD: 0.5,       //   the ball drops into the barrel while the cannon squats (anticipation)
    FLIGHT: 0.8,     //   cannon → cloud
    SPLIT: 0.8,      //   the hit term splits into two copies that fly to BOTH sides of the equation
    READ: 1.5,       //   time to read "x + 5 − 5 = 7 − 5"
    PAIR: 0.75,      //   the terms that cancel light up together…
    CANCEL: 0.7,     //   …and fade away
    SETTLE: 0.8,     //   the simplified equation glides together
    READ2: 1.4,      //   time to read the simplified equation
    UNLOCK: 1.2,     // freed: the cage glows, then the lock clicks
    HOLD: 4.5,       //   "x = 2" rests on the card
    HOP: 0.7,        //   x hops up…
    POOF: 0.55,      //   …and vanishes in sparkles
    CLEAR: 0.9,      //   the cloud clears away
    BREATH: 0.6,     //   a breath before the next question
    RATTLE: 1.3,     // stuck: the cage rattles, the cloud wobbles
    LEAVE: 1.0,      //   the cloud sails away
    CLOUD_IN: 1.0,   // a new question's cloud sails in
    BALLS_OUT: 0.45, // the tray's balls shrink away…
    BALL_DROP: 0.8,  //   …and the new ones drop in, one after another
    BALL_GAP: 0.1,
    TAP_FLY: 0.75,   // a tapped ball flies into its socket (or back to the tray)
    MORPH: 0.75,     // the cannon changes to 1 or 2 sockets
  },
  reduced: false, skipping: false, live: new Set(),
  init() {
    let mq = null;
    try { mq = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { /* (old browser) */ }
    const set = () => { this.reduced = !!(mq && mq.matches); };
    set();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', set); else if (mq.addListener) mq.addListener(set); }
    gsap.ticker.lagSmoothing(500, 33);
  },
  d(s) { return this.reduced || this.skipping ? 0 : s; }, // a motion's length (a pause for reading uses wait(), which stays)
  still() { return this.reduced || this.skipping; },
  track(tw) { this.live.add(tw); return tw; },
  // jump a concept timeline to its end: running tweens finish first, then the timeline, all silent
  skip(tl) {
    this.skipping = true;
    try {
      for (const tw of [...this.live]) tw.progress(1);
      if (tl) tl.progress(1);
    } finally { this.skipping = false; }
    FX.parts = [];
  },
  killAll() { for (const tw of this.live) tw.kill(); this.live.clear(); },
  // ---- UI helpers (GSAP; will-change only while moving) ----
  to(el, vars) {
    el.style.willChange = 'transform,opacity';
    const done = vars.onComplete;
    return gsap.to(el, { ...vars, duration: this.d(vars.duration ?? this.DUR.NORMAL), onComplete() { el.style.willChange = ''; if (done) done(); } });
  },
  enter(el, vars = {}) { gsap.killTweensOf(el); gsap.set(el, { opacity: 0, y: 8 }); return this.to(el, { opacity: 1, y: 0, duration: this.DUR.NORMAL, ease: this.EASE.OUT, ...vars }); },
  exit(el, vars = {}) { gsap.killTweensOf(el); return this.to(el, { opacity: 0, y: -6, duration: this.DUR.FAST, ease: this.EASE.IN, ...vars }); },
};

// A GSAP tween that drives onUpdate(easedProgress, progress). With a timeline it is placed in it
// (at `pos`); otherwise it runs at once. `ease` is one of Ease (core).
function drive(dur, onUpdate, ease = Ease.inOutCubic, tl = null, pos) {
  const p = { k: 0 };
  let last = -1;
  const step = () => { if (p.k !== last) { last = p.k; onUpdate(ease(p.k), p.k); } };
  const vars = { k: 1, duration: Motion.d(dur), ease: 'none', immediateRender: false, onUpdate: step, onComplete: () => { p.k = 1; step(); } };
  return tl ? tl.to(p, vars, pos) : gsap.to(p, vars);
}
// The same as a promise (it freezes while paused: gsap.globalTimeline pauses).
function tween(dur, onUpdate, ease = Ease.inOutCubic, delay = 0) {
  return new Promise((res) => {
    const d = Motion.d(dur), dl = Motion.d(delay);
    if (!d && !dl) { onUpdate(ease(1), 1); res(); return; }
    const p = { k: 0 };
    const tw = gsap.to(p, { k: 1, duration: Math.max(d, 1e-4), delay: dl, ease: 'none',
      onUpdate: () => onUpdate(ease(p.k), p.k),
      onComplete: () => { Motion.live.delete(tw); res(); } });
    Motion.track(tw);
  });
}
// A pause (for reading, or for a voice line): it stays under reduced motion, and ends at once when skipping.
const wait = (s) => new Promise((res) => {
  if (Motion.skipping || s <= 0) { res(); return; }
  const tw = gsap.to({}, { duration: s, onComplete: () => { Motion.live.delete(tw); res(); } });
  Motion.track(tw);
});

// =====================================================================
//  GAME FEEL (docs/GAME_PROMPT.md §8): springs, smooth noise, hit-stop / slow-mo.
//  All time-based, so they look the same at 60 Hz and 120 Hz. Under Skip or
//  reduced motion none of them run.
// =====================================================================
// A damped spring, sub-stepped so it stays stable at any frame rate. kick(a) pushes it so its first swing peaks
// at about a; set(x) displaces it. Used for the recoil kick, zoom punch and squash-and-stretch.
class Spring {
  constructor(freq, damp) {
    this.w = 2 * Math.PI * freq; this.zeta = damp; this.x = 0; this.v = 0;
    const wd = this.w * Math.sqrt(1 - damp * damp), tp = Math.atan2(wd, damp * this.w) / wd;
    this.kf = wd / (Math.exp(-damp * this.w * tp) * Math.sin(wd * tp));
  }
  kick(a) { if (!Motion.still()) this.v += a * this.kf; }
  set(x) { if (!Motion.still()) { this.x = x; this.v = 0; } }
  reset() { this.x = 0; this.v = 0; }
  update(dt) {
    if (this.x === 0 && this.v === 0) return 0;
    const n = Math.ceil(dt / 0.004) || 1, h = dt / n, w2 = this.w * this.w, c = 2 * this.zeta * this.w;
    for (let i = 0; i < n; i++) { this.v += (-w2 * this.x - c * this.v) * h; this.x += this.v * h; }
    if (Math.abs(this.x) < 1e-4 && Math.abs(this.v) < 1e-3) { this.x = 0; this.v = 0; }
    return this.x;
  }
}
// 1D value noise in −1…1, smooth (no per-frame random jitter, no repeating sine pattern)
const Noise = (() => {
  const v = new Float32Array(256);
  for (let i = 0; i < 256; i++) v[i] = Math.random() * 2 - 1;
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = v[i & 255]; return a + (v[(i + 1) & 255] - a) * u; };
})();
// Hit-stop and slow-mo scale GAME time (GSAP + the game loop). They run on real time, and never touch audio.
const TimeFx = {
  stop: 0, slowT: 0, slowDur: 0, slowMin: 1, scale: 1,
  hitStop(s) { if (!Motion.still()) this.stop = Math.max(this.stop, s); },
  slowMo(min, dur) { if (!Motion.still()) { this.slowMin = min; this.slowDur = dur; this.slowT = 0; } }, // starts after any hit-stop
  reset() { this.stop = 0; this.slowDur = 0; this.scale = 1; },
  update(rdt) {
    if (this.stop > 0) { this.stop -= rdt; this.scale = 0.02; return; }
    if (this.slowDur > 0) {
      this.slowT += rdt;
      const k = Math.min(1, this.slowT / this.slowDur);
      this.scale = this.slowMin + (1 - this.slowMin) * k * k; // eases back to full speed
      if (k >= 1) this.slowDur = 0;
      return;
    }
    this.scale = 1;
  },
};
// Adaptive quality (§9.4): tier 2 = full, tier 1 = half the particles, no rotational shake, dim-only spotlight.
// Starts low on weak devices; steps down if frames stay slow, but only between shots, never mid-shot.
const Perf = {
  tier: 2, ema: 16.7, slowFor: 0, wantDown: false, since: 0,
  init() {
    const hc = navigator.hardwareConcurrency || 8, dm = navigator.deviceMemory || 8;
    if (hc <= 4 || dm <= 3) this.tier = 1;
    this.apply();
  },
  sample(ms, rdt) {
    this.since += rdt;
    if (this.tier === 1 || this.since < 3) return; // (the first seconds decode images and audio)
    this.ema += (Math.min(ms, 100) - this.ema) * 0.05;
    this.slowFor = this.ema > 21 ? this.slowFor + rdt : 0;
    if (this.slowFor > 1.5) this.wantDown = true;
  },
  step() { if (this.wantDown && this.tier > 1) { this.tier = 1; this.wantDown = false; this.apply(); } },
  apply() {
    const lo = this.tier === 1;
    FX.q = lo ? 0.5 : 1; FX.cap = lo ? 250 : 500; FX.setDpr(lo ? 1.5 : 2);
    document.body.classList.toggle('lowfx', lo);
  },
};

// ---------- the Skip button (top-right): shown while a tutorial or a shot is playing ----------
const Skip = {
  el: null, fn: null, on: false,
  init() {
    this.el = $('#skipBtn');
    this.el.addEventListener('click', () => {
      if (!this.on || G.paused) return;
      Sound.click();
      const f = this.fn; this.hide(); if (f) f();
    });
  },
  show(fn) {
    this.fn = fn;
    if (this.on) return;
    this.on = true; this.el.classList.add('on');
    Motion.enter(this.el, { duration: Motion.DUR.NORMAL });
  },
  hide() {
    this.fn = null;
    if (!this.on) return;
    this.on = false; this.el.classList.remove('on');
    Motion.exit(this.el);
  },
};
// generated by build.sh (tools/vo_data.mjs) from tools/vo_takes.json: the lines voiced by a real person's recording
const VO_FILES = []; // keys with a clip in assets/VO/en/ (the other lines are not voiced)
const VO_WORDS = {}; // when each word of a clip starts (s from the clip's start), for the board

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

// =====================================================================
//  STAGE — fixed 1672×941 art-space scaled to the screen, a 2D camera
//  (zoom / pan / shake), particles, and the scene sprites.
// =====================================================================
const DW = 1672, DH = 941, CX = DW / 2, CY = DH / 2;
// (measured on the art cut from the user's UI sheet art/sprite_sheets/ui_elements.png by tools/cut_ui_elements.py:
// the wooden cannon with leaves, its FIRE pill a dark recess where the game's FIRE button sits; cannon 2 is the same
// cannon with two smaller sockets, on the same canvas)
const CANNON = { x: 836, bottom: 762, h: 360, src: { 1: [613, 449], 2: [613, 449] },
  // centre + inner radius of each gold socket ring (the dark hole's edge): x and r as fractions of the sprite width, y of its height
  holes: { 1: [[0.5074, 0.4095, 0.1002]], 2: [[0.3921, 0.4206, 0.0782], [0.6227, 0.4206, 0.0782]] },
  // base footprint width (fraction of the sprite); the wooden base has no light strips
  foot: { 1: { w: 0.8546, strips: [] }, 2: { w: 0.8546, strips: [] } },
  // the dark recess inside the gold FIRE bezel, in sprite px (both cannons share it): centre + size. The art's
  // cannon is not centred on its sprite, so the button is placed by this, never by the sprite's middle. FIRE's
  // picture (fire.webp, 244×101) has its pill in the middle 240×97: it is sized so the pill fills the recess exactly
  fire: { cx: 314.0, cy: 357.5, w: 240, h: 97, art: [244, 101, 240, 97] },
  // a loaded ball fills its socket edge to edge (user, 20 Nov: "fully absorb in circle, no negative space"): its
  // painted orb is this much of the hole's width. The gold ring (cannonN_front, drawn above the balls) is solid from
  // 1.003 × the hole's radius (cannon 1; 1.005 on cannon 2's smaller sockets) out to ~1.44, so at 1.015 the orb's
  // edge tucks under the ring's inner lip by about a pixel: no dark gap shows anywhere round it, and nothing of the
  // orb shows outside the ring. (The dark lining .sbk under a loaded socket now only shows while a ball drops in)
  seat: 1.015 };
const BALL_ART = 0.96; // the orb's share of its picture (ball_*.webp: the orb is ~161 of 168 px)
// tray art (wooden, metal corners; its plain middle stretched to hold 8 balls): ball spots along its floor (holesX,
// holeY), the bottom edge and the outer edges in source px; a seated ball's centre sits `seat` px below (+) / above (−) its spot
const RACK = { left: 166, top: 780, w: 1340, srcW: 1618, holesX: [212.3, 382.4, 552.5, 722.7, 892.8, 1063.0, 1233.1, 1403.2], holeY: 59.5, bot: 185.4, edges: [2, 1616], seat: 12 }; // (12: each ball rests on the trough's floor, its bottom ~16 px behind the front rail, so it sits in the tray instead of hovering on the rail)
const BALL_D = 122, MUZZLE = { x: CANNON.x, y: CANNON.bottom - CANNON.h + 14 }; // (BALL_D = the .ball size in the CSS)
// the equation cloud, far off in the sky and well clear of the cannon: Cloud.apply draws #cloud (card included) at
// CLOUD_FAR of its size, about its transform-origin (world 828, 163). Where a shot hits (on the card), and its middle
const CLOUD_FAR = 0.88, CLOUD_HIT = { x: 828, y: 174 }, CLOUD_MID = { x: 828, y: 133 };
// background layers cut from the user's deck picture (tools/cut_deck_bg.py): how much each follows the camera (1 =
// the deck, with its railing and plants, where the cannon stands; less = farther away, so it drifts less). Moved by
// transform only, when the camera moves. Each layer holds ~25 bg px of picture under the edge of the one in front
// of it, which is as far as these factors ever pull two layers apart (widest phone, camera up at the cloud): keep
// the steps between them this small, or a layer's hidden edge would show.
// (the sun moves with the sky, the birds fly between the hills and the trees, the mist / light / leaves go with the trees)
const PARALLAX = [['#bgSky', 0.62], ['#bgSun', 0.62], ['#bgMount', 0.74], ['#bgBirds', 0.8], ['#bgTrees', 0.88], ['#bgJungle', 0.88]];

// =====================================================================
//  CAMERA RIG (docs/GAME_PROMPT.md §7–8). Three parts, added every frame:
//   1. cam  = the director's target, tweened by GSAP inside the round timeline (so Skip + pause just work)
//   2. view = the real camera: follows cam with a critically damped spring, so moves that overlap or are
//      interrupted blend with continuous velocity and never pop
//   3. additive feel: trauma shake (smooth noise, amount = trauma²), a spring recoil kick, a zoom punch
//  Then a final clamp keeps the painted background covering the screen, shake and rotation included.
//  Rotation is about the screen centre. One transform write per frame, only when it changed.
// =====================================================================
// (SMOOTH: the follow's lag in seconds; a little longer = a softer camera. FREQ: the shake's speed; 15 Hz reads as a
// rounded wiggle, 24 Hz read as jitter. Both changed on 19 Nov 2026, when the user asked for smoother motion)
const CAM = { SMOOTH: 0.14, SHAKE: 22, ROT: 1.0, FREQ: 15, DECAY: 1.4, ZMIN: 1, ZMAX: 1.25 };
function smoothDamp(cur, target, vel, key, st, dt) { // (critically damped follow; Game Programming Gems 4, 1.10)
  const om = 2 / st, x = om * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel[key] + om * ch) * dt;
  vel[key] = (vel[key] - om * tmp) * ex;
  return target + (ch + tmp) * ex;
}
const Stage = {
  S: 1, ox: 0, oy: 0, W: innerWidth, H: innerHeight, tx: 0, ty: 0, z: 1, fx: CX, fy: CY, cs: 1, sn: 0, rt: 0,
  cam: { fx: CX, fy: CY, z: 1 }, view: { fx: CX, fy: CY, z: 1 }, vel: { fx: 0, fy: 0, z: 0 },
  trauma: 0, traumaX: 0, kx: new Spring(9, 0.35), ky: new Spring(9, 0.35), kz: new Spring(5, 0.55),
  bgRect: { l: 0, t: 0, w: DW, h: DH }, lastTr: '', _fx: 0, _fy: 0,
  init() {
    this.el = $('#stage'); this.top = $('#stageTop'); this.world = $('#world'); this.worldTop = $('#worldTop'); this.bg = $('#bg');
    this.layers = PARALLAX.map(([id, k]) => ({ el: $(id), k, last: '' }));
    this.resize();
  },
  // the far layers drift less than the plaza as the camera moves (and shakes), so the scene has depth
  parallax(fx, fy) {
    const kb = this.bgK || 1;
    for (const L of this.layers) {
      const tr = `translate(${(((fx - CX) * (1 - L.k)) / kb).toFixed(1)}px,${(((fy - CY) * (1 - L.k)) / kb).toFixed(1)}px)`;
      if (tr !== L.last) { L.el.style.transform = tr; L.last = tr; }
    }
  },
  resize() {
    const W = (this.W = innerWidth), H = (this.H = innerHeight);
    this.S = Math.min(W / DW, H / DH);
    this.ox = (W - DW * this.S) / 2; this.oy = (H - DH * this.S) / 2;
    this.el.style.transform = this.top.style.transform = `translate(${this.ox}px,${this.oy}px) scale(${this.S})`;
    const k = (Math.max(W / DW, H / DH) / this.S) * 1.07, bw = DW * k, bh = DH * k;
    this.bgRect = { l: (DW - bw) / 2, t: (DH - bh) / 2, w: bw, h: bh };
    this.bgK = k; this.bg.style.transform = `translate(${this.bgRect.l.toFixed(2)}px,${this.bgRect.t.toFixed(2)}px) scale(${k.toFixed(5)})`;
    FX.resize(W, H);
    this.lastTr = '';
    if (typeof Spot !== 'undefined') Spot.layout();
  },
  // a hit: trauma (shake), a recoil kick (art px; +y pushes the world down) and a zoom punch. Nothing under Skip / reduced motion.
  shake(a, xOnly = false) { if (Motion.still()) return; if (xOnly) this.traumaX = Math.min(1, this.traumaX + a); else this.trauma = Math.min(1, this.trauma + a); },
  hit({ trauma = 0, kx = 0, ky = 0, zoom = 0, xOnly = false } = {}) {
    if (Motion.still()) return;
    if (trauma) this.shake(trauma, xOnly);
    if (kx) this.kx.kick(kx); if (ky) this.ky.kick(ky); if (zoom) this.kz.kick(zoom);
  },
  // the camera lands on its target at once (Skip, restart): no glide, no shake left over
  snap() {
    const v = this.view, c = this.cam;
    v.fx = c.fx; v.fy = c.fy; v.z = c.z; this.vel.fx = this.vel.fy = this.vel.z = 0;
    this.trauma = this.traumaX = 0; this.kx.reset(); this.ky.reset(); this.kz.reset();
  },
  // the focus range that keeps the painted background covering the screen at zoom z (m = extra margin)
  clampF(fx, fy, z, m = 0) {
    const hw = this.W / this.S / z / 2 + m, hh = this.H / this.S / z / 2 + m, b = this.bgRect;
    this._fx = b.w > hw * 2 ? clamp(fx, b.l + hw, b.l + b.w - hw) : b.l + b.w / 2;
    this._fy = b.h > hh * 2 ? clamp(fy, b.t + hh, b.t + b.h - hh) : b.t + b.h / 2;
  },
  update(rdt) { // real time: the camera keeps its pace through hit-stop and slow-mo
    const c = this.cam, v = this.view, vl = this.vel;
    c.z = clamp(c.z, CAM.ZMIN, CAM.ZMAX);
    this.clampF(c.fx, c.fy, c.z); c.fx = this._fx; c.fy = this._fy; // a target it can reach (no dead time on the way back)
    if (Motion.reduced || rdt <= 0) { v.fx = c.fx; v.fy = c.fy; v.z = c.z; }
    else {
      v.fx = smoothDamp(v.fx, c.fx, vl, 'fx', CAM.SMOOTH, rdt);
      v.fy = smoothDamp(v.fy, c.fy, vl, 'fy', CAM.SMOOTH, rdt);
      v.z = smoothDamp(v.z, c.z, vl, 'z', CAM.SMOOTH, rdt);
    }
    this.rt += rdt;
    this.trauma = Math.max(0, this.trauma - rdt * CAM.DECAY); this.traumaX = Math.max(0, this.traumaX - rdt * CAM.DECAY);
    const kx = this.kx.update(rdt), ky = this.ky.update(rdt), kz = this.kz.update(rdt);
    const a = this.trauma * this.trauma, ax = this.traumaX * this.traumaX, t = this.rt;
    const shx = a + ax ? CAM.SHAKE * (a + ax) * Noise(t * CAM.FREQ + 11.3) : 0;
    const shy = a ? CAM.SHAKE * a * Noise(t * CAM.FREQ + 97.1) : 0;
    const rot = a && Perf.tier > 1 ? ((CAM.ROT * Math.PI) / 180) * a * Noise(t * 18 + 173.7) : 0; // radians
    const z = Math.max(1, v.z + kz);
    // shake + kick move the world on screen = the focus moves the other way; then the final clamp
    // (with a margin for the rotation's corners) so the background edge never shows
    this.clampF(v.fx - (shx + kx) / z, v.fy - (shy + ky) / z, z, rot ? (this.W / this.S + this.H / this.S) / z / 2 * Math.abs(rot) : 0);
    const fx = (this.fx = this._fx), fy = (this.fy = this._fy);
    const cs = (this.cs = Math.cos(rot)), sn = (this.sn = Math.sin(rot));
    this.z = z; this.tx = CX - fx * z; this.ty = CY - fy * z;
    const A = z * cs, B = z * sn;
    const tr = `matrix(${A.toFixed(5)},${B.toFixed(5)},${(-B).toFixed(5)},${A.toFixed(5)},${(CX - A * fx + B * fy).toFixed(2)},${(CY - B * fx - A * fy).toFixed(2)})`;
    if (tr !== this.lastTr) { this.world.style.transform = this.worldTop.style.transform = tr; this.lastTr = tr; this.parallax(fx, fy); }
  },
  // art-space → stage units / screen px, and back (rotation included)
  w2st(x, y) { const dx = (x - this.fx) * this.z, dy = (y - this.fy) * this.z; return { x: CX + dx * this.cs - dy * this.sn, y: CY + dx * this.sn + dy * this.cs }; },
  w2s(x, y) { const p = this.w2st(x, y); return { x: this.ox + this.S * p.x, y: this.oy + this.S * p.y }; },
  s2w(sx, sy) {
    const X = (sx - this.ox) / this.S - CX, Y = (sy - this.oy) / this.S - CY;
    return { x: this.fx + (X * this.cs + Y * this.sn) / this.z, y: this.fy + (-X * this.sn + Y * this.cs) / this.z };
  },
  camTo(o, dur = 0.8, ease = Ease.inOutCubic) {
    const c = this.cam, from = { ...c };
    return tween(dur, (e) => { for (const k in o) c[k] = lerp(from[k], o[k], e); }, ease);
  },
};
// the same camera move, placed in a timeline (it starts from wherever the camera is when its turn comes).
// o can be a function, read when the move starts (for targets measured on screen, like the cage).
function camDrive(tl, pos, o, dur = 0.8, ease = Ease.inOutCubic) {
  const c = Stage.cam; let from = null, to = null;
  drive(dur, (e) => {
    if (!from) { from = { ...c }; to = typeof o === 'function' ? o() : o; }
    for (const k in to) c[k] = lerp(from[k], to[k], e);
  }, ease, tl, pos);
}

// ---------- particles on a screen-space canvas (positions live in art-space) ----------
// Quality-scaled counts (Perf: q, cap), no per-frame allocation (in-place compaction), nothing drawn when idle.
const FX = {
  cv: null, ctx: null, dpr: 1, dprMax: 2, parts: [], dots: new Map(), uiMode: false, q: 1, cap: 500, drawn: false,
  init() { this.cv = $('#fx'); this.ctx = this.cv.getContext('2d'); },
  resize(W, H) { this.dpr = Math.min(devicePixelRatio || 1, this.dprMax); this.cv.width = W * this.dpr; this.cv.height = H * this.dpr; this.drawn = true; },
  setDpr(m) { if (m === this.dprMax) return; this.dprMax = m; if (this.cv) this.resize(Stage.W, Stage.H); },
  n(k) { return Math.max(1, Math.round(k * this.q)); }, // a count, scaled for the quality tier
  dot(color) {
    let c = this.dots.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const h = color.replace('#', ''), rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.dots.set(color, c); return c;
  },
  add(p) { if (Motion.still()) return; p.ui = this.uiMode; if (this.parts.length < this.cap) this.parts.push(p); }, // reduced motion / a skip: no particles
  // o.dir + o.spread (radians) aim the burst (canvas y is down, so −π/2 is straight up); by default it goes all round
  burst(x, y, color, n = 30, speed = 420, o = {}) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rr(-o.spread, o.spread) : Math.random() * Math.PI * 2, v = speed * rr(0.3, 1);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g ?? 500, drag: 2.2, life: rr(0.5, 0.95), max: 0.95, size: rr(14, 30) * (o.size || 1), color: Math.random() < 0.35 ? '#ffffff' : color });
    }
  },
  trail(x, y, color) { this.add({ k: 'spark', x: x + rr(-6, 6), y: y + rr(-6, 6), vx: rr(-40, 40), vy: rr(-40, 40), g: 0, drag: 2, life: 0.45, max: 0.45, size: rr(18, 30), color }); },
  smoke(x, y, n = 10, spread = 120) {
    n = this.n(n);
    for (let i = 0; i < n; i++) this.add({ k: 'smoke', x: x + rr(-20, 20), y: y + rr(-10, 10), vx: rr(-spread, spread), vy: rr(-200, -60), g: -40, drag: 2.4, life: rr(0.8, 1.3), max: 1.3, size: rr(40, 70), grow: rr(1.5, 2.4) });
  },
  dust(x, y, dir = 0, n = 8) { // sand kicked up along the ground
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const d = dir || (Math.random() < 0.5 ? -1 : 1);
      this.add({ k: 'smoke', a: 0.42, col: pick(['#ead5b0', '#f5e8cf', '#dcc39a']), x: x + d * rr(0, 24), y: y + rr(-8, 2), vx: d * rr(90, 300), vy: rr(-80, -15), g: 90, drag: 2.8, life: rr(0.45, 0.85), max: 0.85, size: rr(16, 30), grow: rr(1.0, 1.5) });
    }
  },
  puffs(x, y, w, n = 16) { n = this.n(n); for (let i = 0; i < n; i++) this.add({ k: 'smoke', x: x + rr(-w / 2, w / 2), y: y + rr(-60, 60), vx: rr(-160, 160), vy: rr(-120, 40), g: 0, drag: 1.6, life: rr(0.7, 1.1), max: 1.1, size: rr(60, 110), grow: 1.6 }); },
  confetti(x, y, n = 140, power = 900) {
    const cols = ['#ff4f8b', '#ffd23f', '#36d97a', '#22d3ee', '#9b5cff', '#ff9f1c', '#ffffff', '#3b82f6'];
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rr(-1.1, 1.1), v = power * rr(0.4, 1);
      this.add({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 1.4, life: rr(2.2, 3.4), max: 3.4, w: rr(10, 18), h: rr(16, 28), rot: rr(0, 6), vr: rr(-12, 12), flip: rr(0, 6), color: pick(cols) });
    }
  },
  flash(x, y, size = 260, life = 0.28) { this.add({ k: 'flash', x, y, life, max: life, size }); },
  // a soft, even smoke puff (not white-hot in the middle like dot()), cached per colour
  puffTex(color) {
    const key = 'p' + color; let c = this.dots.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'), gr = g.createRadialGradient(48, 40, 0, 48, 48, 48);
    const h = color.replace('#', ''), rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.58, `rgba(${rgb},.96)`); gr.addColorStop(0.8, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    // a soft shade on the lower side, so each puff reads as a round billow (light from above)
    const sh = g.createRadialGradient(48, 70, 0, 48, 70, 40); sh.addColorStop(0, 'rgba(60,50,45,.22)'); sh.addColorStop(1, 'rgba(60,50,45,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96); g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, 96, 96);
    this.dots.set(key, c); return c;
  },
  // a real-looking cannon blast at (x, y), aimed along `dir` (radians; −π/2 = straight up), p = power:
  // a white-hot flash, a fireball that blooms and cools from yellow to red, a shock ring, hot embers that
  // fall, and thick grey-white smoke that billows out, rolls sideways, then rises and drifts away on the breeze
  blast(x, y, dir = -Math.PI / 2, p = 1) {
    const cx = Math.cos(dir), cy = Math.sin(dir), px = -cy, py = cx; // along the barrel, and across it
    this.add({ k: 'flash', x: x + cx * 16, y: y + cy * 16, life: 0.07, max: 0.07, size: 70 * p, col: '#ffffff' });
    this.flash(x + cx * 30, y + cy * 30, 120 * p, 0.14);
    this.ring(x + cx * 10, y + cy * 10, '#fff6dc', 130 * p);
    let n = this.n(28 * p);
    for (let i = 0; i < n; i++) { // smoke: a column out of the barrel + a ring that rolls out sideways
      const ring = i % 3 !== 0, side = Math.random() < 0.5 ? -1 : 1;
      const v = ring ? rr(170, 380) * p : rr(260, 560) * p;
      const vx = ring ? (px * side + cx * 0.35) * v : cx * v + px * rr(-70, 70), vy = ring ? (py * side + cy * 0.35) * v : cy * v + py * rr(-70, 70);
      const shade = Math.random();
      this.add({ k: 'puff', x: x + cx * rr(6, 36), y: y + cy * rr(6, 36), vx, vy, g: -36, wind: rr(16, 36), drag: rr(3.2, 4.4), life: rr(1.6, 2.6), max: 2.6, size: rr(22, 40) * (0.75 + 0.25 * p), grow: rr(1.6, 2.6), a: rr(0.7, 0.92), col: shade < 0.35 ? '#8f8981' : shade < 0.75 ? '#bdb7ae' : '#e6e2db' });
    }
    n = this.n(14 * p);
    for (let i = 0; i < n; i++) { // the fireball: hot core along the barrel, licks to the sides; it cools from yellow to red inside the smoke
      const a = dir + rr(-0.6, 0.6), v = rr(160, 600) * p;
      this.add({ k: 'fire', x: x + rr(-8, 8), y: y + rr(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: -60, drag: 7, life: rr(0.18, 0.36), max: 0.36, size: rr(26, 46) * p, grow: rr(0.7, 1.4) });
    }
    n = this.n(16 * p);
    for (let i = 0; i < n; i++) { // embers: fast, bright, they arc and fall
      const a = dir + rr(-0.8, 0.8), v = rr(320, 900) * p;
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 2.6, life: rr(0.35, 0.8), max: 0.8, size: rr(7, 14), color: pick(['#ffd34d', '#ffb02e', '#ff7a1a', '#fff1b0']) });
    }
  },
  ring(x, y, color = '#ffffff', size = 200) { this.add({ k: 'ring', x, y, life: 0.5, max: 0.5, size, color }); },
  update(dt) {
    const ps = this.parts; let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.vx !== undefined) {
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy = p.vy * d + (p.g || 0) * dt; p.x += (p.vx + (p.wind || 0)) * dt; p.y += p.vy * dt;
        if (p.k === 'conf') { p.rot += p.vr * dt; p.flip += dt * 9; if (p.vy > 260) p.vy = 260; p.x += Math.sin(p.flip * 0.5) * 30 * dt; }
      }
      ps[w++] = p;
    }
    ps.length = w;
  },
  draw() {
    const c = this.ctx, d = this.dpr, ps = this.parts;
    if (!ps.length) { if (this.drawn) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); this.drawn = false; } return; }
    this.drawn = true;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    // the camera's mapping, once per frame (rotation included): screen = E + [A −B; B A]·(p − f)
    const S = Stage.S, z = Stage.z || 1, A = S * z * Stage.cs, B = S * z * Stage.sn, ex = Stage.ox + S * CX, ey = Stage.oy + S * CY, ffx = Stage.fx, ffy = Stage.fy, scW = S * z;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      let sx, sy;
      if (p.ui) { sx = Stage.ox + S * p.x; sy = Stage.oy + S * p.y; } else { const dx = p.x - ffx, dy = p.y - ffy; sx = ex + A * dx - B * dy; sy = ey + B * dx + A * dy; }
      const k = p.life / p.max, X = sx * d, Y = sy * d, sc = p.ui ? S : scW;
      if (p.k === 'spark') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, k * 2);
        const r = p.size * sc * d * (0.4 + 0.6 * k);
        c.drawImage(this.dot(p.color), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'smoke') {
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, k * 1.6) * (p.a ?? 0.55);
        const r = p.size * sc * d * (1 + (1 - k) * p.grow);
        c.drawImage(this.dot(p.col || '#ffffff'), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'conf') {
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, k * 2);
        c.save(); c.translate(X, Y); c.rotate(p.rot); c.scale(1, Math.cos(p.flip));
        c.fillStyle = p.color; c.fillRect(-p.w * sc * d / 2, -p.h * sc * d / 2, p.w * sc * d, p.h * sc * d); c.restore();
      } else if (p.k === 'puff') { // smoke: fades in fast, swells, thins out as it drifts
        c.globalCompositeOperation = 'source-over';
        const age = 1 - k; c.globalAlpha = p.a * Math.min(1, age * 12) * Math.min(1, k * 1.8);
        const r = p.size * sc * d * (1 + Math.sqrt(age) * p.grow);
        c.drawImage(this.puffTex(p.col), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'fire') { // the fireball: white-yellow → orange → red as it cools (painted, so it stays orange on a bright sky)
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, k * 1.5);
        const r = p.size * sc * d * (1 + (1 - k) * p.grow);
        c.drawImage(this.puffTex(k > 0.72 ? '#fff0a8' : k > 0.45 ? '#ffb22e' : k > 0.22 ? '#ff6a1c' : '#c9401a'), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'flash') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
        const r = p.size * sc * d * (1.4 - k * 0.6);
        c.drawImage(this.dot(p.col || '#ffd27a'), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'ring') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
        c.strokeStyle = p.color; c.lineWidth = 10 * sc * d * k;
        c.beginPath(); c.arc(X, Y, p.size * sc * d * (1 - k * 0.8), 0, Math.PI * 2); c.stroke();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
};

// ---------- the equation cloud ----------
const Cloud = {
  el: null, x: 0, y: 0, s: 1, a: 1, blur: 0, rot: 0, sq: new Spring(5, 0.32),
  init() { this.el = $('#cloud'); },
  squash() { this.sq.kick(1); }, // a ball hits it: wide-and-flat, then it springs back
  apply(t, dt = 0) {
    // a calm, far-off drift: a slow rise and fall (~11 s) and a slower sideways sway (~23 s); still with reduced motion
    const calm = !Motion.reduced, by = calm ? Math.sin(t * 0.55) * 4 : 0, bx = calm ? Math.sin(t * 0.27 + 1) * 5 : 0, q = this.sq.update(dt);
    const s = this.s * CLOUD_FAR, sx = s * (1 + 0.05 * q), sy = s * (1 - 0.05 * q);
    const tr = `translate(${(this.x + bx).toFixed(1)}px,${(this.y + by).toFixed(1)}px) rotate(${this.rot.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`, op = this.a.toFixed(3);
    if (tr !== this.lastTr) { this.el.style.transform = tr; this.lastTr = tr; }
    if (op !== this.lastOp) { this.el.style.opacity = op; this.lastOp = op; }
  },
  // a new question arrives: the cloud sails in with its card (ease-out, a soft settle), then the card's tab drops on
  async enter(fromX = 1250) {
    Object.assign(this, { x: fromX, y: -40, s: 1, a: 1, blur: 0, rot: 0 });
    QCard.hide();
    Sound.swoosh();
    await tween(Motion.BEAT.CLOUD_IN, (e) => { this.x = lerp(fromX, 0, e); this.y = lerp(-40, 0, e); }, Ease.outBackSoft);
    QCard.pop();
  },
  // in a round's timeline: floats away (ease-in), dissolves (ease-in), or wobbles
  leaveTL(tl, pos, toX = -1250) {
    let x0 = 0;
    tl.call(() => { x0 = this.x; Sound.swoosh(); }, null, pos);
    drive(Motion.BEAT.LEAVE, (e) => { this.x = lerp(x0, toX, e); this.y = -60 * e; this.rot = -5 * e; }, Ease.inQuad, tl, pos);
  },
  clearTL(tl, pos) {
    tl.call(() => FX.puffs(CLOUD_MID.x, CLOUD_MID.y, 560 * CLOUD_FAR, 26), null, pos);
    drive(Motion.BEAT.CLEAR, (e) => { this.s = 1 + 0.18 * e; this.a = 1 - e; this.y = -30 * e; }, Ease.inQuad, tl, pos);
  },
  // "not yet": a slow rock that dies away (2 swings, not 3 quick ones)
  wobbleTL(tl, pos) { drive(Motion.BEAT.RATTLE, (e, k) => { this.rot = Math.sin(k * Math.PI * 4) * 3 * (1 - k); this.s = 1 + Math.sin(k * Math.PI * 6) * 0.02 * (1 - k); }, Ease.linear, tl, pos); },
};

// ---------- ground contact helpers: a 'shadow' group multiplies onto the plaza, a 'light' group screens ----------
function groundGroup(parent, kind, x, y, before = null) {
  const g = document.createElement('div'); g.className = 'gsh ' + kind;
  Object.assign(g.style, { left: x + 'px', top: y + 'px' }); parent.insertBefore(g, before); return g;
}
function groundBlob(g, cls, cx, cy, w, h) {
  const i = document.createElement('i'); i.className = cls;
  Object.assign(i.style, { left: cx - w / 2 + 'px', top: cy - h / 2 + 'px', width: w + 'px', height: h + 'px' });
  g.appendChild(i); return i;
}

// ---------- cannon (1 or 2 sockets from the art), FIRE button ----------
const Cannon = {
  n: 1, el: null, c1: null, c2: null, fire: null, sock: [], tags: [], recoil: 0, morphS: 1, kickY: 0, kickS: 1, active: false, pressT: 0,
  antic: 0, jig: new Spring(4, 0.28), live: 0, promoted: false, lastTr: '',
  init() {
    this.el = $('#cannon'); this.el.style.transformOrigin = `${CANNON.x}px ${CANNON.bottom}px`;
    this.c1 = $('#c1'); this.c2 = $('#c2'); this.fire = $('#fireBtn');
    this.front = $('#cannonFront'); this.front.style.transformOrigin = this.el.style.transformOrigin; this.c1f = $('#c1f'); this.c2f = $('#c2f');
    for (const id of ['#cannonBody', '#cannonFrontBody']) Object.assign($(id).style, { left: CANNON.x + 'px', top: CANNON.bottom + 'px' });
    this.c1.style.height = this.c2.style.height = this.c1f.style.height = this.c2f.style.height = CANNON.h + 'px';
    // FIRE fills the recess in the cannon's gold bezel, centred on it (pressed, it sinks into the dark recess)
    const F = CANNON.fire, [sw, sh] = CANNON.src[1], sc = CANNON.h / sh, [aw, ah, pw, ph] = F.art;
    const fcx = CANNON.x + (F.cx - sw / 2) * sc, fcy = CANNON.bottom - CANNON.h + F.cy * sc;
    const fw = F.w * sc * (aw / pw), fh = F.h * sc * (ah / ph);
    Object.assign(this.fire.style, { left: fcx - fw / 2 + 'px', top: fcy - fh / 2 + 'px', width: fw + 'px', height: fh + 'px' });
    this.fireBox = { x: fcx, y: fcy, w: fw, h: fh };
    this.fireText = this.fire.querySelector('.ft'); this.fireFont = fh * 0.62; // the word's size, from the pill's height (about the painted word's size)
    this.fitFire();
    const gr = $('#ground');
    this.gShadow = groundGroup(gr, 'shadow', CANNON.x, CANNON.bottom); // planted on the plaza
    this.gLight = groundGroup(gr, 'light', CANNON.x, CANNON.bottom);   // cyan strips spilling onto the ground
    this.setN(1);
  },
  holes(n = this.n) {
    const [sw, sh] = CANNON.src[n], sc = CANNON.h / sh, w = sw * sc, left = CANNON.x - w / 2, top = CANNON.bottom - CANNON.h;
    return CANNON.holes[n].map(([fx, fy, fr]) => ({ x: left + fx * w, y: top + fy * CANNON.h, r: fr * w }));
  },
  // a loaded ball fills its socket, centred, its edge just under the gold ring (CANNON.seat)
  socketPos(i, n = this.n) { const h = this.holes(n)[i] || this.holes(n)[0]; return { x: h.x, y: h.y, s: (h.r * 2 * CANNON.seat) / (BALL_D * BALL_ART) }; },
  // the word on FIRE (T('btnFire')) at its size, shrunk if a longer word would run past the pill's straight middle
  fitFire() {
    const t = this.fireText; if (!t) return;
    t.style.fontSize = this.fireFont + 'px';
    const room = this.fireBox.w * 0.78, w = t.offsetWidth; // (the span is as wide as its word)
    if (w > room) t.style.fontSize = (this.fireFont * room / w).toFixed(1) + 'px';
  },
  setN(n) {
    this.n = n;
    this.fitFire(); // (each round: by now the word is in, whatever the language)
    this.c1.style.display = this.c1f.style.display = n === 1 ? '' : 'none'; this.c2.style.display = this.c2f.style.display = n === 2 ? '' : 'none';
    const fx = $('#sockFx'); fx.innerHTML = '';
    this.sock = []; this.tags = []; this.backs = [];
    this.holes(n).forEach((h, i) => {
      // the socket's dark lining, shown while a ball sits in it (the ring's inner edge, so the ring covers its rim)
      const k = document.createElement('i'); k.className = 'sbk'; const kd = h.r * 2 + 1;
      Object.assign(k.style, { left: h.x - kd / 2 + 'px', top: h.y - kd / 2 + 'px', width: kd + 'px', height: kd + 'px' });
      fx.appendChild(k); this.backs.push(k);
      const g = document.createElement('div'); g.className = 'sglow';
      const d = h.r * 2.55; Object.assign(g.style, { left: h.x - d / 2 + 'px', top: h.y - d / 2 + 'px', width: d + 'px', height: d + 'px' });
      fx.appendChild(g); this.sock.push(g);
      if (n > 1) { // the order markers sit beside the sockets, 1 on the left, 2 on the right (above them is the barrel)
        const t = document.createElement('div'); t.className = 'stag'; t.textContent = i + 1;
        Object.assign(t.style, { left: h.x + (i === 0 ? -1 : 1) * (h.r + 38) + 'px', top: h.y + 'px' }); fx.appendChild(t); this.tags.push(t);
      }
    });
    const [sw, sh] = CANNON.src[n], w = sw * CANNON.h / sh, fw = (this.footW = w * CANNON.foot[n].w);
    this.gShadow.innerHTML = ''; this.gLight.innerHTML = '';
    groundBlob(this.gShadow, 'cast', fw * 0.34, -20, fw * 1.1, fw * 0.15); // light comes from the upper-left → shade falls back-right
    groundBlob(this.gShadow, 'soft', 8, 2, fw * 1.36, fw * 0.13);          // dark core right at the front edge of the base
    groundBlob(this.gShadow, 'contact', 0, -2, fw * 1.12, 24);            // the line where the base touches the ground…
    for (const sx of [-1, 1]) groundBlob(this.gShadow, 'contact', sx * fw * 0.44, -2, fw * 0.26, 24); // …pressed in at both corners
    CANNON.foot[n].strips.forEach(([fx, fwid]) => groundBlob(this.gLight, 'glow', (fx - 0.5) * w, 8, fwid * w * 1.8, 32));
  },
  groundDust(big) {
    const fw = this.footW || 400, y = CANNON.bottom + this.kickY;
    FX.dust(CANNON.x - fw * 0.48, y, -1, big ? 7 : 4); FX.dust(CANNON.x + fw * 0.48, y, 1, big ? 7 : 4);
  },
  async morph(n) {
    if (n === this.n) return;
    Sound.whoosh(0.4);
    const M = Motion.BEAT.MORPH;
    await tween(M * 0.4, (e) => (this.morphS = 1 - 0.18 * e), Ease.inQuad);
    this.setN(n); FX.smoke(CANNON.x, CANNON.bottom - 140, 14, 260); this.groundDust(false); Sound.clunk(); Stage.hit({ trauma: 0.1, ky: 4 });
    await tween(M * 0.6, (e) => (this.morphS = 0.82 + 0.18 * e), Ease.outBackSoft);
  },
  setFireActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.fire.classList.toggle('off', !on);
    if (on) { this.fire.classList.remove('glow'); void this.fire.offsetWidth; this.fire.classList.add('glow'); Sound.ready(); }
  },
  hint() { this.fire.classList.remove('hint'); void this.fire.offsetWidth; this.fire.classList.add('hint'); },
  highlight(i, on) { if (this.sock[i]) this.sock[i].classList.toggle('on', on); },
  pulseSockets() {
    this.tags.forEach((t, i) => { t.classList.remove('pulse'); void t.offsetWidth; t.style.animationDelay = i * 0.25 + 's'; t.classList.add('pulse'); });
    this.sock.forEach((g, i) => { tween(0.9, (e, k) => (g.style.opacity = Math.sin(k * Math.PI).toFixed(2)), Ease.linear, i * 0.25).then(() => (g.style.opacity = '')); });
  },
  // the shot: anticipation (antic, tweened in the timeline) is released into a stretch that jiggles back on a
  // spring, and the base slides down for the recoil; the tray balls ripple
  shoot() { this.antic = 0; this.jig.set(1); this.recoil = Motion.still() ? 0 : 1; this.live = 2; Rack.ripple(); },
  settle() { this.antic = 0; this.jig.reset(); this.recoil = 0; }, // (Skip / restart)
  // a quick side-to-side "no" when FIRE is tapped before every socket is filled (the CSS translate property, so
  // it never fights the press / glow transforms)
  wiggleFire() {
    if (Motion.still()) return;
    const f = this.fire;
    tween(0.26, (e, k) => (f.style.translate = (Math.sin(k * Math.PI * 6) * 6 * (1 - k)).toFixed(2) + 'px 0'), Ease.linear).then(() => (f.style.translate = ''));
  },
  // its own compositor layer only while it moves (animation skill rule 7), so the recoil never repaints the plaza
  promote(on) {
    if (on === this.promoted) return;
    this.promoted = on;
    this.el.style.willChange = this.front.style.willChange = this.gShadow.style.willChange = on ? 'transform' : '';
  },
  update(dt, t = 0) {
    this.recoil = Math.max(0, this.recoil - dt * 2.6);
    const r = this.recoil, kick = r > 0.75 ? (1 - r) / 0.25 : r / 0.75;
    this.kickY = 10 * kick; this.kickS = 1 - 0.04 * kick;
    this.pressT = Math.max(0, this.pressT - dt * 5);
    const s = this.morphS, a = this.antic, j = this.jig.update(dt);
    this.sx = s * (1 + 0.04 * a) * (1 - 0.06 * j); this.sy = s * (1 - 0.07 * a) * (1 + 0.12 * j);
    this.live = a > 0 || j !== 0 || r > 0 || s !== 1 ? Math.max(this.live, 0.6) : Math.max(0, this.live - dt);
    this.promote(this.live > 0);
    const tr = `translateY(${this.kickY.toFixed(2)}px) scale(${this.sx.toFixed(4)},${this.sy.toFixed(4)})`;
    if (tr !== this.lastTr) {
      this.el.style.transform = this.front.style.transform = tr; this.lastTr = tr;
      // the shadow slides with the recoil and follows the cannon's width, so it stays glued to the ground
      const gt = `translate(0px,${this.kickY.toFixed(2)}px) scale(${(this.sx * (1 + 0.07 * kick)).toFixed(4)},${s.toFixed(4)})`;
      this.gShadow.style.transform = gt; this.gLight.style.transform = gt;
    }
    this.fire.classList.toggle('press', this.pressT > 0);
    this.gLight.style.opacity = Math.min(1, 0.72 + (Motion.reduced ? 0 : 0.2 * Math.sin(t * 2.4)) + 0.3 * kick).toFixed(3);
  },
};

// ---------- rack with 8 holders + the physical operation balls ----------
const Rack = {
  holes: [], glows: [], balls: [], enterY: 0,
  applyEnter() {
    const tr = this.enterY ? `translateY(${this.enterY.toFixed(1)}px)` : '';
    if (tr === this.lastTr) return; // only when it moves
    this.lastTr = tr;
    for (const id of ['#rack', '#rackFront', '#bshadows', '#hglows', '#rackShadow']) $(id).style.transform = tr;
  },
  init() {
    const sc = RACK.w / RACK.srcW, img = $('#rack');
    Object.assign(img.style, { left: RACK.left + 'px', top: RACK.top + 'px', width: RACK.w + 'px' });
    Object.assign($('#rackFront').style, { left: RACK.left + 'px', top: RACK.top + 'px', width: RACK.w + 'px' });
    // the tray sits on the plaza too: contact line along its bottom edge, pressed-in corners, soft + cast shade
    const rs = groundGroup($('#ground'), 'shadow', 0, 0); rs.id = 'rackShadow';
    const bot = RACK.top + RACK.bot * sc, cx = RACK.left + RACK.w / 2, edgeL = RACK.left + RACK.edges[0] * sc, edgeR = RACK.left + RACK.edges[1] * sc;
    groundBlob(rs, 'cast', cx + RACK.w * 0.08, bot - 18, RACK.w * 0.98, 64);
    groundBlob(rs, 'soft', cx + 8, bot + 2, RACK.w * 1.06, 58);
    groundBlob(rs, 'contact', cx, bot - 2, (edgeR - edgeL) * 1.04, 22);
    for (const ex of [edgeL + 14, edgeR - 14]) groundBlob(rs, 'contact', ex, bot - 4, 120, 24);
    groundBlob(rs, 'soft', RACK.left + 22, bot - 26, 150, 84);          // around the rounded teal feet
    groundBlob(rs, 'soft', RACK.left + RACK.w - 6, bot - 22, 190, 90);  // the far (cast) side a little longer
    this.holes = RACK.holesX.map((hx) => ({ x: RACK.left + hx * sc, y: RACK.top + RACK.holeY * sc }));
    const sh = $('#bshadows');
    // each spot's shading, behind its ball: a soft cast shadow on the trough's back wall (light from the upper-left, so it
    // falls right and down; it rises with the ball when the ball hops) and a dark pool where the ball meets the trough
    this.shadows = this.holes.map((h) => {
      const d = document.createElement('div'); d.className = 'bshadow';
      Object.assign(d.style, { left: h.x + 'px', top: h.y + RACK.seat + 'px' });
      d.innerHTML = '<i class="cast"></i><i class="pool"></i>';
      sh.appendChild(d); d.cast = d.firstChild; d.pool = d.lastChild; d.lift = 0; return d;
    });
    const box = $('#hglows');
    this.glows = this.holes.map((h) => { const g = document.createElement('div'); g.className = 'hglow'; Object.assign(g.style, { left: h.x + 'px', top: h.y + 'px' }); box.appendChild(g); return g; });
  },
  restPos(i) { const h = this.holes[i]; return { x: h.x, y: h.y + RACK.seat, s: 1 }; }, // seated: the bottom dips into the cup
  glowWave() {
    this.glows.forEach((g, i) => { g.classList.remove('on'); void g.offsetWidth; g.style.animationDelay = i * 0.08 + 's'; g.classList.add('on'); });
    this.balls.forEach((b, i) => { if (b.where === 'rack') tween(0.5, (e, k) => (b.hop = Math.sin(k * Math.PI)), Ease.linear, i * 0.08); });
  },
  // the cannon's blast shakes the tray: each ball hops 3–5 px in its cup, outward from the centre
  ripple() {
    if (Motion.still()) return;
    this.balls.forEach((b) => {
      if (b.where !== 'rack' || b.flight) return;
      const d = Math.abs(b.holder - 3.5);
      tween(0.26, (e, k) => (b.hop = Math.sin(k * Math.PI) * (0.145 - d * 0.012)), Ease.linear, 0.02 + d * 0.025).then(() => (b.land = Math.max(b.land, 0.4)));
    });
  },
};
function createBall(opStr, i) {
  const op = parseOp(opStr), el = document.createElement('div');
  el.className = 'ball';
  el.innerHTML = `<i class="gl"></i><img src="${IMG}ball_${i}.webp" alt="" draggable="false"><i class="ao"></i><b>${labelHTML(op)}</b>`; // gl = guide halo, ao = shade where it sinks into the cup
  $('#balls').appendChild(el);
  const r = Rack.restPos(i);
  el.style.transform = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px) scale(0.001)`; // in its cup, too small to see or tap, until the next frame places it
  const b = { op, i, hex: BALL_HEX[i], ink: BALL_INK[i], el, holder: i, where: 'rack', socket: -1, x: r.x, y: r.y, s: 1, r: 0, flight: null, hop: 0, guide: false, drop: 0, land: 0, hover: 0, hoverT: 0, scale: 1 };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); Drag.down(b, e); }); // a press that moves is a drag, one that doesn't is a tap (Drag, src/40_game.js)
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') b.hoverT = 1; });
  el.addEventListener('pointerleave', () => (b.hoverT = 0));
  return b;
}
function removeBall(b) { b.el.remove(); }
function ballHome(b) {
  if (b.where === 'socket') return Cannon.socketPos(b.socket);
  if (b.where === 'loading') { const p = Cannon.socketPos(b.socket); return { x: p.x, y: p.y + 6, s: p.s * 0.35 }; }
  return Rack.restPos(b.holder);
}
// a ball's flight: one smooth turn on a long arc (none on a short hop), eased with the flight so it lands upright,
// with nothing left to unwind (no fast spin, no spin-back after it lands)
function flyBall(b, dur = Motion.BEAT.TAP_FLY, arc = 230) {
  const turn = arc > 60 ? (Math.random() < 0.5 ? -1 : 1) * 360 : 0;
  b.flight = { fx: b.x, fy: b.y, fs: b.s, t: 0, dur, arc, r0: b.r, r1: turn };
}
function updateBalls(dt, t) {
  const seated = new Array(8).fill(false), lift = new Array(8).fill(0), full = [];
  for (const b of Rack.balls) {
    if (b.where === 'gone') { b.el.classList.add('gone'); continue; }
    const h = ballHome(b);
    b.hover = lerp(b.hover, G.inputOn && !b.drag ? b.hoverT : 0, 1 - Math.exp(-14 * dt));
    if (b.drag) {
      // in the player's hand: it follows the finger closely and leans a little into the move; near an empty socket
      // the socket draws it in and it shrinks toward the socket's size (k, mx, my and s come from Drag.aimAt)
      const d = b.drag, f = 1 - Math.exp(-32 * dt), m = 0.45 * d.k * d.k;
      const tx = lerp(d.px, d.mx, m), ty = lerp(d.py, d.my, m), vx = tx - b.x;
      b.x = lerp(b.x, tx, f); b.y = lerp(b.y, ty, f);
      b.s = lerp(b.s, d.s, 1 - Math.exp(-16 * dt));
      b.r = lerp(b.r, Motion.reduced ? 0 : clamp(vx * 0.35, -7, 7), 1 - Math.exp(-12 * dt));
      b.isSeated = false;
    } else if (b.flight) {
      const f = b.flight; f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1), e = Ease.inOutCubic(k);
      const my = Math.min(f.fy, h.y) - f.arc;
      b.x = bez(f.fx, (f.fx + h.x) / 2, h.x, e); b.y = bez(f.fy, my, h.y, e); b.s = lerp(f.fs, h.s, e);
      b.r = lerp(f.r0, f.r1, e);
      if (k >= 1) { b.flight = null; b.land = 1; b.r = 0; const cb = b.onLand; b.onLand = null; if (cb) cb(); } // (a full turn = upright)
    } else {
      const gh = b.guide && b.where === 'rack' && !Motion.reduced ? Math.abs(Math.sin(t * 3.4)) * 22 : 0;
      b.x = h.x; b.y = h.y - gh - b.hop * 34 - b.hover * 6 - b.drop;
      if (b.where === 'rack' && b.drop < 30 && b.scale > 0.5) seated[b.holder] = true;
      b.isSeated = b.where === 'rack' && b.drop < 30 && b.hop < 0.2 && !b.guide;
      b.s = h.s;
      if (b.where === 'socket') { // follow the cannon's own transform exactly, so the ball never slips off the ring
        const sx = Cannon.sx ?? 1, sy = Cannon.sy ?? 1;
        b.x = CANNON.x + (b.x - CANNON.x) * sx; b.y = CANNON.bottom + (b.y - CANNON.bottom) * sy + Cannon.kickY; b.s *= (sx + sy) / 2;
      }
      if (b.where === 'rack') { b.y += Rack.enterY; lift[b.holder] = h.y + Rack.enterY - b.y; } // (how far it is raised off the trough's floor)
      b.r *= Math.exp(-10 * dt);
    }
    // a dragged ball rode above everything (#fly); back in the tray's layer once it has landed (under the ring and
    // the tray's lip again), or at once when a shot starts drawing it into the barrel
    if (b.lifted && !b.drag && (!b.flight || b.where === 'loading')) { $('#balls').appendChild(b.el); b.lifted = false; }
    b.land = Math.max(0, b.land - dt * 3.5);
    // landing: a squash in a cup; in a socket a small swell instead, so the orb settles in without ever pulling away
    // from the ring (a squash would open a gap above and below it)
    const inSock = b.where === 'socket' && !b.flight, bump = Math.sin(b.land * Math.PI);
    const sq = inSock ? 0 : bump * 0.14, s = b.s * b.scale * (1 + b.hover * 0.06) * (inSock ? 1 + bump * 0.05 : 1);
    const tr = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) rotate(${b.r.toFixed(1)}deg) scale(${(s * (1 + sq)).toFixed(4)},${(s * (1 - sq)).toFixed(4)})`;
    const moving = tr !== b.lastTr;
    if (moving) { b.el.style.transform = tr; b.lastTr = tr; }
    b.el.classList.toggle('mv', moving);
    b.el.classList.toggle('guide', b.guide && b.where === 'rack' && !b.drag);
    b.el.classList.toggle('hov', b.hover > 0.5);
    b.el.classList.toggle('seated', !b.flight && !!b.isSeated);
    b.el.classList.toggle('insock', !b.flight && b.where === 'socket'); // (sunk into the barrel: a soft inner shade)
    if (b.where === 'socket' && (!b.flight || b.flight.t > b.flight.dur * 0.7)) full[b.socket] = true; // (lined as it arrives)
  }
  if (Rack.shadows) Rack.shadows.forEach((d, i) => {
    d.classList.toggle('on', seated[i]);
    const l = Math.max(0, Math.round(lift[i])); // a raised ball: its wall shadow rises with it, the contact pool fades
    if (l !== d.lift) { d.lift = l; d.cast.style.transform = l ? `translateY(${-l}px)` : ''; d.pool.style.opacity = Math.max(0, 1 - l / 16).toFixed(2); }
  });
  if (Cannon.backs) Cannon.backs.forEach((k, i) => k.classList.toggle('on', !!full[i]));
}

// =====================================================================
//  EQUATION UI — tokens glide (FLIP) when the equation changes
// =====================================================================
const EqUI = {
  el: null, maxW: 470, maxH: 126, // (the cloud's body below its label, with a margin: the equation always stays inside the cloud)
  init() { this.el = $('#eq'); this.el.style.transformOrigin = '50% 50%'; },
  fit() {
    this.el.style.transform = 'translate(-50%,-50%)';
    const w = this.el.offsetWidth || 1, h = this.el.offsetHeight || 1, k = Math.min(1, this.maxW / w, this.maxH / h);
    this.el.style.transform = `translate(-50%,-50%) scale(${k.toFixed(4)})`;
  },
  render(html, flip = true) {
    this.el.classList.remove('fadeout');
    const old = new Map();
    if (flip) this.el.querySelectorAll('[data-key]').forEach((e) => old.set(e.dataset.key, e.getBoundingClientRect()));
    this.el.innerHTML = html;
    this.fit();
    if (!flip || !old.size) return;
    const s = this.el.getBoundingClientRect().width / (this.el.offsetWidth || 1) || 1;
    this.el.querySelectorAll('[data-key]').forEach((e) => {
      const o = old.get(e.dataset.key); if (!o) return;
      const par = e.parentElement && e.parentElement.closest('[data-key]');
      if (par && old.has(par.dataset.key)) return;
      const n = e.getBoundingClientRect(); if (!n.width) return;
      const dx = (o.left + o.width / 2 - (n.left + n.width / 2)) / s, dy = (o.top + o.height / 2 - (n.top + n.height / 2)) / s, sc = o.width / n.width;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sc - 1) < 0.01) return;
      if (Motion.still()) return;
      e.style.willChange = 'transform';
      // terms glide from their old place to their new one (ease-in-out: a move within the card, so no overshoot)
      gsap.fromTo(e, { x: dx, y: dy, scale: sc }, { x: 0, y: 0, scale: 1, duration: Motion.BEAT.SETTLE, ease: 'power2.inOut', clearProps: 'transform', onComplete: () => (e.style.willChange = '') });
    });
  },
  setEq(eq, flip = true) { this.render(eqHTML(eq), flip); },
  cage() { return this.el.querySelector('[data-key="x"]'); },
  showImpact(eq, op, color) {
    this.render(impactHTML(eq, op, color), true);
    return [this.el.querySelector('[data-key="inL"]'), this.el.querySelector('[data-key="inR"]')];
  },
  // the next equation's terms: key → what it shows
  nextTerms(next) { const tpl = document.createElement('div'); tpl.innerHTML = eqHTML(next); return new Map([...tpl.querySelectorAll('[data-key]')].map((e) => [e.dataset.key, e.innerHTML])); },
  // the terms that are not in the next equation (the outermost of each: a bracket that goes takes its insides along)
  leaving(after) {
    const out = [];
    this.el.querySelectorAll('[data-key]').forEach((e) => {
      if (after.has(e.dataset.key) || out.some((o) => o.contains(e))) return;
      if ([...e.querySelectorAll('[data-key]')].some((c) => after.has(c.dataset.key))) return;
      out.push(e);
    });
    return out;
  },
  // simplifying, step 1: the terms that combine light up together, so the eye links them before anything moves:
  // one soft gold pill behind each side's group, "+5 −5" (they cancel) and "7 −5" (they become 2). CSS .hlg
  pair(next) {
    const after = this.nextTerms(next);
    const changed = [...this.el.querySelectorAll('[data-key]')].filter((e) => {
      const k = e.dataset.key;
      return k !== 'x' && after.has(k) && !e.querySelector('[data-key]') && after.get(k) !== e.innerHTML;
    });
    const lit = [...this.leaving(after), ...changed], eqs = this.el.querySelector('[data-key="eq"]');
    if (!lit.length || !eqs) return;
    const R = this.el.getBoundingClientRect(), s = R.width / (this.el.offsetWidth || 1) || 1, m = eqs.getBoundingClientRect(), mid = m.left + m.width / 2;
    const rects = lit.map((e) => e.getBoundingClientRect());
    for (const side of [rects.filter((r) => r.right <= mid), rects.filter((r) => r.left >= mid)]) {
      if (!side.length) continue;
      const l = Math.min(...side.map((r) => r.left)), r = Math.max(...side.map((q) => q.right));
      const t = Math.min(...side.map((q) => q.top)), b = Math.max(...side.map((q) => q.bottom));
      const pill = document.createElement('i'); pill.className = 'hlg'; // (in #eq's own units: it is drawn under the terms)
      Object.assign(pill.style, { left: (l - R.left) / s + 'px', top: (t - R.top) / s + 'px', width: (r - l) / s + 'px', height: (b - t) / s + 'px' });
      this.el.prepend(pill);
    }
  },
  // step 2: the terms that cancel fade away, and the pills with them (CSS .van / .hlg.out: transform + opacity, for Motion.BEAT.CANCEL)
  vanish(next) {
    const d = Motion.d(Motion.BEAT.CANCEL) + 's';
    this.leaving(this.nextTerms(next)).forEach((e) => { e.style.animationDuration = d; e.classList.add('van'); });
    this.el.querySelectorAll('.hlg').forEach((p) => { p.style.animationDuration = d; p.classList.add('out'); });
  },
  // step 3: the simplified equation glides into place, and the numbers that changed pop
  settle(next) {
    const html = eqHTML(next), tpl = document.createElement('div'); tpl.innerHTML = html;
    const after = new Map([...tpl.querySelectorAll('[data-key]')].map((e) => [e.dataset.key, e.innerHTML]));
    const before = new Map([...this.el.querySelectorAll('[data-key]')].map((e) => [e.dataset.key, e.innerHTML]));
    this.render(html, true);
    this.el.querySelectorAll('[data-key]').forEach((e) => {
      const k = e.dataset.key;
      if (k !== 'x' && before.has(k) && before.get(k) !== after.get(k) && !e.querySelector('[data-key]')) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
    });
  },
  worldAt(elm) { const r = elm.getBoundingClientRect(); return Stage.s2w(r.left + r.width / 2, r.top + r.height / 2); },
};

// ---------- the label on the cloud (#qTab), by key ----------
// During play the cloud has no label, only the equation (the user removed "Find the value of x" on 19 Nov). At the
// end it reads "Your score": it travels with the cloud and drops in just after the cloud lands (transform + opacity).
const QCard = {
  tab: null, key: null,
  el() { return this.tab || (this.tab = $('#qTab')); },
  label(key) { if (key === this.key) return; this.key = key; this.el().innerHTML = key ? T(key) : ''; },
  hide() { const t = this.el(); gsap.killTweensOf(t); gsap.set(t, { opacity: 0 }); },
  pop() {
    if (!this.key) return this.hide(); // no label to show
    const t = this.el(); gsap.killTweensOf(t);
    if (Motion.still()) { gsap.set(t, { opacity: 1, y: 0, scale: 1 }); return; }
    gsap.set(t, { opacity: 0, y: -14, scale: 0.86 });
    Motion.to(t, { opacity: 1, y: 0, scale: 1, duration: Motion.DUR.REVEAL, ease: Motion.EASE.POP });
  },
};

// =====================================================================
//  SPOTLIGHT: first-time tutorial focus. Everything is blurred + dimmed
//  except one target (a soft elliptical hole), or two (the −5 and the
//  socket it goes into; FIRE and the loaded socket), each with a gold
//  ring, and a little hand that shows what to do: it taps a button, or
//  carries a see-through copy of the ball into the cannon (the drag
//  lesson). Only opacity and transform move: each of the two dim layers
//  gets its holes once, and they cross-fade; a ring is sized once per
//  target and glides there by transform (FLIP), the hand following it.
// =====================================================================
// the drag lesson, one loop of P seconds (the marks are fractions of it): the hand comes to the ball (GRAB), presses
// and a see-through copy lifts out (LIFT), carries it up and over into the socket (CARRY), lets go: the copy sinks in
// and fills the hole, with a ripple (DROP), lifts away as the copy fades (AWAY), and rests until the next loop
const DEMO = { P: 3.4, GRAB: 0.12, LIFT: 0.22, CARRY: 0.6, DROP: 0.7, AWAY: 0.84 };
const GHOST_A = 0.68; // the copy's opacity: clearly a see-through hint, never a second −5
const Spot = {
  el: null, layers: [], front: 0, ring: null, ring2: null, hand: null, ghost: null, target: null, opts: {}, active: false,
  ringOn: false, ring2On: false, rs: null, rs2: null, box: { l: 0, t: 0 }, nudgeT: 0, tapped: false, dropped: false,
  lastRing: '', lastRing2: '', lastHand: '', lastHandA: '', lastGhost: '', lastGhostA: '', demoT0: 0, held: false, ghostOf: null,
  init() {
    this.el = $('#spot'); this.layers = [...this.el.querySelectorAll('.sl')];
    this.ring = $('#spotRing'); this.ring2 = $('#spotRing2'); this.hand = $('#spotHand'); this.ghost = $('#spotGhost');
    this.layout();
  },
  layout() { // cover exactly the screen, in stage units (set on resize, not animated)
    if (!this.el) return;
    const S = Stage.S, l = -Stage.ox / S, t = -Stage.oy / S;
    this.box = { l, t };
    Object.assign(this.el.style, { left: l + 'px', top: t + 'px', width: Stage.W / S + 'px', height: Stage.H / S + 'px' });
    if (this.active && this.target) this.place(false);
  },
  // a target's box in stage units, from elements on screen…
  boxOf(target) {
    const els = (Array.isArray(target) ? target : [target]).filter(Boolean);
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const e of els) { const q = e.getBoundingClientRect(); if (!q.width && !q.height) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
    if (l === Infinity) return null;
    const S = Stage.S;
    return { x: ((l + r) / 2 - Stage.ox) / S, y: ((t + b) / 2 - Stage.oy) / S, w: (r - l) / S, h: (b - t) / S };
  },
  // …or from art-space coordinates (centre, size), through the camera
  worldBox(x, y, w, h) { const p = Stage.w2st(x, y), z = Stage.z; return { x: p.x, y: p.y, w: w * z, h: h * z }; },
  fade(el, to, enter, dur) { gsap.killTweensOf(el); return Motion.to(el, { opacity: to, duration: dur, ease: enter ? Motion.EASE.OUT : Motion.EASE.IN }); },
  // target: () => box (stage units), with opts sx / sy / pad for the hole round it and hand (a hand taps it).
  // opts.also: () => box, a second clear hole (sx2 / sy2 / pad2), with its own gold ring when opts.ring2.
  // opts.drag: { ball, from, to }: the drag lesson, the hand carrying a see-through copy of ball from from() to to()
  // (stage points { x, y, s }, s = the ball's scale on screen)
  show(target, opts = {}) {
    this.target = target; this.opts = opts; this.active = true;
    document.body.classList.add('spot');
    if (opts.drag) this.dress(opts.drag.ball);
    this.demoT0 = Clock.t + 0.5; this.held = false; this.dropped = false; // (the lesson starts once the spotlight has settled)
    this.place(true);
  },
  // the see-through copy wears the ball's own picture and label
  dress(b) {
    if (this.ghostOf === b) return;
    this.ghostOf = b;
    this.ghost.innerHTML = `<img src="${IMG}ball_${b.i}.webp" alt="" draggable="false"><b>${labelHTML(b.op)}</b>`;
  },
  hole(q, sx, sy, pad) { return { rx: (q.w / 2) * sx + pad, ry: (q.h / 2) * sy + pad }; },
  place(animate) {
    const b = this.target && this.target(); if (!b) return;
    const o = this.opts, b2 = o.also ? o.also() : null;
    const h1 = this.hole(b, o.sx ?? 1.3, o.sy ?? 1.3, o.pad ?? 24), h2 = b2 ? this.hole(b2, o.sx2 ?? 1.3, o.sy2 ?? 1.3, o.pad2 ?? 24) : null;
    const D = animate ? Motion.DUR.SLOW : 0, px = (v) => v.toFixed(1) + 'px';
    // the dim + blur: the other layer takes the new holes, then the two cross-fade (no second hole: it is off screen)
    const prev = this.layers[this.front];
    this.front ^= 1;
    const next = this.layers[this.front], st = next.style;
    st.setProperty('--x', px(b.x - this.box.l)); st.setProperty('--y', px(b.y - this.box.t));
    st.setProperty('--rx', px(h1.rx)); st.setProperty('--ry', px(h1.ry));
    st.setProperty('--x2', b2 ? px(b2.x - this.box.l) : '-9999px'); st.setProperty('--y2', b2 ? px(b2.y - this.box.t) : '-9999px');
    st.setProperty('--rx2', h2 ? px(h2.rx) : '1px'); st.setProperty('--ry2', h2 ? px(h2.ry) : '1px');
    this.fade(next, 1, true, D); this.fade(prev, 0, false, D);
    // the rings sit where the clear area starts to fade: each sized once, then it glides from where it was
    this.rs = this.aim(this.ring, this.rs, this.ringOn, b, h1, D);
    if (!this.ringOn) { this.ringOn = true; this.fade(this.ring, 1, true, Motion.DUR.NORMAL); }
    const r2 = !!(b2 && o.ring2);
    if (r2) this.rs2 = this.aim(this.ring2, this.rs2, this.ring2On, b2, h2, D);
    if (r2 !== this.ring2On) { this.ring2On = r2; this.fade(this.ring2, r2 ? 1 : 0, r2, Motion.DUR.NORMAL); }
    // the hand fades in to tap; in the drag lesson, update() brings it (and the copy) in and out with each loop
    if (o.drag) { gsap.killTweensOf(this.hand); gsap.killTweensOf(this.ghost); this.lastHandA = this.lastGhostA = ''; }
    else { this.fade(this.hand, o.hand ? 1 : 0, !!o.hand, Motion.DUR.FAST); this.fade(this.ghost, 0, false, Motion.DUR.FAST); }
  },
  aim(ring, old, on, b, h, D) {
    const gx = h.rx * 0.8, gy = h.ry * 0.8;
    Object.assign(ring.style, { width: 2 * gx + 'px', height: 2 * gy + 'px' });
    const from = old && on ? { x: old.x, y: old.y, sx: (old.gx * old.sx) / gx, sy: (old.gy * old.sy) / gy } : { x: b.x, y: b.y, sx: 1.3, sy: 1.3 };
    if (old) gsap.killTweensOf(old);
    const rs = { ...from, gx, gy };
    gsap.to(rs, { x: b.x, y: b.y, sx: 1, sy: 1, duration: Motion.d(D), ease: Motion.EASE.OUT });
    return rs;
  },
  hide() {
    if (!this.active && !this.ringOn) return;
    this.active = false; this.target = null; this.held = false;
    document.body.classList.remove('spot');
    for (const l of this.layers) this.fade(l, 0, false, Motion.DUR.SLOW);
    this.ringOn = this.ring2On = false;
    this.fade(this.ring, 0, false, Motion.DUR.NORMAL); this.fade(this.ring2, 0, false, Motion.DUR.NORMAL);
    this.fade(this.hand, 0, false, Motion.DUR.FAST); this.fade(this.ghost, 0, false, Motion.DUR.FAST);
  },
  // a hint: the ring swells; in the drag lesson the hand also starts its carry again (if it is between loops)
  nudge() {
    if (!Motion.reduced) this.nudgeT = 1;
    if (this.active && this.opts.drag && !this.held) { const u = (Clock.t - this.demoT0) / DEMO.P; if (u < 0 || u % 1 > DEMO.AWAY) this.demoT0 = Clock.t; }
  },
  // the player has the ball in hand: the lesson steps aside, and comes back a moment after the ball is let go
  hold(on) { this.held = on; if (!on) { this.demoT0 = Clock.t + 0.9; this.dropped = false; } },
  ringAt(el, r, p, last) {
    const tr = `translate(${(r.x - r.gx).toFixed(1)}px,${(r.y - r.gy).toFixed(1)}px) scale(${(r.sx * p).toFixed(4)},${(r.sy * p).toFixed(4)})`;
    if (tr !== last) el.style.transform = tr;
    return tr;
  },
  update(dt, t) {
    const r = this.rs; if (!r) return;
    this.nudgeT = Math.max(0, this.nudgeT - dt * 2.2);
    const pulse = (k) => (Motion.reduced ? 1 : 1 + 0.03 * Math.sin(t * 4 + k)) + 0.1 * Math.sin(this.nudgeT * Math.PI);
    this.lastRing = this.ringAt(this.ring, r, pulse(0), this.lastRing);
    if (this.rs2 && this.ring2On) this.lastRing2 = this.ringAt(this.ring2, this.rs2, pulse(Math.PI), this.lastRing2); // (the two breathe in turn)
    if (!this.active) return;
    if (this.opts.drag) { this.demo(t); return; }
    if (this.opts.hand) { // taps the target every 1.4 s, with a ripple on each tap
      const ph = (t % 1.4) / 1.4, press = !Motion.reduced && ph > 0.4 && ph < 0.62 ? Math.sin(((ph - 0.4) / 0.22) * Math.PI) : 0;
      const hx = (r.gx / 0.8) * r.sx, hy = (r.gy / 0.8) * r.sy;
      if (press > 0.9 && !this.tapped) { this.tapped = true; FX.uiMode = true; FX.ring(r.x, r.y, '#fff6c8', Math.min(hx, hy) * 0.9); FX.uiMode = false; }
      if (press === 0) this.tapped = false;
      const ax = Math.min(hx, 110) * 0.17, ay = Math.min(hy, 110) * 0.2;
      const lowest = (Stage.H - Stage.oy) / Stage.S - 112; // the whole hand stays on screen, even for the tray's balls
      const fy = Math.min(r.y + ay + 20 * (1 - press), lowest + 20 * (1 - press) * 0.4);
      const ht = `translate(${(r.x + ax + 14 * (1 - press)).toFixed(1)}px,${fy.toFixed(1)}px) rotate(-28deg) scale(${(1 - 0.1 * press).toFixed(3)})`;
      if (ht !== this.lastHand) { this.hand.style.transform = ht; this.lastHand = ht; }
    }
  },
  // the drag lesson (DEMO). Its two ends are read every frame, in stage units, so they stay on the ball and the
  // socket wherever the camera is. Under reduced motion nothing travels: the hand rests on the ball, and the copy
  // waits in the socket, showing where it goes.
  demo(t) {
    const d = this.opts.drag, A = d.from(), B = d.to(), z = Stage.z;
    let hx = A.x, hy = A.y, ha = 0, hp = 0, gx = A.x, gy = A.y, gs = A.s, ga = 0;
    if (this.held) { /* the player is dragging the ball: nothing to show */ }
    else if (Motion.reduced) { ha = 1; ga = 0.6; gx = B.x; gy = B.y; gs = B.s; }
    else if (t >= this.demoT0) {
      const u = ((t - this.demoT0) / DEMO.P) % 1, seg = (a, b) => clamp((u - a) / (b - a), 0, 1);
      const cx = (A.x + B.x) / 2, cy = Math.min(A.y, B.y) - 90 * z, lift = A.s * 1.1; // (up and over: it drops into the hole from above)
      if (u < DEMO.GRAB) { const e = Ease.outCubic(seg(0, DEMO.GRAB)); ha = e; hx = A.x + 50 * z * (1 - e); hy = A.y + 60 * z * (1 - e); }
      else if (u < DEMO.LIFT) { const e = Ease.outCubic(seg(DEMO.GRAB, DEMO.LIFT)); ha = 1; hp = e; ga = GHOST_A * e; gs = lerp(A.s, lift, e); }
      else if (u < DEMO.CARRY) {
        const e = Ease.inOutCubic(seg(DEMO.LIFT, DEMO.CARRY));
        ha = 1; hp = 1; ga = GHOST_A; gs = lift; gx = hx = bez(A.x, cx, B.x, e); gy = hy = bez(A.y, cy, B.y, e);
      } else if (u < DEMO.DROP) {
        const e = Ease.outCubic(seg(DEMO.CARRY, DEMO.DROP));
        ha = 1; hp = 1 - e; ga = GHOST_A; gx = hx = B.x; gy = hy = B.y; gs = lerp(lift, B.s, e); // it sinks in and fills the hole
        if (!this.dropped) { this.dropped = true; FX.uiMode = true; FX.ring(B.x, B.y, '#fff6c8', 61 * B.s * 1.15); FX.uiMode = false; }
      } else if (u < DEMO.AWAY) {
        const e = seg(DEMO.DROP, DEMO.AWAY);
        ha = 1 - Ease.inCubic(e); hx = B.x + 50 * z * Ease.outCubic(e); hy = B.y + 60 * z * Ease.outCubic(e);
        ga = GHOST_A * (1 - e); gx = B.x; gy = B.y; gs = B.s;
      }
      if (u < DEMO.CARRY) this.dropped = false;
    }
    // the fingertip sits a little below-right of the ball's middle (its label stays in view), and the whole hand on screen
    const lowest = (Stage.H - Stage.oy) / Stage.S - 100;
    const ht = `translate(${(hx + 28 * z).toFixed(1)}px,${Math.min(hy + 34 * z, lowest).toFixed(1)}px) rotate(-28deg) scale(${(1 - 0.1 * hp).toFixed(3)})`;
    if (ht !== this.lastHand) { this.hand.style.transform = ht; this.lastHand = ht; }
    const hA = ha.toFixed(3); if (hA !== this.lastHandA) { this.hand.style.opacity = hA; this.lastHandA = hA; }
    const gt = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px) scale(${gs.toFixed(4)})`;
    if (gt !== this.lastGhost) { this.ghost.style.transform = gt; this.lastGhost = gt; }
    const gA = ga.toFixed(3); if (gA !== this.lastGhostA) { this.ghost.style.opacity = gA; this.lastGhostA = gA; }
  },
};
// =====================================================================
//  SCENERY: the living background on the user's deck picture (art/background/new_background.png, cut into
//  layers by tools/cut_deck_bg.py). Only transform and opacity move, almost all in CSS keyframes, so it runs on the
//  compositor thread and never stutters.
//  • SUN: top right. The sky brightens toward it; a white disc with its bloom and two slowly counter-turning glare
//    layers (sun_glow / sun_rays, drawn by tools/make_sun.py).
//  • NO painted clouds: the only cloud in the game is the equation's (the user, 19 Nov).
//  • JUNGLE: low mist drifting between the trees, soft shafts of sunlight that breathe, sunlit specks floating up,
//    and now and then a leaf tumbling down from the big trees.
//  • BIRDS: a small flock (1–3) now and then, crossing between the hills and the treetops. They flap a few beats
//    and glide. GSAP, so they stop with the game on pause; none under reduced motion.
//  • WIND: the two leafy plants behind the railing sway on one gust curve (Wind.lean). Each plant's delay follows
//    its x, so a gust crosses the scene from left to right. The sway starts and ends upright, as painted.
//  Freezes with the game on pause. Under reduced motion it stands still (each CSS loop ends where it rests).
// =====================================================================

// (bg units = the 1672×941 frame)
const SUN = { x: 1490, y: 96 }; // top right: clear of the HUD, the equation cloud and the title's caged x
// the jungle pieces. Mist: centre, size, how far it drifts each way, seconds per sweep, strength.
const MIST = [
  { x: 520, y: 520, w: 900, h: 120, mx: 70, T: 52, o: 0.7 },
  { x: 1220, y: 505, w: 820, h: 110, mx: -60, T: 64, o: 0.6 },
  { x: 880, y: 560, w: 1100, h: 130, mx: 50, T: 58, o: 0.55 },
  { x: 150, y: 545, w: 600, h: 110, mx: -40, T: 46, o: 0.5 },
];
// light shafts: from the sun toward these points in the forest (x, y), width; the near part is masked off so each
// shaft only shows as it falls through the trees
const SHAFTS = [[1210, 590, 110], [1040, 610, 70], [880, 600, 130], [1390, 620, 60], [700, 610, 80]];
// where leaves fall from (under the big trees' crowns): x, y; each falls with its own timing. Sunlit yellow-green
// and a few golden ones, so they show against the green trees
const LEAF_FROM = [[350, 355], [470, 345], [1320, 330], [1450, 360], [1570, 350], [1230, 385], [420, 375], [1500, 335]];
const LEAF_HUE = ['#d4ec4c', '#f2c94c', '#c3e24a', '#ffd95a'];

// ---------- WIND ----------
const PLANTS = ['#bgPlantL', '#bgPlantR']; // (their boxes are #bgPlantL / #bgPlantR in src/00_head.html)
const Wind = {
  PERIOD: 12, SPEED: 560, // one gust cycle, in seconds; how fast a gust crosses the scene (bg units per second)
  // the lean (0 = upright, 1 = a full gust) over one cycle, u in 0..1. A breeze that never quite stops, two gusts
  // of different strength, and a small spring back after each one.
  lean(u) {
    const P = Math.PI * 2;
    const g = (c, w) => { let d = Math.abs(u - c); d = Math.min(d, 1 - d); return Math.exp(-((d / w) ** 2)); };
    return 0.3 + 0.1 * Math.sin(P * u + 0.4) + 0.07 * Math.sin(P * 2 * u + 1.9) + 0.04 * Math.sin(P * 5 * u + 0.8) + 0.025 * Math.sin(P * 11 * u)
      + 0.62 * g(0.3, 0.075) - 0.2 * g(0.405, 0.05) + 0.36 * g(0.72, 0.055) - 0.12 * g(0.79, 0.04);
  },
  // CSS keyframes (transform only; linear between 72 samples of the curve), measured from the lean at the start of
  // the cycle, so the first and last frames are the plant as painted (that is also where reduced motion leaves it)
  css() {
    const N = 72, L0 = this.lean(0);
    let s = '@keyframes wplant{';
    for (let i = 0; i <= N; i++) {
      const L = this.lean(i / N) - L0;
      s += `${((i * 100) / N).toFixed(2)}%{transform:rotate(${(2.4 * L).toFixed(2)}deg) skewX(${(-2 * L).toFixed(2)}deg)}`;
    }
    return s + '}';
  },
  delay(x) { return (x / this.SPEED - this.PERIOD).toFixed(2) + 's'; }, // (negative: every plant is mid-sway from the start)
};

// a small seeded random, so the scene is the same on every load
const scnRand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
const scnPiece = (box, cls, css, vars) => {
  const e = document.createElement('i'); e.className = cls; Object.assign(e.style, css);
  if (vars) for (const k in vars) e.style.setProperty(k, vars[k]);
  box.appendChild(e); return e;
};

// ---------- SUN ----------
const Sun = {
  build() {
    const el = $('#bgSun'); el.style.left = SUN.x + 'px'; el.style.top = SUN.y + 'px';
    const add = (tag, cls, src) => { const e = document.createElement(tag); e.className = cls; if (src) { e.src = IMG + src; e.alt = ''; } el.appendChild(e); };
    add('i', 'sk'); add('img', 'sg', 'sun_glow.webp'); add('img', 'sr r1', 'sun_rays.webp'); add('img', 'sr r2', 'sun_rays.webp');
    add('i', 'ss'); add('i', 'sd');
  },
};

// ---------- JUNGLE ----------
const Jungle = {
  build() {
    const box = $('#bgJungle'), R = scnRand;
    MIST.forEach((m) => scnPiece(box, 'ms', {
      left: m.x - m.w / 2 + 'px', top: m.y - m.h / 2 + 'px', width: m.w + 'px', height: m.h + 'px', opacity: m.o,
      animationDuration: m.T + 's', animationDelay: (-m.T * R()).toFixed(2) + 's',
    }, { '--mx': m.mx + 'px' }));
    SHAFTS.forEach(([tx, ty, w], i) => { // a long soft beam hung from the sun, turned to point at its spot in the forest
      const dx = tx - SUN.x, dy = ty - SUN.y, len = Math.hypot(dx, dy) * 1.12, ang = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      scnPiece(box, 'sh', {
        left: SUN.x - w / 2 + 'px', top: SUN.y + 'px', width: w + 'px', height: len + 'px', transform: `rotate(${ang.toFixed(2)}deg)`,
        animationDuration: (6 + i * 1.7).toFixed(1) + 's', animationDelay: (-4 * R()).toFixed(2) + 's',
      });
    });
    for (let i = 0; i < 18; i++) { // sunlit specks, mostly on the sunny right, drifting up and a little toward the sun
      const T = 7 + R() * 6;
      scnPiece(box, 'mt', {
        left: 760 + R() * 880 + 'px', top: 330 + R() * 230 + 'px', animationDuration: T.toFixed(2) + 's', animationDelay: (-T * R()).toFixed(2) + 's',
      }, { '--mx': (R() * 50 - 15).toFixed(1) + 'px', '--my': -(40 + R() * 60).toFixed(1) + 'px' }).style.scale = (0.7 + R() * 0.7).toFixed(2);
    }
    LEAF_FROM.forEach(([x, y], i) => { // each leaf falls for ~60 % of its loop and rests unseen for the rest
      const T = 14 + R() * 9, c = LEAF_HUE[i % LEAF_HUE.length];
      const e = scnPiece(box, 'lf', { left: x + 'px', top: y + 'px', animationDuration: T.toFixed(2) + 's', animationDelay: (-T * R()).toFixed(2) + 's' },
        { '--lx': (R() * 70 - 35).toFixed(1) + 'px', '--ly': (125 + R() * 35).toFixed(1) + 'px' }); // (fades out just above the railing)
      e.innerHTML = `<b style="animation-duration:${(2.2 + R()).toFixed(2)}s;animation-delay:${(-2 * R()).toFixed(2)}s"><svg viewBox="0 0 20 20" style="animation-duration:${(1.6 + R() * 0.8).toFixed(2)}s"><path d="M10 1C15 5 16 12 10 19C4 12 5 5 10 1Z" fill="${c}" stroke="rgba(70,100,10,.7)" stroke-width="1"/><path d="M10 3V17" stroke="rgba(70,100,10,.6)" stroke-width="1.1" fill="none"/></svg></b>`;
    });
  },
};

// ---------- BIRDS ----------
const BIRD_SVG = '<span class="bb"><svg viewBox="0 0 44 30"><path class="w" d="M22 15C17 9 10 6 2 8C9 9.5 15 12 20 17Z"/><path class="w" d="M22 15C27 9 34 6 42 8C35 9.5 29 12 24 17Z"/>'
  + '<path d="M16.5 16L11.5 14.2L12.2 18.2Z"/><ellipse cx="22" cy="16" rx="5.6" ry="2.6"/><circle cx="27.2" cy="14.9" r="2.2"/></svg></span>';
const Birds = {
  live: 0,
  start() { gsap.delayedCall(2.5, () => this.next()); }, // the first flock soon after the start screen shows
  next() {
    if (!Motion.reduced && this.live < 2) this.flock();
    gsap.delayedCall(9 + Math.random() * 9, () => this.next()); // then one every 9–18 s (game time)
  },
  flock() {
    const box = $('#bgBirds'), r = Math.random(), n = r < 0.4 ? 1 : r < 0.75 ? 2 : 3, dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = 120 + Math.random() * 130, dur = 17 + Math.random() * 7, rise = (Math.random() - 0.5) * 80;
    let left = n; this.live++;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'bird'; el.innerHTML = BIRD_SVG; box.appendChild(el);
      const beat = 2.2 + Math.random() * 0.6, ph = -Math.random() * beat; // its own wingbeat and phase
      el.querySelectorAll('.bb,.w').forEach((p) => { p.style.animationDuration = beat + 's'; p.style.animationDelay = ph + 's'; });
      const back = i * (46 + Math.random() * 30), dy = i ? (i % 2 ? 1 : -1) * (12 + Math.random() * 14) : 0, s = (0.72 + Math.random() * 0.3) * (i ? 0.9 : 1);
      const x0 = dir > 0 ? -90 - back : DW + 90 + back, x1 = x0 + dir * (DW + 260);
      gsap.set(el, { x: x0, y: y0 + dy, scaleX: dir * s, scaleY: s });
      gsap.to(el, { y: `+=${rise}`, duration: dur, ease: 'sine.inOut' });
      gsap.to(el, { x: x1, duration: dur, ease: 'none', onComplete: () => { el.remove(); if (--left === 0) this.live--; } });
    }
  },
};

const Scenery = {
  // at boot, before the start screen shows: the sun, the jungle's life, the plants' wind; then the birds start
  build() {
    Sun.build(); Jungle.build();
    PLANTS.forEach((id) => {
      const el = $(id);
      el.querySelector('img').style.animationDelay = Wind.delay(parseFloat(getComputedStyle(el).left) + el.offsetWidth / 2);
    });
    const st = document.createElement('style'); st.textContent = Wind.css(); document.head.appendChild(st);
    Birds.start();
  },
  pause(p) { document.body.classList.toggle('scnPause', p); },
};

// =====================================================================
//  START SCREEN: the user's mockup (art/start_screen/start_mockup.png), built from their sheet
//  (art/start_screen/start_sheet.png, cut by tools/cut_start_screen.py). The CANNON QUEST plaque on top, the
//  wooden cannon on the left, a small Play button in the middle, and the golden cage on the right with x INSIDE
//  it (drawn between the cage's back and its front bars).
//  It comes in one piece after another (Title.IN), each on its own beat and with its own real recorded sound
//  (Title.cues → Sound.signLand / rollIn / cannonLand / cageLand / cork): the CANNON QUEST sign drops from the sky
//  and bounces into place, the cannon slides in from the left and plants itself, the cage drops onto the deck and
//  bounces, then Play pops up. (A browser lets a page sound only after its first tap, so on a first visit the entrance
//  may play silent; x's struggle is heard from the first tap anywhere: Sound.listen.)
//  x wants out. In a loop it peeks through the bars, shoves the left bars, shoves the right bars, jumps at the
//  roof and rattles the bars, and the cage rocks on its edge, hops and wiggles each time (one GSAP timeline;
//  the cage's rock, jolt and squash are springs, so every wiggle settles by itself).
//  Time-based (Clock / GSAP), transform + opacity only. Reduced motion: it is simply there, x sits still, no sounds.
// =====================================================================
const TL = (() => { // art space (1672×941). Boxes = where the mockup draws each piece (tools/cut_start_screen.py prints them)
  const cannon = { x: 122.3, y: 401.3, w: 525.7, h: 485.2 }, cage = { x: 1092.1, y: 348.9, w: 382.1, h: 505.3 };
  return {
    logo: { x: 338.9, y: 34.5, w: 980.7 },
    cannon,
    foot: { x: 0.5, y: 0.93, w: 0.9 },          // its wooden base on the deck (fractions of its box): centre, width
    muzzle: { x: cannon.x + 0.84 * cannon.w, y: cannon.y + 0.27 * cannon.w, dir: -0.6 }, // its mouth, and where it points
    play: { x: 836, y: 640, w: 176 },           // centre + width: smaller than the mockup's 257 (the user: "start button should small")
    cage,
    cageFoot: { pivot: 0.987, y: 0.955 },       // its base: the lowest point (it rocks on it), the middle of its footprint
    // in the cage's own box (px). x stands on the cage floor, between the front bars, as in the mockup
    x: { x: 92.3, y: 202.7, w: 194.6, h: 202.7 },
    room: { side: 38, up: 15 },                 // how far x can move before it meets the side bars / the top ring
    bars: { l: 50.6, r: 324.6, top: 186.2 },    // the side bars' inner edges and the top ring's underside (sparks fly where x hits)
  };
})();
const Title = {
  active: false, exiting: false, t0: 0, hover: false, press: 0, kick: 0, handlers: [], tl: null, landed: false, cLanded: false,
  // the cage: rock (degrees; it tips onto the edge it leans to), jolt (px sideways), squash (+ = squashed), hop (px up),
  // shake (0..1: x rattling the bars). x: its pose from the timeline, plus a squash spring for landings
  rock: new Spring(2.3, 0.2), jolt: new Spring(6, 0.3), squash: new Spring(4.2, 0.32), xsq: new Spring(5, 0.3),
  cg: { hop: 0, shake: 0 }, xs: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
  // the entrance: [start, length] in s after the start screen shows. One after another (the user, 20 Nov: "the text
  // come and cannon and the cage come"), so each lands on its own beat and its sound is heard on its own
  IN: { logo: [0.2, 0.85], cannon: [0.7, 0.8], cage: [1.15, 0.9], play: [1.8, 0.6], escape: 3 },
  BOUNCE: [1 / 2.75, 2 / 2.75, 2.5 / 2.75], // where Ease.outBounce touches down (its first fall, then two bounces)
  CANNON_STOP: 0.58,                         // where Ease.outBack slides furthest (it stops, then settles back)
  Q: [], q: 0,
  // when each arrival is heard, in s after the start: a swish as the sign / the cage falls (its loudest part just
  // before the touch-down), a knock / clang on each touch-down, the cannon's roll and its thud where it stops, a pop for Play
  cues() {
    const I = this.IN, B = this.BOUNCE, at = (k, f) => I[k][0] + I[k][1] * f;
    return [
      [at('logo', B[0]) - 0.2, () => Sound.swish(0.42, 0.9)],
      ...B.map((f, i) => [at('logo', f), () => Sound.signLand(i)]),
      [I.cannon[0], () => Sound.rollIn()],
      [at('cannon', this.CANNON_STOP), () => Sound.cannonLand()],
      [at('cage', B[0]) - 0.2, () => Sound.swish(0.36, 1.1, 0.3)],
      ...B.map((f, i) => [at('cage', f), () => Sound.cageLand(i)]),
      [I.play[0] + 0.06, () => Sound.cork()],
    ].sort((a, b) => a[0] - b[0]);
  },
  init() {
    const box = $('#thumb'); this.box = box; this.play = $('#playBtn'); this.pg = this.play.querySelector('.pg');
    const img = (src, cls, parent, before = null) => {
      const im = document.createElement('img'); im.className = cls; im.src = IMG + src; im.alt = ''; im.draggable = false;
      parent.insertBefore(im, before); return im;
    };
    const place = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    // the ground under the cannon, the cage and the Play button (they stand on the wooden deck)
    const cn = TL.cannon, fx = cn.x + cn.w * TL.foot.x, fw = cn.w * TL.foot.w;
    this.footY = cn.y + cn.h * TL.foot.y;
    this.cSh = groundGroup(box, 'shadow', fx, this.footY, this.play);
    groundBlob(this.cSh, 'pool', -14, 6, fw * 1.38, 124); groundBlob(this.cSh, 'contact', 0, 20, fw * 1.0, 28);
    const cg = TL.cage;
    this.cageFootY = cg.y + cg.h * TL.cageFoot.y;
    this.gSh = groundGroup(box, 'shadow', cg.x + cg.w / 2, this.cageFootY, this.play);
    groundBlob(this.gSh, 'pool', -14, 8, cg.w * 1.32, 100); groundBlob(this.gSh, 'contact', 0, 12, cg.w * 1.03, 36);
    const p = TL.play;
    this.pSh = groundGroup(box, 'shadow', p.x, p.y + p.w * 0.68, this.play);
    groundBlob(this.pSh, 'soft', 0, 0, p.w * 0.98, 32); groundBlob(this.pSh, 'contact', 0, 0, p.w * 0.66, 14);
    // the cannon
    this.cannon = img('t_cannon.webp', 'tp', box, this.play); place(this.cannon, cn.x, cn.y, cn.w, cn.h);
    this.cannon.style.transformOrigin = `${TL.foot.x * 100}% ${TL.foot.y * 100}%`;
    // the cage, one group: its whole picture (behind x), x's shadow on the floor, x, then its front bars
    const g = (this.cage = document.createElement('div')); g.className = 'tp tcage'; box.insertBefore(g, this.play);
    place(g, cg.x, cg.y, cg.w, cg.h); g.style.transformOrigin = `50% ${TL.cageFoot.pivot * 100}%`;
    place(img('t_cage.webp', '', g), 0, 0, cg.w, cg.h);
    const X = TL.x;
    this.xShadow = document.createElement('i'); this.xShadow.className = 'xsh'; g.appendChild(this.xShadow);
    place(this.xShadow, X.x + X.w * 0.14, X.y + X.h - 18, X.w * 0.72, 22);
    this.x = img('t_x.webp', 'tx', g); place(this.x, X.x, X.y, X.w, X.h);
    place(img('t_cage_front.webp', '', g), 0, 0, cg.w, cg.h);
    // the logo, and a brighter copy of it that flashes now and then
    const lh = TL.logo.w * (719 / 1833);
    this.logo = img('t_logo.webp', 'tp', box, this.play); place(this.logo, TL.logo.x, TL.logo.y, TL.logo.w, lh);
    this.logoLit = img('t_logo.webp', 'tp lit', box, this.play); place(this.logoLit, TL.logo.x, TL.logo.y, TL.logo.w, lh);
    // Play: small, in the middle of the deck
    Object.assign(this.play.style, { left: p.x - p.w / 2 + 'px', top: p.y - p.w / 2 + 'px', width: p.w + 'px', height: p.w + 'px' });
    this.handlers = [['pointerenter', () => (this.hover = true)], ['pointerleave', () => (this.hover = false)], ['pointerdown', () => (this.press = 1)]];
    for (const [ev, fn] of this.handlers) this.play.addEventListener(ev, fn);
    this.hideAll();
  },
  hideAll() { for (const el of this.box.querySelectorAll('.tp, .gsh, #playBtn')) el.style.opacity = 0; }, // (each piece enters in update)
  start() {
    this.active = true; this.t0 = Clock.t; this.box.classList.add('live');
    this.Q = this.cues(); this.q = 0;
    if (!Motion.reduced) this.tl = this.escape();
  },
  // x tries to get out: one looping timeline (~10 s). The cage answers (rocks, hops, rattles) from the callbacks
  escape() {
    const X = this.xs, C = this.cg, S = TL.room.side, U = TL.room.up;
    const tl = gsap.timeline({ repeat: -1, delay: this.IN.escape }); // (once everything has come in)
    // 1. it peeks out through the bars: left, then right
    tl.to(X, { x: -12, r: -7, duration: 0.5, ease: 'sine.inOut' })
      .to(X, { x: 12, r: 7, duration: 0.7, ease: 'sine.inOut' }, '+=0.25')
      .to(X, { x: 0, r: 0, duration: 0.45, ease: 'sine.inOut' }, '+=0.25')
    // 2. a shove at the left bars: wind up, rush, hit (squashed against the bars), back to the middle
      .to(X, { x: S * 0.4, r: 8, sx: 0.95, sy: 1.04, duration: 0.4, ease: 'power2.out' }, '+=0.35')
      .to(X, { x: -S, r: -9, sx: 1.04, sy: 0.98, duration: 0.2, ease: 'power2.in' })
      .call(() => this.bump(-1))
      .to(X, { sx: 0.86, sy: 1.07, duration: 0.08, ease: 'power1.out' })
      .to(X, { x: 0, r: 0, sx: 1, sy: 1, duration: 0.6, ease: 'power3.out' })
    // 3. …and at the right bars
      .to(X, { x: -S * 0.4, r: -8, sx: 0.95, sy: 1.04, duration: 0.4, ease: 'power2.out' }, '+=0.45')
      .to(X, { x: S, r: 9, sx: 1.04, sy: 0.98, duration: 0.2, ease: 'power2.in' })
      .call(() => this.bump(1))
      .to(X, { sx: 0.86, sy: 1.07, duration: 0.08, ease: 'power1.out' })
      .to(X, { x: 0, r: 0, sx: 1, sy: 1, duration: 0.6, ease: 'power3.out' })
    // 4. a jump at the roof: crouch, spring up, bonk (the whole cage hops), fall, land (the cage thuds down)
      .to(X, { sx: 1.12, sy: 0.82, duration: 0.32, ease: 'power2.out' }, '+=0.45')
      .to(X, { y: -U * 1.6, sx: 0.92, sy: 1.1, duration: 0.18, ease: 'power2.out' })
      .addLabel('bonk')
      .call(() => this.bonk(), null, 'bonk')
      .to(C, { hop: -18, duration: 0.15, ease: 'power2.out' }, 'bonk')
      .to(C, { hop: 0, duration: 0.2, ease: 'power2.in' }, 'bonk+=0.15')
      .to(X, { y: 0, sx: 1, sy: 1, duration: 0.26, ease: 'power2.in' }, 'bonk+=0.04')
      .call(() => this.thud(), null, 'bonk+=0.35')
    // 5. it grabs the bars and rattles them
      .to(C, { shake: 1, duration: 0.15, ease: 'power1.out' }, '+=0.45')
      .to(C, { shake: 0, duration: 0.3, ease: 'power1.in' }, '+=0.75')
    // 6. a sigh, a rest, and it tries again
      .to(X, { sy: 0.94, sx: 1.03, duration: 0.55, ease: 'sine.inOut' }, '+=0.15')
      .to(X, { sy: 1, sx: 1, duration: 0.7, ease: 'sine.inOut' })
      .to({}, { duration: 1.1 });
    return tl;
  },
  at(fx, fy) { const cg = TL.cage; return { x: cg.x + fx, y: cg.y + fy + this.cg.hop }; }, // a point of the cage, in art space
  bump(side) { // x hits the side bars: the cage tips onto that edge and rocks back, with a jolt; sparks at the bars
    this.rock.kick(side * 4.2); this.jolt.kick(side * 5);
    const p = this.at(side < 0 ? TL.bars.l : TL.bars.r, TL.x.y + TL.x.h * 0.45);
    FX.uiMode = true; FX.burst(p.x, p.y, '#ffd34d', 9, 260, { g: 300, dir: side < 0 ? Math.PI : 0, spread: 1.1, size: 0.6 }); FX.uiMode = false;
    if (Sound.live()) Sound.rattle();
  },
  bonk() { // x's head hits the top ring
    const p = this.at(TL.cage.w / 2, TL.bars.top);
    FX.uiMode = true; FX.burst(p.x, p.y, '#ffd34d', 8, 220, { g: 300, dir: -Math.PI / 2, spread: 1.2, size: 0.6 }); FX.uiMode = false;
    if (Sound.live()) Sound.clunk();
  },
  thud() { // the cage lands back on the deck: it squashes, x squashes, a puff of dust each side
    this.squash.kick(0.05); this.xsq.kick(0.08); this.rock.kick((Math.random() < 0.5 ? -1 : 1) * 1.2);
    this.cageDust(false);
    if (Sound.live()) Sound.land();
  },
  cageDust(big) {
    const cg = TL.cage, r = cg.w * 0.46, x = cg.x + cg.w / 2;
    FX.uiMode = true; FX.dust(x - r, this.cageFootY, -1, big ? 6 : 4); FX.dust(x + r, this.cageFootY, 1, big ? 6 : 4); FX.uiMode = false;
  },
  titleDust(big) {
    const cn = TL.cannon, r = cn.w * 0.42, x = cn.x + cn.w * TL.foot.x;
    FX.uiMode = true; FX.dust(x - r, this.footY, -1, big ? 7 : 4); FX.dust(x + r, this.footY, 1, big ? 7 : 4); FX.uiMode = false;
  },
  muzzleFx() { // the same real-looking blast as in the game, out of the barrel (up and to the right)
    FX.uiMode = true; FX.blast(TL.muzzle.x, TL.muzzle.y, TL.muzzle.dir, 0.9); FX.uiMode = false;
  },
  teardown() { // the start screen unmounts: no more updates, no timeline, no will-change, no listeners
    this.active = false;
    if (this.tl) { this.tl.kill(); this.tl = null; }
    this.box.classList.remove('live'); this.box.classList.add('gone');
    for (const [ev, fn] of this.handlers) this.play.removeEventListener(ev, fn);
    this.handlers = [];
  },
  set(el, dx, dy, rot = 0, sc = 1, op = 1, sx = 1) {
    el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(sc * sx).toFixed(4)},${sc.toFixed(4)})`;
    el.style.opacity = op.toFixed(3);
  },
  update(t, dt) {
    if (!this.active) return;
    const R = Motion.reduced, tt = R ? 0 : t;               // reduced motion: everything in place at once, nothing idles
    const T = R ? 99 : t - this.t0, X = this.exiting ? (R ? 99 : t - this.exitT) : -1;
    const pr = (s, d) => clamp((T - s) / d, 0, 1), I = this.IN, prIn = (k) => pr(I[k][0], I[k][1]);
    const ex = (s, d) => (X < 0 ? 0 : clamp((X - s) / d, 0, 1));
    // the entrance's sounds, each on its moment (none under reduced motion, nothing heard while the page is held
    // silent, and none once Play is tapped: the start screen is leaving)
    while (this.q < this.Q.length && T >= this.Q[this.q][0]) { const c = this.Q[this.q++]; if (!R && !this.exiting && Sound.live()) c[1](); }
    // cannon: slides in from the left, breathes, recoils when Play fires it, slides out
    this.kick = Math.max(0, this.kick - dt * 3.2);
    const cP = prIn('cannon'), ck = Math.sin(this.kick * Math.PI), cIn = Ease.outBack(cP), cOut = Ease.inBack(ex(0.08, 0.5));
    const cdx = -640 * (1 - cIn) - 760 * cOut - 18 * ck, cdy = 8 * ck, breathe = 1 + Math.sin(tt * 2.4) * 0.006, cOp = pr(I.cannon[0], 0.2);
    this.set(this.cannon, cdx, cdy, -2 * ck, breathe, cOp);
    this.set(this.cSh, cdx, 0, 0, 1, cOp);
    if (!this.cLanded && cP >= this.CANNON_STOP) { this.cLanded = true; if (!R) this.titleDust(true); } // (where it stops sliding)
    // the cage: drops onto the deck (with bounces), then x's struggle rocks, hops, rattles and squashes it
    const gIn = prIn('cage'), drop = 1 - Ease.outBounce(gIn), gOut = Ease.inBack(ex(0.05, 0.55));
    if (!this.landed && gIn >= this.BOUNCE[0]) { this.landed = true; if (!R) { this.cageDust(true); this.squash.kick(0.06); this.xsq.kick(0.1); } } // (the bounce's first touch-down)
    const rock = this.rock.update(dt), jolt = this.jolt.update(dt), sq = this.squash.update(dt), xsq = this.xsq.update(dt);
    const sh = this.cg.shake, w7 = R ? 0 : Math.sin(tt * Math.PI * 2 * 7), w7b = R ? 0 : Math.sin(tt * Math.PI * 2 * 7 + 1.3);
    const rot = rock + sh * 0.9 * w7b + 6 * gOut;
    const tip = -TL.cage.w * 0.5 * Math.abs(Math.sin((rot * Math.PI) / 180)); // it tips on its edge: the low side stays on the deck
    const gdx = jolt + sh * 3.5 * w7 + 760 * gOut, up = -640 * drop + this.cg.hop - 120 * gOut;
    this.cage.style.transform = `translate(${gdx.toFixed(1)}px,${(up + tip).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 + 0.6 * sq).toFixed(4)},${(1 - sq).toFixed(4)})`;
    this.cage.style.opacity = Math.min(1, gIn * 5).toFixed(3);
    const air = clamp(-up / 160, 0, 1); // its shadow shrinks and fades while it is up in the air
    this.set(this.gSh, gdx, 0, 0, 1 - 0.5 * air, Math.min(1, gIn * 3) * (1 - 0.7 * air) * (1 - gOut));
    // x inside: its pose from the timeline, a slow breath, the rattle, and a squash on each landing
    const xb = 1 + (R ? 0 : Math.sin(tt * 2.6) * 0.018), xs = this.xs;
    this.set(this.x, xs.x + sh * 2 * w7b, xs.y, xs.r + sh * 7 * w7, xb * xs.sy * (1 - xsq), 1, (xs.sx * (1 + 0.7 * xsq)) / (xs.sy * (1 - xsq)));
    const xUp = clamp(-xs.y / 30, 0, 1); // its shadow on the cage floor
    this.set(this.xShadow, xs.x, 0, 0, 1 - 0.35 * xUp, 0.9 - 0.5 * xUp);
    // logo: bounces down from the sky, floats, flashes now and then (a brighter copy fades in and out)
    const lIn = Ease.outBounce(prIn('logo')), lOut = Ease.inBack(ex(0.04, 0.55));
    const flash = R ? 0 : Math.max(0, Math.sin(clamp(((T - 3) % 5) / 0.55, 0, 1) * Math.PI));
    const ly = -560 * (1 - lIn) - 760 * lOut + Math.sin(tt * 1.6) * 6, lr = Math.sin(tt * 1.1) * 1 - 8 * lOut, ls = 1 + Math.sin(tt * 2.2) * 0.01, lo = pr(I.logo[0], 0.15);
    this.set(this.logo, 0, ly, lr, ls, lo);
    this.set(this.logoLit, 0, ly, lr, ls, lo * flash * 0.85);
    // Play: pops in, floats a little over the deck (its shadow answers), reacts to hover / press, bursts on exit
    this.press = Math.max(0, this.press - dt * 4);
    const pIn = prIn('play'), pk = Ease.outBack(pIn);
    const pX = ex(0, 0.12), pBoom = ex(0.12, 0.25), bob = R ? 0 : Math.sin(tt * 2.1) * 5;
    const psc = pk * (1 + 0.02 * Math.sin(tt * 3.4) + (this.hover ? 0.08 : 0) - this.press * 0.12) * (1 - 0.15 * pX + 0.5 * pBoom);
    this.set(this.play, 0, bob, 0, Math.max(0.001, psc), Math.min(1, pIn * 3) * (1 - pBoom));
    this.set(this.pSh, 0, 0, 0, Math.max(0.001, pk * (1 - bob / 60)), Math.min(1, pIn * 3) * (0.8 - bob / 40) * (1 - pBoom));
    this.pg.style.opacity = Math.min(1, 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(tt * 3.4)) + (this.hover ? 0.2 : 0)).toFixed(3);
    if (pIn > 0.3) this.play.classList.add('live');
    if (this.exiting && X > 0.9) this.teardown();
  },
  exit() {
    this.exiting = true; this.exitT = Clock.t; this.play.classList.remove('live');
    if (this.tl) this.tl.pause(); // x stops struggling; the cage leaves as it is
    this.kick = 1; this.muzzleFx();
    FX.uiMode = true;
    FX.burst(TL.play.x, TL.play.y, '#ffd34d', 44, 560, { g: 0 }); FX.burst(TL.play.x, TL.play.y, '#ffffff', 20, 420, { g: 0 }); FX.ring(TL.play.x, TL.play.y, '#fff3c4', 170);
    FX.uiMode = false;
    Sound.boom(); Sound.whoosh(0.7); Stage.hit({ trauma: 0.35, ky: 10, zoom: 0.03 }); Haptic.buzz(25);
    return Promise.all([wait(0.62), Pics.game]); // (the play scene's pictures: almost always in already, see boot)
  },
};

// =====================================================================
//  GAME FLOW
// =====================================================================
const G = {
  state: 'boot', session: 0, idx: 0, freed: 0, eq: null, sockets: [], inputOn: false, fireResolve: null, hooks: {},
  taught1: false, tutSkip: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false, tl: null,
  welcome: null, said: { freed: 0, stuck: 0, next: 0 },
};
// ---- the voice's lines through a session, in order: welcome → tutorial → a short intro on every other
// round → a reaction as the cage opens (or rattles) → the end line. Variants take turns, so a line never
// repeats back to back. The emotion is in the reader's own voice (docs/VO_RECORD.txt tells them each line's mood).
const LINES = {
  freed: ['voFreed1', 'voFreed2', 'voFreed3', 'voFreed4'],
  stuck: ['voStuck1', 'voStuck2'],
  next: ['voNext1', 'voNext2', 'voNext3'],
};
const nextLine = (kind) => LINES[kind][G.said[kind]++ % LINES[kind].length];
const introLine = (i) => (i === ROUNDS.length - 1 ? 'voLast' : i === 0 ? 'tutFreeX' : nextLine('next'));
const endLine = () => (G.freed === ROUNDS.length ? 'voEndAll' : G.freed * 2 > ROUNDS.length ? 'voEndMost' : 'voEndSome');
// a reaction inside a shot's timeline: said as it plays, never when Skip jumps the timeline (Skip is silent)
const react = (kind) => { if (!Motion.skipping) VO.say(nextLine(kind), 0.3); };
function flashScreen() { if (Motion.still()) return; const f = $('#flash'); f.classList.add('on'); gsap.delayedCall(0.09, () => f.classList.remove('on')); }
function idleReset() { G.idle = 0; }
function idleHint() {
  if (Spot.active) { Sound.tick(); Spot.nudge(); return; } Sound.tick(); if (G.sockets.length && G.sockets.every(Boolean)) Cannon.hint(); else Rack.glowWave(); }

async function refreshBalls(list) {
  const old = Rack.balls.filter((b) => b.where !== 'gone');
  const B = Motion.BEAT;
  if (old.length) {
    Sound.whoosh(0.3);
    await tween(B.BALLS_OUT, (e) => old.forEach((b) => (b.scale = Math.max(0.001, 1 - e))), Ease.inCubic);
    old.forEach((b) => FX.burst(b.x, b.y, b.hex, 8, 220));
  }
  Rack.balls.forEach(removeBall);
  Rack.balls = list.map((s, i) => createBall(s, i));
  Rack.balls.forEach((b) => { b.scale = 0.001; b.drop = 420; });
  // the new balls drop into their cups one after another: one soft settle each (no elastic wobble), then a squash as they land
  await Promise.all(Rack.balls.map((b, i) => tween(B.BALL_DROP, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 2.5)); b.drop = 420 * (1 - e); }, Ease.outBackSoft, 0.1 + i * B.BALL_GAP)
    .then(() => { b.land = 1; Sound.pop(0.75 + i * 0.06); })));
}

function onSocketsChanged() {
  const filled = G.sockets.filter(Boolean).length, n = G.sockets.length;
  Cannon.setFireActive(G.inputOn && n > 0 && filled === n);
  if (G.hooks.onFill) G.hooks.onFill(filled, n);
}
// a ball goes into socket i: it flies there (from the tray on a long arc, or from the hand on a short one), drops
// into the hole and fills it, with a clunk, a burst and a ring
function seat(b, i, dur = Motion.BEAT.TAP_FLY, arc = 230) {
  G.sockets[i] = b; b.where = 'socket'; b.socket = i;
  Rack.balls.forEach((x) => (x.guide = false));
  flyBall(b, dur, arc); Sound.pop(1); Sound.whoosh(0.35);
  b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); Stage.hit({ trauma: 0.08, ky: 3 }); };
}
function tapBall(b, tap = false) { // (tap: a press on the screen; false: a key)
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn || !b || b.where === 'gone' || b.where === 'loading' || b.drag) return;
  if (G.spotOnly && G.spotOnly !== b) { Sound.nope(); Spot.nudge(); return; } // guided step: only the highlighted ball
  idleReset();
  if (b.where === 'rack') {
    const i = G.sockets.indexOf(null);
    if (i < 0) { Sound.nope(); Cannon.pulseSockets(); tween(0.5, (e, k) => (b.hop = Math.sin(k * Math.PI) * 0.5), Ease.linear); return; }
    seat(b, i);
  } else if (b.where === 'socket') {
    G.sockets.splice(b.socket, 1); G.sockets.push(null);
    G.sockets.forEach((s, k) => { if (s && s.socket !== k) { s.socket = k; flyBall(s, 0.45, 40); } });
    b.where = 'rack'; b.socket = -1;
    flyBall(b, Motion.BEAT.TAP_FLY - 0.05, 180); Sound.unload();
    b.onLand = () => Sound.settle();
  }
  onSocketsChanged();
}

// ---- drag a ball into the cannon (or just tap it). A press that moves a few px becomes a drag: the ball lifts out
// of its cup and follows the finger above everything (the tray's lip, the cannon's ring, the tutorial's dim). Near
// the cannon the nearest empty socket glows, draws the ball in and the ball shrinks toward its size; let go there and
// it drops in and fills the hole. Let go anywhere else and it flies home. A press that doesn't move is a tap.
// A loaded ball can be dragged out the same way (its socket stays free until another ball goes in).
const Drag = {
  b: null, id: -1, x0: 0, y0: 0, moved: false, touch: false, aim: -1, SLOP: 9, // (SLOP: screen px before a press is a drag)
  down(b, e) {
    if (G.paused) return;
    if (this.b) { if (e.pointerId !== this.id) return; this.cancel(); } // (one ball at a time; the same pointer pressing again = its last release was missed)
    Sound.resume();
    this.b = b; this.id = e.pointerId; this.x0 = e.clientX; this.y0 = e.clientY; this.moved = false; this.touch = e.pointerType === 'touch';
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onCancel);
  },
  can(b) { return G.inputOn && !G.paused && !b.flight && (b.where === 'rack' || b.where === 'socket') && (!G.spotOnly || G.spotOnly === b); },
  move(e) {
    if (e.pointerId !== this.id) return;
    const b = this.b;
    if (!this.moved) {
      if (Math.hypot(e.clientX - this.x0, e.clientY - this.y0) < this.SLOP || !this.can(b)) return; // (stays a tap)
      this.lift(b, e);
    }
    if (!b.drag) return;
    idleReset();
    const p = Stage.s2w(e.clientX, e.clientY);
    b.drag.px = p.x + b.drag.ox; b.drag.py = p.y + b.drag.oy;
    this.aimAt(b);
  },
  lift(b, e) {
    this.moved = true;
    if (b.where === 'socket') { G.sockets[b.socket] = null; b.where = 'rack'; b.socket = -1; onSocketsChanged(); }
    const p = Stage.s2w(e.clientX, e.clientY);
    // it keeps its place under the finger (on a touch screen it rises a little above the fingertip, so it stays in view)
    b.drag = { px: b.x, py: b.y, ox: b.x - p.x, oy: b.y - p.y - (this.touch ? 40 : 0), mx: b.x, my: b.y, k: 0, s: 1.08 };
    b.hop = 0; b.drop = 0; b.lifted = true;
    $('#fly').appendChild(b.el); b.el.classList.add('drag'); document.body.classList.add('dragging');
    Sound.pop(1.15); Spot.hold(true);
  },
  // the socket it would drop into: the nearest empty one, once the ball is over the cannon (near any of its sockets)
  aimAt(b) {
    const d = b.drag, holes = Cannon.holes(), CATCH = Math.max(130, holes[0].r * 3);
    let near = Infinity, best = -1, bd = Infinity;
    holes.forEach((h, i) => {
      const q = Math.hypot(d.px - h.x, d.py - h.y); near = Math.min(near, q);
      if (!G.sockets[i] && q < bd) { bd = q; best = i; }
    });
    if (near > CATCH || !G.inputOn) best = -1;
    if (best !== this.aim) {
      if (this.aim >= 0) Cannon.highlight(this.aim, false);
      if (best >= 0) { Cannon.highlight(best, true); Sound.tick(); }
      this.aim = best;
    }
    if (best >= 0) { const s = Cannon.socketPos(best), k = clamp(1 - bd / CATCH, 0, 1); d.k = k; d.mx = s.x; d.my = s.y; d.s = lerp(1.08, s.s * 1.04, k); }
    else { d.k = 0; d.s = 1.08; }
  },
  up(e) {
    if (e.pointerId !== this.id) return;
    const b = this.b, moved = this.moved;
    this.end();
    if (moved) this.drop(b); else tapBall(b, true);
  },
  drop(b) {
    const i = this.aim, overFull = !!b.drag && i < 0 && G.sockets.every(Boolean) && this.overCannon(b);
    this.release(b);
    if (i >= 0 && G.inputOn && !G.paused && !G.sockets[i]) { seat(b, i, 0.3, 14); onSocketsChanged(); return; }
    this.home(b);
    if (overFull && G.inputOn) { Sound.nope(); Cannon.pulseSockets(); }
  },
  overCannon(b) { return Cannon.holes().some((h) => Math.hypot(b.x - h.x, b.y - h.y) < Math.max(130, h.r * 3)); },
  // back to its cup (under the tray's lip again at once, so it lands into the tray)
  home(b) {
    $('#balls').appendChild(b.el); b.lifted = false;
    flyBall(b, 0.5, 50); Sound.unload();
    b.onLand = () => Sound.settle();
  },
  release(b) {
    if (this.aim >= 0) Cannon.highlight(this.aim, false);
    this.aim = -1;
    b.drag = null; b.el.classList.remove('drag'); document.body.classList.remove('dragging');
    Spot.hold(false);
  },
  // the game takes the ball away mid-drag (FIRE by key, pause, restart): it goes home
  cancel() {
    const b = this.b; if (!b) return;
    const moved = this.moved;
    this.end();
    if (moved && b.drag) { this.release(b); this.home(b); }
  },
  end() {
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onCancel);
    this.b = null; this.id = -1;
  },
};
Drag.onMove = (e) => Drag.move(e);
Drag.onUp = (e) => Drag.up(e);
Drag.onCancel = (e) => { if (e.pointerId === Drag.id) Drag.cancel(); };
function tapFire() {
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn) return;
  if (G.spotOnly && G.spotOnly !== 'fire') { Sound.nope(); Spot.nudge(); return; }
  idleReset(); Cannon.pressT = 1; Sound.press();
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); Cannon.wiggleFire(); return; }
  G.inputOn = false; Drag.cancel(); // (a ball still in hand goes home)
  const r = G.fireResolve; G.fireResolve = null; if (r) r();
}

// ---- one shot: cannon → cloud → two identical tokens land on both sides ----
function makeFlyBall(b, s) {
  const el = document.createElement('div'); el.className = 'ball'; el.style.pointerEvents = 'none';
  el.innerHTML = `<img src="${IMG}ball_${b.i}.webp" alt=""><b>${labelHTML(b.op)}</b>`;
  $('#fly').appendChild(el);
  const o = { el, x: MUZZLE.x, y: MUZZLE.y, s, r: 0 };
  o.apply = () => (el.style.transform = `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px) rotate(${o.r.toFixed(1)}deg) scale(${o.s.toFixed(3)})`);
  o.apply();
  return o;
}
function fizzle(b) {
  FX.burst(b.x, b.y, b.hex, 16, 300);
  tween(0.5, (e) => (b.scale = Math.max(0.001, 1 - e)), Ease.inCubic).then(() => (b.where = 'gone'));
}

// =====================================================================
//  A ROUND'S SHOTS + OUTCOME = ONE GSAP TIMELINE (animation skill rule 5).
//  The equation after every shot is worked out before anything moves,
//  so the whole concept sequence is laid out first; Skip jumps it to the
//  end, silently (tl.progress(1)). Positions measured on screen (where
//  the new terms sit) are read once, when their step begins.
// =====================================================================
function roundTimeline() {
  const tl = gsap.timeline({ paused: true });
  const balls = G.sockets.slice(), eqs = [G.eq];
  let solvedAt = -1;
  for (let i = 0; i < balls.length && solvedAt < 0; i++) {
    const nx = balls[i] ? applyOp(eqs[i], balls[i].op) : eqs[i];
    eqs.push(nx);
    if (balls[i] && isSolved(nx)) solvedAt = i;
  }
  let at = 0.15, first = true;
  for (let i = 0; i < eqs.length - 1; i++) if (balls[i]) { at = addShot(tl, at, i, balls[i], eqs[i], eqs[i + 1], first); first = false; }
  const solved = solvedAt >= 0;
  if (solved) {
    const rest = balls.slice(solvedAt + 1).filter(Boolean); // x is already free: the other loaded balls fizzle
    if (rest.length) tl.call(() => rest.forEach(fizzle), null, at);
    addFreed(tl, at);
  } else addStuck(tl, at);
  return { tl, solved };
}
// one shot: cannon → cloud → two identical terms land on both sides → the equation simplifies. Returns its end time.
// The camera is directed beat by beat (docs/GAME_PROMPT.md §6.5 + §7.2): wind-up on the cannon → recoil kick and
// shake as it fires → it follows the ball up → impact (a soft jolt, no freeze-frame) → it holds on the equation for reading.
// Every step is its own beat from Motion.BEAT, slow enough to follow, with a pause to read between the steps.
const SHOT_CAM = { WIND: { fx: CX, fy: 540, z: 1.06 }, FOLLOW: { fx: CX, fy: 260, z: 1.1 }, READ: { fx: CX, fy: 260, z: 1.12 } };
function addShot(tl, t0, i, b, eq0, eq1, first = true) {
  const B = Motion.BEAT, to = { ...CLOUD_HIT };
  let p = null, inL = null, inR = null, ms = null, tg = null;
  // 1) aim: the loaded socket glows while the camera leans in on the cannon (for a second ball, from the equation it was reading)
  tl.call(() => { Cannon.highlight(i, true); Sound.tick(); b.land = 1; }, null, t0);
  if (first) camDrive(tl, t0 + 0.1, SHOT_CAM.WIND, B.AIM + B.LOAD * 0.5, Ease.inOutQuad);
  else camDrive(tl, t0, SHOT_CAM.WIND, B.AIM + 0.3, Ease.inOutCubic);
  // 2) load: the ball sinks into the barrel and the cannon squats (anticipation)
  const tlo = t0 + B.AIM;
  tl.call(() => { b.where = 'loading'; flyBall(b, B.LOAD, 24); Sound.charge(); }, null, tlo);
  drive(B.LOAD, (e) => (Cannon.antic = e), Ease.inOutQuad, tl, tlo);
  const tf = tlo + B.LOAD; // 3) FIRE
  tl.call(() => {
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.shoot(); Sound.boom(); Music.punch(); Haptic.buzz(25); Cannon.groundDust(true);
    Stage.hit({ trauma: 0.42, ky: 14, zoom: 0.03 }); // the screen wiggle: a rounded shake + recoil kick + zoom punch
    // the blast: white-hot flash, fireball, shock ring, embers, and thick smoke that lingers and drifts
    // (the ball flies above all of it)
    FX.blast(MUZZLE.x, MUZZLE.y, -Math.PI / 2, 1);
    p = makeFlyBall(b, 0.66); Sound.whistle();
  }, null, tf);
  camDrive(tl, tf + 0.05, SHOT_CAM.FOLLOW, B.FLIGHT + 0.1, Ease.inOutQuad); // the camera follows the ball up to the cloud
  // the ball leaves the barrel fast and slows as it climbs (like a real throw), turning once, so its label lands upright
  drive(B.FLIGHT, (e) => {
    if (!p) return;
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r = 360 * e; p.s = 0.66 - 0.14 * e; p.apply();
    FX.trail(p.x, p.y + 30, b.hex); if (Math.random() < 0.6) FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.outQuad, tl, tf);
  const th = tf + B.FLIGHT; // 4) the hit: the term splits in two, and one copy flies to EACH side ("x + 5 − 5 = 7 − 5")
  camDrive(tl, th + 0.1, SHOT_CAM.READ, B.SPLIT + B.READ, Ease.inOutQuad); // a slow push-in through the reading beat
  tl.call(() => {
    if (p) p.el.remove(); p = null;
    FX.burst(to.x, to.y, b.hex, 40, 460); FX.burst(to.x, to.y, '#ffffff', 16, 320); FX.ring(to.x, to.y, '#ffffff', 170);
    Sound.pop(1.5);
    Stage.hit({ trauma: 0.16, ky: -6, zoom: 0.015 }); Cloud.squash(); // impact: a soft jolt and the cloud squashes (no freeze-frame: it reads as lag)
    [inL, inR] = EqUI.showImpact(eq0, b.op, b.ink);
    tg = [inL, inR].map((el) => (el ? EqUI.worldAt(el) : { ...to }));
    ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
    ms.forEach((m) => { m.x = to.x; m.y = to.y; m.apply(); });
  }, null, th);
  drive(B.SPLIT, (e) => {
    if (!ms) return;
    ms.forEach((m, j) => { // the copies stay upright (only a slight lean), so "−5" can be read on its way to each side
      m.x = bez(to.x, (to.x + tg[j].x) / 2, tg[j].x, e); m.y = bez(to.y, Math.min(to.y, tg[j].y) - 100, tg[j].y, e);
      m.s = 0.5 - 0.22 * e; m.r = (j ? 10 : -10) * Math.sin(e * Math.PI); m.apply();
      if (Math.random() < 0.5) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic, tl, th);
  const tl2 = th + B.SPLIT; // the copies land and become terms
  tl.call(() => {
    if (ms) ms.forEach((m) => m.el.remove()); ms = null;
    [inL, inR].forEach((el, j) => { if (el) { el.classList.remove('hid'); el.classList.add('pop'); } FX.burst(tg[j].x, tg[j].y, b.hex, 18, 260); });
    Sound.ding(0); Sound.ding(2); Stage.hit({ ky: 2 });
  }, null, tl2);
  const tp = tl2 + B.READ; // 5) after a reading beat, the terms that combine light up together…
  tl.call(() => { EqUI.pair(eq1); Sound.tick(); }, null, tp);
  const tv = tp + B.PAIR; // …the ones that cancel fade away…
  tl.call(() => { EqUI.vanish(eq1); Sound.sparkle(); }, null, tv);
  const ts = tv + B.CANCEL; // …and the simplified equation glides together
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  return ts + B.SETTLE + B.READ2; // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes: no "wrong" label, no hints, no retry; both outcomes advance ----
function addFreed(tl, t0) {
  const B = Motion.BEAT;
  let cage = null, img = null, p = null, q = null, s0 = 1, fl = null;
  // 1) the cage glows… and unlocks
  tl.call(() => { cage = EqUI.cage(); img = cage && cage.querySelector('img'); if (cage) cage.classList.add('glowx'); Sound.ding(1); }, null, t0);
  // the camera pushes in on the cage (framing x and its value together)
  camDrive(tl, t0, () => { const c = EqUI.cage(), w = c ? EqUI.worldAt(c) : { x: 700, y: 200 }; return { fx: (w.x + CLOUD_MID.x) / 2, fy: w.y + 60, z: 1.18 }; }, 0.9, Ease.inOutCubic);
  tl.call(() => Sound.unlock(), null, t0 + B.UNLOCK * 0.7);
  // 2) the cage bursts open; the free x stays on the card so it reads "x = 2"
  const tb = t0 + B.UNLOCK;
  tl.call(() => {
    p = img ? EqUI.worldAt(img) : { x: 700, y: 170 };
    if (img) { img.src = IMG + 'xchar.webp'; cage.classList.remove('glowx'); cage.classList.add('free'); }
    EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.creak(); Sound.spring(); Sound.fanfare(); flashScreen();
    FX.burst(p.x, p.y, '#ffd34d', 46, 560); FX.burst(p.x, p.y, '#c58bff', 40, 480); FX.ring(p.x, p.y, '#ffffff', 200);
    FX.confetti(p.x, p.y, 140, 1000);
    // the big moment: a shake and a zoom punch (no freeze-frame or slow-mo: on screen they read as lag)
    Stage.hit({ trauma: 0.28, zoom: 0.025 }); Haptic.buzz([15, 30, 15]);
  }, null, tb);
  tl.call(() => react('freed'), null, tb + 0.3); // just after the burst's first hit, over the "x = 2" reading beat
  camDrive(tl, tb + 0.3, { z: 1.15 }, 1.4, Ease.inOutQuad); // eases back a touch while "x = 2" is read
  // 3) after a reading beat (the value of x), x does a happy hop… and vanishes in a poof of sparkles
  const th = tb + B.HOLD; // “x = 2” rests on the card, pulsing gently
  tl.call(() => {
    q = img ? EqUI.worldAt(img) : p;
    s0 = img ? img.getBoundingClientRect().height / (Stage.S * Stage.z) / 115 : 1; // (.xfly is 115 tall: the flying x starts at the exact size of the one on the card)
    fl = document.createElement('div'); fl.className = 'xfly'; fl.innerHTML = `<img src="${IMG}xchar.webp" alt="">`;
    fl.style.willChange = 'transform,opacity';
    $('#fly').appendChild(fl);
    if (img) img.style.visibility = 'hidden';
    EqUI.el.classList.add('fadeout');
    Sound.spring();
  }, null, th);
  const put = (x, y, r, s, o) => { if (!fl) return; fl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`; fl.style.opacity = o.toFixed(3); };
  drive(B.HOP, (e) => put(q.x, q.y - 70 * e, 8 * Math.sin(e * Math.PI), s0 * (1 + 0.18 * e), 1), Ease.outQuad, tl, th);
  tl.call(() => Sound.sparkle(), null, th + B.HOP);
  drive(B.POOF, (e) => {
    put(q.x, q.y - 70 - 12 * e, 8 + 200 * e, s0 * 1.18 * (1 - e), 1 - e * 0.6);
    if (fl && Math.random() < 0.9) FX.trail(q.x + rr(-30, 30), q.y - 70 + rr(-30, 30), pick(['#d4b0ff', '#fff1a8', '#ffffff']));
  }, Ease.inCubic, tl, th + B.HOP);
  // 4) the cloud clears; the next round brings in a new cloud
  const tp = th + B.HOP + B.POOF;
  tl.call(() => {
    if (q) { FX.burst(q.x, q.y - 80, '#d4b0ff', 34, 340, { g: 0 }); FX.burst(q.x, q.y - 80, '#ffffff', 18, 240, { g: 0 }); FX.ring(q.x, q.y - 80, '#ffffff', 110); }
    Sound.pop(1.6);
    if (fl) fl.remove(); fl = null;
  }, null, tp);
  camDrive(tl, tp, { fx: CX, fy: CY, z: 1 }, B.CLEAR + 0.1); // back to the base framing as the cloud clears
  Cloud.clearTL(tl, tp);
  tl.to({}, { duration: B.BREATH }, tp + B.CLEAR); // a breath before the next round
}
function addStuck(tl, t0) {
  const B = Motion.BEAT, tr = t0 + 0.6;
  camDrive(tl, t0, { fx: CX, fy: 330, z: 1.08 }, 0.8, Ease.inOutCubic); // the camera holds on the cloud
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.3, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  tl.call(() => react('stuck'), null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => EqUI.el.classList.remove('wob'), null, tr + B.RATTLE);
  const tg = tr + B.RATTLE + 0.3; // a beat to see it is still caged, then the cloud sails away
  Cloud.leaveTL(tl, tg);
  camDrive(tl, tg, { fx: CX, fy: CY, z: 1 }, B.LEAVE); // back to the base framing as the cloud floats away
}
function playShots() {
  const { tl, solved } = roundTimeline();
  G.tl = tl;
  Cannon.live = 3; // the cannon gets its own layer now (at the tap), not mid-shot
  return new Promise((res) => {
    tl.eventCallback('onComplete', () => { if (G.tl === tl) G.tl = null; Skip.hide(); res(solved); });
    // Skip: the shot lands at its end, silently; the camera snaps to its final framing, no freeze or shake left
    Skip.show(() => { if (G.tl === tl) { VO.stop(); Motion.skip(tl); TimeFx.reset(); Cannon.settle(); Stage.snap(); } });
    tl.play();
  });
}

// ---- the tutorial: ONE, on the first screen (x + 5 = 7) of the first game on this device, and on no other screen
// (user, 20 Nov). The spotlight shows the three parts in turn: the equation, then the cannon, then the orbs; then
// the hand taps the glowing −5 and the player taps it (or drags it, or presses its key): it flies into the cannon,
// and the cannon fires it at the cloud by itself. Every line by key; Skip ends it.
// It plays every time the game is opened (user, 20 Nov: "in this screen, add a tutorial part": it had been saved in
// the browser after one showing, so it never came again). Only Play again, in the same visit, goes straight into play.
function skipTutorial() {
  G.tutSkip = true;
  VO.stop(); Spot.hide(); G.spotOnly = null;
  Rack.balls.forEach((b) => (b.guide = false));
  if (G.hooks) { G.hooks.onFill = null; G.hooks.softSpot = false; }
}
const sockSpot = (i = 0) => () => { const h = Cannon.holes()[i]; return Spot.worldBox(h.x, h.y, h.r * 2, h.r * 2); };
// the three parts the tutorial shows, as boxes on screen (stage units)
const eqSpot = () => Spot.boxOf(EqUI.el);
const cannonSpot = () => Spot.boxOf([$('#c1'), $('#c2'), $('#fireBtn')]); // (the hidden body has no box, so only the one showing counts)
const orbsSpot = () => Spot.boxOf(Rack.balls.filter((b) => b.where === 'rack').map((b) => b.el));
const ballSpot = (b) => () => { const r = Rack.restPos(b.holder); return Spot.worldBox(r.x, r.y - 11, BALL_D, BALL_D + 22); }; // (room for its hop above the cup)
async function tutorialLoad() {
  G.taught1 = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  // 1) the equation, 2) the cannon, 3) the orbs: one at a time, everything else dimmed and blurred
  const parts = [
    [eqSpot, { sx: 1.08, sy: 1.25, pad: 30 }, 'tutEquation'],
    [cannonSpot, { sx: 1.12, sy: 1.12, pad: 20 }, 'tutCannon'],
    [orbsSpot, { sx: 1.5, sy: 2, pad: 24 }, 'tutOrbs'],
  ];
  for (const [box, o, line] of parts) {
    if (G.tutSkip) return null;
    Spot.show(box, o);
    if (line === 'tutOrbs') Rack.glowWave();
    await VO.say(line, 0.5);
  }
  if (G.tutSkip) return null;
  return () => {
    if (G.tutSkip) return;
    // 4) tap the glowing −5: the hand taps it, and only it can be loaded (a key or a drag loads it too)
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(ballSpot(gb), { hand: true, sx: 1.2, sy: 1.2, pad: 26, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26 }); }
    else Rack.glowWave();
    VO.say('tutTapOrb', 0.5);
    // 5) it flies into the cannon; once it has landed in its socket, the cannon fires it at the cloud by itself
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip || filled !== n || G.hooks.autoFire) return;
      G.hooks.autoFire = true; G.spotOnly = 'fire'; // (the −5 stays in; FIRE may still be tapped in the meantime)
      Spot.hide();
      wait(Motion.BEAT.TAP_FLY + 0.45).then(() => { if (!G.tutSkip && G.fireResolve) tapFire(); });
    };
  };
}
// ---- a full round ----
async function firstEntry() { // the play scene has just built itself after the start screen
  EqUI.el.style.transition = 'opacity .35s'; EqUI.el.style.opacity = 1;
  await wait(0.2);
  if (G.welcome) { await Promise.race([G.welcome, wait(4)]); G.welcome = null; } // the welcome ends before the first lesson line
}
async function playRound(sid, i) {
  const R = ROUNDS[i];
  G.idx = i; G.hooks = {};
  Perf.step(); // a lower quality tier, if frames have been slow, applies here between shots (never mid-shot)
  G.eq = { layers: initLayers(R.eq), rhs: F(R.rhs) };
  G.sockets = new Array(R.slots).fill(null);
  const tasks = [Cannon.morph(R.slots)];
  if (G.rackFor !== R) { tasks.push(refreshBalls(R.balls)); G.rackFor = R; }
  EqUI.setEq(G.eq, false);
  if (G.firstEntry) { G.firstEntry = false; tasks.push(firstEntry()); }
  else { // the camera glances toward the cloud coming in from the right, then settles with it
    tasks.push(Cloud.enter());
    tasks.push(Stage.camTo({ fx: CX + 50 }, 0.4, Ease.inOutQuad).then(() => Stage.camTo({ fx: CX }, 0.75, Ease.inOutCubic)));
  }
  await Promise.all(tasks);
  if (sid !== G.session) return;
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad(); // (the only tutorial: the first −5 shot, first game only)
  else VO.sayAfter(introLine(i), 0.4); // a short intro, once the reaction before it has finished (play starts at once)
  if (sid !== G.session) return;
  const fired = new Promise((res) => (G.fireResolve = res));
  G.inputOn = true; idleReset(); onSocketsChanged();
  if (after) after();
  await fired;
  if (sid !== G.session) return;
  G.spotOnly = null; Spot.hide();
  G.inputOn = false; G.hooks = {}; Cannon.setFireActive(false);
  Rack.balls.forEach((b) => (b.guide = false));
  VO.stop();
  const solved = await playShots(); // the shots and their outcome: one timeline, skippable
  if (sid !== G.session) return;
  if (solved) G.freed++;
}
async function runSession() {
  const sid = ++G.session;
  G.freed = 0; G.state = 'play'; G.said = { freed: 0, stuck: 0, next: 0 };
  for (let i = 0; i < ROUNDS.length; i++) {
    if (sid !== G.session) return;
    await playRound(sid, i);
  }
  if (sid !== G.session) return;
  await showEnd();
}
async function showEnd() {
  G.state = 'end';
  EqUI.render(msgHTML(T('endFreed'), T('endScore', { freed: G.freed, total: ROUNDS.length })), false);
  QCard.label('qScore'); // the label on the cloud now reads "Your score"
  refreshBalls([]); G.rackFor = null;
  Stage.camTo({ fx: CX, fy: 300, z: 1.05 }, Motion.BEAT.CLOUD_IN, Ease.inOutCubic); // the end card is framed a little closer
  await Cloud.enter();
  Sound.fanfare();
  if (G.freed) FX.confetti(CLOUD_MID.x, CLOUD_MID.y + 40, 100 + G.freed * 30, 1100);
  $('#endUI').classList.add('on');
  VO.sayAfter(endLine(), 0.8);
}
async function restartGame() {
  G.session++;
  if (G.tl) { G.tl.kill(); G.tl = null; } // the running round's timeline is torn down with everything else in flight
  Motion.killAll(); Skip.hide();
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; Drag.cancel(); Spot.hide();
  $('#endUI').classList.remove('on');
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.parts = [];
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset();
  QCard.label(null); // back to no label during play
  G.rackFor = null;
  runSession();
}

// ---- pause ----
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p; Scenery.pause(p);
  $('#pauseBtn img').src = IMG + (p ? 'play.webp' : 'pause.webp');
  $('#pauseBtn').setAttribute('aria-label', T(p ? 'btnResume' : 'btnPause'));
  if (p) { Drag.cancel(); gsap.globalTimeline.pause(); Music.pause(); Sound.suspend(); VO.pause(); } // (a ball in hand goes home)
  else { gsap.globalTimeline.resume(); Music.resume(); Sound.resume(); VO.resume(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient();
  G.welcome = VO.say('voWelcome', 0.15); // said while the scene builds itself
  flashScreen();
  // zoom-through: the camera punches toward the Play button while the start screen bursts away…
  Stage.camTo({ fx: TL.play.x, fy: TL.play.y, z: 1.15 }, 0.4, Ease.inCubic);
  await Title.exit();
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.y = -470; Cannon.morphS = 0.001; Rack.enterY = 330;
  QCard.hide();
  $('#world').classList.remove('title');
  // …and the play scene eases out from that close framing while it builds itself: the cloud with the question
  // card first, then the tray, then the cannon, one after another (each lands with only a soft overshoot)
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 1.1, Ease.outCubic);
  Sound.swoosh();
  await Promise.all([
    tween(Motion.BEAT.CLOUD_IN, (e) => (Cloud.y = -470 * (1 - e)), Ease.outBackSoft).then(() => QCard.pop()),
    tween(0.9, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBackSoft, 0.18).then(() => Sound.settle()),
    tween(0.75, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack, 0.5).then(() => { Sound.clunk(); Cannon.groundDust(true); Stage.hit({ trauma: 0.12, ky: 6 }); }),
  ]);
  $('#hud').classList.add('on');
  G.firstEntry = true;
  runSession();
}

// =====================================================================
//  INPUT, LOOP, BOOT
// =====================================================================
function wireInput() {
  $('#fireBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapFire(); });
  $('#playBtn').addEventListener('click', onPlay);
  $('#pauseBtn').addEventListener('click', () => { const p = !G.paused; if (!p) setPaused(false); Sound.click(); if (p) setPaused(true); });
  $('#againBtn').addEventListener('click', () => { Sound.click(); restartGame(); });
  $('#sndBtn').addEventListener('click', () => { Sound.init(); Sound.click(); Sound.setMuted(!Sound.muted); $('#sndBtn').classList.toggle('muted', Sound.muted); });
  $('#rotateOk').addEventListener('click', () => $('#rotate').classList.add('dismissed'));
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (G.state === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPlay(); return; }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setPaused(!G.paused); return; }
    if (e.key === 'm' || e.key === 'M') { $('#sndBtn').click(); return; }
    if (G.paused) return;
    if (/^[1-8]$/.test(e.key)) { const b = Rack.balls.find((x) => x.holder === +e.key - 1); if (b) tapBall(b); }
    else if (e.key === 'Backspace') { const f = G.sockets.filter(Boolean); if (f.length) tapBall(f[f.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') { e.preventDefault(); tapFire(); }
  });
  // a tapped button shouldn't keep focus (no focus box, and Enter/Space stay for FIRE)
  addEventListener('pointerup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  addEventListener('resize', () => Stage.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setPaused(true); });
}
// one frame, on gsap.ticker (requestAnimationFrame underneath): everything moves by elapsed time
// Real time (rdt) drives the camera and its shake; game time (dt) is real time × hit-stop / slow-mo (TimeFx), and
// GSAP's global timeline runs at the same scale, so timelines, tweens and the loop freeze and slow together.
function frame(time, deltaMs) {
  const sp = window.__cqSpeed || 1; // (a test hook: run the whole game faster)
  const rdt = Math.min(0.05, Math.max(0, deltaMs / 1000)) * sp;
  if (!Clock.paused) TimeFx.update(rdt);
  const ts = sp * TimeFx.scale;
  if (gsap.globalTimeline.timeScale() !== ts) gsap.globalTimeline.timeScale(ts);
  if (Clock.paused) return;
  Perf.sample(deltaMs, rdt);
  const dt = rdt * TimeFx.scale;
  Clock.t += dt; const t = Clock.t;
  Music.update(rdt);
  if (G.state === 'title' && !Motion.reduced) { const c = Stage.cam, tt = t - Title.t0; c.fx = CX + Math.sin(tt * 0.22) * 28; c.fy = CY + Math.sin(tt * 0.31) * 10; c.z = 1.05 + Math.sin(tt * 0.17) * 0.02; } // (drifts from where boot framed it)
  Cloud.apply(t, dt); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(rdt); Spot.update(dt, t); FX.update(dt); FX.draw();
}
// ---- pictures: there is no loading screen. The start screen shows as soon as its own pictures are in (the page
// preloads them); the play scene's arrive while the player is on the start screen (Title.exit waits for them,
// in case Play is tapped first) ----
const Pics = {
  TITLE: ['bg_sky', 'sun_glow', 'sun_rays', 'bg_mount', 'bg_trees', 'bg_plantL', 'bg_plantR', 'bg_deck', 't_logo', 't_cannon', 'playbtn', 't_cage', 't_x', 't_cage_front'],
  GAME: ['cloud', 'cannon1', 'cannon2', 'cannon1_front', 'cannon2_front', 'rack', 'rack_front', 'fire', 'cage_x', 'xchar', 'hand', 'pause', 'play', 'sound', 'question_board',
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `ball_${i}`)],
  game: null, // (a promise: the play scene's pictures and the font)
  // resolves when every picture has arrived and is decoded (so it shows without a hitch), or after cap seconds,
  // so a picture that never comes never holds the game up
  load(names, cap, more = []) {
    const one = (n) => {
      const im = new Image(); im.src = IMG + n + '.webp';
      return (im.decode ? im.decode() : new Promise((r) => { im.onload = im.onerror = r; })).catch(() => {});
    };
    return Promise.race([Promise.all(names.map(one).concat(more)), later(cap * 1000)]);
  },
};
async function boot() {
  Motion.init();
  // the sound, now, so the start screen can be heard (its own few effects came with the page: js/sfx_title.js).
  // Where the browser still holds the page silent, it wakes on the first tap or key (Sound.listen)
  Sound.init(); Sound.listen();
  // lay the scene out at once (it stays hidden, over the plain sky, until its pictures are in)
  Scenery.build(); FX.init(); Stage.init(); Perf.init();
  removeEventListener('resize', fitStage); // (index.html's first fit; the game's Stage keeps the screen fitted from here)
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 }); Stage.snap(); Stage.update(0);
  await Pics.load(Pics.TITLE, 8); // usually in already: they have been downloading since the page's <head>
  if (Sound.live()) await Promise.race([Sound.ready(), later(1000)]); // (sound allowed at once: the entrance's sounds are decoded first)
  Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); Title.init(); Spot.init(); Skip.init();
  wireInput();
  gsap.ticker.add(frame);
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Drag, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX, Pics };
  // the start screen: the scene fades in while the title plays its intro, and the Play button pops in
  G.state = 'title';
  Title.start();
  Motion.to($('#world'), { opacity: 1, duration: Motion.DUR.SLOW, ease: Motion.EASE.OUT });
  // …and the rest comes while the player looks at it (nothing of it was asked for before, so it never slowed the
  // start screen): the play scene's pictures (the markup's data-src ones, the tray's balls) + the font, then the sound effects
  for (const im of document.querySelectorAll('img[data-src]')) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  const font = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('600 64px Poppins', '0123456789+−×='), document.fonts.load("400 64px 'Trig Text'", '0123456789+−×÷=()')]).catch(() => {}) : null;
  Pics.game = Pics.load(Pics.GAME, 15, font ? [font] : []);
  const sfx = document.createElement('script'); sfx.src = 'js/sfx.js'; document.body.appendChild(sfx); // (it hands itself to Sound.loadSfx)
}
boot();
