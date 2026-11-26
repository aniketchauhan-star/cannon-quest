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
// the equation as it reads with its brackets multiplied out and like terms joined ("3(x + 2) − 6" → "3x")
function normalize(eq) { let L = []; for (const l of eq.layers) L = addLayer(L, l); return { layers: L, rhs: eq.rhs }; }
// A shot that adds to a bracket leaves it on screen ("3(x + 2) − 6 = 15"). The step a learner needs to see before
// "3x = 15" (design review, 23 Nov 2026: "show the simplified line between them") is the bracket multiplied out with
// both numbers still there: "3x + 6 − 6 = 15". This returns that line, or null when there is no such step
function expandStep(eq) {
  const L = eq.layers, n = L.length;
  if (n < 3 || L[n - 1].t !== 'add' || L[n - 2].t !== 'mul') return null;
  const inner = L.slice(0, n - 1); // (…x + a)·m: a bracket only when an add sits inside the multiplication
  if (!inner.slice(0, -1).some((l) => l.t === 'add')) return null;
  return { layers: [...normalize({ layers: inner, rhs: eq.rhs }).layers, L[n - 1]], rhs: eq.rhs };
}
// what the cloud shows after a shot: the simplified line (brackets multiplied out once a number is added to them)
const shownAfter = (eq) => (expandStep(eq) ? normalize(eq) : eq);
// the ball (its label, as in parseOp) that undoes the outermost thing done to x: the inverse of the top layer
function undoLabel(eq) {
  const top = eq.layers[eq.layers.length - 1]; if (!top) return null;
  const v = top.v;
  if (top.t === 'add') return (v.n > 0 ? '−' : '+') + Math.abs(v.n) / v.d;
  return v.d === 1 ? '÷' + Math.abs(v.n) : '×' + v.d; // (×n is undone by ÷n, ÷d by ×d)
}
const LABEL_OP = { '−': '-', '+': '+', '×': '*', '÷': '/' };
// the whole way to free x from eq: the labels to fire, in order, and x's value
function solvePath(eq) {
  const steps = []; let e = eq;
  for (let i = 0; i < 6 && !isSolved(e); i++) { const lb = undoLabel(e); steps.push(lb); e = shownAfter(applyOp(e, parseOp(LABEL_OP[lb[0]] + lb.slice(1)))); }
  return { steps, x: e.rhs };
}

// ---------- question bank (from the brief), easy to hard (design review, 23 Nov 2026): two one-step, two two-step,
// then a negative answer and a bracket. The levels are never named on screen (the user, 25 Nov 2026: no "Level 2"
// banner, "no need of this type of things in game") ----------
const ROUNDS = [
  { eq: [['+', 5]], rhs: 7, slots: 1, balls: ['+5', '-5', '*5', '/5', '+3', '-3', '+2', '-2'], guide: ['-5'] },
  { eq: [['*', 3]], rhs: 18, slots: 1, balls: ['+3', '-3', '*3', '/3', '+5', '-5', '+2', '-2'] },
  { eq: [['*', 2], ['+', 3]], rhs: 11, slots: 2, balls: ['+3', '-3', '*2', '/2', '+2', '-2', '*3', '/3'] },
  { eq: [['/', 3], ['+', 2]], rhs: 6, slots: 2, balls: ['-2', '*3', '-6', '/3', '+2', '+6', '-3', '*2'] },
  { eq: [['*', 2], ['+', 7]], rhs: 1, slots: 2, balls: ['-7', '/2', '+7', '*2', '-2', '+2', '-6', '/7'] },
  { eq: [['+', 2], ['*', 3]], rhs: 21, slots: 2, balls: ['/3', '-2', '*3', '+2', '-3', '/2', '-6', '+6'] },
];
// ball art from the asset sheet (magenta, pink, green, cyan, coral, blue, yellow, purple) + darker ink for tokens
const BALL_HEX = ['#e33bf8', '#fb2c91', '#4fbf00', '#00b8d4', '#fd5c53', '#3185fd', '#f2b800', '#a54afb'];
const BALL_INK = ['#a312c0', '#d0106d', '#2f8a00', '#0089a6', '#d8352b', '#1d5fd1', '#c27f00', '#7a22d6'];
// an orb's colour says its operation (design review, 23 Nov 2026: "code colour by operation type, + warm, − cool,
// × green, ÷ purple, so players learn by sight"): + orange, − cyan, × green, ÷ violet. With these four the dark label
// keeps 4.9:1 or more against the orb behind it (WCAG AA is 4.5:1; measured on the art: the blue and purple orbs
// stay under 4.5:1 with any ink, so they are not used)
const OP_ART = { '+': 4, '-': 3, '*': 2, '/': 0 };

// =====================================================================
//  Equation → HTML shown on the cloud. data-key lets tokens glide to
//  their new places when the equation changes (FLIP animation).
// =====================================================================
const IMG = 'assets/img/';
const symHTML = (s) => (s === '÷' ? '<span class="dv"></span>' : s);
const labelHTML = (op) => symHTML(op.sym) + op.n;
// x on the cloud is the letter x, in x's own violet (design review, 23 Nov 2026: x's cage stands on the deck now, as
// the cannon's target, and the equation reads as written algebra; the cage wears an "x" tag, so the two are one)
const tk = (cls, key, inner) => `<span class="tk ${cls}" data-key="${key}">${inner}</span>`;
const cageHTML = () => tk('xv', 'x', 'x');
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
//  • Each shot (and its outcome) is ONE GSAP timeline; a tap on the scene while x
//    is being freed jumps it to the end, silently (tl.progress(1)). No Skip button.
//  • prefers-reduced-motion: motion lands at once (pauses for reading stay);
//    no shake, particles, idle loops or camera drift.
// =====================================================================
const Clock = { t: 0, paused: false };
const Motion = {
  DUR: { INSTANT: 0.08, FAST: 0.18, NORMAL: 0.3, SLOW: 0.45, REVEAL: 0.7 },
  EASE: { OUT: 'power2.out', IN: 'power2.in', INOUT: 'power2.inOut', POP: 'back.out(1.25)' },
  STAGGER: 0.1,
  // THE LESSON'S PACE (seconds). Each idea in a shot is its own beat with a pause to read (the user, 19 Nov: "so that
  // I can understand easily"). The design review (23 Nov 2026) had it squeezed to ~8 s from FIRE to the next
  // equation; the user found that too fast (25 Nov 2026: "the animation of the shoot and the x = something is coming,
  // and then cage is broke. That is too fast, so please make it slow so that user can understand"). So every beat
  // of the shot and the freeing is slower again (about 1.6× the review's), and "x = 2" now gets a beat of its own to
  // be read before the bolt flies: the shot ~6.5 s, "x = 2" 1.4 s, the cage ~4 s until x lands. A tap anywhere
  // still skips the celebration. No freeze-frames (they read as lag), gentle eases, no fast spins. Tune it all here.
  BEAT: {
    AIM: 0.55,       // a shot: the socket glows and the camera leans in on the cannon
    LOAD: 0.6,       //   the ball drops into the barrel while the cannon squats (anticipation)
    FLIGHT: 1.0,     //   cannon → cloud
    SPLIT: 0.85,     //   the hit term splits into two copies that fly to BOTH sides of the equation
    READ: 1.4,       //   time to read "x + 5 − 5 = 7 − 5"
    PAIR: 0.7,       //   the terms that cancel light up together…
    CANCEL: 0.7,     //   …and fade away
    SETTLE: 0.75,    //   the simplified equation glides together
    READ2: 1.3,      //   time to read the simplified equation (before a second shot)
    EXPAND: 0.85,    //   a bracket multiplied out ("3(x + 2) − 6" → "3x + 6 − 6"), on the way to the simplified line
    // freed: x's cage stands on the deck (design review, 23 Nov: "keep the caged X visible on deck as the cannon's
    // target… the payoff happens in the world"). Every stage of the user's cinematic break (23 Nov: cracks, shards,
    // x rising out of the light, a cloudburst) has its own beat, slow enough to follow, and they come ONE AFTER
    // ANOTHER, never two at once (the user, 25 Nov 2026: "the animation should come one by one… cage broken, then the
    // x come out… then go to the right side, and then cloud is burst, equation will change. And again x cage come")
    SOLVED: 1.4,     // "x = 2" lights up on the cloud and grows, and stays a moment to be read…
    BOLT: 0.8,       //   …then a bolt of light flies from the x on the cloud down to x's cage…
    CRACK: 1.6,      //   …x pushes three times (CAGE.push, played at CAGE.T / CRACK speed): the cage cracks, light leaks out
    SHATTER: 1.7,    //   …and bursts along its cracks: the shards tumble away and fade
    RISE: 1.6,       //   x rises out of the light, hovers (sparkles circle it), comes down and lands where the cage stood
    CHEER: 1.0,      //   x dances there a moment: it is free…
    HOP_OFF: 1.6,    //   …then it hops away to the right along the boards and off the screen (DeckCage.leaveTL)
    INHALE: 0.45,    // then the cloudburst, with x gone: the cloud draws in its breath (it squeezes, trembles, glows; "x = 2" is drawn in)…
    BURST: 0.85,     //   …and bursts in place: its puffs blast apart, a flash, rings, a shower
    BREATH: 0.3,     //   a moment of clear sky; then the next question's cloud forms, and only then does its cage drop in
    RATTLE: 1.1,     // stuck: the cage rattles, the cloud wobbles; then the same question again (one retry)
    REWIND: 0.7,     // a retry: the equation glides back to how it started, the fired orbs come back
    CLOUD_IN: 0.8,   // a new question's cloud forms in the same place, out of puffs that drift together
    BALLS_OUT: 0.3,  // the tray's balls shrink away…
    BALL_DROP: 0.55, //   …and the new ones drop in, one after another
    BALL_GAP: 0.05,
    TAP_FLY: 0.6,    // a tapped ball flies into its socket (or back to the tray)
    MORPH: 0.6,      // the cannon changes to 1 or 2 sockets
    CAGE_IN: 0.55,   // a new cage falls onto the deck (once the next cloud has formed; play starts when it has landed)
    SAID: 1.0,       // a line on the question board, once said, stays this long to be read, then the board lifts away (Caption.said)
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
    FX.clear(); // (the particles, the comet tails and the cage's shards)
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
// Adaptive quality (§9.4): tier 2 = full, tier 1 = half the particles, no rotational shake.
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

// ---------- skipping a shot: no button (the user, 26 Nov 2026: "Skip ki bhi [need ni hai]") ----------
// A shot says what skips it (show); only a tap on the scene while x is being freed calls it (wireInput: design
// review, "let a tap skip the celebration"). The tutorial cannot be skipped.
const Skip = {
  fn: null,
  now() {
    if (!this.fn || G.paused) return;
    Sound.click();
    const f = this.fn; this.fn = null; f();
  },
  show(fn) { this.fn = fn; },
  hide() { this.fn = null; },
};
// generated by build.sh (tools/vo_data.mjs) from tools/vo_takes.json: the lines voiced by a real person's recording
const VO_FILES = ["tutCannon","tutEquation","tutFreeX","tutOrbs","tutTapFire","tutTapOrb","voEndAll","voEndMost","voEndSome","voFreed1","voFreed2","voFreed3","voFreed4","voLast","voNext1","voNext2","voNext3","voStuck1","voStuck2","voWelcome"]; // keys with a clip in assets/VO/en/ (the other lines are not voiced)
const VO_WORDS = {"tutCannon":[0.11,0.5,0.68,0.8],"tutEquation":[0.1,0.65,0.92,1.1],"tutFreeX":[0.09,0.54,0.96],"tutOrbs":[0.08,0.62,0.73,0.88],"tutTapFire":[0.07,0.4,0.73],"tutTapOrb":[0.11,0.46,0.61,1.52],"voEndAll":[0.09,1.23,1.47,1.86,2.19,2.64,3.12],"voEndMost":[0.06,0.45,1.02,1.23,1.56,1.89,1.98],"voEndSome":[0.06,0.33,0.84,1.11,1.44,1.53,1.74,1.92],"voFreed1":[0.07,0.77,1.25,1.55],"voFreed2":[0.05,0.91,1.25,1.61],"voFreed3":[0.05,0.95,1.3,1.48,1.64],"voFreed4":[0.05,0.62],"voLast":[0.09,0.54,0.96,1.32,1.44],"voNext1":[0.12,0.39,0.69,0.81,1.08],"voNext2":[0.12,0.42,1.23,1.47,1.62,2.04],"voNext3":[0.09,0.87,1.32,1.5,1.62],"voStuck1":[0.15,0.33,0.84,1.14,1.26,1.53],"voStuck2":[0.05,0.43,0.64,1.34,1.66,1.77,2.02,2.38],"voWelcome":[0.06,0.66,0.87,1.29]}; // when each word of a clip starts (s from the clip's start), for the board

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
    if (m) { VO.stop(); if (!SILENT) Caption.hide(); } // (no voice, no board: the next voiced line brings it back)
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
  // the cloudburst (p = how big: 1, or 0.6 for the gentle "not yet" one): an airy whoomp (recorded air whooshes, a
  // cloth flap, a deep thud for its body) and the glittering shower after it (glass, pitched high)
  poof(p = 1) {
    if (!this.play('airmid', { vol: 0.42 * p, rate: 0.8, verb: 0.25, pan: 0 })) this.noise({ dur: 0.7, vol: 0.08, type: 'bandpass', f: 900, f2: 300, q: 0.7, attack: 0.03 });
    this.play('cloth', { vol: 0.34 * p, rate: 0.7, verb: 0.2, pan: 0 });
    this.play('air', { vol: 0.25 * p, rate: 0.62, t: 0.03, pan: 0 });
    this.play('thud', { vol: 0.32 * p, rate: 0.7, verb: 0.3, pan: 0 });
    const n = p < 1 ? 3 : 7;
    for (let i = 0; i < n; i++) this.play('glass2', { vol: 0.07, rate: rr(2, 3.2), t: 0.08 + i * 0.07, verb: 0.5, vary: 0.01 });
  },
  // ---- the cage cracking open (recorded clips only, see CREDITS.md) ----
  // a low rumble as the camera closes in: a distant boom's echo and a rolling hand truck, both slowed right down
  rumble() {
    this.play('echo', { vol: 0.32, rate: 0.55, verb: 0.35, pan: 0, vary: 0.02 });
    this.play('roll', { vol: 0.16, rate: 0.55, t: 0.05, pan: 0, vary: 0.02 });
  },
  // a push cracks the cage (i = 0, 1, 2: harder each time): the snap of the crack (a lock's spring, a gavel's knock
  // pitched up) and the metal groaning
  crack(i = 0) {
    this.play('key', { vol: 0.42 + 0.1 * i, rate: 1.3 - 0.1 * i, verb: 0.15, pan: 0 });
    this.play('knock', { vol: 0.28 + 0.08 * i, rate: 1.7 - 0.15 * i, t: 0.006, verb: 0.12, pan: 0 });
    this.strain(Math.min(1, i));
  },
  // the cage bursts: its break (lock snap, clang, bars clattering) on a deep thud, with a twinkle of light
  shatter() { this.cageBreak(); this.play('thud', { vol: 0.55, rate: 0.78, verb: 0.25, pan: 0 }); this.cheer(); },
  // x rises out of the light: a soft rising swish with a sparkle
  rise() { this.play('swish', { vol: 0.32, rate: 0.85, verb: 0.2, pan: 0 }); this.play('glass2', { vol: 0.12, rate: 2.5, t: 0.18, verb: 0.5 }); },
  // the cloud draws in its breath before it bursts
  inhale(p = 1) { this.play('airlong', { vol: 0.24 * p, rate: 1.4, verb: 0.2, pan: 0 }); },
  // a new cloud has formed: a soft two-note twinkle
  chime() { this.play('glass2', { vol: 0.14, rate: 2, verb: 0.45, pan: 0 }); this.play('glass1', { vol: 0.1, rate: 2.52, t: 0.09, verb: 0.45, pan: 0 }); },
  // fireworks at the end: a rocket's whoosh; its burst (a distant boom's echo, a cork's pop, a crackle of glass)
  fwLaunch() { this.play('whoosh', { vol: 0.2, rate: 1.9, verb: 0.15, vary: 0.06 }); },
  fwBurst() {
    this.play('echo', { vol: 0.38, rate: rr(0.95, 1.15), verb: 0.4, vary: 0.04 });
    this.play('cork', { vol: 0.2, rate: 0.75, verb: 0.25 });
    [2.2, 2.6, 3].forEach((r, i) => this.play('glass2', { vol: 0.06, rate: r, t: 0.12 + i * 0.07, verb: 0.5, vary: 0.02 }));
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

// ---------- background music: a naval battle far off, with nature round it (CC0, see CREDITS.md) ----------
// The user, 23 Nov: "change the BG music… like cannon, some fighting sound, but not too loud… add natural SFX in
// music". So the light lo-fi tune ("New Shoes") gave way to "War on Water: Chapter 1" (yd, CC0): an orchestral march
// from a naval-battle game, 85 bpm with marching drums but light bass (on 20 Nov a 170 bpm guitar track was "too
// heavy"). tools/mix_bgm.py mixes real recordings into it: wind in the trees, small waves on the shore, a few
// distant gulls, and distant cannon fire on the music's downbeats (muffled, with an echo off the water). One
// 135.5 s seamless loop (exactly 48 bars), at −19 LUFS (2 dB under the old track). It plays at its own speed, at
// 20% volume (level; the user, 20 Nov: "40% only", then "20%"), and dips to 40% of that while the voice speaks
// (duck), so it always sits softly UNDER the lesson.
const TRACKS = { game: 'assets/music/battle.webm' };
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

// ---------- the caption board (what the voice is saying): the wooden board at the top (CSS #cap) ----------
// Its words come WITH the voice, and only with it (the user, 20 Nov: "the question template comes word by word, with
// the voiceover… otherwise this will not come"). Nothing shows until the first line's voice really starts (its
// recorded clip playing): then the board drops in (ease-out) with the first word, and each word pops in as it is
// said (upTo, driven by the word clock Said, below). Once a line has been said, the board keeps it a moment to be
// read (Motion.BEAT.SAID) and then lifts away (the user, 26 Nov 2026: "yh instruction jab bol diya hta dena", said()):
// lines are there while they are being said, not left hanging. Lines that follow each other at once (the tutorial's
// "This is the equation." → "This is the cannon." → …) keep the board up between them (the user, 26 Nov 2026: "when the
// text come again and again… do not remove the question tablet"): the old words fade out and the new ones come, one
// by one, as they are said; a line cut short shows whole. An instruction the player has to act on ("Now tap FIRE.")
// stays until they do it (keep): the shot lifts the board away ("Tap fire wala instruction fire ke baad hta dena").
// Some lines are voice only and never bring the board (the cheers as x is freed: the user, 26 Nov 2026: "Boom! x is
// free yh sirf VO mei rhene do"). At the top it has one size all game (wide: the widest line it says there), so
// nothing of it moves between lines. It also lifts away (ease-in) when the screen changes: the end screen (place),
// Play again, or the sound turned off (no voice, no words: the next voiced line brings it back). A line whose voice
// never starts (no clip recorded yet, a clip that fails) brings no board. The board is
// sized for the whole line before its first word (fit: the text box exactly as wide as the line's longest row), so it
// never grows while the words come (a board whose size does change between lines, on the end screen, glides from
// its old box to the new one: FLIP). GSAP, transform + opacity only (animation skill); under reduced motion or a
// Skip each step lands at once.
// The board is the user's question template (assets/img/question_board.webp, cut by tools/cut_question_board.py)
// as a 9-slice, painted by paint() into the canvas .bg in whole device pixels, so its nine pieces meet exactly
// (a CSS border-image leaves faint lines across the cream at the stage's fractional scales). SLICE: where the
// template's rounded corners end, in WebP px (top right bottom left); EDGE: the same in art px, drawn at half the
// WebP (0.25 of the template), the template's own proportions, so its whole thick wooden frame shows.
// It hangs at the top of the screen, in the middle, above the cloud and never over it (#capPos; the user, 26 Nov
// 2026: "the question panel should come in top between… in upper side of the cloud"), so it drops in from above and
// lifts away; the end screen has no board, its line is only said (Caption.place). The letter x in its words is set as mathematics, as on the cloud (.mx). It has no speaker icon, and no
// round hear-again button waits between lines (the user, 25 Nov 2026: "remove the X and sound icon… from this
// entire game"): the board is only the words.
const BOARD = { SLICE: [96, 100, 81, 100], EDGE: [48, 50, 40.5, 50] };
// paint the board (the user's question template, a 9-slice) into canvas c, the size of element el, in whole device
// pixels (so its nine pieces meet without seams)
function paintBoard(c, el, im, edge = BOARD.EDGE) {
  if (!c || !im || !im.naturalWidth) return;
  const w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
  const k = ($('#stageTop').getBoundingClientRect().width / DW || 1) * (window.devicePixelRatio || 1) * (el.dataset.k ? +el.dataset.k : 1);
  const W = Math.round(w * k), H = Math.round(h * k), iw = im.naturalWidth, ih = im.naturalHeight;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const [st, sr, sb, sl] = BOARD.SLICE, [et, er, eb, ek] = edge.map((v) => Math.round(v * k));
  const sx = [0, sl, iw - sr, iw], sy = [0, st, ih - sb, ih], dx = [0, ek, W - er, W], dy = [0, et, H - eb, H];
  const g = c.getContext('2d'); g.clearRect(0, 0, W, H); g.imageSmoothingQuality = 'high';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    g.drawImage(im, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
}
// a word of the board, with the letter x in it (x, x!, x?) set as mathematics (.mx: Latin Modern Math's italic x, as
// on the cloud); every other word is plain text
function mathX(el, word) {
  const m = /^([^A-Za-z]*)x([^A-Za-z]*)$/.exec(word);
  if (!m) { el.textContent = word; return; }
  const x = document.createElement('span'); x.className = 'mx'; x.textContent = 'x';
  el.replaceChildren(...[m[1], x, m[2]].filter((p) => p !== ''));
}
const Caption = {
  el: null, bg: null, txt: null, pic: null, words: [], want: 0, shown: 0, ready: false, id: 0,
  keep: false, // the line on it is an instruction waiting for the player: it stays up until the shot (VO.KEEP)
  linger: null, // a said line's moment to be read, before the board lifts away (said)
  init() {
    if (this.el) return;
    this.el = $('#cap'); this.bg = this.el.querySelector('.bg'); this.txt = this.el.querySelector('.txt');
    this.pic = new Image(); this.pic.onload = () => this.paint(); this.pic.src = IMG + 'question_board.webp';
    addEventListener('resize', () => requestAnimationFrame(() => this.paint())); // (after Stage.resize has rescaled the stage)
  },
  // the 9-slice, at the board's size (its layout box) in device px: the stage's scale × the screen's pixel ratio
  paint() { paintBoard(this.bg, this.el, this.pic); },
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
  // a line's words into the text box: each word is its own span (.w), so it can pop in on its own, and a one-letter
  // word (x) never ends a row: it shares an unbreakable group (.nw) with the word after it
  build(text) {
    const t = this.txt, m = String(text).match(/\S+/g) || [], n = m.length;
    t.textContent = '';
    const ws = m.map((s) => { const w = document.createElement('span'); w.className = 'w'; mathX(w, s); return w; });
    for (let i = 0; i < n;) {
      if (i) t.append(' ');
      let j = i; while (j < n - 1 && [...m[j]].length === 1) j++;
      if (j === i) t.append(ws[i]);
      else { const g = document.createElement('span'); g.className = 'nw'; for (let k = i; k <= j; k++) { if (k > i) g.append(' '); g.append(ws[k]); } t.append(g); }
      i = j + 1;
    }
    return ws;
  },
  // ONE size for the board at the top, all game long: as wide as the widest line it can say there (every voiced line
  // but the end screen's and the voice-only ones), measured once in its font (the user, 26 Nov 2026: "do not remove
  // the question tablet. The question tablet should constant"), so it never grows, shrinks or glides between lines
  W: 0,
  wide() {
    if (this.W) return this.W;
    const keys = typeof VO_FILES !== 'undefined' ? VO_FILES.filter((k) => !/^voEnd/.test(k) && !VO.ONLY_SAID.test(k)) : [];
    let w = 0;
    for (const k of keys) { this.build(T(k)); this.fit(); w = Math.max(w, parseFloat(this.txt.style.width) || 0); }
    if (!document.fonts || document.fonts.status === 'loaded') this.W = w; // (kept once measured in the board's own font)
    return w;
  },
  // the line laid out with every word hidden. The board is fitted and painted for the whole line first (its one
  // size, the words centred in it), and only then are the words shrunk for their pop (a shrunk word would measure
  // narrower and the line could wrap once they grow)
  lay(text) {
    gsap.killTweensOf(this.words);
    const W = this.wide();
    const ws = (this.words = this.build(text));
    this.fit();
    if (W > (parseFloat(this.txt.style.width) || 0)) this.txt.style.width = W + 'px';
    this.paint();
    gsap.set(ws, { opacity: 0, y: 12, scale: 0.92 });
  },
  up() { return !!this.el && this.el.classList.contains('on'); },
  // the end screen has no board: it lifts away and its line is only said (the user, 26 Nov 2026: "yh text box ki
  // need ni hai… sirf VO mei hona chahie"); Play again brings it back at the top with the next line
  end: false,
  place(end) {
    this.init(); this.end = !!end; this.ready = false;
    this.hide();
  },
  // the line's voice has started: the board comes in (or glides over from the line before), its words still hidden.
  // keep: an instruction the player still has to carry out (it stays up after it has been said)
  start(text, keep = false) {
    this.init();
    this.stay(); this.keep = !!keep;
    if (this.end) return; // (the end screen: voice only)
    const { el, bg, txt } = this, id = ++this.id, up = this.up() && +gsap.getProperty(el, 'opacity') > 0.05;
    this.want = 0; this.shown = 0; this.ready = false;
    el.classList.add('on');
    gsap.killTweensOf(el);
    if (!up) { // enter: the board is laid out (in its place) before it shows
      gsap.killTweensOf([txt, bg]); this.lay(text);
      gsap.set(txt, { opacity: 1, y: 0 }); gsap.set(bg, { x: 0, y: 0, scaleX: 1, scaleY: 1 }); gsap.set(el, { y: -14, scale: 0.97 });
      this.ready = true;
    } else { // the board stays: the old words fade out and the new words come as said (a board whose size did change
      // glides from the old box to the new one)
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
    if (n > this.want) this.want = n; // (Infinity: the whole line)
    const m = Math.min(this.want, this.words.length);
    if (!this.ready || m <= this.shown) return;
    this.words.slice(this.shown, m).forEach((w, k) =>
      Motion.to(w, { opacity: 1, y: 0, scale: 1, duration: Motion.DUR.NORMAL * 0.8, ease: Motion.EASE.POP, delay: Motion.d(k * 0.06) }));
    this.shown = m;
  },
  // a line has been said (or cut short): the board keeps it a moment to be read (Motion.BEAT.SAID) and lifts away
  // (the user, 26 Nov 2026: "yh instruction jab bol diya hta dena"). Not an instruction still waiting for the player
  // (keep: the shot lifts that one), and not if the next line starts first (start / stay: the board stays up for it)
  said() {
    if (!this.up() || this.keep || this.linger) return;
    this.linger = gsap.delayedCall(Motion.BEAT.SAID, () => { this.linger = null; this.hide(); }); // (on GSAP's clock: it waits while the game is paused)
  },
  // the next line is on its way: the board waits up for it
  stay() { if (this.linger) { this.linger.kill(); this.linger = null; } },
  // it lifts away: a line said and read, the shot (playShots: "Tap fire wala instruction fire ke baad hta dena"), a
  // voice-only line, a skipped tutorial, or the screen changing (the end screen, Play again, the sound turned off)
  hide() {
    this.init();
    this.stay(); this.keep = false;
    this.id++;
    if (!this.el.classList.contains('on')) return; // (gone, or going)
    this.el.classList.remove('on');
    gsap.killTweensOf(this.el);
    Motion.to(this.el, { opacity: 0, y: -10, scale: 0.98, duration: Motion.DUR.FAST + 0.03, ease: Motion.EASE.IN });
  },
};

// ---------- voice-over + its board, by key (localization skill) ----------
// Every line is said in a real person's voice, never a made-up one (the user, 20 Nov 2026: "natural voiceovers,
// not AI generated"): no TTS studio, no AI voice, and not the device's own voice either. The clips are cut from
// a recording of the lines read aloud (docs/VO_RECORD.txt) by tools/vo_split.py: I18n.voice(key) =
// assets/VO/en/<key>.webm. VO_FILES (build.sh, from tools/vo_takes.json, the record of each cut) lists the keys
// that have a clip; VO_WORDS, when each word of a clip starts. A line with no clip yet, or a clip the browser
// can't play, is not voiced: no voice, so no board, and its pause stays.
// Every clip plays a little slower than it was read (VO.RATE, the user, 25 Nov 2026: "I want slow voice… in all I
// want in slow voice"), its pitch kept, so it is still the same natural voice, only calmer. The board's words keep
// time with it (they follow the clip's own clock).
// ---------- the word clock: which word of the line the voice is saying (it drives the board's words) ----------
// A clip: the recording's own word starts (VO_WORDS, heard by tools/vo_split.py), or, without them, its play time
// spread over the words by their weight: its letters (at least 3: "x" is said "ex"), a gap, and a breath after
// , ; : . ! ? inside the line. A test robot (SILENT, no clip playing) runs on a clock at a speaking pace (cps:
// weight a second). Pausing the game pauses the clock (and the clip).
const Said = {
  my: 0, text: '', key: '', board: true, at: [], from: [], total: 1, cps: 17, t: 0, heard: false, on: false, done: true, clip: null, words: null,
  begin(my, text, key) {
    this.stop();
    const w = typeof VO_WORDS !== 'undefined' && VO_WORDS[key];
    Object.assign(this, { my, text, key, board: !VO.ONLY_SAID.test(key), t: 0, heard: false, done: false, clip: null, at: [], from: [], words: w || null });
    const ms = [...String(text).matchAll(/\S+/g)];
    let c = 0;
    ms.forEach((m, i) => {
      this.at.push(m.index); this.from.push(c);
      c += Math.max(3, (m[0].match(/[\p{L}\p{N}]/gu) || []).length) + 1;
      if (i < ms.length - 1) c += /[.!?]$/.test(m[0]) ? 5 : /[,;:]$/.test(m[0]) ? 3 : 0;
    });
    this.total = Math.max(1, c);
  },
  // the voice has started: the board comes in with the first word (a voice-only line: the board, with whatever it
  // said before, lifts away)
  go(clip) {
    if (this.done || this.on || this.my !== VO.token) return;
    this.on = this.heard = true; this.clip = clip || null; this.t = 0;
    if (this.board) Caption.start(this.text, VO.KEEP.test(this.key)); else Caption.hide();
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
        : this.t * this.cps * VO.RATE;
      while (n < this.from.length && this.from[n] <= k) n++;
    }
    if (this.board) Caption.upTo(Math.max(1, n));
  },
  // the line has been said: every word is up
  end() {
    if (this.on && this.board) Caption.upTo(Infinity);
    this.stop();
  },
  stop() { gsap.ticker.remove(this.tick); this.on = false; this.done = true; this.clip = null; },
};
const VO = {
  RATE: 0.82, // every line's speed (1 = as recorded): slower, the pitch kept
  // lines that are only said, never put on the board: the cheers as x is freed (the user, 26 Nov 2026: "Boom! x is
  // free yh sirf VO mei rhene do"; and, of "Yes! You did it!": "jaise yh text yha ni hona chahie")
  ONLY_SAID: /^voFreed/,
  // instructions the board keeps up once said, until the player has done them: the orb to load, then FIRE (the shot
  // lifts the board away, playShots: "Tap fire wala instruction fire ke baad hta dena"). Every other line lifts away
  // a moment after it has been said (Caption.said)
  KEEP: /^tutTap/,
  token: 0, missing: new Set(), cur: null, finish: null, busy: null,
  has(key) { return typeof VO_FILES !== 'undefined' && VO_FILES.includes(key) && !this.missing.has(key); },
  // say a line by key: its recorded clip, and the board, whose words come as they are said (and which lifts away a
  // moment after: Caption.said); resolves when it has been said, or at once when stopped. No voice (sound off, no clip
  // yet, a clip that fails): no board, the pause stays
  async say(key, hold = 0.5) {
    const text = T(key), my = ++this.token;
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; } // never let two lines overlap
    if (this.finish) this.finish();
    Said.begin(my, text, key);
    const clip = VO.has(key);
    if (clip && !this.ONLY_SAID.test(key)) Caption.stay(); // (a line that follows at once: the board, if up, waits for it, and its words change when this voice starts)
    if (clip) Music.duck(true);
    const est = (0.9 + text.length * 0.058) / this.RATE, t0 = performance.now(); // (how long it takes to say, at RATE)
    const spoken = new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; if (this.finish === finish) this.finish = null; if (my === this.token) Said.end(); Caption.said(); resolve(); } };
      this.finish = finish;
      if (SILENT) { if (clip) Said.go(); wait(est).then(finish); return; } // a test robot: no sound, but a recorded line's board runs as if spoken
      if (Sound.muted || !clip) { wait(est).then(finish); return; }
      wait(est + 2.5).then(finish); // (in case a clip's 'ended' never comes)
      let a = null;
      const fail = () => { // a clip that can't play: the line's pause still runs its course, unvoiced
        this.missing.add(key); if (Said.clip === a) Said.clip = null;
        if (a && this.cur === a && !done) wait(Math.max(0, est - (performance.now() - t0) / 1000)).then(finish);
      };
      a = I18n.say(key, { onended: finish, onerror: fail, rate: this.RATE });
      a.addEventListener('playing', () => { if (this.cur === a && !done) Said.go(a); });
      this.cur = a;
    });
    this.busy = spoken;
    await spoken;
    if (this.busy === spoken) this.busy = null;
    if (my !== this.token) return;
    await wait(hold);
    if (my === this.token) Music.duck(false);
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
    Said.stop(); if (Said.board) Caption.upTo(Infinity); // (a line cut short: the board shows it whole, a moment, then lifts away: Caption.said)
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
// (measured on the user's cannon art (23 Nov), teal and gold with leaves on a wooden base: cannon 1 from
// art/sprite_sheets/single_cannon.png by tools/cut_single_cannon.py, cannon 2 from art/sprite_sheets/double_cannon.png
// by tools/cut_double_cannon.py. Both are cut onto one canvas with one mapping (1226×898 px, 0.84 px per art px, the
// barrel's centre on CANNON.x, the base's bottom 4 px above the canvas's), so a round's morph swaps only the top. Each
// one's painted FIRE pill is a dark recess where the game's FIRE button sits)
const CANNON = { x: 836, bottom: 762, h: 324, src: { 1: [613, 449], 2: [613, 449] },
  // each socket's centre + radius: x and r as fractions of the sprite width, y of its height. r comes from where the
  // ring's gold starts (found on 240 rays): r × seat = the ring's widest inner edge + 1.8 canvas px (see seat)
  holes: { 1: [[0.4978, 0.5072, 0.1164]], 2: [[0.3473, 0.5194, 0.0884], [0.6507, 0.5202, 0.0892]] },
  // base footprint width (fraction of the sprite); the wooden base has no light strips
  foot: { 1: { w: 0.7845, strips: [] }, 2: { w: 0.8148, strips: [] } },
  // the dark recess inside each cannon's gold FIRE bezel, in sprite px: centre + size (Cannon.placeFire). The button
  // is placed by this, never by the sprite's middle. Each cannon has its own pill picture (1: fire.webp, 2: fire2.webp,
  // .p1 / .p2 in #fireBtn); `art` = the picture's size with its pill's size inside it, so the pill fills the recess exactly
  fire: { 1: { cx: 304.4, cy: 375.2, w: 247.0, h: 93.2, art: [499, 192, 494.0, 186.9] },
    2: { cx: 304.0, cy: 372.3, w: 252.0, h: 96.6, art: [254.0, 99.0, 252.0, 96.6] } },
  // a loaded ball fills its socket edge to edge (user, 20 Nov: "fully absorb in circle, no negative space"): its
  // painted orb is this much of the hole's width. Each hole's r is set so that edge sits 1.8 canvas px (~0.7 game px)
  // under the gold ring where the ring is widest (the holes are not perfect circles), and the ring layer
  // (cannonN_front, drawn above the balls) is half there at the gold's inner edge and solid half a canvas px further
  // out: no dark gap shows anywhere round the orb, and nothing of it shows outside the ring. (The dark lining .sbk
  // under a loaded socket only shows while a ball drops in)
  seat: 1.015 };
const BALL_ART = 0.96; // the orb's share of its picture (ball_*.webp: the orb is ~161 of 168 px)
// tray art (wooden, metal corners; its plain middle stretched to hold 8 balls): ball spots along its floor (holesX,
// holeY), the bottom edge and the outer edges in source px; a seated ball's centre sits `seat` px below (+) / above (−) its spot
const RACK = { left: 233, top: 795, w: 1206, srcW: 1618, holesX: [212.3, 382.4, 552.5, 722.7, 892.8, 1063.0, 1233.1, 1403.2], holeY: 59.5, bot: 185.4, edges: [2, 1616], seat: 11 }; // (11: each ball rests on the trough's floor, its bottom ~16 px behind the front rail, so it sits in the tray instead of hovering on the rail)
const BALL_D = 110, MUZZLE = { x: CANNON.x, y: CANNON.bottom - CANNON.h + 14 }; // (BALL_D = the .ball size in the CSS)
// the equation cloud, far off in the sky and well clear of the cannon: Cloud.apply draws #cloud (card included) at
// CLOUD_FAR of its size, about its transform-origin (world 828, 276). Where a shot hits (on the card), and its middle.
// The cannon, the tray and its orbs are 10 % smaller and the cloud smaller too (the user, 26 Nov 2026: "cloud, cannon
// and ops and its stands should slightly small"), so the question board fits above the cloud at the top of the
// screen: the cloud's top is at y 150 (the board ends at 132) and its round belly at 343, floating just above the far
// hills (their ridge is at 345–348 under its lowest bump). (26 Nov 2026, later, twice: "clouds slightly big": 0.72 →
// 0.78 → 0.84, the equation's font 84 → 72 px, so the words stay the size they were, with more cloud round them)
const CLOUD_FAR = 0.84, CLOUD_HIT = { x: 828, y: 283 }, CLOUD_MID = { x: 828, y: 247 };
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
// (ZMAX 1.8: the close-up on the cage as it cracks open, 23 Nov; every other move stays at or under 1.2)
const CAM = { SMOOTH: 0.14, SHAKE: 22, ROT: 1.0, FREQ: 15, DECAY: 1.4, ZMIN: 1, ZMAX: 1.8 };
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
// Besides the particles it draws comet tails (ribbons: a flying ball's last moment of path) and layers (things with
// their own motion and drawing, like the cage's shards and the fireworks' rockets), all in art space through the
// camera. A particle drawn with `paint` is laid on normally instead of added as light, so it still shows on the
// white cloud (light added to white stays white).
const FX = {
  cv: null, ctx: null, dpr: 1, dprMax: 2, parts: [], dots: new Map(), uiMode: false, q: 1, cap: 500, drawn: false,
  layers: [], ribbons: [], M: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  init() { this.cv = $('#fx'); this.ctx = this.cv.getContext('2d'); },
  // everything in flight goes at once (Skip, restart): particles, tails and layers
  clear() { this.parts = []; this.ribbons = []; for (const L of this.layers) if (L.kill) L.kill(); this.layers = []; },
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
  // o.dir + o.spread (radians) aim the burst (canvas y is down, so −π/2 is straight up); by default it goes all round.
  // o.paint: laid on (shows on the white cloud); o.white: the share of white sparks (0.35)
  burst(x, y, color, n = 30, speed = 420, o = {}) {
    n = this.n(n);
    const wh = o.white ?? 0.35;
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rr(-o.spread, o.spread) : Math.random() * Math.PI * 2, v = speed * rr(0.3, 1);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g ?? 500, drag: o.drag ?? 2.2, life: rr(0.5, 0.95) * (o.life || 1), max: 0.95 * (o.life || 1), size: rr(14, 30) * (o.size || 1), color: Math.random() < wh ? '#ffffff' : color, paint: !!o.paint });
    }
  },
  // a starburst: thin spikes of light round a bright core, that open out and fade (n spikes; o.paint as above)
  star(x, y, color = '#fff6d6', size = 200, life = 0.3, o = {}) { this.add({ k: 'star', x, y, life, max: life, size, color, n: o.n || 8, rot: o.rot ?? rr(0, Math.PI), vr: o.vr ?? rr(-0.5, 0.5), paint: !!o.paint, delay: o.delay }); },
  // sparks drawn INTO a point from a ring (w × h) round it, faster as they near it: energy gathering
  converge(x, y, w, h, colors, n = 16, life = 0.5, o = {}) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = rr(0.75, 1.05), x0 = x + Math.cos(a) * w * d, y0 = y + Math.sin(a) * h * d, l = life * rr(0.65, 1);
      this.add({ k: 'spark', x: x0, y: y0, x0, y0, tx: x, ty: y, life: l, max: l, size: rr(10, 20) * (o.size || 1), color: pick(colors), paint: !!o.paint, delay: rr(0, life * 0.3) });
    }
  },
  // the cannon winds up (dur s): sparks of the ball's colour are drawn into the barrel's mouth while a glow swells there
  charge(x, y, color, dur = 0.5) {
    this.converge(x, y, 130, 95, [color, '#ffffff', '#ffe27a'], 18, dur * 0.85, { size: 0.9 });
    this.add({ k: 'glow', x, y, life: dur + 0.06, max: dur + 0.06, size: 24, grow: 2.4, color: '#ffcf6a', a: 0.95 });
  },
  // a shock ring running out over the deck from a heavy blow (an ellipse: the ground seen at an angle)
  gring(x, y, size = 380, life = 0.6, color = '#fff1d8') { this.add({ k: 'gring', x, y, life, max: life, size, color, a: 0.75, lw: 12, flat: 0.2 }); },
  // a cloudburst's shower: drops of glittering rain fall from under the cloud (x0…x1 at y) for about a second, and
  // fade out well above the deck (some catch the light and twinkle)
  rain(x0, x1, y, n = 80) {
    n = this.n(n);
    const mid = (x0 + x1) / 2;
    for (let i = 0; i < n; i++) {
      const x = rr(x0, x1), l = rr(0.45, 0.8);
      this.add({ k: 'drop', x, y: y + rr(-36, 16), vx: rr(-30, 30) + (x - mid) * 0.22, vy: rr(60, 300), g: 1400, drag: 0.5, life: l, max: l, size: rr(2.4, 4.2), color: pick(['#ffffff', '#eaf8ff', '#cdeeff']), a: rr(0.75, 0.95), glint: Math.random() < 0.3, delay: Math.pow(Math.random(), 1.6) * 0.75 });
    }
  },
  // glitter: tiny sparks that float down slowly and twinkle
  glitter(x, y, n = 24, spread = 1, o = {}) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rr(60, 320) * spread, l = rr(0.9, 1.7);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, g: 150, drag: 1.9, life: l, max: l, size: rr(7, 12), color: pick(o.colors || ['#ffffff', '#fff3b0', '#ffd84a']), tw: rr(9, 15), paint: !!o.paint });
    }
  },
  // sparkles that circle round a point (an ellipse seen from the side: those behind are smaller and dimmer), rising
  orbit(cx, cy, n = 14, R = 70, colors = ['#ffd84a', '#b36bff', '#ffffff', '#ff8ad8']) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const l = rr(1.1, 1.6);
      this.add({ k: 'spark', x: cx, y: cy, ocx: cx, ocy: cy, or: R * rr(0.8, 1.25), oa: (i / n) * Math.PI * 2 + rr(-0.25, 0.25), ow: rr(3.4, 4.6), orise: rr(14, 36), oshr: rr(-0.45, 0.15), life: l, max: l, size: rr(11, 19), color: pick(colors), paint: true, delay: rr(0, 0.12) });
    }
  },
  // a firework's burst: a sphere of coloured sparks that slow, droop and twinkle out, with a flash and a ring
  firework(x, y, cols, n = 52) {
    n = this.n(n);
    this.flash(x, y, 200, 0.2);
    this.ring(x, y, cols[0], 190, { lw: 6, life: 0.45 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.06, 0.06), v = rr(400, 500) * (Math.random() < 0.2 ? 0.55 : 1), l = rr(1.1, 1.7);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 230, drag: 1.45, life: l, max: l, size: rr(17, 27), color: pick(cols), tw: Math.random() < 0.4 ? rr(10, 18) : 0 });
    }
  },
  // a comet's tail behind something flying (a cannonball): its last 0.2 s of path as a tapering streak of light.
  // push(x, y) each frame it moves; end() lets it fade
  ribbon(color, w = 24) {
    const r = { pts: [], color, w, dead: false, fade: 1, push(x, y) { if (!r.dead) r.pts.push({ x, y, t: Clock.t }); }, end() { r.dead = true; } };
    if (!Motion.still()) this.ribbons.push(r);
    return r;
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
  // a cloud bursting: soft white mist thrown out from inside it (w × h), swelling as it thins away (p = how hard)
  vapour(x, y, w, h, n = 16, p = 1) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()), v = rr(140, 320) * p;
      this.add({ k: 'mist', x: x + Math.cos(a) * w * 0.5 * d, y: y + Math.sin(a) * h * 0.5 * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 30, g: -20, drag: 2.4, life: rr(0.8, 1.2), max: 1.2, size: rr(34, 56) * (0.8 + 0.2 * p), grow: rr(1, 1.6), a: rr(0.42, 0.6), col: '#f4fbff' });
    }
  },
  // a new cloud gathering: wisps of mist drift in from round it (w × h), shrink and melt into it
  gather(x, y, w, h, n = 14) {
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2), d = rr(0.75, 1), px = x + Math.cos(a) * w * d, py = y + Math.sin(a) * h * d;
      this.add({ k: 'mist', x: px, y: py, vx: (x - px) * 1.5, vy: (y - py) * 1.5, g: 0, drag: 1.9, life: rr(0.75, 1), max: 1, size: rr(36, 56), grow: -0.45, a: rr(0.4, 0.55), col: '#f4fbff' });
    }
  },
  confetti(x, y, n = 140, power = 900, tilt = 0) { // (tilt: radians off straight up, + = to the right)
    const cols = ['#ff4f8b', '#ffd23f', '#36d97a', '#22d3ee', '#9b5cff', '#ff9f1c', '#ffffff', '#3b82f6'];
    n = this.n(n);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + tilt + rr(-1.1, 1.1) * (tilt ? 0.6 : 1), v = power * rr(0.4, 1);
      this.add({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 1.4, life: rr(2.2, 3.4), max: 3.4, w: rr(10, 18), h: rr(16, 28), rot: rr(0, 6), vr: rr(-12, 12), flip: rr(0, 6), color: pick(cols) });
    }
  },
  flash(x, y, size = 260, life = 0.28, col) { this.add({ k: 'flash', x, y, life, max: life, size, col }); }, // (col: its light; warm gold by default)
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
  // a bolt of light (an FX layer): a bright orb flies from a to b on an arc in dur s, with a comet's tail and sparks of
  // its colours behind it. It starts on the white cloud, so its glow is laid on (violet), with a white-hot core
  bolt(a, b, dur, col = '#b36bff') {
    if (Motion.still()) return;
    const tail = this.ribbon(col, 30), cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 110, self = this;
    let t = 0, x = a.x, y = a.y;
    this.layers.push({
      update(dt) {
        t += dt; const e = Ease.inOutQuad(Math.min(1, t / dur));
        x = bez(a.x, cx, b.x, e); y = bez(a.y, cy, b.y, e); tail.push(x, y);
        if (Math.random() < 0.8) self.trail(x, y, Math.random() < 0.5 ? col : '#fff3b0');
        if (t >= dur) { tail.end(); return false; }
        return true;
      },
      kill() { t = dur; tail.end(); },
      draw(c, M) {
        c.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.9; c.drawImage(self.dot(col), x - 34, y - 34, 68, 68);
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1; c.drawImage(self.dot('#ffffff'), x - 16, y - 16, 32, 32);
      },
    });
  },
  // a shock ring (o.lw: its stroke, o.life, o.paint: laid on so it shows on the cloud, o.delay)
  ring(x, y, color = '#ffffff', size = 200, o = {}) { const l = o.life ?? 0.5; this.add({ k: 'ring', x, y, life: l, max: l, size, color, lw: o.lw, paint: !!o.paint, delay: o.delay }); },
  update(dt) {
    const ps = this.parts; let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; ps[w++] = p; continue; } // (not born yet)
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.vx !== undefined) {
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy = p.vy * d + (p.g || 0) * dt; p.x += (p.vx + (p.wind || 0)) * dt; p.y += p.vy * dt;
        if (p.k === 'conf') { p.rot += p.vr * dt; p.flip += dt * 9; if (p.vy > 260) p.vy = 260; p.x += Math.sin(p.flip * 0.5) * 30 * dt; }
      } else if (p.tx !== undefined) { // drawn in: faster and faster (ease-in) toward its point
        const u = 1 - p.life / p.max, e = u * u;
        p.x = p.x0 + (p.tx - p.x0) * e; p.y = p.y0 + (p.ty - p.y0) * e;
      } else if (p.ow !== undefined) { // circling: round its centre, which rises
        p.oa += p.ow * dt; p.or *= Math.exp((p.oshr || 0) * dt); p.ocy -= (p.orise || 0) * dt;
        p.x = p.ocx + Math.cos(p.oa) * p.or; p.y = p.ocy + Math.sin(p.oa) * p.or * 0.38; p.back = Math.sin(p.oa) < 0;
      }
      ps[w++] = p;
    }
    ps.length = w;
    // the comet tails: each keeps its last 0.2 s of path; once let go, it fades
    const rs = this.ribbons, old = Clock.t - 0.2;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      while (r.pts.length > 2 && r.pts[0].t < old) r.pts.shift();
      if (r.dead && (r.fade -= dt / 0.25) <= 0) rs.splice(i, 1);
    }
    // the layers move themselves (each says when it is done)
    const ls = this.layers;
    for (let i = ls.length - 1; i >= 0; i--) if (!ls[i].update(dt)) ls.splice(i, 1);
  },
  draw() {
    const c = this.ctx, d = this.dpr, ps = this.parts;
    if (!ps.length && !this.layers.length && !this.ribbons.length) { if (this.drawn) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); this.drawn = false; } return; }
    this.drawn = true;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    // the camera's mapping, once per frame (rotation included): screen = E + [A −B; B A]·(p − f)
    const S = Stage.S, z = Stage.z || 1, A = S * z * Stage.cs, B = S * z * Stage.sn, ex = Stage.ox + S * CX, ey = Stage.oy + S * CY, ffx = Stage.fx, ffy = Stage.fy, scW = S * z;
    // …the same as a canvas transform, art space → device px, for the layers (they add their own moves on top)
    const M = this.M;
    M.a = d * A; M.b = d * B; M.c = -d * B; M.d = d * A; M.e = d * (ex - A * ffx + B * ffy); M.f = d * (ey - B * ffx - A * ffy);
    for (const L of this.layers) { c.save(); L.draw(c, M); c.restore(); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // the comet tails: a wide streak of the ball's colour with a white-hot core, tapering away to nothing behind it
    if (this.ribbons.length) {
      c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      for (const r of this.ribbons) {
        const n = r.pts.length; if (n < 2) continue;
        const P = r.pts.map((q) => { const dx = q.x - ffx, dy = q.y - ffy; return [(ex + A * dx - B * dy) * d, (ey + B * dx + A * dy) * d]; });
        for (let pass = 0; pass < 2; pass++) {
          c.strokeStyle = pass ? '#ffffff' : r.color;
          for (let j = 1; j < n; j++) {
            const f = j / (n - 1);
            c.globalAlpha = f * r.fade * (pass ? 0.85 : 0.5);
            c.lineWidth = Math.max(0.5, r.w * scW * d * f * (pass ? 0.36 : 1));
            c.beginPath(); c.moveTo(P[j - 1][0], P[j - 1][1]); c.lineTo(P[j][0], P[j][1]); c.stroke();
          }
        }
      }
      c.lineCap = 'butt';
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.delay > 0) continue;
      let sx, sy;
      if (p.ui) { sx = Stage.ox + S * p.x; sy = Stage.oy + S * p.y; } else { const dx = p.x - ffx, dy = p.y - ffy; sx = ex + A * dx - B * dy; sy = ey + B * dx + A * dy; }
      const k = p.life / p.max, X = sx * d, Y = sy * d, sc = p.ui ? S : scW;
      if (p.k === 'spark') {
        c.globalCompositeOperation = p.paint ? 'source-over' : 'lighter';
        let al = Math.min(1, k * 2), sz = 0.4 + 0.6 * k;
        if (p.tw) al *= 0.55 + 0.45 * Math.sin((p.max - p.life) * p.tw); // twinkling glitter
        if (p.back) { al *= 0.55; sz *= 0.7; } // (circling: the far side)
        c.globalAlpha = al;
        const r = p.size * sc * d * sz;
        c.drawImage(this.dot(p.color), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'star') { // spikes of light round a core: they open out fast and fade
        c.globalCompositeOperation = p.paint ? 'source-over' : 'lighter'; c.globalAlpha = Math.min(1, k * 1.7);
        const R = p.size * sc * d * (0.45 + 0.55 * Math.sqrt(1 - k)), r0 = R * 0.09, n = p.n, a0 = p.rot + (1 - k) * p.vr;
        c.fillStyle = p.color; c.beginPath();
        for (let j = 0; j < n * 2; j++) { const a = a0 + (j * Math.PI) / n, q = j % 2 ? r0 : n > 5 && j % 4 === 2 ? R * 0.6 : R; c.lineTo(X + Math.cos(a) * q, Y + Math.sin(a) * q); }
        c.closePath(); c.fill();
        const rc = R * 0.4; c.drawImage(this.dot(p.color), X - rc, Y - rc, rc * 2, rc * 2);
      } else if (p.k === 'drop') { // a falling drop of the cloudburst: a short streak along its fall, some glinting
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, k * 2.4, (p.max - p.life) * 12) * p.a;
        const sp = Math.hypot(p.vx, p.vy) || 1, L = Math.min(52, 8 + sp * 0.05) * sc * d;
        c.strokeStyle = p.color; c.lineWidth = p.size * sc * d; c.lineCap = 'round';
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X - (p.vx / sp) * L, Y - (p.vy / sp) * L); c.stroke(); c.lineCap = 'butt';
        if (p.glint) { const r = p.size * 2.6 * sc * d * (0.6 + 0.4 * Math.sin((p.max - p.life) * 20)); c.globalCompositeOperation = 'lighter'; c.drawImage(this.dot('#ffffff'), X - r, Y - r, r * 2, r * 2); }
      } else if (p.k === 'gring') { // a ring running out over the ground (an ellipse), thinning as it goes
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = k * p.a;
        const rx = p.size * sc * d * (0.2 + 0.8 * Ease.outCubic(1 - k)), ry = rx * p.flat;
        c.strokeStyle = p.color; c.lineWidth = p.lw * sc * d * (0.3 + 0.7 * k);
        c.beginPath(); c.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      } else if (p.k === 'glow') { // a glow that swells (energy gathering), then is gone
        c.globalCompositeOperation = 'lighter';
        const age = 1 - k; c.globalAlpha = Math.min(1, age * 4) * p.a * Math.min(1, k * 8);
        const r = p.size * sc * d * (1 + age * p.grow);
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
      } else if (p.k === 'mist') { // a cloud's white mist: fades in, then thins away as it swells (or shrinks, grow < 0)
        c.globalCompositeOperation = 'source-over';
        const age = 1 - k; c.globalAlpha = p.a * Math.min(1, age * 5) * Math.min(1, k * 1.6);
        const r = p.size * sc * d * (1 + Math.sqrt(age) * p.grow);
        c.drawImage(this.dot(p.col), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'fire') { // the fireball: white-yellow → orange → red as it cools (painted, so it stays orange on a bright sky)
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, k * 1.5);
        const r = p.size * sc * d * (1 + (1 - k) * p.grow);
        c.drawImage(this.puffTex(k > 0.72 ? '#fff0a8' : k > 0.45 ? '#ffb22e' : k > 0.22 ? '#ff6a1c' : '#c9401a'), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'flash') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
        const r = p.size * sc * d * (1.4 - k * 0.6);
        c.drawImage(this.dot(p.col || '#ffd27a'), X - r, Y - r, r * 2, r * 2);
      } else if (p.k === 'ring') {
        c.globalCompositeOperation = p.paint ? 'source-over' : 'lighter'; c.globalAlpha = k;
        c.strokeStyle = p.color; c.lineWidth = (p.lw || 10) * sc * d * k;
        c.beginPath(); c.arc(X, Y, p.size * sc * d * (1 - k * 0.8), 0, Math.PI * 2); c.stroke();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
};

// ---------- the vignette: the screen's edges darken for a big moment (the cage cracking), so the eye goes to it ----------
// (#vig, between the scene and the FX canvas: the sparks and the caption stay bright). Opacity only; none under
// reduced motion. Its fade is tracked, so a Skip lands it at once
const Vignette = {
  el: null, tw: null,
  to(a, dur = 0.6) {
    const el = this.el || (this.el = $('#vig'));
    if (!el) return;
    if (Motion.reduced) a = 0;
    if (this.tw) { Motion.live.delete(this.tw); this.tw = null; }
    gsap.killTweensOf(el);
    if (!Motion.d(dur)) { el.style.opacity = String(a); el.style.willChange = ''; return; }
    const tw = this.tw = Motion.track(Motion.to(el, { opacity: a, duration: dur, ease: a > 0 ? Motion.EASE.OUT : Motion.EASE.INOUT,
      onComplete: () => { Motion.live.delete(tw); if (this.tw === tw) this.tw = null; } }));
  },
};

// ---------- the equation cloud ----------
const Cloud = {
  el: null, core: null, x: 0, y: 0, s: 1, a: 1, blur: 0, rot: 0, jx: 0, jy: 0, sq: new Spring(5, 0.32),
  // (core: a warm glow in the cloud's heart, over its picture and under the equation; it builds as the cloud draws in
  // before it bursts, and flashes out at the pop)
  init() { this.el = $('#cloud'); this.core = document.createElement('i'); this.core.className = 'ccore'; this.el.insertBefore(this.core, $('#qCard')); },
  squash() { this.sq.kick(1); }, // a ball hits it: wide-and-flat, then it springs back
  apply(t, dt = 0) {
    // a calm, far-off float (design review, 23 Nov 2026: "slow idle bob (3–4 px), slight drift"): it rises and falls
    // 3.5 px every ~5 s and drifts 7 px each way over ~30 s; still with reduced motion. (Its sun-side rim light and the
    // haze where it meets the sky are pictures in #cloud.) jx / jy: a tremble, just before it bursts
    const calm = !Motion.reduced, by = calm ? Math.sin(t * 1.25) * 3.5 : 0, bx = calm ? Math.sin(t * 0.21 + 1) * 7 : 0, q = this.sq.update(dt);
    const s = this.s * CLOUD_FAR, sx = s * (1 + 0.05 * q), sy = s * (1 - 0.05 * q);
    const tr = `translate(${(this.x + bx + this.jx).toFixed(1)}px,${(this.y + by + this.jy).toFixed(1)}px) rotate(${this.rot.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`, op = this.a.toFixed(3);
    if (tr !== this.lastTr) { this.el.style.transform = tr; this.lastTr = tr; }
    if (op !== this.lastOp) { this.el.style.opacity = op; this.lastOp = op; }
  },
  // a new question: its cloud gathers in the same place, where the last one burst (it never sails in from the side:
  // the user, 23 Nov). It forms out of puffs of mist: its own pieces (CloudBurst) drift in from round it, swollen and
  // blurred, and come together sharpening, while wisps of vapour melt into it; its picture takes over as they meet,
  // the equation pops in, and a twinkle runs over it. (Under reduced motion, or before the pieces are cut, it simply
  // fades in.) Then the card's tab drops on
  // withEq false: it forms bare, and its equation comes after it, on its own (showEq: the first question, after Play)
  async enter(withEq = true) {
    CloudBurst.reset();
    const box = $('#eqBox'), m = CLOUD_MID;
    const bare = () => { if (!withEq) Object.assign(box.style, { opacity: '0', transform: 'scale(0.8)' }); };
    QCard.hide();
    Sound.swoosh();
    CloudBurst.make(); bare();
    if (CloudBurst.bits.length && !Motion.still()) {
      Object.assign(this, { x: 0, y: 0, s: 1, a: 1, blur: 0, rot: 0, jx: 0, jy: 0 });
      FX.gather(m.x, m.y + 26, 460, 180, 18);
      CloudBurst.gatherFrom();
      box.style.willChange = 'transform,opacity'; box.style.opacity = '0';
      await tween(Motion.BEAT.CLOUD_IN, (e, k) => {
        CloudBurst.gather(k);
        if (!withEq) return;
        const q = clamp((k - 0.72) / 0.28, 0, 1); // the equation pops in as the cloud closes
        box.style.opacity = Ease.outQuad(q).toFixed(3); box.style.transform = `scale(${(0.8 + 0.2 * Ease.outBackSoft(q)).toFixed(4)})`;
      }, Ease.linear);
      CloudBurst.reset(); bare();
      if (withEq) this.twinkle();
    } else {
      Object.assign(this, { x: 0, y: 18, s: 0.88, a: 0, blur: 0, rot: 0, jx: 0, jy: 0 });
      FX.gather(m.x, m.y + 26, 380, 150, 14);
      await tween(Motion.BEAT.CLOUD_IN, (e, k) => { this.a = Ease.outQuad(Math.min(1, k * 1.4)); this.s = lerp(0.88, 1, e); this.y = lerp(18, 0, e); }, Ease.outBackSoft);
    }
    QCard.pop();
  },
  // a chime and a twinkle over the cloud as its equation arrives
  twinkle() {
    const m = CLOUD_MID;
    Sound.chime();
    FX.star(m.x - 150, m.y + 12, '#ffd84a', 60, 0.5, { n: 4, paint: true }); FX.star(m.x + 170, m.y - 22, '#ffffff', 48, 0.5, { n: 4, delay: 0.12 });
    FX.star(m.x + 40, m.y - 80, '#ffd84a', 44, 0.5, { n: 4, paint: true, delay: 0.22 });
  },
  // the equation pops onto a cloud that formed without it (the user, 26 Nov 2026: "last cloud come and then equation
  // come"): it grows in from 0.8 with a soft overshoot as it fades in, and the cloud twinkles
  async showEq() {
    const box = $('#eqBox');
    box.style.willChange = 'transform,opacity';
    this.twinkle();
    await tween(0.55, (e, k) => { box.style.opacity = Ease.outQuad(Math.min(1, k * 1.8)).toFixed(3); box.style.transform = `scale(${(0.8 + 0.2 * e).toFixed(4)})`; }, Ease.outBackSoft);
    Object.assign(box.style, { opacity: '', transform: '', willChange: '' });
  },
  // in a round's timeline, when the question is over (x freed or not), the CLOUDBURST (the user, 23 Nov: "extreme…
  // cloudburst after x compose"). 1) It draws in its breath: it squeezes a little and trembles harder and harder, a
  // warm light builds in its heart, sparks are pulled into it, and "x = 2" is drawn into the light (shrinks and
  // fades). 2) It bursts IN PLACE: a flash, a starburst and two shock rings, its own puffs blast outward (swelling,
  // turning, melting into mist), white vapour and golden sparks fly, and a short shower of glittering rain falls
  // from where it was. The camera jolts. It never sails off sideways (the user, 23 Nov: "don't make the cloud go to
  // the left side… the cloud fades and bursts"). soft: the "not yet" ending, a gentler burst with no shower.
  // Returns the moment it pops.
  burstTL(tl, pos, soft = false) {
    const B = Motion.BEAT, box = $('#eqBox'), tp = pos + B.INHALE, P = soft ? 0.6 : 1, core = this.core;
    tl.call(() => {
      CloudBurst.make(); box.style.willChange = 'transform,opacity'; core.style.willChange = 'transform,opacity';
      Sound.inhale(P);
      FX.converge(CLOUD_MID.x, CLOUD_MID.y + 30, 360, 160, ['#ffd84a', '#ffffff', '#ffb627'], soft ? 10 : 24, B.INHALE * 0.95, { paint: true });
    }, null, pos);
    drive(B.INHALE, (e, k) => {
      this.s = 1 - 0.05 * e;
      const j = Motion.still() ? 0 : 3.4 * P * e * e, t = Clock.t * 19; // the tremble grows
      this.jx = j * Noise(t + 3.1); this.jy = j * 0.6 * Noise(t + 57.7);
      core.style.opacity = (Ease.inQuad(k) * (soft ? 0.55 : 0.95)).toFixed(3);
      core.style.transform = `scale(${(0.45 + 0.6 * e).toFixed(4)})`;
      const q = Ease.inQuad(clamp((k - 0.25) / 0.75, 0, 1)); // "x = 2" is drawn into the light
      box.style.opacity = (1 - q).toFixed(3); box.style.transform = `scale(${(1 - 0.5 * q).toFixed(4)})`;
    }, Ease.inOutQuad, tl, pos);
    tl.call(() => { // the pop
      this.jx = this.jy = 0;
      CloudBurst.pop(P);
      Sound.poof(P); Stage.hit({ trauma: 0.3 * P, zoom: 0.03 * P }); Haptic.buzz(soft ? 12 : [18, 30, 18]);
      const x = CLOUD_MID.x, y = CLOUD_MID.y + 34;
      FX.flash(x, y, 560 * P, 0.38, '#fffaf0'); // (white: a gold light added to the blue sky reads green)
      FX.star(x, y, '#fff7d6', 470 * P, 0.42, { n: 10 });
      FX.ring(x, y, '#ffffff', 700 * P, { lw: 22, life: 0.65 });
      FX.ring(x, y, '#9fdcff', 980 * P, { lw: 8, life: 0.95, paint: true, delay: 0.06 });
      FX.vapour(x, y, 640, 230, soft ? 18 : 34, 1.6 * P);
      FX.burst(x, y, '#ffd84a', soft ? 14 : 34, 640, { g: 260, size: 0.75, paint: true, white: 0.2 });
      FX.glitter(x, y, soft ? 10 : 24, 1.4);
      if (!soft) FX.rain(x - 300, x + 300, y + 70, 90);
    }, null, tp);
    drive(B.BURST, (e, k) => {
      CloudBurst.fly(k);
      const f = Math.min(1, k / 0.22); // the light in its heart flashes out
      core.style.opacity = ((1 - Ease.outQuad(f)) * (soft ? 0.55 : 0.95)).toFixed(3);
      core.style.transform = `scale(${(1.05 + 1.1 * Ease.outCubic(f)).toFixed(4)})`;
    }, Ease.linear, tl, tp);
    tl.call(() => CloudBurst.done(), null, tp + B.BURST);
    return tp;
  },
  // "not yet": a slow rock that dies away (2 swings, not 3 quick ones)
  wobbleTL(tl, pos) { drive(Motion.BEAT.RATTLE, (e, k) => { this.rot = Math.sin(k * Math.PI * 4) * 3 * (1 - k); this.s = 1 + Math.sin(k * Math.PI * 6) * 0.02 * (1 - k); }, Ease.linear, tl, pos); },
};

// ---------- the cloud bursting: it comes apart into its own puffs ----------
// The pieces are the cloud's own picture (cloud.webp) cut into canvases: each puff of tools/paint_cloud.py (PUFFS:
// centre, radius = the larger of its half width and height, its place back to front; art px of the 760 × 281 picture) less the puffs in front
// of it, with a soft edge, so each piece is a soft lump of this very cloud; what is left of its belly is cut into four
// lengths. Each piece also has a blurred twin, so it can melt into mist as it goes. At the pop the pieces sit exactly
// on the cloud and the cloud's picture lets go under them, so the swap never shows; they drift out from its middle
// (the inner ones first), slowing as air does, rising a little and swelling, and soften into mist that fades. If the
// cloud is repainted, keep CLOUD_PUFFS in step with paint_cloud.py (another cloud still bursts, only not along its
// own puffs).
const CLOUD_ART = { w: 760, h: 281, x: -52, y: 10, base: 257, mid: [380, 140] }; // (.cl in #cloud's box; the bottom of its belly; the burst's centre)
const CLOUD_PUFFS = [[373, 114, 95, 0], [235, 128, 61, 1], [509, 118, 63, 2], [478, 160, 52, 3], [181, 177, 72, 4], [572, 178, 79, 5],
  [284, 157, 62, 6], [424, 193, 64, 7], [273, 205, 63, 8], [380, 207, 72, 9], [485, 220, 33, 10]];
const CloudBurst = {
  cl: null, wrap: null, bits: [], jobs: null, on: false,
  // The pieces are cut once, one piece at a time while the browser is idle, from when the play scene's pictures are
  // in (boot), so cutting them never costs a frame; a burst that comes sooner finishes them there and then.
  // Soft edges F art px; the pieces at 1.5× the art's px (1× on the low tier), their blurred twins at 1×.
  prepare() {
    const img = this.cl = Cloud.el && Cloud.el.querySelector('.cl');
    if (this.jobs || !img) return;
    this.jobs = [];
    const A = CLOUD_ART, F = 14, BL = 7, P = 18;
    const cut = (x0, y0, x1, y1, cx, cy, paint) => this.jobs.push(() => {
      const R = Perf.tier > 1 ? 1.5 : 1, k = img.naturalWidth / A.w;
      if (!this.wrap) {
        this.wrap = document.createElement('div'); this.wrap.className = 'cbits';
        Object.assign(this.wrap.style, { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px' });
        img.after(this.wrap);
      }
      const bx = Math.max(0, Math.floor(x0)), by = Math.max(0, Math.floor(y0)), bw = Math.min(A.w, Math.ceil(x1)) - bx, bh = Math.min(A.h, Math.ceil(y1)) - by;
      const c = document.createElement('canvas'); c.width = Math.ceil(bw * R); c.height = Math.ceil(bh * R);
      const g = c.getContext('2d');
      g.drawImage(img, bx * k, by * k, bw * k, bh * k, 0, 0, c.width, c.height);
      const X = (x) => (x - bx) * R, Y = (y) => (y - by) * R;
      const disc = (x, y, r) => { // a soft-edged disc: solid to r − F/2, clear from r + F/2
        const gr = g.createRadialGradient(X(x), Y(y), Math.max(0, r - F / 2) * R, X(x), Y(y), (r + F / 2) * R);
        gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      };
      paint(g, X, Y, disc, c);
      const el = document.createElement('div'); el.className = 'cb';
      Object.assign(el.style, { left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px' });
      Object.assign(c.style, { left: '0', top: '0', width: bw + 'px', height: bh + 'px' });
      // its blurred twin (where canvas filters work), with room round it for the blur
      let soft = null;
      const s = document.createElement('canvas'), sg = s.getContext('2d');
      if ('filter' in sg) {
        s.width = bw + 2 * P; s.height = bh + 2 * P;
        sg.filter = `blur(${BL}px)`; sg.drawImage(c, P, P, bw, bh);
        Object.assign(s.style, { left: -P + 'px', top: -P + 'px', width: s.width + 'px', height: s.height + 'px', opacity: '0' });
        el.appendChild(soft = s);
      }
      el.appendChild(c);
      this.wrap.appendChild(el);
      const dx = cx - A.mid[0], dy = cy - A.mid[1], len = Math.hypot(dx, dy) || 1;
      this.bits.push({ el, sharp: c, soft, ux: dx / len, uy: dy / len, len, dx: 0, dy: 0, dl: 0.06 * Math.min(1, len / 320), s1: 1.3, r1: 0, f: 1 });
    });
    // the puffs: each keeps what it shows of itself (less the puffs in front of it), down to the bottom of the belly
    CLOUD_PUFFS.forEach(([x, y, r, z]) => cut(x - r - F, y - r - F, x + r + F, Math.min(y + r + F, A.base + 2), x, Math.min(y, A.base - 30), (g, X, Y, disc, c) => {
      g.globalCompositeOperation = 'destination-in';
      disc(x, y, r);
      const lg = g.createLinearGradient(0, Y(A.base - 4), 0, Y(A.base + 1)); lg.addColorStop(0, '#000'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out';
      CLOUD_PUFFS.forEach(([x2, y2, r2, z2]) => { if (z2 > z && Math.hypot(x2 - x, y2 - y) < r + r2 + F) disc(x2, y2, r2); });
    }));
    // the bottom, in four lengths: whatever of the belly no puff's circle holds
    [[0, 190], [190, 380], [380, 570], [570, A.w]].forEach(([x0, x1]) => cut(x0 - F, A.base - 46, x1 + F, A.h, (x0 + x1) / 2, A.base - 6, (g, X, Y, disc, c) => {
      g.globalCompositeOperation = 'destination-in';
      const l = X(x0 - F / 2), r = X(x1 + F / 2), lg = g.createLinearGradient(l, 0, r, 0), f = (F * (X(1) - X(0))) / (r - l);
      lg.addColorStop(0, x0 > 0 ? 'rgba(0,0,0,0)' : '#000'); lg.addColorStop(f, '#000'); lg.addColorStop(1 - f, '#000'); lg.addColorStop(1, x1 < A.w ? 'rgba(0,0,0,0)' : '#000');
      g.fillStyle = lg; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out';
      g.save(); g.beginPath(); g.rect(0, 0, c.width, Y(A.base - 2)); g.clip();
      CLOUD_PUFFS.forEach(([x2, y2, r2]) => disc(x2, y2, r2));
      g.restore();
    }));
    const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 40);
    const next = () => { if (this.jobs.length && this.ready()) { this.jobs.shift()(); idle(next); } };
    if (this.ready()) idle(next); else img.addEventListener('load', () => idle(next), { once: true });
  },
  ready() { return !!(this.cl && this.cl.complete && this.cl.naturalWidth); },
  // the cloud's picture shows (v: an opacity, '' = as it is), and its rim light and haze with it
  clOp(v) {
    if (!this.look) this.look = Cloud.el ? [...Cloud.el.querySelectorAll('.cl,.clr,.chz')] : [];
    for (const el of this.look) el.style.opacity = v;
  },
  // at a burst: any pieces not cut yet are cut now (if the picture is in; if not, the cloud only fades)
  make() { this.prepare(); if (this.ready()) while (this.jobs.length) this.jobs.shift()(); },
  // the pop: the pieces show, exactly on the cloud, and each is given its throw (p = how hard: 1, or 0.6 for the
  // gentle "not yet" burst). The farther a piece is from the middle, the farther it flies (a few hundred px for the
  // outer puffs); it swells a lot and turns. Each burst throws them a little differently
  pop(p = 1) {
    this.on = true;
    for (const b of this.bits) {
      const D = (70 + 0.95 * b.len) * p * rr(0.88, 1.15);
      b.dx = b.ux * D; b.dy = b.uy * D * 0.85; b.f = 1;
      b.s1 = 1 + (0.45 + rr(0, 0.35)) * p; b.r1 = (rr(-11, 11) + Math.sign(b.ux) * 6) * p; b.up = 26 * p;
      Object.assign(b.el.style, { visibility: 'visible', transform: 'none', willChange: 'transform' });
      b.sharp.style.opacity = '1';
      if (b.soft) b.soft.style.opacity = '0';
    }
  },
  // k = 0…1 of Motion.BEAT.BURST: the pieces blast out (a fast start that the air brakes hard: ease-out quart), rise a
  // little, swell and turn; each softens into its blurred twin and the mist fades. The cloud's own picture lets go
  // under them in the first fifth of a second (ease-in)
  fly(k) {
    if (!this.on) return;
    const T = Motion.BEAT.BURST, t = k * T;
    this.clOp((this.bits.length ? 1 - Ease.inQuad(Math.min(1, t / 0.2)) : 1 - Ease.inQuad(k)).toFixed(3));
    for (const b of this.bits) {
      const u = clamp((t - b.dl) / (T - b.dl), 0, 1), e = 1 - Math.pow(1 - u, 4), s = 1 + (b.s1 - 1) * Ease.outCubic(u);
      b.el.style.transform = `translate(${(b.dx * b.f * e).toFixed(2)}px,${(b.dy * b.f * e - b.up * u).toFixed(2)}px) rotate(${(b.r1 * e).toFixed(2)}deg) scale(${s.toFixed(4)})`;
      if (b.soft) {
        b.sharp.style.opacity = (1 - Ease.inQuad(Math.min(1, u / 0.45))).toFixed(3);
        b.soft.style.opacity = (Math.min(1, u / 0.18) * (1 - Ease.inQuad(clamp((u - 0.2) / 0.8, 0, 1)))).toFixed(3);
      } else b.sharp.style.opacity = (1 - Ease.inQuad(u)).toFixed(3);
    }
  },
  // a new cloud forms: the burst run backwards, gentler. Each piece starts out where a burst would have thrown it
  // (part of the way), swollen, turned and blurred, then drifts in (ease-out, the outer ones a moment later) and
  // sharpens as it arrives; the cloud's picture fades in under them as they meet, then they hand over to it
  gatherFrom() {
    this.on = true;
    for (const b of this.bits) {
      const D = (40 + 0.55 * b.len) * rr(0.85, 1.15);
      b.gx = b.ux * D; b.gy = b.uy * D * 0.8 + rr(-8, 8); b.gs = rr(1.22, 1.42); b.gr = rr(-9, 9); b.gd = 0.14 * Math.min(1, b.len / 320);
      Object.assign(b.el.style, { visibility: 'visible', willChange: 'transform' });
    }
    this.clOp('0');
    this.gather(0);
  },
  // k = 0…1 of Motion.BEAT.CLOUD_IN
  gather(k) {
    if (!this.on) return;
    const T = Motion.BEAT.CLOUD_IN, t = k * T, end = T * 0.8;
    this.clOp(Ease.inOutQuad(clamp((k - 0.45) / 0.35, 0, 1)).toFixed(3)); // the picture comes in under them, once they are nearly in place (it fills the seams between them: the cloud forms whole)
    const out = Ease.inQuad(clamp((k - 0.84) / 0.16, 0, 1)); // …and they hand over to it
    for (const b of this.bits) {
      const u = clamp((t - b.gd) / (end - b.gd), 0, 1), e = Ease.outCubic(u), q = 1 - e, show = Ease.outQuad(Math.min(1, u / 0.35)) * (1 - out);
      b.el.style.transform = `translate(${(b.gx * q).toFixed(2)}px,${(b.gy * q).toFixed(2)}px) rotate(${(b.gr * q).toFixed(2)}deg) scale(${(1 + (b.gs - 1) * q).toFixed(4)})`;
      if (b.soft) { b.soft.style.opacity = (show * q).toFixed(3); b.sharp.style.opacity = (show * Math.min(1, e * 1.3)).toFixed(3); }
      else b.sharp.style.opacity = show.toFixed(3);
    }
  },
  // the burst is over: nothing of the cloud is left (it stays hidden until the next one gathers)
  done() {
    Cloud.a = 0; Cloud.s = 1; Cloud.el.style.opacity = '0'; Cloud.lastOp = '0.000';
    this.reset();
  },
  // ready for a new cloud: its picture and its equation back, the pieces put away, no glow in its heart
  reset() {
    this.on = false;
    for (const b of this.bits) Object.assign(b.el.style, { visibility: 'hidden', willChange: '', transform: 'none' });
    this.clOp('');
    const box = $('#eqBox'); if (box) Object.assign(box.style, { opacity: '', transform: '', willChange: '' });
    if (Cloud.core) Object.assign(Cloud.core.style, { opacity: '0', transform: '', willChange: '' });
    Cloud.jx = Cloud.jy = 0;
  },
};

// ---------- x's moods: pictures that move frame by frame (the user's art, 23 Nov: tools/cut_x_sprites.py) ----------
// A mood is a row of frames in one picture (assets/img/<src>.webp), seen through a window one frame wide (.mood): the
// row slides along, a frame at a time (transform only). The frames turn on the game's clock, so they freeze on pause,
// keep their beat when the equation is redrawn (its cage is a new element each time) and need no timer of their own.
// Under reduced motion each shows one still frame and nothing moves. d: each frame's time (s), round a loop.
//   cry:   x sad in its cage, no tears (the user, 25 Nov: "no need to make a cry"): it looks out sadly, its lip
//          trembles, its eyelids droop with a sigh, and it looks out again. Slow, so it reads as sad, not as sobbing
//   dance: the freed x dancing, two steps to a loop: a crouch, a hop with its fists up, a wink and a wave; a crouch, a
//          hop with its arms out, a wave (2 beats of the music, ~81 bpm). The sheet draws its hops a little higher; here
//          each hop rises and falls smoothly through its frame (hop: how high, of the frame's height) and each landing
//          gives a little squash. stand: the standing body's height (px of the frame's h)
const SPR = {
  cry: { src: 'x_cry', n: 3, w: 382, h: 503, d: [1.2, 0.55, 0.95], still: 0 },
  dance: { src: 'x_dance', n: 6, w: 491, h: 396, d: [0.185, 0.278, 0.278, 0.185, 0.278, 0.278], still: 1, stand: 374, hops: [1, 4], hop: 0.1 },
};
const Sprite = {
  live: new Set(),
  // a mood's window, with its row of frames in it (frame 1 shows until it is played or held)
  html(name, cls = '', alt = '') {
    const s = SPR[name];
    return `<span class="mood ${cls}" data-mood="${name}" style="aspect-ratio:${s.w}/${s.h}"><img src="${IMG}${s.src}.webp" alt="${alt}" draggable="false"></span>`;
  },
  // every new window under root plays its loop on the shared beat (from t = 0), so a redrawn cage just carries on
  scan(root) { root.querySelectorAll('.mood').forEach((el) => { if (!el._s) this.play(el); }); },
  play(el, name = el.dataset.mood, t0 = 0) { if (!el) return; el._s = { a: SPR[name], t0, hold: -1, f: -1, tr: '' }; this.live.add(el); this.paint(el, Clock.t); },
  hold(el, f) { if (!el) return; if (!el._s) this.play(el); el._s.hold = f; this.paint(el, Clock.t); }, // one frame, still
  tick(t) { for (const el of this.live) { if (el.isConnected) this.paint(el, t); else this.live.delete(el); } },
  paint(el, t) {
    const s = el._s, a = s.a;
    let f = s.hold, u = 0;
    if (f < 0) {
      if (Motion.reduced) f = a.still;
      else { // (which frame at time t, and how far through it)
        const T = a.T || (a.T = a.d.reduce((p, q) => p + q, 0));
        u = (((t - s.t0) % T) + T) % T; f = 0;
        while (f < a.n - 1 && u >= a.d[f]) u -= a.d[f++];
        u = Math.min(1, u / a.d[f]);
      }
    }
    if (f !== s.f) { s.f = f; el.firstChild.style.transform = `translateX(${((-100 * f) / a.n).toFixed(4)}%)`; }
    if (!a.hops) return;
    let y = 0, sx = 1, sy = 1;
    if (s.hold < 0 && !Motion.reduced) {
      if (a.hops.includes(f)) y = -100 * a.hop * Math.sin(Math.PI * u); // up and down within its frame
      else if (a.hops.includes(f - 1) && u < 0.45) { const w = Math.sin((Math.PI * u) / 0.45); sx = 1 + 0.045 * w; sy = 1 - 0.07 * w; } // the landing
    }
    const tr = y || sx !== 1 ? `translateY(${y.toFixed(2)}%) scale(${sx.toFixed(4)},${sy.toFixed(4)})` : '';
    if (tr !== s.tr) { s.tr = tr; el.style.transform = tr; }
  },
};

// ---------- the cage cracking open when x is freed ----------
// (the user, 23 Nov: "extreme… cage crack, and x come out from that… slow animation of the cage crack and x come out
// from them"). x stops crying and looks up; it pushes on the bars three times, and each push cracks the cage further:
// glowing cracks run out over its gold from where x's hands are, light leaks through them, a fan of light rays wakes
// behind the cage and chips of gold fly. After the third push the cracks race over the whole cage and it trembles,
// about to give; then it bursts along its cracks: a flash, and its shards tumble away (some toward us, some away),
// slowing in the air and fading, while x rises out of the light with its fists up, hovers with sparkles circling it,
// comes down where the cage stood and dances there.
// The cracks ARE where it comes apart: one fracture (Fracture: a Voronoi pattern round x's chest, its edges made
// jagged) gives both the lines that crack and the shards. The cracks are drawn on a canvas over the cage, masked by
// the cage as it shows round x (cage_crack.webp), so they run only over its gold; the shards are the cage of the
// crying frame x holds, with x taken out (cage_empty.webp, both cut by tools/cut_x_sprites.py), cut along the cracks
// and flown on the FX canvas (a layer), over the scene. The free x (the dance's frames), its white twin and the rays
// live in the cage's box in the equation, so they ride the cloud. Measured in cage units: the cage's box is 199 × 262
// (its pictures are 382 × 503 px).
const CAGE = { w: 199, h: 262, x: { cx: 99.6, feet: 229.7, h: 134.4 }, rest: 0.75, shift: 0,
  core: [100, 164], hands: [[51.4, 186.7], [149.6, 186.8]], // x's chest (the fracture's centre) and its gloves on the front bars (where the pushes land)
  // the three pushes, in s of the crack as it was first made (T = 2.6 s: the fracture's crack speeds are set for it);
  // it plays in Motion.BEAT.CRACK, so the whole crack runs at T / CRACK speed (the break comes at its end)
  push: [0.15, 1.0, 1.85], T: 2.6,
  zoom: 1.1,                                         // the camera's zoom while it cracks (the crack canvas has as many px as the cage has on screen then)
  rise: { up: 0.47, hover: 0.72, drop: 0.86, top: -0.07 } }; // x's rise, as fractions of Motion.BEAT.RISE: up out of the light, hover, drop, land (top: its feet at the hover, of the cage's height from its middle)
// (x in its cage: centre, feet, height. The free x stands 75 % of the cage's height tall, where it stood: its feet on
// the cage's floor, in the middle)

// The fracture: seeds in rings round x's chest (a fixed seed, so it is the same each time), each seed's Voronoi cell
// cut out of the cage's box by half-planes; every shared edge made jagged once and used by both its cells, so the
// shards fit together exactly. Each crack (a shared edge) has its moment: the first push cracks the edges near x's
// left glove, the second those near its right glove, the third all the rest, racing out from the chest; each crack
// runs from its end nearer where it started.
const Fracture = {
  cells: null, cracks: null,
  make() {
    if (this.cells) return this;
    let sd = 23;
    const R = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // (mulberry32)
    const [cx, cy] = CAGE.core, W = CAGE.w, H = CAGE.h, sites = [[cx + 3, cy - 5]];
    [[44, 6, 0.35], [90, 8, 0], [142, 10, 0.3]].forEach(([r, n, a0]) => {
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.45, d = r * (0.86 + 0.28 * R()); sites.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.15]); }
    });
    // a cell's outline, cut by the half-plane nearer seed a than seed b. Each vertex carries the tag of the edge that
    // leaves it: the seed on that edge's other side (−1 = the box)
    const clip = (poly, a, b, j) => {
      const out = [], nx = b[0] - a[0], ny = b[1] - a[1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, side = (p) => (p.x - mx) * nx + (p.y - my) * ny;
      for (let i = 0; i < poly.length; i++) {
        const P = poly[i], Q = poly[(i + 1) % poly.length], dp = side(P), dq = side(Q);
        if (dp <= 0) out.push(P);
        if ((dp <= 0) !== (dq <= 0)) { const t = dp / (dp - dq); out.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t, e: dp <= 0 ? j : P.e }); }
      }
      return out;
    };
    const box = [{ x: -3, y: -3, e: -1 }, { x: W + 3, y: -3, e: -1 }, { x: W + 3, y: H + 3, e: -1 }, { x: -3, y: H + 3, e: -1 }];
    const raw = sites.map((a, i) => { let poly = box; sites.forEach((b, j) => { if (j !== i && poly.length > 2) poly = clip(poly, a, b, j); }); return poly; });
    const area = (p) => { let s2 = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s2 += a.x * b.y - b.x * a.y; } return Math.abs(s2) / 2; };
    // the jagged edges: made from the lower seed's side (points pushed off the straight line at random), and read
    // backwards by the cell on the other side
    const jag = new Map();
    const jagged = (i, j, P, Q) => {
      const key = i < j ? i + ',' + j : j + ',' + i;
      let J = jag.get(key);
      if (!J) {
        const A = i < j ? P : Q, B = i < j ? Q : P, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.round(L / 11)), pts = [];
        for (let k = 1; k < n; k++) { const t = (k + (R() - 0.5) * 0.5) / n, o = (R() - 0.5) * Math.min(7, L * 0.16); pts.push({ x: A.x + dx * t - (dy / L) * o, y: A.y + dy * t + (dx / L) * o }); }
        J = { A, B, pts }; jag.set(key, J);
      }
      return i < j ? J.pts : J.pts.slice().reverse();
    };
    this.cells = []; this.cracks = [];
    raw.forEach((poly, i) => {
      if (poly.length < 3 || area(poly) < 40) return;
      const pts = [];
      poly.forEach((P, a) => { pts.push({ x: P.x, y: P.y }); if (P.e >= 0) pts.push(...jagged(i, P.e, P, poly[(a + 1) % poly.length])); });
      this.cells.push(pts);
    });
    // each crack's moment and speed (s into Motion.BEAT.CRACK; cage px per s)
    const P = CAGE.push, [h1, h2] = CAGE.hands, far = (p, q) => Math.hypot(p.x - q[0], p.y - q[1]);
    for (const J of jag.values()) {
      const pts = [J.A, ...J.pts, J.B];
      let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      const mid = pts[pts.length >> 1], a1 = far(mid, h1), a2 = far(mid, h2), ac = far(mid, CAGE.core);
      let o, t0, v;
      if (a1 < 62) { o = h1; t0 = P[0] + 0.03 + a1 / 320; v = 230; }
      else if (a2 < 68) { o = h2; t0 = P[1] + 0.03 + a2 / 320; v = 250; }
      else { o = CAGE.core; t0 = P[2] + 0.08 + ac / 400; v = 520; }
      if (far(pts[0], o) > far(pts[pts.length - 1], o)) pts.reverse();
      this.cracks.push({ pts, L, t0, dur: L / v });
    }
    return this;
  },
};

const CageBreak = {
  cage: null, img: null, aura: null, rays: null, cv: null, g: null, x: null, xw: null, xs: null, pic: null, mask: null, layer: null, W: 0, H: 0, hb: 0, p: 0, tw: -1,
  // the empty cage's picture (the shards), the cracks' mask and the fracture, once the play scene's pictures are in
  load() {
    if (!this.pic) { this.pic = new Image(); this.pic.src = IMG + 'cage_empty.webp'; this.mask = new Image(); this.mask.src = IMG + 'cage_crack.webp'; }
    Fracture.make();
  },
  // as x's freeing begins: x stops crying and looks up (it holds the crying frame the shards are cut from); the glow,
  // the rays, the crack canvas and the free x (with its white twin) are laid into the cage's box, hidden
  prep(cage) {
    this.kill();
    this.cage = cage; this.x = this.xw = this.xs = this.aura = this.rays = this.cv = this.g = this.img = null; this.W = this.H = this.p = 0; this.tw = -1;
    if (!cage) return;
    this.load();
    this.img = cage.querySelector('.cg'); // (the cage's picture: the window onto its crying frames)
    Sprite.hold(this.img, 0);
    this.aura = document.createElement('i'); this.aura.className = 'caura'; cage.prepend(this.aura);
    this.rays = document.createElement('i'); this.rays.className = 'crays'; cage.prepend(this.rays);
    // the cracks' canvas, with as many px as the cage will have on screen in the close-up (the zoom then, the screen's px)
    const cv = this.cv = document.createElement('canvas'), r = cage.getBoundingClientRect(), w = cage.offsetWidth || 1, h = cage.offsetHeight || 1;
    const k = ((r.width / w) || 1) * (Math.max(CAGE.zoom, Stage.z || 1) / (Stage.z || 1)) * Math.min(2, devicePixelRatio || 1);
    cv.className = 'ccrk'; cv.width = Math.max(64, Math.round(w * k)); cv.height = Math.max(84, Math.round(h * k));
    cage.appendChild(cv); this.g = cv.getContext('2d');
    // the free x: the dance's frames, holding frame 2 (its fists up) until it lands. Its box is taller than x (room
    // for its arms), sized so that x stands CAGE.rest of the cage's height; x's feet are the box's foot
    this.hb = (CAGE.rest * SPR.dance.h) / SPR.dance.stand;
    const x = this.x = document.createElement('span');
    x.className = 'xfree'; x.innerHTML = Sprite.html('dance'); x.style.height = (100 * this.hb).toFixed(3) + '%';
    const xw = this.xw = x.cloneNode(true); xw.className = 'xfree xwhite';
    cage.appendChild(x); cage.appendChild(xw);
    this.xs = x.firstChild; Sprite.hold(this.xs, 1); Sprite.hold(xw.firstChild, 1);
  },
  // t = s into Motion.BEAT.CRACK: the bulge of each push (the cage widens and squats from its foot; the third builds
  // into the break and holds), the tremble before it gives, the cracks so far, how much light comes through them, the
  // rays and the glow behind. All from the time, so a Skip or a pause lands it exactly
  strain(t) {
    if (!this.img) return;
    const P = CAGE.push, T = CAGE.T; // (t is in the crack's own seconds: see CAGE.T)
    const bump = (t0, len, amp) => { const u = (t - t0) / len; return u > 0 && u < 1 ? amp * Math.sin(Math.PI * u) * (1 - 0.35 * u) : 0; };
    let p = bump(P[0], 0.42, 0.05) + bump(P[1], 0.42, 0.07);
    if (t > P[2]) p += 0.07 * Ease.outCubic(Math.min(1, (t - P[2]) / 0.3)) + 0.05 * Ease.inQuad(clamp((t - P[2] - 0.3) / Math.max(0.01, T - P[2] - 0.3), 0, 1));
    this.p = p;
    const sh = Motion.still() ? 0 : clamp((t - (T - 0.6)) / 0.6, 0, 1), ct = Clock.t; // (the tremble: the last 0.6 s)
    const jx = sh ? 2.4 * sh * Noise(ct * 24 + 7.7) : 0, jy = sh ? 1.5 * sh * Noise(ct * 21 + 40.1) : 0;
    const tr = p || sh ? `translate(${jx.toFixed(2)}px,${jy.toFixed(2)}px) scale(${(1 + p).toFixed(4)},${(1 - 0.55 * p).toFixed(4)})` : '';
    this.img.style.transform = tr; this.cv.style.transform = tr;
    let flare = 0; for (const t0 of P) if (t > t0) flare += Math.exp(-(t - t0) / 0.28); // (the light flares with each push)
    const build = t < P[0] ? 0 : t < P[1] ? 0.35 : t < P[2] ? 0.6 : 0.6 + 0.4 * clamp((t - P[2]) / (T - P[2]), 0, 1);
    this.drawCracks(t, Math.min(1, 0.3 + 0.8 * build + 0.5 * flare));
    this.setRays(Math.min(1, 0.85 * build + 0.3 * flare), 0.7 + 0.3 * build);
    this.aura.style.opacity = Math.min(1, 0.12 + 0.55 * build + 0.45 * flare).toFixed(3);
  },
  // the cracks at time t, glow = how much light comes through them: a soft wide warm light round each crack, the dark
  // split, white-hot light inside it and a bright point where a crack is still running; then masked by the cage as it
  // shows round x (cage_crack: no cracks over x, or over the sky between the bars). Without the mask there are none
  drawCracks(t, glow) {
    const g = this.g, cv = this.cv, m = this.mask;
    if (!g) return;
    const W = cv.width, H = cv.height, lines = [], tips = [];
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    if (!(m && m.complete && m.naturalWidth)) return;
    for (const c of Fracture.cracks) {
      const u = (t - c.t0) / c.dur; if (u <= 0) continue;
      let left = c.L * Math.min(1, u); const q = c.pts, out = [q[0]];
      for (let i = 1; i < q.length && left > 0; i++) {
        const a = q[i - 1], b = q[i], l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l <= left) { out.push(b); left -= l; } else { const f = left / l; out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); left = 0; }
      }
      lines.push(out); if (u < 1) tips.push(out[out.length - 1]);
    }
    if (!lines.length) return;
    g.setTransform(W / CAGE.w, 0, 0, H / CAGE.h, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); for (const L of lines) { g.moveTo(L[0].x, L[0].y); for (let i = 1; i < L.length; i++) g.lineTo(L[i].x, L[i].y); }
    g.strokeStyle = `rgba(255,170,30,${(0.4 * glow).toFixed(3)})`; g.lineWidth = 15; g.stroke();
    g.strokeStyle = `rgba(255,226,120,${(0.7 * glow).toFixed(3)})`; g.lineWidth = 8.5; g.stroke();
    g.strokeStyle = 'rgba(84,34,0,.95)'; g.lineWidth = 4.4; g.stroke();
    g.strokeStyle = `rgba(255,255,236,${Math.min(1, 0.45 + 0.55 * glow).toFixed(3)})`; g.lineWidth = 2.1; g.stroke();
    g.fillStyle = '#fffbe8';
    for (const p of tips) { g.beginPath(); g.arc(p.x, p.y, 4.2, 0, Math.PI * 2); g.fill(); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in';
    g.drawImage(m, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  },
  // the fan of light behind the cage (op, size); it turns slowly all the time it shows
  setRays(op, sc = 1) {
    const r = this.rays;
    if (!r) return;
    const o = Math.max(0, op).toFixed(3); if (o !== r.style.opacity) r.style.opacity = o;
    r.style.transform = `translate(-50%,-50%) rotate(${((Clock.t * 14) % 360).toFixed(2)}deg) scale(${sc.toFixed(4)})`;
  },
  // a push lands (i = 0, 1, 2): the crack's snap and the cage's groan, chips of gold and sparks from where x's hand hit,
  // a starburst there, and the camera jolts (a little more each time)
  push(i) {
    if (!this.img) return;
    Sound.crack(i); Haptic.buzz(10 + 6 * i);
    Stage.hit({ trauma: 0.1 + 0.06 * i, zoom: 0.006 + 0.005 * i });
    const [hx, hy] = i < 2 ? CAGE.hands[i] : CAGE.core, w = this.pt(hx, hy);
    FX.burst(w.x, w.y, '#e3a21a', 6 + 4 * i, 240 + 70 * i, { paint: true, size: 0.5, g: 900, up: 140, white: 0 });
    FX.burst(w.x, w.y, '#fff3b8', 5 + 3 * i, 220, { size: 0.55, white: 0.5 });
    FX.star(w.x, w.y, '#fff1b0', 70 + 25 * i, 0.22, { n: 6 });
  },
  // a point of the cage (cage units) in art space, from where the cage is on screen
  pt(px, py) {
    const r = this.cage.getBoundingClientRect();
    return Stage.s2w(r.left + (px / CAGE.w) * r.width, r.top + (py / CAGE.h) * r.height);
  },
  // the break: the cage hands over to its shards (its picture keeps its place in the equation, unseen), which fly on
  // the FX canvas from exactly where it was; x shows, white with light, where it stood
  burst() {
    if (!this.img) return;
    this.W = this.cage.offsetWidth; this.H = this.cage.offsetHeight;
    const r = this.cage.getBoundingClientRect(), a = Stage.s2w(r.left, r.top), b = Stage.s2w(r.right, r.bottom);
    const rect = { x: a.x, y: a.y, s: (b.x - a.x) / CAGE.w };
    Object.assign(this.img.style, { transform: '', opacity: '0' });
    this.cv.style.visibility = 'hidden';
    this.cage.classList.remove('glowx');
    for (const el of [this.x, this.xw]) Object.assign(el.style, { visibility: 'visible', willChange: 'transform,opacity' });
    if (!Motion.still() && this.pic && this.pic.complete && this.pic.naturalWidth && rect.s > 0) FX.layers.push(this.layer = this.shatter(rect, this.p));
    this.rise(0);
  },
  // the shards in flight (an FX layer). Each is one cell of the fracture, thrown out from x's chest (the outer ones
  // faster) and up, braked hard by the air so they seem to hang (a slow-motion look, with no change in the game's
  // pace), drawn down, spinning less and less, tumbling (a flat piece turning over: it narrows, and its far side is
  // darker), some coming toward us (growing) and some going away (shrinking). White-hot at first, they cool to gold,
  // and fade after 0.7 s. They start from the bulge the cage broke at, let go in the first 0.12 s
  shatter(rect, bulge) {
    const T = Motion.BEAT.SHATTER, D = 2.3, G = 600, pic = this.pic, [ccx, ccy] = CAGE.core, O = [CAGE.w / 2, CAGE.h * 0.9], k = rect.s / 0.4;
    const qx = pic.naturalWidth / CAGE.w, qy = pic.naturalHeight / CAGE.h; // (the picture's px per cage unit)
    const shards = Fracture.cells.map((pts) => {
      let cx = 0, cy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of pts) { cx += q.x; cy += q.y; x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      cx /= pts.length; cy /= pts.length;
      const bx = Math.max(0, Math.floor(x0)), by = Math.max(0, Math.floor(y0)), bw = Math.min(CAGE.w, Math.ceil(x1)) - bx, bh = Math.min(CAGE.h, Math.ceil(y1)) - by;
      const dx = cx - ccx, dy = cy - ccy, len = Math.hypot(dx, dy) || 1, sp = rr(330, 560) * (0.55 + 0.6 * Math.min(1, len / 120)) * k;
      return { pts: pts.map((q) => ({ x: q.x - cx, y: q.y - cy })), cx, cy, bx, by, bw, bh, ok: bw > 1 && bh > 1,
        vx: (dx / len) * sp, vy: (dy / len) * sp - rr(160, 300) * k, w: rr(-7, 7), w2: rr(-0.9, 0.9), tu: rr(-6.5, 6.5), ph: rr(-0.3, 0.3),
        zs: Math.random() < 0.4 ? rr(0.55, 1.1) : rr(-0.4, -0.15) };
    }).filter((s) => s.ok).sort((a, b) => a.zs - b.zs); // (those going away first, so the ones coming at us pass in front)
    let t = 0;
    return {
      update(dt) { t += dt; return t < T; },
      kill() { t = T; },
      draw(c, M) {
        const a = t < 0.7 ? 1 : 1 - Ease.inQuad(clamp((t - 0.7) / (T - 0.7), 0, 1));
        if (a <= 0) return;
        const ex = (1 - Math.exp(-D * t)) / D, rel = Math.max(0, 1 - t / 0.12), sxb = 1 + bulge * rel, syb = 1 - 0.55 * bulge * rel;
        const hot = 0.8 * Math.max(0, 1 - t / 0.24), zt = 1 - Math.exp(-1.7 * t);
        c.globalAlpha = a;
        for (const s of shards) {
          const x = rect.x + (O[0] + (s.cx - O[0]) * sxb) * rect.s + s.vx * ex, y = rect.y + (O[1] + (s.cy - O[1]) * syb) * rect.s + (s.vy - G / D) * ex + (G / D) * t;
          const fl = Math.cos(s.ph + s.tu * t), sc = rect.s * (1 + s.zs * zt), fy = Math.abs(fl) < 0.06 ? (fl < 0 ? -0.06 : 0.06) : fl;
          c.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
          c.translate(x, y); c.rotate(s.w * ex + s.w2 * t); c.scale(sc * sxb, sc * syb * fy);
          c.beginPath(); s.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath();
          c.save(); c.clip();
          c.drawImage(pic, s.bx * qx, s.by * qy, s.bw * qx, s.bh * qy, s.bx - s.cx, s.by - s.cy, s.bw, s.bh);
          const shade = fl < 0 ? 0.42 * Math.min(1, -fl * 1.5) : 0;
          if (hot > 0 || shade > 0) {
            c.globalCompositeOperation = 'source-atop';
            if (hot > 0) { c.fillStyle = `rgba(255,248,220,${(0.9 * hot).toFixed(3)})`; c.fillRect(s.bx - s.cx, s.by - s.cy, s.bw, s.bh); }
            if (shade > 0) { c.fillStyle = `rgba(70,32,0,${shade.toFixed(3)})`; c.fillRect(s.bx - s.cx, s.by - s.cy, s.bw, s.bh); }
            c.globalCompositeOperation = 'source-over';
          }
          c.restore();
        }
      },
    };
  },
  // k = 0…1 of Motion.BEAT.RISE: x rises out of the light with its fists up (white-hot at first, at its size inside the
  // cage, growing a little past its full size as it goes up, leaning), hovers at the top of its rise, then comes down
  // where it stood in the cage and lands with a squash that settles about its feet; then it dances there (Sprite:
  // SPR.dance, from its crouch). Its place is worked out from its feet (the foot of its box). The glow behind flares
  // out at the break, and the rays flare, then calm to a halo behind x
  rise(k) {
    const x = this.x;
    if (!x || !this.W) return;
    const H = this.H, t = k * Motion.BEAT.RISE, R = CAGE.rise, hb = (this.hb * H) / 2; // (hb: half its box: from its middle to its feet)
    const X0 = (CAGE.x.cx / CAGE.w - 0.5) * this.W, F0 = (CAGE.x.feet / CAGE.h - 0.5) * H, S0 = CAGE.x.h / CAGE.h / CAGE.rest;
    const X1 = CAGE.shift * H, XA = lerp(X0, X1, 0.55), FA = R.top * H;
    let px, f, s, r = 0, sx = 1, sy = 1;
    if (k < R.up) { const u = k / R.up, e = Ease.outCubic(u); px = lerp(X0, XA, Ease.outQuad(u)); f = lerp(F0, FA, e); s = lerp(S0, 1.12, e); r = -6 * Math.sin(Math.PI * u); sy = 1 + 0.1 * (1 - e); sx = 1 - 0.06 * (1 - e); }
    else if (k < R.hover) { const u = (k - R.up) / (R.hover - R.up); px = XA; f = FA - 0.025 * H * Math.sin(Math.PI * u); s = 1.12; r = 2.5 * Math.sin(Math.PI * 2 * u); }
    else if (k < R.drop) { const u = (k - R.hover) / (R.drop - R.hover), e = Ease.inQuad(u); px = lerp(XA, X1, u); f = lerp(FA, F0, e); s = lerp(1.12, 1, u); sy = 1 + 0.07 * e; sx = 1 - 0.05 * e; }
    else { const u = (k - R.drop) / (1 - R.drop), w = Math.exp(-4.5 * u) * Math.cos(9 * u) * (1 - u); px = X1; f = F0; s = 1; sy = 1 - 0.14 * w; sx = 1 + 0.1 * w; }
    const tr = `translate(-50%,-50%) translate(${px.toFixed(2)}px,${(f - hb).toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(s * sx).toFixed(4)},${(s * sy).toFixed(4)})`;
    x.style.transform = tr; this.xw.style.transform = tr;
    this.xw.style.opacity = (1 - Ease.outQuad(Math.min(1, t / 0.6))).toFixed(3);
    const a = Math.min(1, t / 0.45);
    this.aura.style.transform = `scale(${(1 + 1.1 * Ease.outCubic(a)).toFixed(3)})`; this.aura.style.opacity = (1 - Ease.inQuad(a)).toFixed(3);
    this.setRays(t < 0.25 ? 1 : lerp(1, 0.55, Ease.inOutQuad(Math.min(1, (t - 0.25) / 1.0))),
      1 + 0.45 * Ease.outCubic(Math.min(1, t / 0.4)) - 0.15 * Ease.inOutQuad(clamp((t - 0.4) / 1.2, 0, 1)));
    if (k >= 1 && !x.classList.contains('live')) { x.classList.add('live'); x.style.willChange = ''; this.xw.style.visibility = 'hidden'; Sprite.play(this.xs, 'dance', Clock.t); }
  },
  // as x hovers at the top of its rise: sparkles circle it, and a ring of light runs out from it
  orbit() {
    if (!this.x || !this.W) return;
    const XA = lerp((CAGE.x.cx / CAGE.w - 0.5) * this.W, CAGE.shift * this.H, 0.55);
    const c = this.pt(CAGE.w / 2 + (XA / this.W) * CAGE.w, CAGE.h * (0.5 + CAGE.rise.top - 0.56 * CAGE.rest)); // (its middle: its feet, less half its height at 1.12)
    const R = (this.cage.getBoundingClientRect().height / (Stage.S * Stage.z)) * 0.62 || 60;
    FX.orbit(c.x, c.y, 16, R);
    FX.ring(c.x, c.y, '#ffd84a', R * 2.2, { lw: 7, life: 0.6, paint: true, delay: 0.35 });
  },
  // x comes down: a puff of gold sparkles and a ring at its feet, and a soft landing
  landFx() {
    if (!this.x || !this.W) return;
    const f = this.pt(CAGE.w / 2 + ((CAGE.shift * this.H) / this.W) * CAGE.w, CAGE.x.feet);
    Sound.land();
    FX.burst(f.x, f.y, '#ffd84a', 14, 300, { paint: true, dir: -Math.PI / 2, spread: 1.3, size: 0.6, g: 700, white: 0.2 });
    FX.ring(f.x, f.y - 6, '#ffc21a', 120, { lw: 6, life: 0.45, paint: true });
  },
  // k = 0…1 of Motion.BEAT.HOLD: "x = 2" rests on the cloud; the rays behind x fade down to a soft halo, and a
  // twinkle shows round the equation now and then
  hold(k) {
    if (!this.x) return;
    this.setRays(lerp(0.55, 0.28, Ease.inOutQuad(k)), 1.3);
    const n = Math.floor((k * Motion.BEAT.HOLD) / 0.34);
    if (n > this.tw && !Motion.still() && EqUI.el) {
      this.tw = n;
      const r = EqUI.el.getBoundingClientRect(), w = Stage.s2w(rr(r.left - 24, r.right + 24), rr(r.top - 16, r.bottom + 12));
      FX.star(w.x, w.y, pick(['#ffd84a', '#ffffff', '#c58bff', '#ffd84a']), rr(24, 42), 0.6, { n: 4, paint: true });
    }
  },
  // the freeing is over or torn down (Skip, restart): its shards stop
  kill() { if (this.layer) { this.layer.kill(); this.layer = null; } },
};

// ---------- the end screen: x dancing in the middle of the deck, in front of its broken cage ----------
// (the user, 25 Nov 2026: "no need of this amazing panel… in between I want X should be dancing in the between, and
// the cage behind of the X. And cage is in broken"; before, x stood by its cage on the right, beside a results card.)
// x freed at least once: its cage stands just behind it, a little to the left so its broken front shows (bars bent
// and snapped, loose bars and a bolt on the boards: cage_broken.webp, cut from the user's own picture of x free by
// tools/cut_broken_cage.py), and x dances in front of it (its dance frames, SPR.dance, with their hops). The cage
// drops onto the deck first (a clang, dust); then x jumps out from behind it in an arc and lands in the middle with a
// squash, and dances. None freed: x still sad in its cage, in the middle (its crying frames: "Play again to free them
// all!"). Transform + opacity only, on GSAP and the game clock, so it freezes on pause; under reduced motion it all
// simply stands there.
// XEND: where x stands on the deck during play (right of the cannon: DeckCage). END: x's feet (art px) and its
// frame's height, in the middle of the deck; the broken cage's foot (its base ring's bottom, a little further back on
// the deck than x), its middle (the dome's ball) and the picture's height. BROKEN: cage_broken.webp's size, and its
// base ring's bottom and its middle in it (printed by the tool)
const XEND = { x: 1330, foot: 732, free: 270, cage: 270 }; // (270: 10 % smaller with the cannon, 26 Nov 2026, so the two keep their sizes to each other)
const END = { x: 846, foot: 762, h: 300, cage: { x: 672, foot: 742, h: 450 } };
const BROKEN = { w: 418, h: 744, foot: 704, mid: 208.5 };
const EndX = {
  els: [], tl: null, drops: [],
  // returns when x starts dancing (none freed: when its cage has landed), in s from now
  show(freed) {
    this.hide();
    const free = freed > 0, h = END.h, cg = END.cage;
    const add = (html, x, top, w, ht, cls = '') => {
      const el = document.createElement('div');
      el.className = 'xEnd ' + cls; el.innerHTML = html;
      Object.assign(el.style, { left: x.toFixed(1) + 'px', top: top.toFixed(1) + 'px', width: w.toFixed(1) + 'px', height: ht.toFixed(1) + 'px' });
      $('#world').insertBefore(el, $('#cannon')); this.els.push(el);
      return el;
    };
    const shadow = (x, foot, blobs) => { const g = groundGroup($('#ground'), 'shadow', x, foot); for (const b of blobs) groundBlob(g, ...b); this.els.push(g); return g; };
    if (!free) { // x still in its cage, in the middle (its frames keep a little clear space under the cage's base)
      const w = (h * SPR.cry.w) / SPR.cry.h, lift = h * (11 / SPR.cry.h);
      const el = add(Sprite.html('cry', '', T('altXCaged')), END.x - w / 2, END.foot - h + lift, w, h);
      Sprite.play(el.firstChild);
      const sh = shadow(END.x, END.foot, [['soft', w * 0.04, 2, w * 0.92, 30], ['contact', 0, 0, w * 0.86, 16]]);
      this.drop(el, sh, END.x, END.foot, w, 0.1);
      return 0.65; // (it has landed)
    }
    // the broken cage: its picture, placed by its base ring's foot and its dome's middle
    const s = cg.h / BROKEN.h, cw = BROKEN.w * s;
    const cage = add(`<img src="${IMG}cage_broken.webp" alt="" draggable="false">`, cg.x - BROKEN.mid * s, cg.foot - BROKEN.foot * s, cw, cg.h, 'brk');
    const csh = shadow(cg.x, cg.foot, [['soft', 0, 4, cw * 1.02, 34], ['contact', 0, 0, cw * 0.86, 14], ['contact', -0.05 * cw, (736 - BROKEN.foot) * s - 3, cw * 0.2, 9]]); // (the base ring; the bolt in front)
    // x: its dance frames, its feet on the boards in the middle
    const w = (h * SPR.dance.w) / SPR.dance.h;
    const x = add(Sprite.html('dance', '', T('altXFree')), END.x - w / 2, END.foot - h, w, h, 'dnc');
    const xsh = shadow(END.x, END.foot, [['soft', 0, 3, w * 0.72, 28], ['contact', 0, 0, w * 0.5, 12]]);
    Sprite.hold(x.firstChild, 0);
    this.drop(cage, csh, cg.x, cg.foot, cw, 0.1); // (it lands at 0.65 s, before the title comes: it never falls across it)
    if (Motion.still()) { Sprite.play(x.firstChild, 'dance', Clock.t); return 0; }
    // x jumps out from behind its cage (fists up), in an arc over to the middle, lands with a squash and dances
    const dx = cg.x - END.x;
    gsap.set(x, { opacity: 0, x: dx * 0.8, y: -40, scale: 0.82 }); gsap.set(xsh, { opacity: 0, x: dx * 0.6, scale: 0.4 });
    const tl = this.tl = gsap.timeline({ delay: 1.15 });
    tl.call(() => { Sprite.hold(x.firstChild, 1); Sound.spring(); })
      .to(x, { opacity: 1, duration: 0.15, ease: 'none' }, 0)
      .to(x, { x: dx * 0.4, y: -150, scale: 0.96, duration: 0.38, ease: 'power2.out' }, 0)
      .to(x, { x: 0, y: 0, scale: 1, duration: 0.36, ease: 'power2.in' })
      .to(xsh, { opacity: 1, x: 0, scale: 1, duration: 0.74, ease: 'power1.inOut' }, 0)
      .call(() => { Sound.land(); FX.dust(END.x - w * 0.22, END.foot, -1, 7); FX.dust(END.x + w * 0.22, END.foot, 1, 7); })
      .to(x, { scaleX: 1.08, scaleY: 0.9, duration: 0.08, ease: 'power2.out' })
      .to(x, { scaleX: 1, scaleY: 1, duration: 0.36, ease: 'back.out(2)' })
      .addLabel('dance', '-=0.3')
      .call(() => Sprite.play(x.firstChild, 'dance', Clock.t), null, 'dance');
    return tl.delay() + tl.labels.dance; // (when x starts dancing, in s from now: the end card's Play again waits for it)
  },
  // the cage drops onto the deck (as a new cage does in play: DeckCage.drop), after `at` s: a clang, dust, a rebound
  drop(el, sh, x, foot, w, at) {
    if (Motion.still()) return;
    gsap.set(el, { opacity: 0, y: -620 }); gsap.set(sh, { opacity: 0, scale: 0.4 });
    const tl = gsap.timeline({ delay: at }), D = 0.55;
    this.drops.push(tl);
    tl.set(el, { opacity: 1 })
      .call(() => Sound.swish(0.3, 1.1, -0.1))
      .to(el, { y: 0, duration: D, ease: 'power2.in' }, 0)
      .to(sh, { opacity: 1, scale: 1, duration: D, ease: 'power2.in' }, 0)
      .call(() => { Sound.cageLand(0); FX.dust(x - w * 0.42, foot, -1, 6); FX.dust(x + w * 0.42, foot, 1, 6); Stage.hit({ trauma: 0.07, ky: 3 }); })
      .to(el, { scaleX: 1.06, scaleY: 0.93, duration: 0.07, ease: 'power2.out' })
      .to(el, { y: -14, scaleX: 0.98, scaleY: 1.02, duration: 0.12, ease: 'power2.out' })
      .to(el, { y: 0, scaleX: 1, scaleY: 1, duration: 0.12, ease: 'power2.in' })
      .call(() => Sound.cageLand(1))
      .to(el, { scaleX: 1.025, scaleY: 0.975, duration: 0.05, ease: 'power2.out' })
      .to(el, { scaleX: 1, scaleY: 1, duration: 0.16, ease: 'power2.out' });
  },
  // the end screen goes (Play again): its timelines are killed, x, its cage and their shadows taken away
  hide() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    for (const t of this.drops) t.kill(); this.drops = [];
    for (const el of this.els) { gsap.killTweensOf(el); el.remove(); }
    this.els = [];
  },
};

// ---------- x in its cage on the deck: the cannon's target (design review, 23 Nov 2026) ----------
// "Keep the caged X visible on deck during play as the cannon's target… the payoff (cage cracks open) happens in the
// world, and the empty space is used." x cries in its cage on the deck right of the cannon, where the end card's x
// stands (XEND), wearing an "x" tag ("show a small 'x' label on the cage, so the link to written algebra is
// explicit"). When the equation is solved, a bolt of light flies from
// the x on the cloud to the cage and it cracks open (CageBreak: its cracks, shards and x rising out of the light, all
// in this cage's box); x dances there a moment and hops away to the right, off the screen; only then does the cloud
// burst, the next question's cloud form, and the next cage fall onto the deck: one after another (the user, 25 Nov
// 2026). The box is the crying frames' (382 × 503), DECK.h art px tall; its font-size makes the cage 1.72 em tall, as
// the CSS for .cage (made for the equation) expects.
const DECK = { x: XEND.x, foot: XEND.foot, h: XEND.cage };
// x hopping off to the right when it is free (DeckCage.leaveTL), in s of a LEAVE.T-long leave (it plays in
// Motion.BEAT.HOP_OFF): the crouch, then each hop's take-off, touch-down, from and to (shares of the whole way, which
// ends past the screen's right edge) and height (art px). The last, longest leap carries it off the screen
const LEAVE = { T: 1.6, crouch: [0, 0.14], hops: [[0.14, 0.5, 0, 0.17, 70], [0.6, 0.96, 0.17, 0.36, 80], [1.1, 1.6, 0.36, 1, 130]] };
const DeckCage = {
  el: null, cage: null, sh: null, tw: null, state: 'none', w: 0, // state: 'none', 'caged' (x crying in it), 'free' (x dancing where it stood)
  init() {
    const el = this.el = document.createElement('div'), h = DECK.h, w = this.w = (h * SPR.cry.w) / SPR.cry.h, lift = h * (11 / SPR.cry.h);
    el.id = 'deckCage';
    Object.assign(el.style, { left: (DECK.x - w / 2).toFixed(1) + 'px', top: (DECK.foot - h + lift).toFixed(1) + 'px', width: w.toFixed(1) + 'px', height: h + 'px', fontSize: (h / 1.72).toFixed(2) + 'px', opacity: '0' });
    $('#world').insertBefore(el, $('#cannon'));
    const sh = this.sh = groundGroup($('#ground'), 'shadow', DECK.x, DECK.foot);
    groundBlob(sh, 'soft', w * 0.04, 2, w * 0.92, 30); groundBlob(sh, 'contact', 0, 0, w * 0.86, 16);
    sh.style.opacity = '0';
  },
  // a fresh cage with x crying in it (no "x" tag on it: the user, 25 Nov 2026, "remove the X… from this entire game")
  fill() {
    CageBreak.kill();
    this.el.innerHTML = `<span class="cage" data-key="x">${Sprite.html('cry', 'cg', T('altXCaged'))}</span>`;
    this.cage = this.el.firstChild; Sprite.play(this.cage.firstChild);
    gsap.set(this.el, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, transformOrigin: '50% 100%' });
  },
  // a new cage falls onto the deck (under the new cloud): a swish, the clang as it lands with a puff of dust, one
  // small rebound, a softer clink. Like the start screen's cage, it stands still after that; only x moves inside
  drop() {
    this.fill(); this.state = 'caged';
    const el = this.el, sh = this.sh, D = Motion.BEAT.CAGE_IN;
    if (this.tw) this.tw.kill();
    gsap.killTweensOf([el, sh]);
    if (Motion.still()) { gsap.set(el, { opacity: 1 }); gsap.set(sh, { opacity: 1, scale: 1 }); return Promise.resolve(); }
    gsap.set(el, { opacity: 1, y: -640 }); gsap.set(sh, { opacity: 0, x: 0, scale: 0.4 });
    Sound.swish(0.3, 1.1, 0.4);
    const tl = this.tw = gsap.timeline();
    tl.to(el, { y: 0, duration: D, ease: 'power2.in' }, 0)
      .to(sh, { opacity: 1, scale: 1, duration: D, ease: 'power2.in' }, 0)
      .call(() => { Sound.cageLand(0); FX.dust(DECK.x - this.w * 0.42, DECK.foot, -1, 6); FX.dust(DECK.x + this.w * 0.42, DECK.foot, 1, 6); Stage.hit({ trauma: 0.07, ky: 3 }); })
      .to(el, { scaleX: 1.06, scaleY: 0.93, duration: 0.07, ease: 'power2.out' })
      .to(el, { y: -14, scaleX: 0.98, scaleY: 1.02, duration: 0.12, ease: 'power2.out' })
      .to(el, { y: 0, scaleX: 1, scaleY: 1, duration: 0.12, ease: 'power2.in' })
      .call(() => Sound.cageLand(1))
      .to(el, { scaleX: 1.025, scaleY: 0.975, duration: 0.05, ease: 'power2.out' })
      .to(el, { scaleX: 1, scaleY: 1, duration: 0.16, ease: 'power2.out' });
    return new Promise((res) => tl.eventCallback('onComplete', res));
  },
  // the freed x leaves, in the round's timeline, after it has danced a moment where its cage stood (the user, 25 Nov
  // 2026: "then the x come out from them, and then go to the right side, and then cloud is burst"): it crouches and
  // hops away to the right along the boards, two hops and a long leap that carries it off the screen (LEAVE), its
  // shadow keeping to the deck under it, the halo behind it fading. All from the timeline's time, so a Skip or a pause
  // lands it exactly. Returns the time it is gone
  leaveTL(tl, pos) {
    const D = Motion.BEAT.HOP_OFF, k = D / LEAVE.T, el = this.el, sh = this.sh;
    let far = 0; // how far it goes (art px): until its box is past the right edge of the screen, once the camera is back on the whole scene
    const reach = () => far || (far = CX + Stage.W / Stage.S / 2 - (DECK.x - this.w / 2) + 40);
    tl.call(() => { Sprite.hold(CageBreak.xs, 1); el.style.willChange = 'transform'; }, null, pos); // (its fists up, all the way)
    drive(D, (e, u) => this.hop(u * LEAVE.T, reach()), Ease.linear, tl, pos);
    LEAVE.hops.forEach(([a, b, , x1], i) => {
      const last = i === LEAVE.hops.length - 1;
      tl.call(() => (last ? Sound.spring() : Sound.swish(0.25, 1.3, 0.5)), null, pos + a * k);
      if (!last) tl.call(() => { Sound.land(); const x = DECK.x + reach() * x1; FX.dust(x - 36, DECK.foot, -1, 4); FX.dust(x + 36, DECK.foot, 1, 4); }, null, pos + b * k);
    });
    tl.call(() => {
      this.state = 'none'; el.style.willChange = '';
      gsap.set(el, { opacity: 0 }); gsap.set(sh, { opacity: 0, x: 0, scale: 1 }); CageBreak.kill();
    }, null, pos + D);
    return pos + D;
  },
  // x at t s into LEAVE (nominal), far = the whole way (art px): on the boards (a crouch, the squash of each landing
  // that is also the crouch for the next hop) or in the air (a parabola: a stretch as it takes off, leaning into the
  // hop); its shadow under it, smaller and fainter the higher it is
  hop(t, far) {
    const H = LEAVE.hops, [c0, c1] = LEAVE.crouch;
    let i = 0; while (i < H.length - 1 && t >= H[i][1]) i++;
    const [a, b, x0, x1, h] = H[i];
    let px = 0, py = 0, r = 0, sx = 1, sy = 1, air = 0;
    if (t < a) {
      if (i === 0) { const e = Ease.outQuad(clamp((t - c0) / (c1 - c0), 0, 1)); sx = 1 + 0.07 * e; sy = 1 - 0.1 * e; } // (the crouch before the first hop)
      else { const p = H[i - 1], w = Math.sin(Math.PI * clamp((t - p[1]) / (a - p[1]), 0, 1)); px = p[3] * far; sx = 1 + 0.08 * w; sy = 1 - 0.11 * w; }
    } else {
      const u = Math.min(1, (t - a) / (b - a)), s = Math.max(0, 1 - u / 0.35);
      px = lerp(x0, x1, u) * far; air = 4 * u * (1 - u); py = -h * air;
      r = 9 * Math.sin(Math.PI * u); sx = 1 - 0.06 * s; sy = 1 + 0.09 * s;
    }
    gsap.set(this.el, { x: px, y: py, rotation: r, scaleX: sx, scaleY: sy });
    gsap.set(this.sh, { x: px, scale: lerp(1, 0.8, clamp(t / c1, 0, 1)) * (1 - 0.4 * air), opacity: 1 - 0.5 * air });
    CageBreak.setRays(0.55 * (1 - clamp(t / 0.3, 0, 1)), 1.3); // (the halo behind it fades as it crouches)
  },
  // the same leave on its own (the end card, if x is still standing where its cage was): resolves once x has gone. In
  // play the round's timeline has already taken it off (leaveTL), so this just resolves
  away() {
    if (this.state !== 'free') return Promise.resolve();
    if (this.tw) this.tw.kill();
    gsap.killTweensOf([this.el, this.sh]);
    const tl = this.tw = gsap.timeline({ paused: true });
    this.leaveTL(tl, 0);
    return new Promise((res) => { tl.eventCallback('onComplete', res); tl.play(); });
  },
  // gone at once (Play again, the end card)
  hide() {
    if (this.tw) { this.tw.kill(); this.tw = null; }
    gsap.killTweensOf([this.el, this.sh]);
    gsap.set([this.el, this.sh], { opacity: 0 });
    this.state = 'none'; CageBreak.kill();
  },
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
    this.fireText = this.fire.querySelector('.ft'); // (FIRE is placed by setN → placeFire)
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
  // FIRE fills the recess in this cannon's gold bezel, centred on it (pressed, it sinks into the dark recess), with
  // this cannon's own pill picture
  placeFire(n) {
    const F = CANNON.fire[n], [sw, sh] = CANNON.src[n], sc = CANNON.h / sh, [aw, ah, pw, ph] = F.art;
    const fcx = CANNON.x + (F.cx - sw / 2) * sc, fcy = CANNON.bottom - CANNON.h + F.cy * sc;
    const fw = F.w * sc * (aw / pw), fh = F.h * sc * (ah / ph);
    Object.assign(this.fire.style, { left: fcx - fw / 2 + 'px', top: fcy - fh / 2 + 'px', width: fw + 'px', height: fh + 'px' });
    this.fire.classList.toggle('two', n === 2); // (shows .p2, cannon 2's pill, instead of .p1)
    this.fireBox = { x: fcx, y: fcy, w: fw, h: fh };
    this.fireFont = fh * 0.775; // the word's size, from the pill's height: its capitals as tall as the painted word's (both yellow pills)
  },
  // the word on FIRE (T('btnFire')) at its size, shrunk if a longer word would run past the pill's straight middle
  fitFire() {
    const t = this.fireText; if (!t) return;
    t.style.fontSize = this.fireFont + 'px';
    const room = this.fireBox.w * 0.78, w = t.offsetWidth; // (the span is as wide as its word)
    if (w > room) t.style.fontSize = (this.fireFont * room / w).toFixed(1) + 'px';
  },
  setN(n) {
    this.n = n;
    this.placeFire(n); this.fitFire(); // (each round: by now the word is in, whatever the language)
    this.c1.style.display = this.c1f.style.display = n === 1 ? '' : 'none'; this.c2.style.display = this.c2f.style.display = n === 2 ? '' : 'none';
    const fx = $('#sockFx'); fx.innerHTML = '';
    this.sock = []; this.backs = []; // (no 1/2 order markers beside the sockets: the user had them removed, 23 Nov)
    // (no × on a loaded orb: the user had it removed, 25 Nov. Tapping another orb takes its place instead, tapBall)
    this.holes(n).forEach((h) => {
      // the socket's dark lining, shown while a ball sits in it (the ring's inner edge, so the ring covers its rim)
      const k = document.createElement('i'); k.className = 'sbk'; const kd = h.r * 2 + 1;
      Object.assign(k.style, { left: h.x - kd / 2 + 'px', top: h.y - kd / 2 + 'px', width: kd + 'px', height: kd + 'px' });
      fx.appendChild(k); this.backs.push(k);
      const g = document.createElement('div'); g.className = 'sglow';
      const d = h.r * 2.55; Object.assign(g.style, { left: h.x - d / 2 + 'px', top: h.y - d / 2 + 'px', width: d + 'px', height: d + 'px' });
      fx.appendChild(g); this.sock.push(g);
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
    if (this.morphS < 0.99) { this.setN(n); return; } // (it is growing in: Cannon.back)
    Sound.whoosh(0.4);
    const M = Motion.BEAT.MORPH;
    await tween(M * 0.4, (e) => (this.morphS = 1 - 0.18 * e), Ease.inQuad);
    this.setN(n); FX.smoke(CANNON.x, CANNON.bottom - 140, 14, 260); this.groundDust(false); Sound.clunk(); Stage.hit({ trauma: 0.1, ky: 4 });
    await tween(M * 0.6, (e) => (this.morphS = 0.82 + 0.18 * e), Ease.outBackSoft);
  },
  // the end screen: the cannon has done its work and shrinks away into a puff of smoke (design review: "FIRE is still
  // visible" on the end screen); a new game grows it back
  async leave() {
    Sound.whoosh(0.45);
    await tween(0.18, (e) => (this.morphS = 1 + 0.06 * e), Ease.outQuad);
    FX.smoke(CANNON.x, CANNON.bottom - 160, 16, 260); this.groundDust(true);
    await tween(0.4, (e) => (this.morphS = Math.max(0.001, 1.06 * (1 - e))), Ease.inBack);
    this.el.style.visibility = this.front.style.visibility = 'hidden'; this.gShadow.style.visibility = 'hidden';
  },
  async back() {
    this.el.style.visibility = this.front.style.visibility = this.gShadow.style.visibility = '';
    if (this.morphS >= 1) return;
    await tween(0.6, (e) => (this.morphS = Math.max(0.001, e)), Ease.outBack);
    Sound.clunk(); this.groundDust(true);
  },
  setFireActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.fire.classList.toggle('off', !on);
    if (on) { this.fire.classList.remove('glow'); void this.fire.offsetWidth; this.fire.classList.add('glow'); Sound.ready(); }
  },
  hint() { this.fire.classList.remove('hint'); void this.fire.offsetWidth; this.fire.classList.add('hint'); },
  // which socket fires first, shown in the first two-socket round only (design review, 23 Nov 2026: "nothing explains
  // the order; add '1' and '2' labels or number the chambers in the first two-step round"). The user had the markers
  // removed for good on 23 Nov, so these come for that one round and go when it fires. Dark glass, gold edge
  showOrder() {
    this.hideOrder(true);
    const fx = $('#sockFx');
    this.tags = this.holes().map((h, i) => {
      const t = document.createElement('span'); t.className = 'stag'; t.textContent = String(i + 1);
      Object.assign(t.style, { left: h.x + 'px', top: h.y - h.r - 30 + 'px' });
      fx.appendChild(t);
      if (Motion.still()) t.style.opacity = '1';
      else gsap.fromTo(t, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)', delay: 0.2 + i * 0.15 });
      return t;
    });
  },
  hideOrder(now = false) {
    for (const t of this.tags) { gsap.killTweensOf(t); if (now || Motion.still()) t.remove(); else gsap.to(t, { opacity: 0, scale: 0.6, duration: 0.25, ease: 'power2.in', onComplete: () => t.remove() }); }
    this.tags = [];
  },
  // FIRE tapped before every socket is full: besides its shake and the empty sockets' pulse, a hint above it says what
  // is missing (design review: "tapping it early does nothing; add a small shake and a hint ('Load 2 balls')")
  tip() {
    const n = G.sockets.length, empty = G.sockets.filter((s) => !s).length;
    const key = empty < n ? 'hintLoadMore' : n === 1 ? 'hintLoadOne' : 'hintLoadAll';
    const f = this.fireBox; Note.tip(T(key, { n: empty }), f.x, f.y + f.h / 2 + 12); // (under FIRE: the sockets above stay in view)
  },
  highlight(i, on) { if (this.sock[i]) this.sock[i].classList.toggle('on', on); },
  pulseSockets() {
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
  holes: [], balls: [], enterY: 0,
  applyEnter() {
    const tr = this.enterY ? `translateY(${this.enterY.toFixed(1)}px)` : '';
    if (tr === this.lastTr) return; // only when it moves
    this.lastTr = tr;
    for (const id of ['#rack', '#rackFront', '#bshadows', '#rackShadow']) $(id).style.transform = tr;
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
    // a faint ghost of the orb in its cup while the orb is away (in the cannon, in a hand, fired), so the tray never
    // shows a hole (design review, 23 Nov 2026: "a loaded ball leaves an empty hole in the tray… show a faint ghost
    // in the slot"); the orbs keep their places (and their keys 1–8)
    this.ghosts = this.holes.map((h, i) => {
      const g = document.createElement('i'); g.className = 'bghost'; const r = this.restPos(i);
      Object.assign(g.style, { left: r.x + 'px', top: r.y + 'px' }); g.innerHTML = '<img alt="" draggable="false">';
      sh.appendChild(g); g.on = false; g.art = -1; return g;
    });
  },
  // a retry: the fired orbs come back into their cups (they drop in again, one after another) and any still in the
  // cannon fly home
  restore() {
    const back = [];
    for (const b of this.balls) {
      if (b.where === 'gone') { Object.assign(b, { where: 'rack', socket: -1, flight: null, scale: 0.001, drop: 300 }); b.el.classList.remove('gone'); back.push(b); }
      else if (b.where === 'socket' || b.where === 'loading') { b.where = 'rack'; b.socket = -1; flyBall(b, 0.5, 120); b.onLand = () => Sound.settle(); }
    }
    return Promise.all(back.map((b, i) => tween(Motion.BEAT.BALL_DROP, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 2.5)); b.drop = 300 * (1 - e); }, Ease.outBackSoft, 0.05 + i * 0.08)
      .then(() => { b.land = 1; Sound.pop(0.8 + i * 0.06); })));
  },
  restPos(i) { const h = this.holes[i]; return { x: h.x, y: h.y + RACK.seat, s: 1 }; }, // seated: the bottom dips into the cup
  // the orbs light up one after another, left to right, each with a gold ring round its own rim (front on, a circle:
  // the user, 26 Nov 2026, "in the corner of the circle in front view, not horizontal"), and hop in their cups
  glowWave() {
    this.balls.forEach((b) => {
      if (b.where !== 'rack') return;
      const d = b.holder * 0.08, r = b.ring;
      r.classList.remove('on'); void r.offsetWidth; r.style.animationDelay = d + 's'; r.classList.add('on');
      tween(0.5, (e, k) => (b.hop = Math.sin(k * Math.PI)), Ease.linear, d);
    });
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
  const op = parseOp(opStr), art = OP_ART[op.k], el = document.createElement('div'); // (its colour = its operation: OP_ART)
  el.className = 'ball';
  // gl = guide halo, ao = shade where it sinks into the cup, hr = the hint ring round its rim (Rack.glowWave)
  el.innerHTML = `<i class="gl"></i><img src="${IMG}ball_${art}.webp" alt="" draggable="false"><i class="ao"></i><i class="hr"></i><b>${labelHTML(op)}</b>`;
  el.setAttribute('aria-label', op.label);
  $('#balls').appendChild(el);
  const r = Rack.restPos(i);
  el.style.transform = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px) scale(0.001)`; // in its cup, too small to see or tap, until the next frame places it
  const b = { ring: el.querySelector('.hr'), op, i, art, hex: BALL_HEX[art], ink: BALL_INK[art], el, holder: i, where: 'rack', socket: -1, x: r.x, y: r.y, s: 1, r: 0, flight: null, hop: 0, guide: false, drop: 0, land: 0, hover: 0, hoverT: 0, scale: 1 };
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
  const seated = new Array(8).fill(false), lift = new Array(8).fill(0), full = [], away = new Array(8).fill(-1);
  for (const b of Rack.balls) {
    if (b.where !== 'rack' || b.drag) away[b.holder] = b.art; // (its cup shows a ghost of it)
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
  if (Rack.ghosts) Rack.ghosts.forEach((g, i) => {
    const a = away[i], on = a >= 0;
    if (on && a !== g.art) { g.art = a; g.firstChild.src = `${IMG}ball_${a}.webp`; }
    if (on !== g.on) { g.on = on; g.classList.toggle('on', on); }
  });
}

// =====================================================================
//  EQUATION UI — tokens glide (FLIP) when the equation changes
// =====================================================================
const EqUI = {
  el: null, maxW: 440, maxH: 112, // (the cloud's body, with a margin: the equation always stays inside the cloud)
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
    Sprite.scan(this.el); // (x in its cage cries on: its frames keep the shared beat)
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
  cage() { return DeckCage.cage; }, // (x's cage stands on the deck: DeckCage)
  xTerm() { return this.el.querySelector('[data-key="x"]'); }, // the x on the cloud
  // the line rewritten in place ("3(x + 2) − 6" → "3x + 6 − 6"): what stays glides, what is new pops in
  rewrite(eq) {
    const before = new Set([...this.el.querySelectorAll('[data-key]')].map((e) => e.dataset.key));
    this.render(eqHTML(eq), true);
    this.el.querySelectorAll('[data-key]').forEach((e) => { if (!before.has(e.dataset.key) && !e.closest('.pop')) e.classList.add('pop'); });
  },
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

// ---------- short labels with no voice: a hint over FIRE ("Load 2 orbs first!") and a banner under the cloud ("Watch
// how!": the "Try again!" one was taken out, the user, 25 Nov 2026), in dark glass with a gold edge. They come and go by CSS transitions (transform + opacity); placed in stage units ----------
const Note = {
  tipT: null, banT: null,
  // a hint over a point of the scene (art px), for a moment
  tip(text, wx, wy, hold = 1.8) {
    const el = $('#tip'), p = Stage.w2st(wx, wy);
    el.textContent = text; Object.assign(el.style, { left: p.x.toFixed(1) + 'px', top: p.y.toFixed(1) + 'px' });
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (this.tipT) this.tipT.kill();
    this.tipT = gsap.delayedCall(hold, () => el.classList.remove('on'));
  },
  banner(title, sub = '', hold = 2) {
    const el = $('#banner');
    el.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; el.appendChild(b);
    if (sub) { const s = document.createElement('span'); s.textContent = sub; el.appendChild(s); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (this.banT) this.banT.kill();
    this.banT = gsap.delayedCall(hold, () => el.classList.remove('on'));
  },
  hide() {
    for (const k of ['tipT', 'banT']) if (this[k]) { this[k].kill(); this[k] = null; }
    $('#tip').classList.remove('on'); $('#banner').classList.remove('on');
  },
};

// =====================================================================
//  SPOTLIGHT: first-time tutorial focus. Everything is dimmed, never
//  blurred (user, 23 Nov: the equation must stay readable), except one
//  target (a soft elliptical hole), or two (the −5 and the socket it
//  goes into; FIRE and the loaded socket), each with a gold
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
    this.glow(opts.glow);
    if (opts.drag) this.dress(opts.drag.ball);
    this.demoT0 = Clock.t + 0.5; this.held = false; this.dropped = false; // (the lesson starts once the spotlight has settled)
    this.place(true);
  },
  // the see-through copy wears the ball's own picture and label
  dress(b) {
    if (this.ghostOf === b) return;
    this.ghostOf = b;
    this.ghost.innerHTML = `<img src="${IMG}ball_${b.art}.webp" alt="" draggable="false"><b>${labelHTML(b.op)}</b>`;
  },
  hole(q, sx, sy, pad) { return { rx: (q.w / 2) * sx + pad, ry: (q.h / 2) * sy + pad }; },
  place(animate) {
    const b = this.target && this.target(); if (!b) return;
    const o = this.opts, b2 = o.also ? o.also() : null;
    const h1 = this.hole(b, o.sx ?? 1.3, o.sy ?? 1.3, o.pad ?? 24), h2 = b2 ? this.hole(b2, o.sx2 ?? 1.3, o.sy2 ?? 1.3, o.pad2 ?? 24) : null;
    const D = animate ? Motion.DUR.SLOW : 0, px = (v) => v.toFixed(1) + 'px';
    // the dim: the other layer takes the new holes, then the two cross-fade (no second hole: it is off screen)
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
  // opts.glow: what lights up while the spotlight is on it (.lit: a glow on the thing itself, no ring round it)
  lit: [],
  glow(els) {
    for (const e of this.lit) e.classList.remove('lit');
    this.lit = (els || []).filter(Boolean);
    for (const e of this.lit) e.classList.add('lit');
  },
  hide() {
    this.glow(null);
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
//    and now and then a leaf tumbling down from the trees.
//  • BIRDS: a small flock (1–3) now and then, in the sky either side of the cloud, into or out of the treetops. They flap a few beats
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
// where leaves fall from (under the crowns of the trees that stand out of the forest; the three biggest were taken
// out on 23 Nov, tools/thin_trees.py): x, y; each falls with its own timing. Sunlit yellow-green and a few golden
// ones, so they show against the green trees
const LEAF_FROM = [[150, 400], [230, 405], [560, 430], [650, 425], [1120, 415], [1260, 420], [1345, 430], [1600, 440]];
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
// Birds keep to the open sky either side of the cloud and never cross it (the user, 26 Nov 2026: "the birds should
// not overlap with the cloud"): a flock glides in from one side of the screen and comes down into the trees on that
// side, or rises out of them and flies off that side. They meet the treetops at BIRD_SKY (art px), well clear of the
// cloud (x 601–1055, y 150–343) and of the question board at the top, also with the camera leaning in (their layer
// drifts at most ~40 px against the cloud's). The birds of a flock follow one another along the same line, a moment
// apart, each a little above or below it.
const BIRD_SKY = { left: [370, 490], right: [1180, 1300], edgeY: [185, 255], treeY: [440, 470] };
const Birds = {
  live: 0,
  start() { gsap.delayedCall(2.5, () => this.next()); }, // the first flock soon after the start screen shows
  next() {
    if (!Motion.reduced && this.live < 2) this.flock();
    gsap.delayedCall(9 + Math.random() * 9, () => this.next()); // then one every 9–18 s (game time)
  },
  flock() {
    const box = $('#bgBirds'), r = Math.random(), n = r < 0.4 ? 1 : r < 0.75 ? 2 : 3, rnd = (a, b) => a + Math.random() * (b - a);
    const left = Math.random() < 0.5, up = Math.random() < 0.5; // which side; rising out of the trees (or coming down into them)
    const [a, b] = left ? BIRD_SKY.left : BIRD_SKY.right;
    const edge = { x: left ? -90 : DW + 90, y: rnd(...BIRD_SKY.edgeY) }, tree = { x: rnd(a, b), y: rnd(...BIRD_SKY.treeY) };
    const [p0, p1] = up ? [tree, edge] : [edge, tree], dir = p1.x > p0.x ? 1 : -1, dur = rnd(6.5, 9);
    let alive = n; this.live++;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'bird'; el.innerHTML = BIRD_SVG; box.appendChild(el);
      const beat = 2.2 + Math.random() * 0.6, ph = -Math.random() * beat; // its own wingbeat and phase
      el.querySelectorAll('.bb,.w').forEach((p) => { p.style.animationDuration = beat + 's'; p.style.animationDelay = ph + 's'; });
      const delay = i * rnd(0.35, 0.6), dy = i ? (i % 2 ? 1 : -1) * rnd(10, 22) : 0, s = rnd(0.72, 1.02) * (i ? 0.9 : 1);
      // into the trees: level at first, then dipping (nose down), fading as the leaves take it; out of them: a steep
      // climb that levels off, coming into sight from behind the treetops
      const tilt = dir * (up ? -12 : 13);
      gsap.set(el, { x: p0.x, y: p0.y + dy, scaleX: dir * s, scaleY: s, rotation: up ? tilt : 0, opacity: up ? 0 : 1 });
      gsap.to(el, { x: p1.x, duration: dur, delay, ease: 'none', onComplete: () => { el.remove(); if (--alive === 0) this.live--; } });
      gsap.to(el, { y: p1.y + dy, duration: dur, delay, ease: up ? 'power1.out' : 'power1.in' });
      gsap.to(el, { rotation: up ? 0 : tilt, duration: dur * 0.7, delay: delay + (up ? dur * 0.3 : 0), ease: 'sine.inOut' });
      gsap.to(el, up ? { opacity: 1, duration: dur * 0.2, delay: delay + dur * 0.05 } : { opacity: 0, duration: dur * 0.18, delay: delay + dur * 0.8 });
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
//  and bounces into place; the cannon slides in from the left on its wooden base, brakes, tips onto its front edge
//  and drops back flat with a thud; the cage falls onto the deck, rebounds once, rocks and settles; then Play pops
//  up. (A browser lets a page sound only after its first tap, so on a first visit the entrance may play silent;
//  x's struggle is heard from the first tap anywhere: Sound.listen.)
//  Once in, the cannon and the cage STAY PUT, standing on the deck like heavy things (the user, 20 Nov: "after
//  coming just don't give a movement… only give some animations… naturally placed"): their shadows hold them to
//  the boards, a glint of light runs over their gold now and then (Title.glint), and only x moves: it cries in its
//  cage, the user's art of 23 Nov (x_cry, as in the game: design review, 23 Nov 2026: "the caged X has no
//  personality… give the title X the same eyes and a sad idle animation so players want to rescue it from the
//  first second"). Its struggle loop (peeking, shoving the bars) went with the plain letter x it was made for.
//  Time-based (Clock / GSAP), transform + opacity only. Reduced motion: it is simply there, x sits still, no glints,
//  no sounds.
// =====================================================================
const TL = (() => { // art space (1672×941). Boxes = where the mockup draws each piece (tools/cut_start_screen.py prints them)
  const cannon = { x: 122.3, y: 401.3, w: 525.7, h: 485.2 }, cage = { x: 1092.1, y: 348.9, w: 382.1, h: 505.3 };
  return {
    logo: { x: 338.9, y: 34.5, w: 980.7 },
    cannon,
    foot: { x: 0.5, y: 0.93, w: 0.9 },          // its wooden base on the deck (fractions of its box): centre, width
    muzzle: { x: cannon.x + 0.84 * cannon.w, y: cannon.y + 0.27 * cannon.w, dir: -0.6 }, // its mouth, and where it points
    // centre + width. The design review (23 Nov 2026: "play button is undersized… it sits on the rope line… scale it
    // about 1.5×, lift it off the rope, and add an idle pulse or glow") met the user's own "start button should small"
    // (19 Nov: the mockup's 257 was too big): 1.25× (220), down off the rope onto the deck, with a breathing glow
    play: { x: 836, y: 706, w: 220 },
    cage,
    cageFoot: { pivot: 0.987, y: 0.955 },       // its base: the lowest point (it rocks on it), the middle of its footprint
    cryFoot: 492 / 503,                         // where the crying cage's base is in its frame (x_cry: 503 px tall)
  };
})();
const Title = {
  active: false, exiting: false, t0: 0, hover: false, press: 0, kick: 0, handlers: [], tl: null, landed: 0, cLanded: false,
  // springs for the arrivals only (each settles by itself, then the piece stands still): the cannon's last rock
  // after it drops back flat, the cage's rock as it settles (degrees; it tips onto the edge it leans to) and its
  // squash on touch-down
  cRock: new Spring(4.5, 0.42), rock: new Spring(2.6, 0.38), squash: new Spring(5, 0.4),
  // the entrance: [start, length] in s after the start screen shows. One after another (the user, 20 Nov: "the text
  // come and cannon and the cage come"), so each lands on its own beat and its sound is heard on its own
  IN: { logo: [0.2, 0.85], cannon: [0.7, 0.66], cage: [1.15, 0.68], play: [1.95, 0.6], glint: 3.3 },
  BOUNCE: [1 / 2.75, 2 / 2.75, 2.5 / 2.75], // where Ease.outBounce touches down (the sign: its first fall, then two bounces)
  // the cannon: it slides in (friction: an even slow-down), leans onto its front edge as it brakes (rear lifted, in
  // degrees), stops, and its rear drops back onto the deck (s): the thud
  CANNON: { slide: 0.52, lean: 2.6, drop: 0.14 },
  // the cage: it falls (gravity, s), lands, rebounds once (px, s up = s down), lands again and rocks itself still
  CAGE: { fall: 0.42, hop: 16, up: 0.11 },
  // the glints: one sweep over the cannon's gold, then over the cage's, every period s
  GLINT: { period: 5.5, cannon: [0, 0.95], cage: [0.32, 1.05] },
  Q: [], q: 0,
  // when each arrival is heard, in s after the start: a swish as the sign / the cage falls (its loudest part just
  // before the touch-down), a knock on each of the sign's touch-downs, the cannon's slide and the thud as its rear
  // drops back, the cage's clang and its softer second touch-down, a pop for Play
  cues() {
    const I = this.IN, B = this.BOUNCE, at = (k, f) => I[k][0] + I[k][1] * f, C = this.CANNON, G = this.CAGE;
    const cage1 = I.cage[0] + G.fall, cage2 = cage1 + 2 * G.up;
    return [
      [at('logo', B[0]) - 0.2, () => Sound.swish(0.42, 0.9)],
      ...B.map((f, i) => [at('logo', f), () => Sound.signLand(i)]),
      [I.cannon[0], () => Sound.rollIn()],
      [I.cannon[0] + C.slide + C.drop, () => Sound.cannonLand()],
      [cage1 - 0.2, () => Sound.swish(0.36, 1.1, 0.3)],
      [cage1, () => Sound.cageLand(0)],
      [cage2, () => Sound.cageLand(1)],
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
    // a glint: a soft slanted band of light (.gband) that sweeps across a piece; through it shows a brightened copy
    // of the piece's gold only (tools/cut_glints.py), so the light falls on the metal and nowhere else. Its picture
    // is not waited for: the first sweep is seconds away
    const glint = (parent, src, w, h) => {
      const band = document.createElement('div'); band.className = 'gband'; parent.appendChild(band);
      const bw = Math.round(w * 0.26); Object.assign(band.style, { width: bw + 'px', height: h + 'px' });
      place(img(src, '', band), 0, 0, w, h);
      return { band, im: band.firstChild, w, h, bw, on: false };
    };
    // the ground under the cannon, the cage and the Play button (they stand on the wooden deck). The sun is up on
    // the right, so a soft shadow falls to the left and towards us; a dark line hugs each base where it meets the boards
    const cn = TL.cannon, fx = cn.x + cn.w * TL.foot.x, fw = cn.w * TL.foot.w;
    this.footY = cn.y + cn.h * TL.foot.y;
    this.cSh = groundGroup(box, 'shadow', fx, this.footY, this.play);
    groundBlob(this.cSh, 'pool', -52, 10, fw * 1.36, 124); groundBlob(this.cSh, 'contact', -16, 18, fw * 1.12, 42); groundBlob(this.cSh, 'ao', -4, 26, fw * 0.94, 18);
    const cg = TL.cage;
    this.cageFootY = cg.y + cg.h * TL.cageFoot.y;
    this.gSh = groundGroup(box, 'shadow', cg.x + cg.w / 2, this.cageFootY, this.play);
    groundBlob(this.gSh, 'pool', -48, 14, cg.w * 1.36, 104); groundBlob(this.gSh, 'contact', -18, 15, cg.w * 1.16, 50); groundBlob(this.gSh, 'ao', -4, 15, cg.w * 1.0, 20);
    const p = TL.play;
    this.pSh = groundGroup(box, 'shadow', p.x, p.y + p.w * 0.68, this.play);
    groundBlob(this.pSh, 'soft', 0, 0, p.w * 0.98, 32); groundBlob(this.pSh, 'contact', 0, 0, p.w * 0.66, 14);
    // the cannon, one group: its picture, and the glint over its gold
    const c = (this.cannon = document.createElement('div')); c.className = 'tp tgrp'; box.insertBefore(c, this.play);
    place(c, cn.x, cn.y, cn.w, cn.h); c.style.transformOrigin = `${TL.foot.x * 100}% ${TL.foot.y * 100}%`;
    place(img('t_cannon.webp', '', c), 0, 0, cn.w, cn.h);
    this.cGlint = glint(c, 't_cannon_glint.webp', cn.w, cn.h);
    // the cage, one group: x crying in its cage (its frames, on the game's clock: Sprite), its base where the mockup's
    // cage stood, and the glint over its gold
    const g = (this.cage = document.createElement('div')); g.className = 'tp tgrp tcage'; box.insertBefore(g, this.play);
    place(g, cg.x, cg.y, cg.w, cg.h); g.style.transformOrigin = `50% ${TL.cageFoot.pivot * 100}%`;
    const cry = document.createElement('div'), ch = (cg.w * SPR.cry.h) / SPR.cry.w; cry.className = 'tcry';
    cry.innerHTML = Sprite.html('cry', '', T('altXCaged')); g.appendChild(cry);
    place(cry, 0, cg.h * TL.cageFoot.y - ch * TL.cryFoot, cg.w, ch);
    Sprite.play(cry.firstChild);
    this.gGlint = glint(cry, 't_cage_glint.webp', cg.w, ch);
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
  },
  cageDust(big) {
    const cg = TL.cage, r = cg.w * 0.46, x = cg.x + cg.w / 2;
    FX.uiMode = true; FX.dust(x - r, this.cageFootY, -1, big ? 6 : 3); FX.dust(x + r, this.cageFootY, 1, big ? 6 : 3); FX.uiMode = false;
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
  // a glint's sweep, p = 0..1 across the piece (outside that it is hidden). The band slants like "/" (skewX), runs
  // from fully off its left side to fully off its right, brightest in the middle; its picture moves the other way,
  // so the gold it shows stays exactly on the piece
  glint(g, p) {
    if (!(p > 0 && p < 1)) { if (g.on) { g.band.style.opacity = 0; g.on = false; } return; }
    g.on = true;
    const SK = 22, lean = g.h * Math.tan((SK * Math.PI) / 180), e = Ease.inOutQuad(p);
    const x = -g.bw + (g.w + lean + g.bw) * e;
    g.band.style.transform = `translateX(${x.toFixed(1)}px) skewX(${-SK}deg)`;
    g.im.style.transform = `skewX(${SK}deg) translateX(${(-x).toFixed(1)}px)`;
    g.band.style.opacity = Math.min(1, 1.6 * Math.sin(p * Math.PI)).toFixed(3);
  },
  update(t, dt) {
    if (!this.active) return;
    const R = Motion.reduced, tt = R ? 0 : t;               // reduced motion: everything in place at once, nothing idles
    const T = R ? 99 : t - this.t0, X = this.exiting ? (R ? 99 : t - this.exitT) : -1;
    const pr = (s, d) => clamp((T - s) / d, 0, 1), I = this.IN, prIn = (k) => pr(I[k][0], I[k][1]);
    const ex = (s, d) => (X < 0 ? 0 : clamp((X - s) / d, 0, 1));
    const D2R = Math.PI / 180;
    // the entrance's sounds, each on its moment (none under reduced motion, nothing heard while the page is held
    // silent, and none once Play is tapped: the start screen is leaving)
    while (this.q < this.Q.length && T >= this.Q[this.q][0]) { const c = this.Q[this.q++]; if (!R && !this.exiting && Sound.live()) c[1](); }
    // cannon: slides in from the left on its base (an even slow-down, like a heavy thing on boards), leans onto its
    // front edge as it brakes, its rear drops back flat with a thud (dust), one small rock, and then it stands
    // still. Play fires it: it recoils and slides out
    const C = this.CANNON, cs = T - I.cannon[0], sP = clamp(cs / C.slide, 0, 1), dP = clamp((cs - C.slide) / C.drop, 0, 1);
    if (!this.cLanded && dP >= 1) { this.cLanded = true; if (!R) { this.titleDust(true); this.cRock.kick(-0.7); } } // (its rear meets the deck)
    const lean = R ? 0 : C.lean * (sP < 1 ? Ease.inQuad(clamp((sP - 0.4) / 0.6, 0, 1)) : 1 - dP * dP) + this.cRock.update(dt);
    this.kick = Math.max(0, this.kick - dt * 3.2);
    const ck = Math.sin(this.kick * Math.PI), cOut = Ease.inBack(ex(0.08, 0.5));
    // it tips on an edge of its base (front edge: rear up; rear edge: front up), never into the deck
    const half = (TL.cannon.w * TL.foot.w) / 2 * (lean >= 0 ? 1 : -1), lx = half * (1 - Math.cos(lean * D2R)), lyc = -half * Math.sin(lean * D2R);
    const cdx = -640 * (1 - Ease.outQuad(sP)) - 760 * cOut - 18 * ck + lx, cOp = pr(I.cannon[0], 0.2);
    this.set(this.cannon, cdx, 8 * ck + lyc, lean - 2 * ck, 1, cOp);
    this.set(this.cSh, cdx - lx, 0, 0, 1, cOp);
    // the cage: falls onto the deck (dust, a clang), rebounds once, lands again and rocks itself still; then it
    // stands. x's struggle never moves it
    const G = this.CAGE, gs = T - I.cage[0], gOut = Ease.inBack(ex(0.05, 0.55));
    let up = 0;
    if (gs < G.fall) up = -640 * (1 - Math.pow(Math.max(0, gs) / G.fall, 2));       // falling (gravity)
    else if (gs < G.fall + 2 * G.up) { const u = (gs - G.fall - G.up) / G.up; up = -G.hop * (1 - u * u); } // the one rebound
    if (R) up = 0;
    if (this.landed === 0 && gs >= G.fall) { this.landed = 1; if (!R) { this.cageDust(true); this.squash.kick(0.035); this.rock.kick(1.3); } }
    if (this.landed === 1 && gs >= G.fall + 2 * G.up) { this.landed = 2; if (!R) { this.cageDust(false); this.squash.kick(0.015); } }
    const rock = this.rock.update(dt), sq = this.squash.update(dt);
    const rot = rock + 6 * gOut;
    const tip = -TL.cage.w * 0.5 * Math.abs(Math.sin(rot * D2R)); // it tips on its edge: the low side stays on the deck
    const gdx = 760 * gOut, gy = up - 120 * gOut;
    this.cage.style.transform = `translate(${gdx.toFixed(1)}px,${(gy + tip).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 + 0.6 * sq).toFixed(4)},${(1 - sq).toFixed(4)})`;
    this.cage.style.opacity = clamp(gs / 0.08, 0, 1).toFixed(3);
    const air = clamp(-gy / 160, 0, 1); // its shadow shrinks and fades while it is up in the air
    this.set(this.gSh, gdx, 0, 0, 1 - 0.5 * air, clamp(gs / 0.15, 0, 1) * (1 - 0.7 * air) * (1 - gOut));
    // the glints over the gold, once both are standing (none while Play is leaving)
    const gT = R || this.exiting ? -1 : (T - I.glint) % this.GLINT.period, GL = this.GLINT;
    this.glint(this.cGlint, gT < 0 ? -1 : (gT - GL.cannon[0]) / GL.cannon[1]);
    this.glint(this.gGlint, gT < 0 ? -1 : (gT - GL.cage[0]) / GL.cage[1]);
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
    const psc = pk * (1 + 0.035 * Math.sin(tt * 3.4) + (this.hover ? 0.08 : 0) - this.press * 0.12) * (1 - 0.15 * pX + 0.5 * pBoom);
    this.set(this.play, 0, bob, 0, Math.max(0.001, psc), Math.min(1, pIn * 3) * (1 - pBoom));
    this.set(this.pSh, 0, 0, 0, Math.max(0.001, pk * (1 - bob / 60)), Math.min(1, pIn * 3) * (0.8 - bob / 40) * (1 - pBoom));
    this.pg.style.opacity = Math.min(1, 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(tt * 3.4)) + (this.hover ? 0.2 : 0)).toFixed(3);
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
  taught1: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false, tl: null,
  welcome: null, said: { freed: 0, stuck: 0, next: 0 },
  results: [],          // per equation: 'ok' (x freed at the first try), 'ok2' (on the retry), 'miss' (the game showed how)
  celebrate: false,     // x is being freed: a tap anywhere skips to the next question
  orderShown: false,    // the 1 / 2 chips of the first two-socket round have been shown (once a visit)
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
let loadCount = 0; // (numbers the balls as they go in, so a new orb knows which loaded one went in last)
function seat(b, i, dur = Motion.BEAT.TAP_FLY, arc = 230) {
  G.sockets[i] = b; b.where = 'socket'; b.socket = i; b.loadN = ++loadCount;
  Rack.balls.forEach((x) => (x.guide = false));
  flyBall(b, dur, arc); Sound.pop(1); Sound.whoosh(0.35);
  b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); FX.star(p.x, p.y, '#fff1a8', 110, 0.24, { n: 6 }); Stage.hit({ trauma: 0.08, ky: 3 }); };
}
// a ball goes back to its cup in the tray (whoever calls this has already emptied its socket)
function unseat(b, dur = Motion.BEAT.TAP_FLY - 0.05, arc = 180) {
  b.where = 'rack'; b.socket = -1;
  flyBall(b, dur, arc); Sound.unload();
  b.onLand = () => Sound.settle();
}
// the socket whose ball went in last (−1: nothing loaded)
const lastLoaded = () => G.sockets.reduce((j, s, k) => (s && (j < 0 || s.loadN > G.sockets[j].loadN) ? k : j), -1);
function tapBall(b, tap = false) { // (tap: a press on the screen; false: a key)
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn || !b || b.where === 'gone' || b.where === 'loading' || b.drag) return;
  if (G.spotOnly && G.spotOnly !== b) { Sound.nope(); Spot.nudge(); return; } // guided step: only the highlighted ball
  idleReset();
  if (b.where === 'rack') {
    // every socket already loaded: the new orb takes the place of the one loaded last, which flies back to its cup
    // (the user, 25 Nov 2026: "if I click on other ops, they replace the loaded cannon ops automatically")
    let i = G.sockets.indexOf(null);
    if (i < 0) { i = lastLoaded(); if (i < 0) { Sound.nope(); return; } unseat(G.sockets[i]); }
    seat(b, i);
  } else if (b.where === 'socket') {
    G.sockets.splice(b.socket, 1); G.sockets.push(null);
    G.sockets.forEach((s, k) => { if (s && s.socket !== k) { s.socket = k; flyBall(s, 0.45, 40); } });
    unseat(b);
  }
  onSocketsChanged();
}

// ---- drag a ball into the cannon (or just tap it). A press that moves a few px becomes a drag: the ball lifts out
// of its cup and follows the finger above everything (the tray's lip, the cannon's ring, the tutorial's dim). Near
// the cannon the nearest empty socket glows, draws the ball in and the ball shrinks toward its size; let go there and
// it drops in and fills the hole. With every socket loaded, the nearest loaded one glows instead: let go there and the
// ball takes its place (its orb flies back to the tray). Let go anywhere else and it flies home. A press that doesn't move is a tap.
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
  // the socket it would drop into, once the ball is over the cannon (near any of its sockets): the nearest empty one,
  // or with every socket loaded, the nearest loaded one (the ball would take its place)
  aimAt(b) {
    const d = b.drag, holes = Cannon.holes(), CATCH = Math.max(130, holes[0].r * 3), full = G.sockets.every(Boolean);
    let near = Infinity, best = -1, bd = Infinity;
    holes.forEach((h, i) => {
      const q = Math.hypot(d.px - h.x, d.py - h.y); near = Math.min(near, q);
      if ((full || !G.sockets[i]) && q < bd) { bd = q; best = i; }
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
    const i = this.aim;
    this.release(b);
    if (i >= 0 && G.inputOn && !G.paused && i < G.sockets.length) {
      if (G.sockets[i]) unseat(G.sockets[i]); // (a loaded socket: its orb makes room)
      seat(b, i, 0.3, 14); onSocketsChanged(); return;
    }
    this.home(b);
  },
  // back to its cup (under the tray's lip again at once, so it lands into the tray)
  home(b) {
    $('#balls').appendChild(b.el); b.lifted = false;
    unseat(b, 0.5, 50);
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
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); Cannon.wiggleFire(); Cannon.tip(); return; }
  G.inputOn = false; Drag.cancel(); // (a ball still in hand goes home)
  const r = G.fireResolve; G.fireResolve = null; if (r) r();
}

// ---- one shot: cannon → cloud → two identical tokens land on both sides ----
function makeFlyBall(b, s) {
  const el = document.createElement('div'); el.className = 'ball'; el.style.pointerEvents = 'none';
  el.innerHTML = `<img src="${IMG}ball_${b.art}.webp" alt=""><b>${labelHTML(b.op)}</b>`;
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
function roundTimeline(opts = {}) {
  const tl = gsap.timeline({ paused: true });
  const balls = G.sockets.slice(), eqs = [G.eq];
  let solvedAt = -1;
  for (let i = 0; i < balls.length && solvedAt < 0; i++) {
    const nx = balls[i] ? shownAfter(applyOp(eqs[i], balls[i].op)) : eqs[i]; // (what the cloud reads after the shot)
    eqs.push(nx);
    if (balls[i] && isSolved(nx)) solvedAt = i;
  }
  let at = 0.15, first = true;
  for (let i = 0; i < eqs.length - 1; i++) if (balls[i]) { at = addShot(tl, at, i, balls[i], eqs[i], applyOp(eqs[i], balls[i].op), first, i === solvedAt); first = false; }
  const solved = solvedAt >= 0;
  if (solved) {
    const rest = balls.slice(solvedAt + 1).filter(Boolean); // x is already free: the other loaded balls fizzle
    if (rest.length) tl.call(() => rest.forEach(fizzle), null, at);
    addFreed(tl, at, opts);
  } else addStuck(tl, at, opts.stuckLine);
  return { tl, solved };
}
// one shot: cannon → cloud → two identical terms land on both sides → the equation simplifies. Returns its end time.
// The camera is directed beat by beat (docs/GAME_PROMPT.md §6.5 + §7.2): wind-up on the cannon → recoil kick and
// shake as it fires → it follows the ball up → impact (a soft jolt, no freeze-frame) → it holds on the equation for reading.
// Every step is its own beat from Motion.BEAT, with a pause to read between the steps. The pushes are gentle now, so
// the tray stays on screen (design review, 23 Nov 2026: "the camera pushes in and the tray drops off-screen at the
// bottom. Keep the tray anchored"): the view always reaches down past the orbs.
// eq1 is the equation right after the shot; when the shot added a number to a bracket, two more beats follow: the
// bracket is multiplied out, then the numbers are joined ("3(x + 2) − 6 = 15" → "3x + 6 − 6 = 15" → "3x = 15").
// last: the shot that frees x (no reading pause after it: the freeing starts as the equation settles)
const SHOT_CAM = { WIND: { fx: CX, fy: 455, z: 1.04 }, FOLLOW: { fx: CX, fy: 460, z: 1.03 }, READ: { fx: CX, fy: 455, z: 1.04 } };
function addShot(tl, t0, i, b, eq0, eq1, first = true, last = false) {
  const B = Motion.BEAT, to = { ...CLOUD_HIT };
  let p = null, inL = null, inR = null, ms = null, tg = null, tail = null, tails = null;
  // 1) aim: the loaded socket glows while the camera leans in on the cannon (for a second ball, from the equation it was reading)
  tl.call(() => { Cannon.highlight(i, true); Sound.tick(); b.land = 1; }, null, t0);
  if (first) camDrive(tl, t0 + 0.1, SHOT_CAM.WIND, B.AIM + B.LOAD * 0.5, Ease.inOutQuad);
  else camDrive(tl, t0, SHOT_CAM.WIND, B.AIM + 0.3, Ease.inOutCubic);
  // 2) load: the ball sinks into the barrel and the cannon squats (anticipation), while sparks of the ball's colour
  // are drawn into the barrel's mouth and a glow swells there: the shot gathering its power
  const tlo = t0 + B.AIM;
  tl.call(() => { b.where = 'loading'; flyBall(b, B.LOAD, 24); Sound.charge(); FX.charge(MUZZLE.x, MUZZLE.y + 8, b.hex, B.LOAD); }, null, tlo);
  drive(B.LOAD, (e) => (Cannon.antic = e), Ease.inOutQuad, tl, tlo);
  const tf = tlo + B.LOAD; // 3) FIRE
  tl.call(() => {
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.shoot(); Sound.boom(); Music.punch(); Haptic.buzz(25); Cannon.groundDust(true);
    Stage.hit({ trauma: 0.42, ky: 14, zoom: 0.03 }); // the screen wiggle: a rounded shake + recoil kick + zoom punch
    // the blast: white-hot flash, fireball, shock ring, embers, and thick smoke that lingers and drifts (the ball flies
    // above all of it); a starburst at the mouth, and a shock ring that runs out over the deck from the cannon's base
    FX.blast(MUZZLE.x, MUZZLE.y, -Math.PI / 2, 1);
    FX.star(MUZZLE.x, MUZZLE.y - 14, '#fff3c4', 250, 0.16, { n: 7 });
    FX.gring(CANNON.x, CANNON.bottom - 4, 430, 0.6);
    p = makeFlyBall(b, 0.66); Sound.whistle();
    tail = FX.ribbon(b.hex, 34); // a comet's tail of the ball's colour, white-hot in the middle
  }, null, tf);
  camDrive(tl, tf + 0.05, SHOT_CAM.FOLLOW, B.FLIGHT + 0.1, Ease.inOutQuad); // the camera follows the ball up to the cloud
  // the ball leaves the barrel fast and slows as it climbs (like a real throw), turning once, so its label lands upright
  drive(B.FLIGHT, (e) => {
    if (!p) return;
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r = 360 * e; p.s = 0.66 - 0.14 * e; p.apply();
    if (tail) tail.push(p.x, p.y);
    FX.trail(p.x, p.y + 30, b.hex); if (Math.random() < 0.4) FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.outQuad, tl, tf);
  const th = tf + B.FLIGHT; // 4) the hit: the term splits in two, and one copy flies to EACH side ("x + 5 − 5 = 7 − 5")
  camDrive(tl, th + 0.1, SHOT_CAM.READ, B.SPLIT + B.READ, Ease.inOutQuad); // a slow push-in through the reading beat
  tl.call(() => {
    if (p) p.el.remove(); p = null;
    if (tail) tail.end(); tail = null;
    // the impact: a starburst and a ring of gold (laid on, so they show on the white cloud), sparks of the ball's colour
    FX.star(to.x, to.y, '#ffd84a', 190, 0.32, { n: 8, paint: true }); FX.ring(to.x, to.y, '#ffc21a', 190, { lw: 10, paint: true });
    FX.burst(to.x, to.y, b.hex, 40, 480, { paint: true, white: 0.2 }); FX.burst(to.x, to.y, '#ffffff', 16, 320); FX.ring(to.x, to.y, '#ffffff', 170);
    Sound.pop(1.5);
    Stage.hit({ trauma: 0.16, ky: -6, zoom: 0.015 }); Cloud.squash(); // impact: a soft jolt and the cloud squashes (no freeze-frame: it reads as lag)
    [inL, inR] = EqUI.showImpact(eq0, b.op, b.ink);
    tg = [inL, inR].map((el) => (el ? EqUI.worldAt(el) : { ...to }));
    ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
    ms.forEach((m) => { m.x = to.x; m.y = to.y; m.apply(); });
    tails = [FX.ribbon(b.hex, 20), FX.ribbon(b.hex, 20)];
  }, null, th);
  drive(B.SPLIT, (e) => {
    if (!ms) return;
    ms.forEach((m, j) => { // the copies stay upright (only a slight lean), so "−5" can be read on its way to each side
      m.x = bez(to.x, (to.x + tg[j].x) / 2, tg[j].x, e); m.y = bez(to.y, Math.min(to.y, tg[j].y) - 100, tg[j].y, e);
      m.s = 0.5 - 0.22 * e; m.r = (j ? 10 : -10) * Math.sin(e * Math.PI); m.apply();
      if (tails) tails[j].push(m.x, m.y);
      if (Math.random() < 0.5) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic, tl, th);
  const tl2 = th + B.SPLIT; // the copies land and become terms
  tl.call(() => {
    if (ms) ms.forEach((m) => m.el.remove()); ms = null;
    if (tails) tails.forEach((r) => r.end()); tails = null;
    [inL, inR].forEach((el, j) => {
      if (el) { el.classList.remove('hid'); el.classList.add('pop'); }
      FX.burst(tg[j].x, tg[j].y, b.hex, 18, 260, { paint: true, white: 0.25 }); FX.star(tg[j].x, tg[j].y, b.hex, 95, 0.3, { n: 6, paint: true });
    });
    Sound.ding(0); Sound.ding(2); Stage.hit({ ky: 2 });
  }, null, tl2);
  const tp = tl2 + B.READ; // 5) after a reading beat, the terms that combine light up together…
  tl.call(() => { EqUI.pair(eq1); Sound.tick(); }, null, tp);
  const tv = tp + B.PAIR; // …the ones that cancel fade away, and burst into golden sparkles as they go…
  tl.call(() => { EqUI.vanish(eq1); Sound.sparkle(); }, null, tv);
  tl.call(() => {
    for (const e of EqUI.leaving(EqUI.nextTerms(eq1))) {
      const w = EqUI.worldAt(e);
      FX.burst(w.x, w.y, '#ffc21a', 10, 230, { paint: true, size: 0.55, g: 120, white: 0.3 }); FX.star(w.x, w.y, '#ffd84a', 70, 0.35, { n: 4, paint: true });
    }
  }, null, tv + B.CANCEL * 0.5);
  const ts = tv + B.CANCEL; // …and the simplified equation glides together; a twinkle on each number that changed
  const twinkle = () => EqUI.el.querySelectorAll('.tk.pop').forEach((e) => { const w = EqUI.worldAt(e); FX.star(w.x, w.y, '#ffd84a', 80, 0.45, { n: 4, paint: true }); });
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  tl.call(twinkle, null, ts + B.SETTLE * 0.7);
  let end = ts + B.SETTLE;
  const ex = expandStep(eq1);
  if (ex) { // the bracket: it lights up, is multiplied out ("3x + 6 − 6"), then its numbers are joined ("3x")
    const nf = normalize(eq1), t1 = end + B.READ * 0.6, t2 = t1 + B.PAIR, t3 = t2 + B.EXPAND + B.READ * 0.7, t4 = t3 + B.PAIR, t5 = t4 + B.CANCEL;
    tl.call(() => { EqUI.pair(ex); Sound.tick(); }, null, t1);
    tl.call(() => { EqUI.rewrite(ex); Sound.ding(1); }, null, t2);
    tl.call(twinkle, null, t2 + B.EXPAND * 0.6);
    tl.call(() => { EqUI.pair(nf); Sound.tick(); }, null, t3);
    tl.call(() => { EqUI.vanish(nf); Sound.sparkle(); }, null, t4);
    tl.call(() => { EqUI.settle(nf); G.eq = nf; }, null, t5);
    tl.call(twinkle, null, t5 + B.SETTLE * 0.7);
    end = t5 + B.SETTLE;
  }
  return end + (last ? 0 : B.READ2); // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes. x freed: the payoff happens on the deck (design review, 23 Nov 2026: "keep the caged X visible on
// deck during play as the cannon's target… the payoff (cage cracks open) happens in the world"; "shorten the
// correct-answer sequence to under 8 seconds, and let a tap skip the celebration"; the user then found it too fast,
// 25 Nov: "make it slow so that user can understand", so each beat is longer again, Motion.BEAT). Every stage of
// the user's cinematic break (23 Nov: "extreme… cage crack, and x come out from that… cloudburst"), each its own beat:
// 0) "x = 2" lights up on the cloud, grows and twinkles, and stays a moment to be read (BEAT.SOLVED);
// 1) a bolt of light flies from its x down to x's cage on the deck (the camera leans toward it, the edges darken a
//    little); 2) it strikes: x pushes three times and the cage cracks, light
//    leaking out (CageBreak); 3) it bursts along its cracks: shards, a flash, rings, sparks; 4) x rises out of the
//    light, hovers with sparkles circling it and lands where it stood, with the fanfare and confetti, and dances there
//    a moment (BEAT.CHEER); 5) it hops away to the right and off the screen, as the camera eases back to the whole
//    scene; 6) with x gone, the cloud has done its job: it draws in its breath and bursts in place; then a moment of
//    clear sky (BEAT.BREATH). Then playRound: the next question's cloud forms where this one was (the new equation,
//    with its orbs), and only then does a new cage drop onto the deck. One after another, never two at once (the
//    user, 25 Nov 2026: "the animation should come one by one").
// opts.shown: the game showed the way (no "you did it")
function addFreed(tl, t0, opts = {}) {
  const B = Motion.BEAT, tz = t0 + B.SOLVED, tc = tz + B.BOLT, tb = tc + B.CRACK, tland = tb + B.RISE, tgo = tland + B.CHEER;
  const cagePt = () => { const c = EqUI.cage(); return c ? EqUI.worldAt(c) : { x: DECK.x, y: DECK.foot - DECK.h / 2 }; };
  // 0) "x = 2" lights up (CSS .win: it grows with a gold glow) with a twinkle on each side, and is read
  tl.call(() => {
    G.celebrate = true;
    EqUI.el.querySelectorAll('[data-key="x"],[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.pop(1.25); Sound.chime();
    for (const k of ['x', 'rhs']) { const e = EqUI.el.querySelector(`[data-key="${k}"]`); if (e) { const w = EqUI.worldAt(e); FX.star(w.x, w.y, '#ffd84a', 110, 0.5, { n: 6, paint: true }); } }
  }, null, t0);
  // 1) the cage starts to glow and a bolt of light flies from the x on the cloud down to it
  tl.call(() => {
    const c = EqUI.cage(), xe = EqUI.xTerm();
    CageBreak.prep(c); if (c) c.classList.add('glowx');
    FX.bolt(xe ? EqUI.worldAt(xe) : { ...CLOUD_HIT }, cagePt(), B.BOLT); Sound.whistle();
    Vignette.to(0.4, B.BOLT + B.CRACK * 0.5);
  }, null, tz);
  camDrive(tl, tz - 0.2, { fx: 1040, fy: 440, z: Motion.reduced ? 1 : CAGE.zoom }, 0.2 + B.BOLT + B.CRACK, Ease.inOutCubic); // (the cloud and the tray stay in view; the cloud's top stays under the question board)
  // 2) it strikes the cage, and x pushes three times: it cracks further each time (the user's cracks, played at CAGE.T / CRACK)
  tl.call(() => { const w = cagePt(); FX.star(w.x, w.y, '#efe0ff', 220, 0.3, { n: 8 }); FX.burst(w.x, w.y, '#c58bff', 18, 380, { white: 0.3 }); Sound.rumble(); Stage.hit({ trauma: 0.16, zoom: 0.012 }); }, null, tc);
  drive(B.CRACK, (e, k) => CageBreak.strain(k * CAGE.T), Ease.linear, tl, tc);
  CAGE.push.forEach((sp, i) => tl.call(() => CageBreak.push(i), null, tc + (sp / CAGE.T) * B.CRACK));
  // 3) it bursts along its cracks: the shards fly, a flash, a starburst, rings of gold and light, sparks, glitter
  tl.call(() => {
    const p = cagePt();
    CageBreak.burst(); DeckCage.state = 'free';
    Vignette.to(0, 0.6); flashScreen();
    Sound.shatter(); Sound.spring();
    FX.flash(p.x, p.y, 240, 0.22, '#fffaf0'); FX.star(p.x, p.y, '#fff3c0', 300, 0.3, { n: 9 });
    FX.ring(p.x, p.y, '#ffd84a', 260, { lw: 16, life: 0.55, paint: true }); FX.ring(p.x, p.y, '#ffffff', 430, { lw: 6, life: 0.8, delay: 0.05 });
    FX.burst(p.x, p.y, '#ffc21a', 34, 640, { paint: true, size: 0.8, white: 0.15 }); FX.burst(p.x, p.y, '#b36bff', 22, 520, { paint: true, size: 0.7, white: 0.1 });
    FX.burst(p.x, p.y, '#ffffff', 16, 460); FX.glitter(p.x, p.y, 26);
    Stage.hit({ trauma: 0.38, zoom: 0.035 }); Haptic.buzz([20, 40, 20]);
  }, null, tb);
  // 4) x rises out of the light, hovers (sparkles circle it), comes down and lands: the fanfare, confetti
  drive(B.RISE, (e, k) => CageBreak.rise(k), Ease.linear, tl, tb);
  tl.call(() => Sound.rise(), null, tb + 0.1);
  tl.call(() => CageBreak.orbit(), null, tb + B.RISE * CAGE.rise.up * 0.55);
  tl.call(() => {
    CageBreak.landFx(); Sound.fanfare();
    const w = cagePt(); FX.confetti(w.x - 70, w.y + 50, 70, 950, -0.4); FX.confetti(w.x + 70, w.y + 50, 60, 900, 0.35);
  }, null, tb + B.RISE * CAGE.rise.drop);
  if (!opts.shown) tl.call(() => react('freed'), null, tb + 0.2);
  // 5) after its dance, x hops away to the right and off the screen, while the camera eases back to the whole scene
  const toff = DeckCage.leaveTL(tl, tgo);
  camDrive(tl, tgo - 0.1, { fx: CX, fy: CY, z: 1 }, B.HOP_OFF * 0.75, Ease.inOutCubic);
  // 6) only then, the cloudburst; and a moment of clear sky before the next question (playRound)
  const tp = Cloud.burstTL(tl, toff + 0.2);
  tl.call(() => { G.celebrate = false; }, null, tp + B.BURST);
  tl.to({}, { duration: 0.01 }, tp + B.BURST + B.BREATH);
}
// x still caged ("not yet", never "wrong"): the cage on the deck rattles, sparks flying off its bars at each knock, the
// cloud rocks. The cloud stays: the same question comes back for a retry, or for the game to show the way (playRound)
function addStuck(tl, t0, line = 'voStuck1') {
  const B = Motion.BEAT, tr = t0 + 0.35;
  camDrive(tl, t0, { fx: CX + 70, fy: CY, z: 1.02 }, 0.6, Ease.inOutCubic); // (the cloud and the cage both in view)
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.28, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  for (let i = 0; i < 6; i++) tl.call(() => { // (the rattle's knocks: CSS .rattle, 0.16 s each)
    const c = EqUI.cage(); if (!c) return;
    const r = c.getBoundingClientRect(), w = Stage.s2w(i % 2 ? r.right - r.width * 0.12 : r.left + r.width * 0.12, r.top + r.height * rr(0.35, 0.7));
    FX.burst(w.x, w.y, '#ffc21a', 5, 200, { paint: true, size: 0.45, g: 700, dir: i % 2 ? -0.5 : -Math.PI + 0.5, spread: 0.8, white: 0.2 });
  }, null, tr + 0.08 + i * 0.16);
  tl.call(() => { if (!Motion.skipping) VO.say(line, 0.2); }, null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => { EqUI.el.classList.remove('wob'); const c = EqUI.cage(); if (c) c.classList.remove('rattle'); }, null, tr + B.RATTLE);
  camDrive(tl, tr + B.RATTLE - 0.2, { fx: CX, fy: CY, z: 1 }, 0.5, Ease.inOutCubic);
  tl.to({}, { duration: 0.01 }, tr + B.RATTLE + 0.3);
}
function playShots(opts = {}) {
  const { tl, solved } = roundTimeline(opts);
  G.tl = tl;
  Cannon.live = 3; // the cannon gets its own layer now (at the tap), not mid-shot
  Caption.hide(); // the shot goes: "Now tap FIRE." (or any line still up) lifts away (the user, 26 Nov 2026: "Tap fire wala instruction fire ke baad hta dena")
  return new Promise((res) => {
    tl.eventCallback('onComplete', () => { if (G.tl === tl) G.tl = null; G.celebrate = false; Skip.hide(); res(solved); });
    // Skip: the shot lands at its end, silently; the camera snaps to its final framing, no freeze or shake left
    Skip.show(() => { if (G.tl === tl) { VO.stop(); Motion.skip(tl); TimeFx.reset(); Cannon.settle(); Stage.snap(); } });
    tl.play();
  });
}

// ---- the tutorial: ONE, on the first screen (x + 5 = 7) of the first game on this device, and on no other screen
// (user, 20 Nov). Five steps: the spotlight shows the three parts in turn (1 the equation, 2 the cannon, 3 the
// orbs); 4 the hand taps the glowing −5 and the player taps it (or drags it, or presses its key): it flies into the
// cannon; 5 the hand moves to FIRE and the player taps it (or presses Enter), and the shot goes (user, 20 Nov: "the 5
// one is click fire button"; before, the cannon fired by itself). Every line by key. It cannot be skipped: there is
// no Skip button (the user, 26 Nov 2026: "Skip ki bhi [need ni hai]").
// It plays every time the game is opened (user, 20 Nov: "in this screen, add a tutorial part": it had been saved in
// the browser after one showing, so it never came again). Only Play again, in the same visit, goes straight into play.
const sockSpot = (i = 0) => () => { const h = Cannon.holes()[i]; return Spot.worldBox(h.x, h.y, h.r * 2, h.r * 2); };
// the three parts the tutorial shows, as boxes on screen (stage units)
const eqSpot = () => Spot.boxOf(EqUI.el);
const cannonSpot = () => Spot.boxOf([$('#c1'), $('#c2'), $('#fireBtn')]); // (the hidden body has no box, so only the one showing counts)
const orbsSpot = () => Spot.boxOf(Rack.balls.filter((b) => b.where === 'rack').map((b) => b.el));
// (a circle, front on like the orb, as the tray's hint rings are: the user, 26 Nov 2026; room for its hop above the cup)
const ballSpot = (b) => () => { const r = Rack.restPos(b.holder); return Spot.worldBox(r.x, r.y - 11, BALL_D + 22, BALL_D + 22); };
const fireSpot = () => Spot.boxOf($('#fireBtn'));
async function tutorialLoad() {
  G.taught1 = true;
  // 1) the equation, 2) the cannon, 3) the orbs: one at a time, everything else dimmed (not blurred: the equation
  // must stay readable in every step, user 23 Nov)
  const parts = [
    [eqSpot, { sx: 1.3, sy: 1.45, pad: 30, glow: [EqUI.el] }, 'tutEquation'], // (Poppins Bold is wider than Trig Text: the clear hole takes the 7 and the x)
    [cannonSpot, { sx: 1.12, sy: 1.12, pad: 20, glow: [$('#c1'), $('#c2')] }, 'tutCannon'],
    [orbsSpot, { sx: 1.5, sy: 2, pad: 24 }, 'tutOrbs'], // (the orbs glow one after another: Rack.glowWave)
  ];
  for (const [box, o, line] of parts) {
    Spot.show(box, o);
    if (line === 'tutOrbs') Rack.glowWave();
    await VO.say(line, 0.5);
  }
  return () => {
    // 4) tap the glowing −5: the hand taps it, and only it can be loaded (a key or a drag loads it too)
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(ballSpot(gb), { hand: true, sx: 1.15, sy: 1.15, pad: 18, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26 }); }
    else Rack.glowWave();
    VO.say('tutTapOrb', 0.5);
    // 5) it flies into the cannon; once it has landed in its socket, the spotlight moves to FIRE (the loaded socket
    // stays clear beside it) and the hand taps it. The −5 stays in now: only FIRE answers (it may be tapped at once)
    G.hooks.onFill = (filled, n) => {
      if (filled !== n || G.hooks.fireStep) return;
      G.hooks.fireStep = true; G.spotOnly = 'fire';
      wait(Motion.BEAT.TAP_FLY + 0.15).then(() => {
        if (!G.fireResolve) return; // (FIRE already tapped)
        Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.3, pad: 20, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26, glow: [$('#fireBtn')] });
        VO.say('tutTapFire', 0.5);
      });
    };
  };
}
// ---- a full round ----
async function firstEntry() { // the play scene has just built itself after the start screen
  EqUI.el.style.transition = 'opacity .35s'; EqUI.el.style.opacity = 1;
  await wait(0.2);
  if (G.welcome) { await Promise.race([G.welcome, wait(4)]); G.welcome = null; } // the welcome ends before the first lesson line
}
// the equation glides back to how it started (a retry, or before the game shows the way)
async function rewindEq(start) {
  Sound.whoosh(0.5); Cloud.squash();
  EqUI.setEq(start, true);
  await wait(Motion.BEAT.REWIND);
}
// x is still stuck after the first try: one more try (design review, 23 Nov 2026: "offer one retry"). The equation
// glides back to how it started and the fired orbs drop back into their cups, and that is all: NO orb glows, the
// player works it out again on their own (the user, 26 Nov 2026: "first time incorrect ke baad turant correct answer
// mat do… let the user try again, agar tb bhi glat kre tb denge"); only a second miss shows the answer (showHow). No
// "Try again!" panel under the cloud (the user, 25 Nov 2026: "remove the try again screen panel")
async function retry(sid, start) {
  VO.sayAfter('voRetry', 0.3);
  G.sockets = G.sockets.map(() => null); G.eq = start;
  await Promise.all([rewindEq(start), Rack.restore()]);
}
// …and still stuck after the retry: the game shows the way, step by step ("then show the correct path step by step
// before moving on"). The equation and the orbs go back; the orbs that free x glow and fly into the cannon one by
// one, it fires them, and every step plays as a normal shot, down to x freed (it doesn't count: its dot says so)
async function showHow(sid, start) {
  Note.banner(T('chipWatch'), '', 2);
  VO.sayAfter('voShowHow', 0.3);
  G.sockets = G.sockets.map(() => null); G.eq = start;
  await Promise.all([rewindEq(start), Rack.restore()]);
  const path = solvePath(start).steps;
  for (let k = 0; k < path.length && k < G.sockets.length; k++) {
    if (sid !== G.session) return;
    const b = Rack.balls.find((o) => o.where === 'rack' && o.op.label === path[k]);
    if (!b) break;
    b.guide = true; await wait(0.5); b.guide = false;
    seat(b, k); await wait(Motion.BEAT.TAP_FLY + 0.15);
  }
  if (sid !== G.session) return;
  Cannon.pressT = 1; Sound.press(); await wait(0.25);
  if (sid !== G.session) return;
  await playShots({ shown: true });
}
async function playRound(sid, i) {
  const R = ROUNDS[i], start = { layers: initLayers(R.eq), rhs: F(R.rhs) };
  G.idx = i; G.hooks = {};
  Perf.step(); // a lower quality tier, if frames have been slow, applies here between shots (never mid-shot)
  G.eq = start;
  G.sockets = new Array(R.slots).fill(null);
  const tasks = [Cannon.morph(R.slots)];
  if (G.rackFor !== R) { tasks.push(refreshBalls(R.balls)); G.rackFor = R; }
  EqUI.setEq(G.eq, false);
  const next = !G.firstEntry; // (the first question's cage fell onto the deck as the scene built itself: onPlay)
  if (G.firstEntry) { G.firstEntry = false; tasks.push(firstEntry()); }
  else tasks.push(Cloud.enter()); // the next question: its cloud forms where the last one burst, with the new equation (and its orbs come in)
  // (no level banner between rounds: the user, 25 Nov 2026: "remove the level 2, no need of this type of things")
  await Promise.all(tasks);
  if (sid !== G.session) return;
  // …and only then does x's new cage drop onto the deck; play starts once it has landed (the user, 25 Nov 2026:
  // "cloud is burst, equation will change. And again x cage come")
  if (next && DeckCage.state !== 'caged') { await DeckCage.drop(); if (sid !== G.session) return; }
  if (R.slots === 2 && !G.orderShown) { G.orderShown = true; Cannon.showOrder(); } // (1 and 2 on the sockets, this once)
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad(); // (the only tutorial: the first −5 shot, first game only)
  else VO.sayAfter(introLine(i), 0.4); // a short intro, once the reaction before it has finished (play starts at once)
  if (sid !== G.session) return;
  let result = 'miss';
  for (let attempt = 1; ; attempt++) {
    const fired = new Promise((res) => (G.fireResolve = res));
    G.inputOn = true; idleReset(); onSocketsChanged();
    if (after) { after(); after = null; }
    await fired;
    if (sid !== G.session) return;
    G.spotOnly = null; Spot.hide(); Cannon.hideOrder();
    G.inputOn = false; G.hooks = {}; Cannon.setFireActive(false);
    Rack.balls.forEach((b) => (b.guide = false));
    VO.stop();
    const solved = await playShots({ stuckLine: attempt === 1 ? 'voStuck1' : 'voStuck2' }); // the shots and their outcome: one timeline, skippable
    if (sid !== G.session) return;
    if (solved) { result = attempt === 1 ? 'ok' : 'ok2'; break; }
    if (attempt === 1) { await retry(sid, start); if (sid !== G.session) return; continue; }
    await showHow(sid, start);
    break;
  }
  if (sid !== G.session) return;
  G.results[i] = result;
  if (result !== 'miss') G.freed++;
}
async function runSession() {
  const sid = ++G.session;
  G.freed = 0; G.state = 'play'; G.said = { freed: 0, stuck: 0, next: 0 }; G.results = [];
  for (let i = 0; i < ROUNDS.length; i++) {
    if (sid !== G.session) return;
    await playRound(sid, i);
  }
  if (sid !== G.session) return;
  await showEnd(sid);
}
// ---- fireworks over the end screen: rockets climb from behind the deck with a trail of sparks and burst in the open
// sky either side of the title and of x (never over the title's letters or over x), one after another ----
const Fireworks = {
  calls: [],
  SPOTS: [[300, 205], [1390, 195], [180, 330], [1500, 320], [330, 75], [1350, 70], [1210, 330], [470, 320]],
  COLS: [['#ffd84a', '#ff9f1c', '#ffffff'], ['#b36bff', '#ff8ad8', '#ffffff'], ['#22d3ee', '#7cf4ff', '#ffffff'], ['#36d97a', '#c3ff6b', '#ffffff'], ['#ff4f8b', '#ffd23f', '#ffffff']],
  show(n) {
    if (Motion.still()) return;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.SPOTS[i % this.SPOTS.length];
      this.calls.push(gsap.delayedCall(0.2 + i * 0.45 + rr(0, 0.12), () => this.launch(x + rr(-40, 40), y + rr(-24, 24), this.COLS[i % this.COLS.length])));
    }
  },
  // one rocket (an FX layer): it climbs fast and slows (ease-out) on a slight curve, shedding sparks, then bursts
  launch(x, y, cols) {
    if (Motion.still()) return;
    const x0 = x + rr(-70, 70), y0 = 640, T = rr(0.62, 0.78);
    let t = 0, burst = false;
    Sound.fwLaunch();
    FX.layers.push({
      update(dt) {
        t += dt;
        const e = Ease.outCubic(Math.min(1, t / T)), px = lerp(x0, x, e) + Math.sin(e * Math.PI) * 18, py = lerp(y0, y, e);
        if (t < T) { if (Math.random() < 0.7) FX.trail(px, py, cols[0]); if (Math.random() < 0.3) FX.trail(px, py + 6, '#fff3c4'); }
        else if (!burst) { burst = true; FX.firework(x, y, cols); FX.glitter(x, y, 10, 1.2); Sound.fwBurst(); }
        return t < T;
      },
      kill() { t = T; burst = true; },
      draw() {},
    });
  },
  stop() { for (const c of this.calls) c.kill(); this.calls = []; },
};
// ---- the end screen (the user, 25 Nov 2026: "no need of this amazing panel… Quest complete, I want in a good text,
// in upper side, and in between I want X should be dancing in the between, and the cage behind of the X. And cage is
// in broken"; it replaced the design review's results card, with its stars, score line and missed equations). The
// last cloud has burst, so the sky is clear. One after another: x's broken cage drops into the middle of the deck
// (EndX); "Quest complete!" drops in at the top word by word, lettered like the game's logo, with a twinkle as each
// word lands, then floats gently; x jumps out of its cage and dances; only once x has danced a while does Play again
// pop up under x (the user, 25 Nov 2026: "add a play again in last after x dancing, do this nicely"), Home just after
// it, and then Play again asks for the tap with a soft ripple and a gleam now and then. The end line is still said, on
// the caption board at the left. GSAP, transform + opacity only; under reduced motion it is all simply there ----
const END_DANCE = 2; // dance loops x gets before Play again comes up (SPR.dance: one loop ≈ 1.5 s)
const EndCard = {
  tl: null, float: null, loops: [],
  // btnAt: when the buttons come up, in s from now (EndX.show tells when x starts dancing: they come END_DANCE loops after)
  show(btnAt = 2.4) {
    const t = $('#endTitle'), b = $('#endBtns'), line = T('endTitle');
    this.hide();
    t.setAttribute('aria-label', line);
    t.replaceChildren(...line.split(/\s+/).filter(Boolean).map((word) => { // (its words: each drops in on its own)
      const w = document.createElement('span'), f = document.createElement('span');
      w.className = 'w'; w.setAttribute('aria-hidden', 'true');
      f.className = 'f'; f.dataset.t = word; f.textContent = word;
      w.appendChild(f); return w;
    }));
    const words = [...t.children];
    if (Motion.still()) { gsap.set([t, b], { opacity: 1 }); b.classList.add('on'); Sound.fanfare(); return; }
    const tl = this.tl = gsap.timeline(), D = 0.75, GAP = 0.16, T0 = 0.75; // (after x's broken cage has landed: EndX)
    tl.set(t, { opacity: 1 }, 0)
      .fromTo(words, { opacity: 0, y: -120, scale: 0.55, rotation: (i) => (i % 2 ? 7 : -7) },
        { opacity: 1, y: 0, scale: 1, rotation: 0, duration: D, ease: 'back.out(1.6)', stagger: GAP }, T0)
      .call(() => Sound.fanfare(), null, T0 + 0.4);
    words.forEach((w, i) => tl.call(() => this.twinkle(w), null, T0 + i * GAP + D * 0.62));
    tl.call(() => { this.float = gsap.to(t, { y: -6, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 }); }, null, T0 + words.length * GAP + D);
    // the buttons, one after the other: each pops up out of the deck (from small, overshooting a little) and settles;
    // Play again with the start screen's Play sound and a puff of glitter off its ends, Home softer just after it
    const again = $('#againBtn'), home = $('#homeBtn'), B = Math.max(btnAt, T0 + words.length * GAP + D);
    gsap.set([again, home], { opacity: 0, transition: 'none' }); // (no CSS hover transition while GSAP moves them)
    tl.set(b, { opacity: 1 }, B)
      .call(() => b.classList.add('on'), null, B)
      .fromTo(again, { opacity: 0, y: 70, scale: 0.4 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.9)', clearProps: 'transform,transition' }, B)
      .call(() => Sound.cork(), null, B + 0.04)
      .call(() => this.puff(again), null, B + 0.3)
      .fromTo(home, { opacity: 0, y: 60, scale: 0.5 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.7)', clearProps: 'transform,transition' }, B + 0.38)
      .call(() => Sound.pop(0.85), null, B + 0.42)
      .call(() => this.invite(again), null, B + 1.2); // (after puff's own ripple has run out)
  },
  // Play again has popped up: glitter off both its ends (not over its word), and a first, stronger ripple
  puff(el) {
    const r = el.getBoundingClientRect(), y = r.top + r.height / 2;
    for (const sx of [r.left + r.height * 0.3, r.right - r.height * 0.3]) { const p = Stage.s2w(sx, y); FX.uiMode = false; FX.glitter(p.x, p.y, 9, 0.75); }
    gsap.fromTo(el.querySelector('.rip'), { opacity: 1, scaleX: 1, scaleY: 1 }, { opacity: 0, scaleX: 1.16, scaleY: 1.6, duration: 0.7, ease: 'power2.out' });
  },
  // …then, until it is tapped, it asks for the tap: a soft ripple runs out from it, and a gleam crosses it now and
  // then (its own elements, transform + opacity; they stop with the game's pause, as GSAP does)
  invite(el) {
    const rip = el.querySelector('.rip'), gl = el.querySelector('.gleam i'), w = el.offsetWidth;
    this.loops.push(
      gsap.fromTo(rip, { opacity: 0.85, scaleX: 1, scaleY: 1 }, { opacity: 0, scaleX: 1.1, scaleY: 1.42, duration: 1.2, ease: 'power1.out', repeat: -1, repeatDelay: 0.9 }),
      gsap.fromTo(gl, { x: 0, skewX: -20 }, { x: w * 1.6, skewX: -20, duration: 0.75, ease: 'power2.inOut', repeat: -1, repeatDelay: 2.4, delay: 0.4 })); // (from just off its left end to just off its right)
  },
  // a word has landed: a starburst and some glitter on it (in the sky: light shows on blue)
  twinkle(w) {
    const r = w.getBoundingClientRect(), p = Stage.s2w(r.left + r.width / 2, r.top + r.height * 0.45);
    FX.uiMode = false; FX.star(p.x, p.y, '#fff3b0', Math.min(240, r.width * 0.8), 0.4, { n: 8 }); FX.glitter(p.x, p.y, 12, 0.7);
  },
  // Play again: it all goes at once
  hide() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    if (this.float) { this.float.kill(); this.float = null; }
    for (const l of this.loops) l.kill(); this.loops = [];
    const t = $('#endTitle'), b = $('#endBtns'), parts = [...b.querySelectorAll('.pill, .rip, .gleam i')];
    gsap.killTweensOf([t, b, ...t.children, ...parts]);
    gsap.set([t, b], { opacity: 0, y: 0 }); b.classList.remove('on');
    gsap.set(parts, { clearProps: 'all' }); // (the buttons, their ripple and gleam: back to their CSS)
    t.replaceChildren();
  },
};
async function showEnd(sid) {
  G.state = 'end';
  Caption.place(true); // (the board lifts away: the end line is only said, no board)
  Note.hide(); Cannon.hideOrder(true);
  $('#fireBtn').classList.add('gone');
  Cannon.leave(); // (the cannon has done its work: it shrinks away, x takes the middle of the deck)
  refreshBalls([]); G.rackFor = null;
  tween(0.7, (e) => (Rack.enterY = 340 * e), Ease.inCubic, 0.35); // the empty tray slides away down the deck
  QCard.label(null);
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, Motion.BEAT.CLOUD_IN, Ease.inOutCubic);
  await DeckCage.away(); // (x has already hopped off to the right in the last round's timeline; this only waits if it hasn't…)
  if (sid !== G.session) return;
  const danceAt = EndX.show(G.freed); // (…its broken cage drops into the middle of the deck, and x jumps out of it and dances; none freed: x still in its cage)
  EndCard.show(G.freed ? danceAt + END_DANCE * SPR.dance.d.reduce((a, d) => a + d, 0) : 2.4); // (Play again once x has danced)
  if (G.freed) { FX.confetti(END.x, 175, 100 + G.freed * 30, 1100); Fireworks.show(2 + G.freed); } // (the more x freed, the more fireworks)
  VO.sayAfter(endLine(), 0.8);
}
async function restartGame() {
  G.session++;
  if (G.tl) { G.tl.kill(); G.tl = null; } // the running round's timeline is torn down with everything else in flight
  Motion.killAll(); Skip.hide();
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; G.celebrate = false; Drag.cancel(); Spot.hide();
  EndCard.hide(); Note.hide(); Cannon.hideOrder(true);
  Caption.place(false); // (the board comes back at the top with the next line)
  $('#fireBtn').classList.remove('gone');
  Cannon.back();
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.clear(); CageBreak.kill(); EndX.hide(); Fireworks.stop(); Vignette.to(0, 0);
  DeckCage.hide();
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset(); CloudBurst.reset();
  QCard.label(null); // back to no label during play
  if (Rack.enterY) { const y0 = Rack.enterY; tween(0.6, (e) => (Rack.enterY = y0 * (1 - e)), Ease.outBackSoft); } // (the tray comes back up)
  G.rackFor = null;
  runSession();
}
// Home: back to the start screen (the page starts again; the tutorial isn't shown again in this visit)
function goHome() {
  Sound.click();
  try { sessionStorage.setItem('cq.home', '1'); } catch (e) { /* (no storage: the tutorial shows again) */ }
  location.reload();
}

// ---- pause ----
// No pause button and no panel (the user, 25 Nov 2026: "remove this panel of paused"; 26 Nov 2026: "yh upar do buttons
// ki need ni hai", the Pause and Sound buttons): the game freezes only while its tab is hidden, and goes on by itself
// when it comes back (wireInput)
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p; Scenery.pause(p);
  if (p) { Drag.cancel(); gsap.globalTimeline.pause(); Music.pause(); Sound.suspend(); VO.pause(); } // (a ball in hand goes home)
  else { gsap.globalTimeline.resume(); Music.resume(); Sound.resume(); VO.resume(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient();
  flashScreen();
  // zoom-through: the camera punches toward the Play button while the start screen bursts away…
  Stage.camTo({ fx: TL.play.x, fy: TL.play.y, z: 1.15 }, 0.4, Ease.inCubic);
  await Title.exit();
  // …then the welcome, and the question board drops in at the top with it (once the start screen's sign has gone
  // from there); once said, it lifts away a moment later (Caption.said)
  G.welcome = VO.say('voWelcome', 0.15);
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.a = 0; Cloud.apply(Clock.t); Cannon.morphS = 0.001; Rack.enterY = 330; // (nothing of the scene shows before its turn)
  Rack.balls.forEach((b) => { b.scale = 0.001; b.drop = 420; }); // (the orbs wait above their cups, too small to see)
  QCard.hide();
  $('#world').classList.remove('title');
  // …and the play scene eases out from that close framing while it builds itself ONE PART AT A TIME (the user, 26 Nov
  // 2026: "when I tap the start button, then the things should come one by one"), each part only once the one before
  // has landed, never two at once, and the cloud LAST, its equation after it ("the cloud should come in last… all the
  // things come, cannon and others, then last cloud come and then equation come"): the cannon pops up onto the deck;
  // the orbs' stand (the tray) slides up; the orbs drop into its cups one after another; x's cage falls onto the deck;
  // the cloud forms in the sky, bare; then the equation pops onto it. Under reduced motion each part is simply there
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 1.1, Ease.outCubic);
  const gap = () => wait(Motion.d(0.15));
  await wait(Motion.d(0.3)); // (the board has dropped in)
  await tween(0.75, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack);
  Sound.clunk(); Cannon.groundDust(true); Stage.hit({ trauma: 0.12, ky: 6 });
  await gap();
  Sound.whoosh(0.4);
  await tween(0.8, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBackSoft);
  Sound.settle();
  await gap();
  await Promise.all(Rack.balls.map((b, i) => tween(Motion.BEAT.BALL_DROP, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 2.5)); b.drop = 420 * (1 - e); }, Ease.outBackSoft, i * 0.12)
    .then(() => { b.land = 1; Sound.pop(0.75 + i * 0.06); })));
  await gap();
  await DeckCage.drop();
  await gap();
  await Cloud.enter(false);
  await gap();
  await Cloud.showEq();
  G.firstEntry = true;
  runSession();
}

// =====================================================================
//  INPUT, LOOP, BOOT
// =====================================================================
function wireInput() {
  $('#fireBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapFire(); });
  $('#playBtn').addEventListener('click', onPlay);
  $('#againBtn').addEventListener('click', () => { Sound.click(); restartGame(); });
  $('#homeBtn').addEventListener('click', goHome);
  // a tap anywhere on the scene while x is being freed skips to the next question (design review: "let a tap skip
  // the celebration")
  $('#viewport').addEventListener('pointerdown', (e) => { if (G.celebrate && G.tl && !G.paused && !e.target.closest('button')) Skip.now(); });
  $('#rotateOk').addEventListener('click', () => $('#rotate').classList.add('dismissed'));
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (G.state === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPlay(); return; }
    if (G.paused) return;
    if (/^[1-8]$/.test(e.key)) { const b = Rack.balls.find((x) => x.holder === +e.key - 1); if (b) tapBall(b); }
    else if (e.key === 'Backspace') { const f = G.sockets.filter(Boolean); if (f.length) tapBall(f[f.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') { e.preventDefault(); tapFire(); }
  });
  // a tapped button shouldn't keep focus (no focus box, and Enter/Space stay for FIRE)
  addEventListener('pointerup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  addEventListener('resize', () => Stage.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'play') setPaused(true); } else setPaused(false); });
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
  Cloud.apply(t, dt); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt); Sprite.tick(t);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(rdt); Spot.update(dt, t); FX.update(dt); FX.draw();
}
// ---- pictures: there is no loading screen. The start screen shows as soon as its own pictures are in (the page
// preloads them); the play scene's arrive while the player is on the start screen (Title.exit waits for them,
// in case Play is tapped first) ----
const Pics = {
  TITLE: ['bg_sky', 'sun_glow', 'sun_rays', 'bg_mount', 'bg_trees', 'bg_plantL', 'bg_plantR', 'bg_deck', 't_logo', 't_cannon', 'playbtn', 'x_cry'],
  GAME: ['cloud', 'cloud_rim', 'cannon1', 'cannon2', 'cannon1_front', 'cannon2_front', 'rack', 'rack_front', 'fire', 'fire2', 'cage_empty', 'cage_crack', 'hand', 'question_board',
    ...[...new Set(Object.values(OP_ART))].map((i) => `ball_${i}`)], // (the orbs' four colours: OP_ART)
  LATER: ['x_dance', 'cage_broken'], // (wanted only once x is first freed, and at the end: fetched after the rest)
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
  try { if (sessionStorage.getItem('cq.home')) { sessionStorage.removeItem('cq.home'); G.taught1 = true; } } catch (e) { /* (no storage) */ } // (back from Home: no tutorial again)
  // the sound, now, so the start screen can be heard (its own few effects came with the page: js/sfx_title.js).
  // Where the browser still holds the page silent, it wakes on the first tap or key (Sound.listen)
  Sound.init(); Sound.listen();
  // lay the scene out at once (it stays hidden, over the plain sky, until its pictures are in)
  Scenery.build(); FX.init(); Stage.init(); Perf.init();
  removeEventListener('resize', fitStage); // (index.html's first fit; the game's Stage keeps the screen fitted from here)
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 }); Stage.snap(); Stage.update(0);
  await Pics.load(Pics.TITLE, 8); // usually in already: they have been downloading since the page's <head>
  if (Sound.live()) await Promise.race([Sound.ready(), later(1000)]); // (sound allowed at once: the entrance's sounds are decoded first)
  Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); DeckCage.init(); Title.init(); Spot.init(); Caption.init();
  wireInput();
  gsap.ticker.add(frame);
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Drag, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX, Pics, CageBreak, CloudBurst, Fracture, Vignette, Fireworks, Sprite, EndX, DeckCage, Caption, EndCard, Note };
  // the start screen: the scene fades in while the title plays its intro, and the Play button pops in
  G.state = 'title';
  Title.start();
  Motion.to($('#world'), { opacity: 1, duration: Motion.DUR.SLOW, ease: Motion.EASE.OUT });
  // …and the rest comes while the player looks at it (nothing of it was asked for before, so it never slowed the
  // start screen): the play scene's pictures (the markup's data-src ones, the tray's balls) + the font, then the sound effects
  for (const im of document.querySelectorAll('img[data-src]')) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  const font = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('600 64px Poppins', '0123456789+−×='), document.fonts.load('700 64px Poppins', 'Let\'s free 0123456789+−×÷=().'), document.fonts.load("italic 400 64px 'Swifty Math'", 'x'), document.fonts.load("400 64px 'Trig Text'", '0123456789+−×÷=()')]).catch(() => {}) : null;
  Pics.game = Pics.load(Pics.GAME, 15, font ? [font] : []);
  Pics.game.then(() => { CloudBurst.prepare(); CageBreak.load(); Pics.load(Pics.LATER, 30); }); // (the cloud's burst pieces are cut while the browser is idle; the cage's fracture is worked out; then x's dance and the end card's picture)
  const sfx = document.createElement('script'); sfx.src = 'js/sfx.js'; document.body.appendChild(sfx); // (it hands itself to Sound.loadSfx)
}
boot();
