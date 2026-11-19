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
  DUR: { INSTANT: 0.08, FAST: 0.15, NORMAL: 0.25, SLOW: 0.4, REVEAL: 0.6 },
  EASE: { OUT: 'power3.out', IN: 'power2.in', INOUT: 'power2.inOut', POP: 'back.out(1.4)' },
  STAGGER: 0.08,
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
// generated by build.sh from assets/sfx/*.webm (real recorded sound effects, Opus; see CREDITS.md)
const SFX_DATA = {
  'air': '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',
  'airlong': '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',
  'airmid': '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',
  'bell': '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',
  'bellbig': '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',
  'blast': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAiFEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHdTbuMU6uEElTDZ1OsggFTTbuMU6uEHFO7a1Osgghv7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmtyrXsYMPQkB7qYQxODA4TYCMTGF2ZjYzLjEuMTAxV0GMTGF2ZjYzLjEuMTAxRImIQHWwAAAAAAAWVK5r8a4BAAAAAAAAaNeBAXPFiCRkvoReouR6nIEAIrWcg3VuZIiBAIaGQV9PUFVTVqqDYy6gVruEBMS0AIOBAiPjg4QBMS0A4ZGfgQG1iEDncAAAAAAAYmSBEFXugQBjopNPcHVzSGVhZAEBOAGAuwAAAAAAElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAxc3PWY8CLY8WIJGS+hF6i5HpnyKFFo4dFTkNPREVSRIeUTGF2YzYzLjEuMTAxIGxpYm9wdXNnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjM0NzAwMDAwMAAfQ7Z1RpbngQCj/oEAAIB4glymJOJse99eAAWvTMMnjbpaQPIoK4NGoDYEiB6vUB9AnQACTQBPHZZnossF6pm00zUCIR4R/ab90/1clcP3LaFUaC33UmIfziWN+wPQGhdQVRTntBYF9ExzgmBc5co0SLe5BdGiZVbzzjyB78Aod78nVfDw26cmbaP3gQAVgHiRWHDChTCDGp08fzBZ3jGyfgzKIuguoRvgS22jNpC8AHr7J+YPpbs/cClRKTn+cImnOAHumZpz+lw30sCQfPqdABNsAalVhysJNKacQZg5l/IA04zEbRyzJN8WmfSrPprcC517wlgmpGDyxeNcPE/j9/Kj+4EAKYB4j4wkL1Gku4QixHbbYzKgA1Y9SH0lYSVyuwtVeFyXNnWrpGKB7GVzWBKtnO9kbnNVuBsymt1YU40FNxsKAkarTOK2EizOzGOH+QIalQJBaqPXfjzUGdY3SRsRs0UcHaPpms/sdbPHsxJHrjgcomXhDbNGQa178KPwgQA9gHg5aTbFptKRdhNg+WA32rNLsshHwycFrR3INShK027faWwfU76lb4HFDvhOOnwE2i0GNgK1EZEKp2I4BiDM+IvvBBUNeUVvK/dC6tgm6a78n8OHq5yw3zeTKZnhNqunijNlbX7Ymx71Iy1iXaPxgQBRgHgyym4VgVTnjuQoQ5DMtIZa8y8bNSUCbtiDRWXqT0aF8TUTE+YcWMjbQzQSVG5aFBLZGrHs2vuC2wiUhqDqNMrs5yO/Wp2rZEqIrb2VK2gaOfEEXy/Kmm9d7sQXOV9K6Xq4c93qISXVqpEQ5hWj6oEAZYB4LKmI36Lr/QI0SZzdN3UQFbEoUDOqdR0wHyq+xcj2GkRkzBeCP09uoJsW/fTIg4IEhZDRhdSWH3WyBmnHyfOTLSW+nLzaT+L+ur5Ofd68ZZGKcCoblwda7SEEPrYW66S9Pr/dxd2j6IEAeYB4IOyFdq/6YLxT3UWrT7QnuV98ZLy7BKiKX+mkzCrSB52iBE+rZkCn+T5BVOX1jC/ES9H5bOHdSTNHyt96675fzHRkIaNmpcnyrjV9EHaCeHS+6p0nJP1AkBYquIscgHkqMsaZo+aBAI2AeBfvA4fn8PylZjer7b79eejclE/80aF9fw1O9ckFEv5prgJ/mmG+qwJNIMKb69cXPyPNymArw4KFeV/OkhNQn3CFmKFbPzpwzvPJBvmGVZ0b94FiZPmdWebONLbtQvaTdHSj4IEAoYB4EaUBn1APpuuWh6DJScYJe6bVJIL0LrS3EjiRTcjuDUq7ULqVKToIh4+iZbhGOU2/Vb6TDtzW1/Gex+5RmbTOycWlsjvkDZYkmc1KBPxiMxVF+NycIWG+S5jTm6PWgQC1gHgNCGd9PQUjjGpGnqapkxgWKtjEDHx2oNYMICZP97jBtd/ou28ZBz3XwWgKdZo/iXdKBoIQB6+zRCxRKmJOJA7YCAfiDHlk54E6tj/WtFeInlejzoEAyYB4Czr/hvch4/KtrKXyXeYJuKVsJt8Idu0d0ldsREnAZl7JFzRaTK9/oTBIyGk2kQgIKqdrItU4y/P2/Au6PhRzofVyDXj0kI66hqPMgQDdgHgKZxVh3CMkKCWe7nztOFPnKBrkw9PkCz0SfTutRzb/IgPTzYWBQdSwdy5II5hsQTTCPXaTZDRP1weh75EBNWWCfpWGQZZiFqPGgQDxgHgJoXCKsWTNkGH3KqqPrMQfIbk+KUMvGW7idWm3yW3GshS4oitqAbxQD5BHuP0UYIeEbMhSSS0feW3/x2nUcjHRtaPAgQEFgHgIoaZ7fxK5xYrDtm2sa5HmmXMo6OREdsPEQwEFDaw5Q0dXBu5eURUVClSf5bz47+sGLilHrv1l5nABYaO9gQEZgHgIoWff9tOhR/X+LDz9m+Bwg6H8T9rc77YY1Dh01sDSjPFfRWtCshBLGmdWvNf9xlnojFboxdsXBKPHgQEtgHgHxGdTxDma1v1IhAXNEgZ/DFvJO8y8fXUnnMgJJKiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABlw6GiU4Jk7dbxC1mjwIEBQYB4B8l5yMlXwP7IKzuoaVX0X+ytgky7taL547ZVq7GRnWaF/OhOhEKEQoRChEKEQoRChEFatWrA4HA4HACgzKHAgQFVAHgHyXnIyVfA/sgrPSVK9OtX0ILrGBo9xOjLG23vndNXlz9WA6E+hPoT6E6EQoRChEKEQVq1asDgcDge8JuBBnWihADWQkMcU7trkbuPs4EAt4r3gQHxggHT8IED',
  'cannon': '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',
  'cannonb': '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',
  'click': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAJSEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggI87AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAMgAAAAAAABZUrmvxrgEAAAAAAABo14EBc8WI2VZwfVId/qScgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEgVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYjZVnB9Uh3+pGfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDE4MDAwMDAwAB9DtnXr54EAoOah24EAAAB4hOM3gnfM2TaeJsoz6lr5uPtTFeb0LD/2Txav9z/lxsU1CNmjiDGjjJhqmpBC3b09fROEoMJP93NRcE/AG4pGZFk5dsIVwxSyDwmAn5EVfkp35r713ZibgRJ1ooMcnDgcU7trkbuPs4EAt4r3gQHxggHM8IED',
  'cloth': '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',
  'creak': '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',
  'echo': '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',
  'glass1': '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',
  'glass2': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAUXEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggUB7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAYAAAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIDJeCYvsIrFWcgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEgVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYgMl4Ji+wisVWfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMTI4MDAwMDAwAB9DtnVDL+eBAKP+gQAAgHgChVduCWB+LtADgPAZ2XFZXewtJoi8An+y1heLqjT4/Pf6lgqtwq3RGnko5tOw0knnrQkjuHFZoprpGs0Sh3+8fD6LIndYUSLmELnf3koFIFMrS3jZhMbGuO3OMhIQ3i0BLVLGAhwTC+jvm3Myl4d+DKI4Pl8gwf7fo/eBABWAeIEWYCSOBLf+r139ZKoA2E+FmGU/ETTBcU05cebi7gAHk2mJot6F0h3MfL5z5btbmPQ+fkZ32ovQLK1RxDKLnQWCR/bG1p9+W2eTSo/OxJIxSodalEOekL4l6y8A2HrTdsxDmVjRDPQTjAtN5r5NzvshQ6NAg4EAKYB4sQfadQIHjfakDgc8bKZI6+RjV+xF5j2jouLFICgrhLKIIKKqh4E69MvMnklIVN7NRh2Teq+yPprGe3Ujfp1hltYEN6OqKUUEdYwmpAuN4/x/REGGy1ksY8DzAkLIjt3wBPcrGd9MqrsHAv7TyvYp4lEPIB7IXGzxZtQ2J8DFo+yBAD2AeL8y1fk5UCVcTo80IvS61vFL0cEnsSe/pJbUkIYJobdNTm6RTnVrbgr4cpGBu8uqPpnkIeDcKVd+9Rmcck+9I5LQxNFj3DnrLnEUXsgeLwDbJMzomMA7XO36jq7qnA8igZG8moR5Araj9YEAUYB4gmEABJrlUQ/trFu5SC6OGHhhtt/nX4phTMBqc0pZbJOaInU+MRmO+Q2tMHsfrJ52p3wgZziKfesDqKJKRS+j38aoMWNhVPHgqovIdceu/w8GMLuzICRUqQzYhjM09nXMBRo6w9Rm16iefFq3UlI0xKPtgQBlgHiHEdpBn7ByQ7EpDuVlcbiPqEEnFBXFhAt+Y0g1wSU4lYvs9gubZSIdgLtjhsI/AEht8oqXnBNg+yHagVub7jfmJuUWivpdJadUJya7BpfxYVRUSkt5n2tcRzErtL/OwWVL0OBJn7ju06DXocuBAHkAeIDRto0iVzL6ao9qgAmJ5khpoioqOmedywVRkWH8IXMrIo0dciZKDCh0lYkiWbXb9Brt/HYcmx5Ukz2n28NdX5WKBncy+D6bgQd1ooQAxWkcHFO7a5G7j7OBALeK94EB8YIBzPCBAw==',
  'key': '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',
  'latch': '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',
  'metal2': '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',
  'metal3': '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',
  'plop': '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',
  'pluck': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAkUEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1Osggj+7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAZSAAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIuWl3pEhOHPycgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEgVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYi5aXekSE4c/GfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMTY5MDAwMDAwAB9DtnVHLOeBAKNA7oEAAID4fn9h7SyVX91D1MaIRsJthi96C7NcRmS066mK/CJOA6TVPjuWn3tSjJyO6JxttIz4H2mDGy3BwohBPf69R/QOE6RoAQbalzFbSl1y516hCxRQDdQoj5z8d+6vZ9e1kWMq3rKD69yucdp5R8mHeD7jZmPArRRe1CCJwiBve+ZErGBZvetbRkU447pLyDMebOcfr3wJ+nB+BYI7CmwnzPUZj7YDgfzZqi3B9fxM+9h4tv0p01wR4GTdu1gyHhI4xX/Rl/ocx34pj4/xXPcdhXeqVFtOaTwRf9URKqayAmiJpKh6/TDFlHJlCjOjQPmBABWA+LU8dvzZVF/iOMRUSp5hFd3J06fTd+dhsYjuTisqSvVrDdnxLNxTZfRZylLE5tOkgOFDELacQU3qfUeFY0/KtzKszubW+o7yRioe2zIIvHThR4nmbe3iM4c1LG5ahHTIbNj5h8Kj/4+UWiyW2AWQhnoP5apvICuvHQAAbwBHBwAAZazcIBDMmlURIrRQrstOmVHxB0B8lqrFZrCvGv9gNHPVFlc7y9zOLm2M1ClNiVHuRa2pwlybvjKh162/UVDp+WepXTEwOFOy9DOSsNYptL5jozfl/d/ra8USG68I7rEK5XkRDkeX24t/hb0jIOb10ZLx606jQPCBACmA+LJFBQvnREGdbHX23yNRM4nkFjQQMQQErwlgMaOjm52W1V3yyU5WyJHbQfxtZcXV4i7nSp93pVhpowwonY0gNsKkf8n0YcFdLElJbP+nv9c84Lp87TQNUjMelnxPmYPd2CdXk8oBX9uG2OkQ3AnQ9nyaLf6/4Kg/DR87igFzkEje7aCIe/3XjlFVFIDqNDiUYDL0JWGPxN+Fg+eR76wpFPZK8Y8f5+rSAmygNIAIJffMbrA0VPOEWL5rwb1lSn5+dQKOYsc70CyRg4cOIecLeFLDNXeSpPKwzErgAF2+A5hPE8AcNrjmzmxrRU6jQLeBAD2A+LKPndHFcp6xLpwGGs1N27cAgXt5uPsn/Xgtv7hF0CTAAhdVYW9XRs2Nlz4cS4+AjtXEbwo7hEXPLLMIzDsEH4n96C/qmXnfn3TIHbGgLWSxPObYDgYjNdggo0Y2io+q+3k5cWDYWRcgSthV1VpwD0MqJyLOgHRjHRBVgG/+ftar8bcdHSAHIewP0RMOsOwuMWp2OjsPgEm1PeWR0xzhQa5GuSo8D6Lt+1h1MtNkN2rIu06jQK2BAFGA+LKRXYqBucNrax7GZw+dkrMW8E93jl9sXjNgSfANw/fX0mGVUTBsQYvp9JzOy8k4nv82LlPmONslFJ7mWb8DCh1DSqjDiCNUPalkjHfHNLXOzLdrnBJMV681IjBlXmBR7kIWHNcxp9Fhy5wkK/AGHYgZw3oKZD6ca/rBNArJKN1M9djyRlZTG1rnPnp92eT5TfbfulNExiRUpq+qNTimdNCHn/7RmiJnTqNAqYEAZYD4skkIhy+ogduUJ71JBQw6HWFCe7EyPVq1XhBjmq4F0UFOQjZf7RRx/TdpECCC53XiC9KKyV+GE/0FDmYW+CrBH+18Q0C6oL/rGUuPieVeAyBp8299ZICqPw6v/V0x0Et9ucDxAlMRp4Fs5uLM3ykDbAc5aNW2yxUmF3avqPSeq5AZ1cb+DFMbub9byUC+amUxylHAqfL+NbQRqfDI42eQZwrEXU6jQKGBAHmA+LJKC6I7DPET0G+WKNjpL8UC1ICIl/qqOZ+PgMxN+l4mN+h8Ty570pl2jbNvQNLkG/DSFwv6RIPSjO2Kp6VWgVJ6jBHrQMNorwVMYeNoIhs40nEjz5amDGiSRbJFt1G+0fytBn0SXkoVgV6GRpQDrggfGNdKAQgEHCm0H0sWtqactUeNrN9uyG4FkXNsUrsxAKaPXUsYX4Ql8X1NTqNAjIEAjYD4skiizo8ICsTuywc1qDkL8Bbwzy2X1VsGwLmUn5BZLYcDZuw008xIXexzwOCi+lrJphlV63Ryr2NgtMYV6I/B0DP3A5V5iehl4wpIa3eEc+SmXiSK7eF6GVTRJYy60XXzCBE7A0tTeJuDEnvgH+cujg+xH+0fayzRmLB+IC6IrES6+c/dnjcOoED9oUDwgQChAPi0/f+jI459JwNhgB1TpNjUyJ6peBstja8jlYSdFm4rY8FQhZgDBRsj9PLz6+OUfU4O+AGv5UCRU8nmwRZMQu6gofm5fpdB5PaDDJkMu1QStIWUuJ8wiNvYFbuvplIA/IFheHvz3Xlt2DUwZSZ0D6DNu1jqUQ5qB0wB0WTlaeRI+mpX6+OdleyIIOhYHbPHygtpQs2gXc1PwP/qnB4bOJWVT/qsK5fC0J7/PI69HkFyokQKdUv5ny4dRQxKABtGdQzHqknHi635KRGwiEx4l5uTMIBqJgvABz/7NOfRmwn+P4tEWq5H6I/n8wsNm4EIdaKEALSP9RxTu2uRu4+zgQC3iveBAfGCAczwgQM=',
  'pot': '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',
  'spring': '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',
  'springlow': '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',
  'tick': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAK6EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggKk7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAPAAAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIoqYhr9W3e92cgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEgVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYiipiGv1bd73WfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDI4MDAwMDAwAB9DtnVA0ueBAKPwgQAAgHiFTe5Jhfs7jZVWCI0GYa94gjPcLfWA2A6n1bdacOmID8cvyJXu4fBWRlLqnc4SXAv4EbRVgbFXX/cNGw8gMhhsxhaWJ5cIxLxJcJUDjDPs55WQZXjXkwym6soGwm67oprsOVals8VXGor2rKDboc+BABUAeLL8QB0BQ9z8/6hXgZNS5CEkXapSebw4LKMKxVUU+FITQLG9+NacuSAFn/BlmMLz6bDA8TsEN8v5RQ0t8t0XR3bSnuUzIDG3hFpQm4EHdaKEAMjoSxxTu2uRu4+zgQC3iveBAfGCAczwgQM=',
  'toggle': 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAVxEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggVb7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAYgAAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIY5TbVLzfDsicgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEgVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYhjlNtUvN8OyGfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMTQ0MDAwMDAwAB9DtnVDieeBAKNAg4EAAIB4hHr7YikVhj/1O9CmAsy2Ibs+LJHYYuN0AmOhew7I2fSv6zHc6Ufmv/gabqVBLdAc+0HTvb58nfZH0Zi7uOksn3LDpGdpijTpzcMCJQj9wnxQOOS4fiqJYXpm3lzGzupfPq671V8nlnAJbUQ7jL7n/MtiH6LKd3MOwDuDwe2jo0CLgQAVgHiza4JUE4SYJuK/3BLeWgtcRBeUFcpns9OSbaGSNCug+ma4augk63fnr2Qcb11hkJvD+eA8/735tLoHHWKgYgSoK2NToNkr7OwfXsjozJrro8LaKarA6Y6vRcJ0G6aOiC4CuvebY1frIpjPhmnhxx/n1mCP7vcAYyGHV0m+zr2pHPAtISESBqPxgQApgHiuxtyP/MHFWe1YBN3qfeqgBhgRqjhF6lj65p9fUbxRUN7oVqoDGgAnsrQIC752HYURT8EmEGbOYZQJaq4s2flm2APbi0hEwPVD4QWuQS6rK9jGciwxYYYPiOPov8FCZBW4yJVOQJ8ehATuAGajQH+BAD2AeITFwGCA3n3RegKe5gEBQEtZa7ByRMbMQHVwVQN3L6L4dcNNCkZieSLeaXT0xVmT5ZsumF+CePMXmrS4Sgq1SXjSLu2IvXx1fo8QNXgi6zJjRhIwf+aq/onygVZkZwZDaWXCi9qL0zAfuU0nzi/jIpV/coyk5yAiVXrRo0CGgQBRgHiN5pwv4kdds0EFeOqOb6Z7ynH7ZRbT+UibPc4IaEi0rp3OD3eRjdDOohDVq2fYJqEp096MQceWUjWbGvwiJ1rw3bvR7PwGwddJn1A56r1VB0Ls4S2cAKFit89KhvArK0scitTR4zJnL04sOtSTlF/GhwQAsD9ApILgRf78gfZAPYej5YEAZYB4BE3ALYiALXtw2FvihYh92EQX5M/1N3hm4QuudTmvLq3qZF53Q9DP1Ll0Ku2AReXwNngI8K67u21zbrEGhVFk01r6ocMZGzJnRev06G0nYCGTGisK88LQm3m4FitwPixUo7+BAHmAeAlANpeRDAg4VY70AViDMLAqiIscBHGj4jhZCIX3XpHVEoZUrb1rPNHS7yiWOOQ274hHkfPbH0Zr4zegyqG+gQCNAHgHyXnIyVfBBWct4dUddkzAK4YKhR3xRaVAagH6QAAApYT8HPHBv/EmodPRzksdY1Gv+Us5IDvYXhqbgQN1ooQBBFpkHFO7a5G7j7OBALeK94EB8YIBzPCBAw==',
  'tools': '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',
  'water': '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',
  'whoosh': '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',
  'wooden': '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',
  'woodhit': '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',
  'woodhit2': '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',
};
const VO_FILES = []; // keys with a clip in assets/VO/en/ (Aamir's studio); the other lines use the device's voice
const VO_MOOD = {"voWelcome":"hype","tutFreeX":"hype","tutTapOp":"teach","tutTapFireOne":"teach","tutOrder":"teach","tutLeftRight":"teach","tutNextOp":"teach","tutTapFireMany":"teach","voNext1":"hype","voNext2":"hype","voNext3":"hype","voLast":"hype","voFreed1":"cheer","voFreed2":"cheer","voFreed3":"cheer","voFreed4":"cheer","voStuck1":"soft","voStuck2":"soft","voEndAll":"cheer","voEndMost":"cheer","voEndSome":"warm"}; // each line's mood (tools/vo_lines.json), which colours the device's voice

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

// ---------- background music: teen-style chill electronic track ----------
const TRACKS = { chill: 'assets/music/chillwave.webm' };
// a short buzz on phones that support it (never when muted or with reduced motion)
const Haptic = { buzz(p) { if (Sound.muted || Motion.still() || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (e) { /* ignore */ } } };

const Music = {
  el: null, choice: 'chill', level: 0.36, target: 0, on: false, paused: false, vol: 0, hitT: 0,
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
    const text = T(key), my = ++this.token, cap = $('#cap');
    if (this.cur) { try { this.cur.pause(); } catch (e) { /* ignore */ } this.cur = null; } // never let two lines overlap
    if (this.finish) this.finish();
    cap.querySelector('.txt').textContent = text;
    cap.classList.add('on');
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
    if (my === this.token) { cap.classList.remove('on'); Music.duck(false); }
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
    $('#cap').classList.remove('on');
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

// =====================================================================
//  STAGE — fixed 1672×941 art-space scaled to the screen, a 2D camera
//  (zoom / pan / shake), particles, and the scene sprites.
// =====================================================================
const DW = 1672, DH = 941, CX = DW / 2, CY = DH / 2;
// (measured on the art cut from new.png, see tools/cut_new_art.py; cannon 1's baked-in FIRE plate is painted out, the game's FIRE button sits there)
const CANNON = { x: 836, bottom: 762, h: 342, src: { 1: [474, 388], 2: [577, 389] },
  // centre + inner radius of each gold socket ring (the dark hole's edge): x and r as fractions of the sprite width, y of its height
  holes: { 1: [[0.5002, 0.4735, 0.0965]], 2: [[0.3812, 0.5059, 0.0748], [0.6185, 0.5064, 0.0754]] },
  // base footprint width + the two cyan light strips (centre, width) as fractions of each sprite
  foot: { 1: { w: 0.9494, strips: [[0.1603, 0.1435], [0.8407, 0.1414]] }, 2: { w: 0.9567, strips: [[0.1482, 0.1334], [0.8562, 0.1317]] } },
  // the FIRE plate on the front of the base: width (× h), centre height above the ground (× h), height/width of its art
  fire: { w: 0.597, y: 0.19, ar: 140 / 304 } };
// tray art (a cupless trough): ball spots along its floor (holesX, holeY), bottom edge and feet in source px; a seated ball's centre sits `seat` px below (+) / above (−) its spot
const RACK = { left: 271, top: 798, w: 1130, srcW: 1428, holesX: [145.1, 307.4, 469.6, 631.9, 794.1, 956.4, 1118.6, 1280.9], holeY: 61, bot: 160, edges: [40, 1388], seat: -8 };
const BALL_D = 112, MUZZLE = { x: CANNON.x, y: CANNON.bottom - CANNON.h + 14 };
// the equation cloud (smaller and high in the sky, well clear of the cannon): where a shot hits, and its middle
const CLOUD_HIT = { x: 828, y: 196 }, CLOUD_MID = { x: 828, y: 150 };
// background layers from art/background/background_layers.png: how much each follows the camera (1 = the plaza;
// less = farther away, so it drifts less; more = nearer). Moved by transform only, when the camera moves.
const PARALLAX = [['#bgSky', 0.35], ['#bgMount', 0.55], ['#bgTrees', 0.72], ['#bgLake', 0.86], ['#bgForeL', 1.1], ['#bgForeR', 1.1]];

// =====================================================================
//  CAMERA RIG (docs/GAME_PROMPT.md §7–8). Three parts, added every frame:
//   1. cam  = the director's target, tweened by GSAP inside the round timeline (so Skip + pause just work)
//   2. view = the real camera: follows cam with a critically damped spring, so moves that overlap or are
//      interrupted blend with continuous velocity and never pop
//   3. additive feel: trauma shake (smooth noise, amount = trauma²), a spring recoil kick, a zoom punch
//  Then a final clamp keeps the painted background covering the screen, shake and rotation included.
//  Rotation is about the screen centre. One transform write per frame, only when it changed.
// =====================================================================
const CAM = { SMOOTH: 0.09, SHAKE: 22, ROT: 1.2, FREQ: 24, DECAY: 1.6, ZMIN: 1, ZMAX: 1.25 };
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
    const by = Motion.reduced ? 0 : Math.sin(t * 1.1) * 5, q = this.sq.update(dt);
    const sx = this.s * (1 + 0.05 * q), sy = this.s * (1 - 0.05 * q);
    const tr = `translate(${this.x.toFixed(1)}px,${(this.y + by).toFixed(1)}px) rotate(${this.rot.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`, op = this.a.toFixed(3);
    if (tr !== this.lastTr) { this.el.style.transform = tr; this.lastTr = tr; }
    if (op !== this.lastOp) { this.el.style.opacity = op; this.lastOp = op; }
  },
  // a new equation arrives (concept reveal, 0.8 s, ease-out with a little overshoot)
  async enter(fromX = 1250) {
    Object.assign(this, { x: fromX, y: -40, s: 1, a: 1, blur: 0, rot: 0 });
    Sound.swoosh();
    await tween(0.8, (e) => { this.x = lerp(fromX, 0, e); this.y = lerp(-40, 0, e); }, Ease.outBack);
  },
  // in a round's timeline: floats away (ease-in), dissolves (ease-in), or wobbles
  leaveTL(tl, pos, toX = -1250) {
    let x0 = 0;
    tl.call(() => { x0 = this.x; Sound.swoosh(); }, null, pos);
    drive(0.7, (e) => { this.x = lerp(x0, toX, e); this.y = -60 * e; this.rot = -5 * e; }, Ease.inCubic, tl, pos);
  },
  clearTL(tl, pos) {
    tl.call(() => FX.puffs(CLOUD_MID.x, CLOUD_MID.y, 560, 26), null, pos);
    drive(0.7, (e) => { this.s = 1 + 0.22 * e; this.a = 1 - e; this.y = -30 * e; }, Ease.inQuad, tl, pos);
  },
  wobbleTL(tl, pos) { drive(0.9, (e, k) => { this.rot = Math.sin(k * Math.PI * 6) * 3.2 * (1 - k); this.s = 1 + Math.sin(k * Math.PI * 8) * 0.025 * (1 - k); }, Ease.linear, tl, pos); },
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
    const fw = CANNON.h * CANNON.fire.w, fh = fw * CANNON.fire.ar, fcy = CANNON.bottom - CANNON.h * CANNON.fire.y; // FIRE sits on the base, like the mockup
    Object.assign(this.fire.style, { left: CANNON.x - fw / 2 + 'px', top: fcy - fh / 2 + 'px', width: fw + 'px', height: fh + 'px' });
    this.fireBox = { x: CANNON.x, y: fcy, w: fw, h: fh };
    const gr = $('#ground');
    this.gShadow = groundGroup(gr, 'shadow', CANNON.x, CANNON.bottom); // planted on the plaza
    this.gLight = groundGroup(gr, 'light', CANNON.x, CANNON.bottom);   // cyan strips spilling onto the ground
    this.setN(1);
  },
  holes(n = this.n) {
    const [sw, sh] = CANNON.src[n], sc = CANNON.h / sh, w = sw * sc, left = CANNON.x - w / 2, top = CANNON.bottom - CANNON.h;
    return CANNON.holes[n].map(([fx, fy, fr]) => ({ x: left + fx * w, y: top + fy * CANNON.h, r: fr * w }));
  },
  // a loaded ball fills the whole socket; its edge tucks under the gold ring (the ring is redrawn above the balls)
  socketPos(i, n = this.n) { const h = this.holes(n)[i] || this.holes(n)[0]; return { x: h.x, y: h.y, s: (h.r * 2 * 1.07) / (BALL_D * 0.99) }; },
  setN(n) {
    this.n = n;
    this.c1.style.display = this.c1f.style.display = n === 1 ? '' : 'none'; this.c2.style.display = this.c2f.style.display = n === 2 ? '' : 'none';
    const fx = $('#sockFx'); fx.innerHTML = '';
    this.sock = []; this.tags = [];
    this.holes(n).forEach((h, i) => {
      const g = document.createElement('div'); g.className = 'sglow';
      const d = h.r * 2.55; Object.assign(g.style, { left: h.x - d / 2 + 'px', top: h.y - d / 2 + 'px', width: d + 'px', height: d + 'px' });
      fx.appendChild(g); this.sock.push(g);
      if (n > 1) { const t = document.createElement('div'); t.className = 'stag'; t.textContent = i + 1; Object.assign(t.style, { left: h.x + 'px', top: h.y - h.r - 50 + 'px' }); fx.appendChild(t); this.tags.push(t); }
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
    await tween(0.22, (e) => (this.morphS = 1 - 0.18 * e), Ease.inQuad);
    this.setN(n); FX.smoke(CANNON.x, CANNON.bottom - 140, 14, 260); this.groundDust(false); Sound.clunk(); Stage.hit({ trauma: 0.1, ky: 4 });
    await tween(0.45, (e) => (this.morphS = 0.82 + 0.18 * e), Ease.outBack);
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
    this.shadows = this.holes.map((h) => { const d = document.createElement('div'); d.className = 'bshadow'; Object.assign(d.style, { left: h.x + 'px', top: h.y + 6 + 'px' }); sh.appendChild(d); return d; });
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
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); tapBall(b); });
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
function flyBall(b, dur = 0.55, arc = 230) { b.flight = { fx: b.x, fy: b.y, fs: b.s, t: 0, dur, arc, spin: (Math.random() < 0.5 ? -1 : 1) * rr(260, 420) }; }
function updateBalls(dt, t) {
  const seated = new Array(8).fill(false);
  for (const b of Rack.balls) {
    if (b.where === 'gone') { b.el.classList.add('gone'); continue; }
    const h = ballHome(b);
    b.hover = lerp(b.hover, G.inputOn ? b.hoverT : 0, 1 - Math.exp(-14 * dt));
    if (b.flight) {
      const f = b.flight; f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1), e = Ease.inOutCubic(k);
      const my = Math.min(f.fy, h.y) - f.arc;
      b.x = bez(f.fx, (f.fx + h.x) / 2, h.x, e); b.y = bez(f.fy, my, h.y, e); b.s = lerp(f.fs, h.s, e);
      b.r += f.spin * dt * (1 - k);
      if (k >= 1) { b.flight = null; b.land = 1; const cb = b.onLand; b.onLand = null; if (cb) cb(); }
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
      if (b.where === 'rack') b.y += Rack.enterY;
      b.r *= Math.exp(-10 * dt);
    }
    b.land = Math.max(0, b.land - dt * 3.5);
    const sq = Math.sin(b.land * Math.PI) * 0.14, s = b.s * b.scale * (1 + b.hover * 0.06);
    const tr = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) rotate(${b.r.toFixed(1)}deg) scale(${(s * (1 + sq)).toFixed(4)},${(s * (1 - sq)).toFixed(4)})`;
    const moving = tr !== b.lastTr;
    if (moving) { b.el.style.transform = tr; b.lastTr = tr; }
    b.el.classList.toggle('mv', moving);
    b.el.classList.toggle('guide', b.guide && b.where === 'rack');
    b.el.classList.toggle('hov', b.hover > 0.5);
    b.el.classList.toggle('seated', !b.flight && !!b.isSeated);
  }
  if (Rack.shadows) Rack.shadows.forEach((d, i) => d.classList.toggle('on', seated[i]));
}

// =====================================================================
//  EQUATION UI — tokens glide (FLIP) when the equation changes
// =====================================================================
const EqUI = {
  el: null, maxW: 556,
  init() { this.el = $('#eq'); this.el.style.transformOrigin = '50% 50%'; },
  fit() {
    this.el.style.transform = 'translate(-50%,-50%)';
    const w = this.el.offsetWidth || 1, k = Math.min(1, this.maxW / w);
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
      gsap.fromTo(e, { x: dx, y: dy, scale: sc }, { x: 0, y: 0, scale: 1, duration: 0.56, ease: 'back.out(1.2)', clearProps: 'transform', onComplete: () => (e.style.willChange = '') });
    });
  },
  setEq(eq, flip = true) { this.render(eqHTML(eq), flip); },
  cage() { return this.el.querySelector('[data-key="x"]'); },
  showImpact(eq, op, color) {
    this.render(impactHTML(eq, op, color), true);
    return [this.el.querySelector('[data-key="inL"]'), this.el.querySelector('[data-key="inR"]')];
  },
  // simplifying, step 1: the terms that cancel vanish (CSS .van: transform + opacity, 0.46 s)
  vanish(next) {
    const tpl = document.createElement('div'); tpl.innerHTML = eqHTML(next);
    const keep = new Set([...tpl.querySelectorAll('[data-key]')].map((e) => e.dataset.key));
    this.el.querySelectorAll('[data-key]').forEach((e) => {
      if (keep.has(e.dataset.key) || (e.parentElement && e.parentElement.closest('.van'))) return;
      if ([...e.querySelectorAll('[data-key]')].some((c) => keep.has(c.dataset.key))) return;
      e.classList.add('van');
    });
  },
  // step 2: the simplified equation glides into place, and the numbers that changed pop
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

// =====================================================================
//  SPOTLIGHT: first-time tutorial focus. Everything is blurred + dimmed
//  except one target (a soft elliptical hole), with a gold ring and a
//  little hand that taps the thing to press. Only opacity and transform
//  move: each of the two dim layers gets its hole once, and they
//  cross-fade; the ring is sized once per target and glides there by
//  transform (FLIP), with the hand following it.
// =====================================================================
const Spot = {
  el: null, layers: [], front: 0, ring: null, hand: null, target: null, opts: {}, active: false, ringOn: false, rs: null,
  box: { l: 0, t: 0 }, nudgeT: 0, tapped: false, lastRing: '', lastHand: '',
  init() { this.el = $('#spot'); this.layers = [...this.el.querySelectorAll('.sl')]; this.ring = $('#spotRing'); this.hand = $('#spotHand'); this.layout(); },
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
  // target: () => box (stage units)
  show(target, opts = {}) {
    this.target = target; this.opts = opts; this.active = true;
    document.body.classList.add('spot');
    this.place(true);
  },
  place(animate) {
    const b = this.target && this.target(); if (!b) return;
    const o = this.opts, rx = (b.w / 2) * (o.sx ?? 1.3) + (o.pad ?? 24), ry = (b.h / 2) * (o.sy ?? 1.3) + (o.pad ?? 24);
    const D = animate ? Motion.DUR.SLOW : 0;
    // the dim + blur: the other layer takes the new hole, then the two cross-fade
    const prev = this.layers[this.front];
    this.front ^= 1;
    const next = this.layers[this.front], st = next.style;
    st.setProperty('--x', (b.x - this.box.l).toFixed(1) + 'px'); st.setProperty('--y', (b.y - this.box.t).toFixed(1) + 'px');
    st.setProperty('--rx', rx.toFixed(1) + 'px'); st.setProperty('--ry', ry.toFixed(1) + 'px');
    this.fade(next, 1, true, D); this.fade(prev, 0, false, D);
    // the ring sits where the clear area starts to fade: sized once, then it glides from where it was
    const gx = rx * 0.8, gy = ry * 0.8, old = this.rs;
    Object.assign(this.ring.style, { width: 2 * gx + 'px', height: 2 * gy + 'px' });
    const from = old && this.ringOn ? { x: old.x, y: old.y, sx: (old.gx * old.sx) / gx, sy: (old.gy * old.sy) / gy } : { x: b.x, y: b.y, sx: 1.3, sy: 1.3 };
    if (old) gsap.killTweensOf(old);
    this.rs = { ...from, gx, gy };
    gsap.to(this.rs, { x: b.x, y: b.y, sx: 1, sy: 1, duration: Motion.d(D), ease: Motion.EASE.OUT });
    if (!this.ringOn) { this.ringOn = true; this.fade(this.ring, 1, true, Motion.DUR.NORMAL); }
    this.fade(this.hand, o.hand ? 1 : 0, !!o.hand, Motion.DUR.FAST);
  },
  hide() {
    if (!this.active && !this.ringOn) return;
    this.active = false; this.target = null;
    document.body.classList.remove('spot');
    for (const l of this.layers) this.fade(l, 0, false, Motion.DUR.SLOW);
    this.ringOn = false;
    this.fade(this.ring, 0, false, Motion.DUR.NORMAL);
    this.fade(this.hand, 0, false, Motion.DUR.FAST);
  },
  nudge() { if (!Motion.reduced) this.nudgeT = 1; },
  update(dt, t) {
    const r = this.rs; if (!r) return;
    this.nudgeT = Math.max(0, this.nudgeT - dt * 2.2);
    const pulse = (Motion.reduced ? 1 : 1 + 0.03 * Math.sin(t * 4)) + 0.1 * Math.sin(this.nudgeT * Math.PI);
    const rt = `translate(${(r.x - r.gx).toFixed(1)}px,${(r.y - r.gy).toFixed(1)}px) scale(${(r.sx * pulse).toFixed(4)},${(r.sy * pulse).toFixed(4)})`;
    if (rt !== this.lastRing) { this.ring.style.transform = rt; this.lastRing = rt; }
    if (this.opts.hand && this.active) { // taps the target every 1.4 s, with a ripple on each tap
      const ph = (t % 1.4) / 1.4, press = !Motion.reduced && ph > 0.4 && ph < 0.62 ? Math.sin(((ph - 0.4) / 0.22) * Math.PI) : 0;
      const hx = (r.gx / 0.8) * r.sx, hy = (r.gy / 0.8) * r.sy;
      if (press > 0.9 && !this.tapped) { this.tapped = true; FX.uiMode = true; FX.ring(r.x, r.y, '#fff6c8', Math.min(hx, hy) * 0.9); FX.uiMode = false; }
      if (press === 0) this.tapped = false;
      const ax = Math.min(hx, 110) * 0.3, ay = Math.min(hy, 110) * 0.38;
      const ht = `translate(${(r.x + ax + 26 * (1 - press)).toFixed(1)}px,${(r.y + ay + 30 * (1 - press)).toFixed(1)}px) rotate(-26deg) scale(${(1 - 0.12 * press).toFixed(3)})`;
      if (ht !== this.lastHand) { this.hand.style.transform = ht; this.lastHand = ht; }
    }
  },
};

// =====================================================================
//  START SCREEN — the thumbnail from your art, brought to life:
//  logo drops in, the cannon fires the 8 balls into their arcs, the
//  caged x rattles, sparkles twinkle, and your Play button pops in.
//  Time-based (gsap.ticker), transform + opacity only: every glow is a
//  separate layer whose opacity moves. Reduced motion: it is simply there.
// =====================================================================
const TL = (() => { // clean layout in art-space (1672×941): logo on top, Play in the middle, cannon bottom-left, the one cloud (x caged on it) right
  const cannon = { x: 290, y: 668, w: 410 };
  return {
    logo: { x: 836, y: 170, w: 560 },
    cloud: { x: 1300, y: 372, w: 420 },   // the only cloud in the sky
    cage: { x: 1300, y: 238, w: 150 },    // x, caged, sitting on it
    cannon,
    fire: { x: cannon.x + 0.048 * cannon.w, y: cannon.y + 0.2495 * cannon.w, w: 0.4606 * cannon.w },   // the FIRE plate on the cannon art (its word is in the art)
    muzzle: { x: cannon.x + 0.3209 * cannon.w, y: cannon.y - 0.322 * cannon.w },
    // the cannon art on the ground, as fractions of its width: base centre offset + width, ground line below the centre, cyan strips (centre, width)
    foot: { dx: 0, w: 0.95, y: (479 / 527) * (0.9958 - 0.5), strips: [[0.2312, 0.186], [0.8083, 0.1822]] },
    play: { x: 836, y: 548, w: 168 },
    shot: { ctrl: { x: 850, y: 330 }, w: 84, dur: 0.85, every: 4.4 }, // one ball at a time, cannon → cage, in a low arc under the logo
  };
})();
const Title = {
  active: false, exiting: false, t0: 0, hover: false, press: 0, kick: 0, nextFire: 0, handlers: [],
  shotT: -1, hitT: -99, shotN: 0, sq: 0,
  init() {
    const box = $('#thumb'); this.box = box; this.play = $('#playBtn'); this.pg = this.play.querySelector('.pg'); this.rays = $('#rays'); this.glow = $('#sunGlow');
    const add = (src, w) => {
      const im = document.createElement('img'); im.className = 'tp'; im.src = IMG + src; im.alt = ''; im.draggable = false;
      im.style.width = w + 'px'; box.insertBefore(im, this.play); return im;
    };
    const sized = (el, x, y, w) => { const h = w * ((el.naturalHeight || 1) / (el.naturalWidth || 1)); Object.assign(el.style, { left: x - w / 2 + 'px', top: y - h / 2 + 'px' }); return h; };
    // the one cloud, with x caged on it (behind everything else)
    this.cloud = add('cloud.webp', TL.cloud.w); sized(this.cloud, TL.cloud.x, TL.cloud.y, TL.cloud.w); this.cloud.style.transformOrigin = '50% 70%';
    this.cage = add('t_cage.webp', TL.cage.w); sized(this.cage, TL.cage.x, TL.cage.y, TL.cage.w); this.cage.style.transformOrigin = '50% 92%';
    this.cannon = add('t_cannon.webp', TL.cannon.w); sized(this.cannon, TL.cannon.x, TL.cannon.y, TL.cannon.w);
    // ground under the start-screen cannon: shadow, the golden glow ring from the mockup, cyan strip light
    const cw = TL.cannon.w, fx = TL.cannon.x + TL.foot.dx * cw, fy = (this.footY = TL.cannon.y + cw * TL.foot.y);
    const fw = cw * TL.foot.w;
    this.cSh = groundGroup(box, 'shadow', fx, fy, this.cannon);
    groundBlob(this.cSh, 'cast', fw * 0.34, -20, fw * 1.1, fw * 0.15); groundBlob(this.cSh, 'soft', 8, 2, fw * 1.36, fw * 0.13); groundBlob(this.cSh, 'contact', -2, -2, fw * 1.12, 26);
    for (const sx of [-1, 1]) groundBlob(this.cSh, 'contact', sx * fw * 0.44 - 2, -2, fw * 0.26, 26);
    this.cGold = groundGroup(box, 'ring', fx, fy, this.cannon); groundBlob(this.cGold, 'gold', -4, -2, cw * 1.08, 46);
    this.cGlow = groundGroup(box, 'light', fx, fy, this.cannon);
    TL.foot.strips.forEach(([c, w]) => groundBlob(this.cGlow, 'glow', (c - 0.5 - TL.foot.dx) * cw, 8, w * cw * 1.7, 32));
    this.fire = add('t_fire.webp', TL.fire.w); sized(this.fire, TL.fire.x, TL.fire.y, TL.fire.w); this.fire.classList.add('fireBase');
    this.fireLit = add('t_fire.webp', TL.fire.w); sized(this.fireLit, TL.fire.x, TL.fire.y, TL.fire.w); this.fireLit.classList.add('fireLit'); // its glow
    // the ball the cannon fires at the cage (one at a time; it flies under the logo)
    this.ball = add('ball_0.webp', TL.shot.w); sized(this.ball, 0, 0, TL.shot.w);
    this.logo = add('t_logo.webp', TL.logo.w); this.logoH = sized(this.logo, TL.logo.x, TL.logo.y, TL.logo.w);
    this.logoLit = add('t_logo.webp', TL.logo.w); sized(this.logoLit, TL.logo.x, TL.logo.y, TL.logo.w); this.logoLit.classList.add('lit'); // its flash
    Object.assign(this.play.style, { left: TL.play.x - TL.play.w / 2 + 'px', top: TL.play.y - TL.play.w * 0.508 + 'px', width: TL.play.w + 'px', height: TL.play.w * 1.016 + 'px' });
    for (const el of [this.rays, this.glow]) Object.assign(el.style, { left: TL.play.x + 'px', top: TL.play.y + 'px' });
    this.handlers = [['pointerenter', () => (this.hover = true)], ['pointerleave', () => (this.hover = false)], ['pointerdown', () => (this.press = 1)]];
    for (const [ev, fn] of this.handlers) this.play.addEventListener(ev, fn);
    this.hideAll();
  },
  hideAll() { for (const el of this.box.querySelectorAll('.tp, .gsh, #playBtn')) el.style.opacity = 0; }, // (the ground under the cannon too: nothing shows behind the loading bar)
  start() { this.active = true; this.t0 = Clock.t; this.nextFire = 3.4; this.box.classList.add('live'); },
  teardown() { // the start screen unmounts: no more updates, no will-change, no listeners
    this.active = false;
    this.box.classList.remove('live'); this.box.classList.add('gone');
    for (const [ev, fn] of this.handlers) this.play.removeEventListener(ev, fn);
    this.handlers = [];
  },
  set(el, dx, dy, rot = 0, sc = 1, op = 1, sx = 1) {
    el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(sc * sx).toFixed(4)},${sc.toFixed(4)})`;
    el.style.opacity = op.toFixed(3);
  },
  titleDust(big) {
    FX.uiMode = true;
    const r = TL.cannon.w * 0.46;
    FX.dust(TL.cannon.x - r, this.footY, -1, big ? 7 : 4); FX.dust(TL.cannon.x + r, this.footY, 1, big ? 7 : 4);
    FX.uiMode = false;
  },
  muzzleFx(big) { // the same real-looking blast as in the game, aimed along the barrel (up and to the right)
    FX.uiMode = true;
    FX.blast(TL.muzzle.x, TL.muzzle.y, -0.93, big ? 1 : 0.7);
    FX.uiMode = false;
  },
  update(t, dt) {
    if (!this.active) return;
    const R = Motion.reduced, tt = R ? 0 : t;               // reduced motion: everything in place at once, nothing idles
    const T = R ? 99 : t - this.t0, X = this.exiting ? (R ? 99 : t - this.exitT) : -1;
    const pr = (s, d) => clamp((T - s) / d, 0, 1);
    const ex = (s, d) => (X < 0 ? 0 : clamp((X - s) / d, 0, 1));
    // sun burst + rays behind Play (soft, so the screen stays calm)
    const rIn = Ease.outCubic(pr(0, 0.8)), rOut = 1 - ex(0.15, 0.45);
    this.rays.style.opacity = (rIn * rOut * 0.32).toFixed(3);
    this.rays.style.transform = `translate(-50%,-50%) rotate(${((tt * 5) % 360).toFixed(2)}deg)`;
    this.glow.style.opacity = (rIn * rOut * (0.5 + 0.1 * Math.sin(tt * 1.7))).toFixed(3);
    this.glow.style.transform = `translate(-50%,-50%) scale(${(1 + 0.06 * Math.sin(tt * 1.3)).toFixed(3)})`;
    // cannon: slides in, recoils on every shot, idles with a breath
    this.kick = Math.max(0, this.kick - dt * 3.2);
    const ck = Math.sin(this.kick * Math.PI), cIn = Ease.outBack(pr(0.3, 0.75)), cOut = Ease.inBack(ex(0.08, 0.5));
    const cdx = -560 * (1 - cIn) - 760 * cOut - 16 * ck * 0.6, cdy = 16 * ck * 0.8, breathe = 1 + Math.sin(tt * 2.4) * 0.008;
    this.set(this.cannon, cdx, cdy, -2.5 * ck, breathe, pr(0.3, 0.2));
    const gtr = `translate(${cdx.toFixed(1)}px,${cdy.toFixed(1)}px)`, cOp = pr(0.3, 0.2);
    this.cSh.style.transform = this.cGold.style.transform = this.cGlow.style.transform = gtr;
    this.cSh.style.opacity = cOp.toFixed(3);
    this.cGold.style.opacity = (cOp * Ease.outCubic(pr(1.0, 0.5)) * (0.82 + 0.18 * Math.sin(tt * 2.2))).toFixed(3);
    this.cGlow.style.opacity = Math.min(1, cOp * (0.75 + 0.2 * Math.sin(tt * 2.6)) + 0.3 * ck).toFixed(3);
    if (!this.cLanded && pr(0.3, 0.75) >= 1) { this.cLanded = true; if (!R) this.titleDust(true); }
    // the FIRE plate breathes; its glow is a brighter copy on top whose opacity pulses
    const fs = breathe * (1 + 0.03 * Math.sin(tt * 3.2)), fg = R ? 0 : Math.max(0, Math.sin(tt * 3.2));
    this.set(this.fire, cdx, cdy, -2.5 * ck, fs, pr(0.3, 0.2));
    this.set(this.fireLit, cdx, cdy, -2.5 * ck, fs, pr(0.3, 0.2) * fg);
    // the cloud floats in from the right and bobs; it squashes when a ball hits the cage
    this.sq = Math.max(0, this.sq - dt * 2.2);
    const qIn = Ease.outBack(pr(0.45, 0.9)), qOut = Ease.inBack(ex(0.05, 0.55)), sq = Math.sin(this.sq * Math.PI * 3) * this.sq;
    const qdx = 620 * (1 - qIn) + 700 * qOut, qdy = Math.sin(tt * 1.1) * 7 - 520 * qOut;
    this.set(this.cloud, qdx, qdy, 0, 1 - 0.035 * sq, Math.min(1, pr(0.45, 0.3)), 1 + 0.08 * sq);
    // x in its cage drops onto the cloud, then rattles each time a ball hits it
    const gIn = pr(0.9, 0.7), drop = 1 - Ease.outBounce(gIn), rat = R ? 0 : clamp(1 - (T - this.hitT) / 0.7, 0, 1);
    this.set(this.cage, qdx + Math.sin(T * 40) * 7 * rat, qdy - 420 * drop + 6 * sq, Math.sin(T * 46) * 7 * rat, 1 + 0.06 * rat, Math.min(1, gIn * 4) * (1 - ex(0.4, 0.2)));
    // the shot: one ball at a time, from the muzzle to the cage in a low arc (it never stays on screen)
    if (!R && !this.exiting && T > this.nextFire) {
      this.nextFire = T + TL.shot.every; this.shotT = T; this.kick = 1; this.muzzleFx(this.shotN === 0); this.titleDust(false);
      this.ball.src = IMG + `ball_${this.shotN++ % 8}.webp`;
      if (Sound.ctx) Sound.boom(0.55);
    }
    const k = this.shotT < 0 ? 1 : (T - this.shotT) / TL.shot.dur;
    if (k >= 0 && k < 1) {
      const e = Ease.inOutQuad(k), m = TL.muzzle, c = TL.shot.ctrl, to = { x: TL.cage.x + qdx, y: TL.cage.y + qdy };
      const x = bez(m.x, c.x, to.x, e), y = bez(m.y, c.y, to.y, e);
      this.set(this.ball, x, y, 600 * k, 0.55 + 0.45 * Math.min(1, k * 4), 1);
      if (Math.random() < 0.85) { FX.uiMode = true; FX.trail(x, y, pick(['#ffd34d', '#fff1a8', '#ffffff'])); FX.uiMode = false; }
    } else if (this.shotT >= 0) {
      this.ball.style.opacity = 0; this.shotT = -1;
      if (!this.exiting) { // it hits the cage: a pop of sparkles, the cage rattles, the cloud squashes
        const p = { x: TL.cage.x + qdx, y: TL.cage.y + qdy };
        FX.uiMode = true; FX.burst(p.x, p.y, '#ffd34d', 26, 380, { g: 200 }); FX.burst(p.x, p.y, '#ffffff', 12, 260, { g: 0 }); FX.ring(p.x, p.y, '#fff3c4', 110); FX.uiMode = false;
        this.hitT = T; this.sq = 1;
        if (Sound.ctx) { Sound.pop(1.3); Sound.rattle(0.5); }
      }
    }
    // logo: bounces down from the sky, floats, flashes now and then (a brighter copy fades in and out)
    const lIn = Ease.outBounce(pr(0.12, 0.8)), lOut = Ease.inBack(ex(0.04, 0.55));
    const flash = R ? 0 : Math.max(0, Math.sin(clamp(((T - 3) % 4.5) / 0.5, 0, 1) * Math.PI));
    const ly = -560 * (1 - lIn) - 760 * lOut + Math.sin(tt * 1.6) * 7, lr = Math.sin(tt * 1.1) * 1.3 - 8 * lOut, ls = 1 + Math.sin(tt * 2.2) * 0.012, lo = pr(0.12, 0.15);
    this.set(this.logo, 0, ly, lr, ls, lo);
    this.set(this.logoLit, 0, ly, lr, ls, lo * flash);
    // play button: pops in last, breathes, reacts to hover/press; its glow is a halo whose opacity pulses
    this.press = Math.max(0, this.press - dt * 4);
    const pIn = pr(0.2, 0.8), pk = Ease.outElastic(pIn); // (right as the loading bar collapses into this spot)
    const pX = ex(0, 0.12), pBoom = ex(0.12, 0.25);
    const psc = pk * (1 + 0.03 * Math.sin(tt * 3.4) + (this.hover ? 0.07 : 0) - this.press * 0.12) * (1 - 0.15 * pX + 0.5 * pBoom);
    this.set(this.play, 0, 0, -120 * (1 - Math.min(1, pIn * 1.4)), Math.max(0.001, psc), Math.min(1, pIn * 3) * (1 - pBoom));
    this.pg.style.opacity = Math.min(1, 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(tt * 3.4)) + (this.hover ? 0.15 : 0)).toFixed(3);
    if (pIn > 0.25) this.play.classList.add('live');
    if (this.exiting && X > 0.9) this.teardown();
  },
  exit() {
    this.exiting = true; this.exitT = Clock.t; this.play.classList.remove('live');
    this.kick = 1; this.muzzleFx(true);
    FX.uiMode = true;
    FX.burst(TL.play.x, TL.play.y, '#ffd34d', 50, 600, { g: 0 }); FX.burst(TL.play.x, TL.play.y, '#ffffff', 24, 440, { g: 0 }); FX.ring(TL.play.x, TL.play.y, '#fff3c4', 200);
    FX.uiMode = false;
    Sound.boom(); Sound.whoosh(0.7); Stage.hit({ trauma: 0.35, ky: 10, zoom: 0.03 }); Haptic.buzz(25);
    return wait(0.62);
  },
};

// =====================================================================
//  GAME FLOW
// =====================================================================
const G = {
  state: 'boot', session: 0, idx: 0, freed: 0, eq: null, sockets: [], inputOn: false, fireResolve: null, hooks: {},
  taught1: false, taughtSeq: false, tutSkip: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false, tl: null,
  welcome: null, said: { freed: 0, stuck: 0, next: 0 },
};
// ---- the voice's lines through a session, in order: welcome → tutorial → a short intro on every other
// round → a reaction as the cage opens (or rattles) → the end line. Variants take turns, so a line never
// repeats back to back. The emotion is in the words (and, for the device's voice, VO_MOOD).
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
  if (old.length) {
    Sound.whoosh(0.3);
    await tween(0.3, (e) => old.forEach((b) => (b.scale = Math.max(0.001, 1 - e))), Ease.inBack);
    old.forEach((b) => FX.burst(b.x, b.y, b.hex, 8, 260));
  }
  Rack.balls.forEach(removeBall);
  Rack.balls = list.map((s, i) => createBall(s, i));
  Rack.balls.forEach((b) => { b.scale = 0.001; b.drop = 420; });
  await Promise.all(Rack.balls.map((b, i) => tween(0.7, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 3)); b.drop = 420 * (1 - e); }, Ease.outElastic, 0.08 + i * 0.065)
    .then(() => { b.land = 1; Sound.pop(0.75 + i * 0.06); })));
}

function onSocketsChanged() {
  const filled = G.sockets.filter(Boolean).length, n = G.sockets.length;
  Cannon.setFireActive(G.inputOn && n > 0 && filled === n);
  if (G.hooks.onFill) G.hooks.onFill(filled, n);
}
function tapBall(b) {
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn || !b || b.where === 'gone' || b.where === 'loading') return;
  if (G.spotOnly && G.spotOnly !== b) { Sound.nope(); Spot.nudge(); return; } // guided step: only the highlighted ball
  idleReset();
  if (b.where === 'rack') {
    const i = G.sockets.indexOf(null);
    if (i < 0) { Sound.nope(); Cannon.pulseSockets(); tween(0.4, (e, k) => (b.hop = Math.sin(k * Math.PI) * 0.5), Ease.linear); return; }
    G.sockets[i] = b; b.where = 'socket'; b.socket = i;
    Rack.balls.forEach((x) => (x.guide = false));
    flyBall(b, 0.55, 230); Sound.pop(1); Sound.whoosh(0.35);
    b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); Stage.hit({ trauma: 0.08, ky: 3 }); };
  } else if (b.where === 'socket') {
    G.sockets.splice(b.socket, 1); G.sockets.push(null);
    G.sockets.forEach((s, k) => { if (s && s.socket !== k) { s.socket = k; flyBall(s, 0.3, 40); } });
    b.where = 'rack'; b.socket = -1;
    flyBall(b, 0.5, 180); Sound.unload();
    b.onLand = () => Sound.settle();
  }
  onSocketsChanged();
}
function tapFire() {
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn) return;
  if (G.spotOnly && G.spotOnly !== 'fire') { Sound.nope(); Spot.nudge(); return; }
  idleReset(); Cannon.pressT = 1; Sound.press();
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); Cannon.wiggleFire(); return; }
  G.inputOn = false;
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
  tween(0.35, (e) => (b.scale = Math.max(0.001, 1 - e)), Ease.inBack).then(() => (b.where = 'gone'));
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
// shake as it fires → it follows the ball up → impact (hit-stop, punch) → it holds on the equation for reading.
const SHOT_CAM = { WIND: { fx: CX, fy: 540, z: 1.06 }, FOLLOW: { fx: CX, fy: 260, z: 1.1 }, READ: { fx: CX, fy: 260, z: 1.12 } };
function addShot(tl, t0, i, b, eq0, eq1, first = true) {
  const to = { ...CLOUD_HIT };
  let p = null, inL = null, inR = null, ms = null, tg = null;
  tl.call(() => { Cannon.highlight(i, true); Sound.tick(); b.land = 1; }, null, t0);
  // wind-up: the camera leans in on the cannon (for a second ball, from the equation framing it was reading)
  if (first) camDrive(tl, t0 + 0.45, SHOT_CAM.WIND, 0.3, Ease.outQuad);
  else camDrive(tl, t0, SHOT_CAM.WIND, 0.72, Ease.inOutCubic);
  tl.call(() => { b.where = 'loading'; flyBall(b, 0.28, 24); Sound.charge(); }, null, t0 + 0.45);
  drive(0.28, (e) => (Cannon.antic = e), Ease.inQuad, tl, t0 + 0.45); // anticipation: the cannon squats
  const tf = t0 + 0.75; // FIRE
  tl.call(() => {
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.shoot(); Sound.boom(); Music.punch(); Haptic.buzz(25); Cannon.groundDust(true);
    Stage.hit({ trauma: 0.55, ky: 16, zoom: 0.035 }); // the screen wiggle: shake + recoil kick + zoom punch
    // the blast: white-hot flash, fireball, shock ring, embers, and thick smoke that lingers and drifts
    // (the ball flies above all of it)
    FX.blast(MUZZLE.x, MUZZLE.y, -Math.PI / 2, 1);
    p = makeFlyBall(b, 0.66); Sound.whistle();
  }, null, tf);
  camDrive(tl, tf + 0.05, SHOT_CAM.FOLLOW, 0.5, Ease.inOutQuad); // the camera follows the ball up to the cloud
  drive(0.5, (e, k) => {
    if (!p) return;
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r = 540 * k; p.s = 0.66 - 0.14 * e; p.apply();
    FX.trail(p.x, p.y + 30, b.hex); FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.inOutQuad, tl, tf);
  const th = tf + 0.5; // hits the cloud: "x + 5 − 5 = 7 − 5" appears, the two terms fly to their places
  camDrive(tl, th + 0.1, SHOT_CAM.READ, 1.6, Ease.inOutQuad); // a slow push-in through the reading beat
  tl.call(() => {
    if (p) p.el.remove(); p = null;
    FX.burst(to.x, to.y, b.hex, 60, 620); FX.burst(to.x, to.y, '#ffffff', 22, 400); FX.ring(to.x, to.y, '#ffffff', 170);
    Sound.pop(1.5);
    TimeFx.hitStop(0.06); Stage.hit({ trauma: 0.3, ky: -8, zoom: 0.02 }); Cloud.squash(); // impact: a 60 ms freeze, a jolt, the cloud squashes
    [inL, inR] = EqUI.showImpact(eq0, b.op, b.ink);
    tg = [inL, inR].map((el) => (el ? EqUI.worldAt(el) : { ...to }));
    ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
    ms.forEach((m) => { m.x = to.x; m.y = to.y; m.apply(); });
  }, null, th);
  drive(0.55, (e, k) => {
    if (!ms) return;
    ms.forEach((m, j) => {
      m.x = bez(to.x, (to.x + tg[j].x) / 2, tg[j].x, e); m.y = bez(to.y, Math.min(to.y, tg[j].y) - 120, tg[j].y, e);
      m.s = 0.5 - 0.22 * e; m.r = 460 * k; m.apply();
      if (Math.random() < 0.6) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic, tl, th);
  const tl2 = th + 0.55;
  tl.call(() => {
    if (ms) ms.forEach((m) => m.el.remove()); ms = null;
    [inL, inR].forEach((el, j) => { if (el) { el.classList.remove('hid'); el.classList.add('pop'); } FX.burst(tg[j].x, tg[j].y, b.hex, 22, 320); });
    Sound.ding(0); Sound.ding(2); Stage.hit({ ky: 2.5 });
  }, null, tl2);
  const tv = tl2 + 1.15; // after a reading beat, the terms that cancel vanish…
  tl.call(() => { EqUI.vanish(eq1); Sound.sparkle(); }, null, tv);
  const ts = tv + 0.46; // …and the simplified equation settles
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  return ts + 1.25; // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes: no "wrong" label, no hints, no retry; both outcomes advance ----
function addFreed(tl, t0) {
  let cage = null, img = null, p = null, q = null, s0 = 1, fl = null;
  // 1) the cage glows… and unlocks
  tl.call(() => { cage = EqUI.cage(); img = cage && cage.querySelector('img'); if (cage) cage.classList.add('glowx'); Sound.ding(1); }, null, t0);
  // the camera pushes in on the cage (framing x and its value together)
  camDrive(tl, t0, () => { const c = EqUI.cage(), w = c ? EqUI.worldAt(c) : { x: 700, y: 200 }; return { fx: (w.x + CLOUD_MID.x) / 2, fy: w.y + 60, z: 1.18 }; }, 0.6, Ease.outCubic);
  tl.call(() => Sound.unlock(), null, t0 + 0.85);
  // 2) the cage bursts open; the free x stays on the cloud so it reads "x = 2"
  const tb = t0 + 1.25;
  tl.call(() => {
    p = img ? EqUI.worldAt(img) : { x: 700, y: 170 };
    if (img) { img.src = IMG + 'xchar.webp'; cage.classList.remove('glowx'); cage.classList.add('free'); }
    EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.creak(); Sound.spring(); Sound.fanfare(); flashScreen();
    FX.burst(p.x, p.y, '#ffd34d', 46, 560); FX.burst(p.x, p.y, '#c58bff', 40, 480); FX.ring(p.x, p.y, '#ffffff', 200);
    FX.confetti(p.x, p.y, 140, 1000);
    // the big moment: an 80 ms freeze, then slow-mo easing back to full speed, a shake and a zoom punch
    TimeFx.hitStop(0.08); TimeFx.slowMo(0.45, 0.35); Stage.hit({ trauma: 0.35, zoom: 0.03 }); Haptic.buzz([15, 30, 15]);
  }, null, tb);
  tl.call(() => react('freed'), null, tb + 0.3); // just after the burst's first hit, over the "x = 2" reading beat
  camDrive(tl, tb + 0.3, { z: 1.15 }, 1.2, Ease.inOutQuad); // eases back a touch while "x = 2" is read
  // 3) after a reading beat (the value of x), x does a happy hop… and vanishes in a poof of sparkles
  const th = tb + 1.9;
  tl.call(() => {
    q = img ? EqUI.worldAt(img) : p;
    s0 = img ? img.getBoundingClientRect().height / (Stage.S * Stage.z) / 107 : 1;
    fl = document.createElement('div'); fl.className = 'xfly'; fl.innerHTML = `<img src="${IMG}xchar.webp" alt="">`;
    fl.style.willChange = 'transform,opacity';
    $('#fly').appendChild(fl);
    if (img) img.style.visibility = 'hidden';
    EqUI.el.classList.add('fadeout');
    Sound.spring();
  }, null, th);
  const put = (x, y, r, s, o) => { if (!fl) return; fl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`; fl.style.opacity = o.toFixed(3); };
  drive(0.45, (e) => put(q.x, q.y - 70 * e, 8 * Math.sin(e * Math.PI), s0 * (1 + 0.18 * e), 1), Ease.outCubic, tl, th);
  tl.call(() => Sound.sparkle(), null, th + 0.45);
  drive(0.32, (e) => {
    put(q.x, q.y - 70 - 12 * e, 8 + 260 * e, s0 * 1.18 * (1 - e), 1 - e * 0.6);
    if (fl && Math.random() < 0.9) FX.trail(q.x + rr(-30, 30), q.y - 70 + rr(-30, 30), pick(['#d4b0ff', '#fff1a8', '#ffffff']));
  }, Ease.inBack, tl, th + 0.45);
  // 4) the cloud clears; the next round brings in a new cloud
  const tp = th + 0.77;
  tl.call(() => {
    if (q) { FX.burst(q.x, q.y - 80, '#d4b0ff', 34, 380, { g: 0 }); FX.burst(q.x, q.y - 80, '#ffffff', 18, 260, { g: 0 }); FX.ring(q.x, q.y - 80, '#ffffff', 110); }
    Sound.pop(1.6);
    if (fl) fl.remove(); fl = null;
  }, null, tp);
  camDrive(tl, tp, { fx: CX, fy: CY, z: 1 }, 0.8); // back to the base framing as the cloud clears
  Cloud.clearTL(tl, tp);
  tl.to({}, { duration: 0.3 }, tp + 0.7); // a breath before the next round
}
function addStuck(tl, t0) {
  const tr = t0 + 0.45;
  camDrive(tl, t0, { fx: CX, fy: 330, z: 1.08 }, 0.5, Ease.outCubic); // the camera holds on the cloud
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.4, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  tl.call(() => react('stuck'), null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => EqUI.el.classList.remove('wob'), null, tr + 0.9);
  Cloud.leaveTL(tl, tr + 0.9);
  camDrive(tl, tr + 0.9, { fx: CX, fy: CY, z: 1 }, 0.8); // back to the base framing as the cloud floats away
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

// ---- tutorials (first entry only), every line by key; Skip ends the tutorial ----
function skipTutorial() {
  G.tutSkip = true;
  VO.stop(); Spot.hide(); G.spotOnly = null;
  Rack.balls.forEach((b) => (b.guide = false));
  if (G.hooks) { G.hooks.onFill = null; G.hooks.softSpot = false; }
}
const fireSpot = () => { const f = Cannon.fireBox; return Spot.worldBox(f.x, f.y, f.w, f.h); };
async function tutorialLoad() {
  G.taught1 = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  const cage = EqUI.cage(); if (cage) cage.classList.add('push');
  // 1) this is x; everything else blurs
  Spot.show(() => Spot.boxOf(EqUI.cage()), { sx: 1.15, sy: 1.08, pad: 30 });
  await VO.say('tutFreeX', 0.35);
  return () => {
    if (G.tutSkip) return;
    // 2) the glowing −5 is the only ball you can tap (the spotlight covers its hop above the cup)
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(() => { const r = Rack.restPos(gb.holder); return Spot.worldBox(r.x, r.y - 11, BALL_D, BALL_D + 22); }, { hand: true, sx: 1.2, sy: 1.2, pad: 26 }); } else Rack.glowWave();
    VO.say('tutTapOp', 0.5);
    // 3) once it is loaded, the spotlight moves to FIRE
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip) return;
      if (filled === n && !G.hooks.saidFire) {
        G.hooks.saidFire = true;
        if (G.spotOnly) { G.spotOnly = 'fire'; wait(0.45).then(() => { if (G.spotOnly === 'fire' && !G.tutSkip) Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.45, pad: 24 }); }); }
        VO.say('tutTapFireOne', 0.5);
      }
    };
  };
}
async function tutorialSeq() {
  G.taughtSeq = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  // the two sockets (with their 1 and 2 markers) are the focus while the order is explained
  Spot.show(() => Spot.boxOf([...Cannon.sock, ...Cannon.tags]), { sx: 1.1, sy: 1.2, pad: 30 });
  await VO.say('tutOrder', 0.15);
  if (G.tutSkip) return null;
  Cannon.pulseSockets();
  await VO.say('tutLeftRight', 0.3);
  if (G.tutSkip) return null;
  Spot.hide();
  return () => {
    if (G.tutSkip) return;
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip) return;
      if (filled === 1 && !G.hooks.saidNext) { G.hooks.saidNext = true; VO.say('tutNextOp', 0.5); }
      if (filled === n && !G.hooks.saidFire) { // a soft spotlight on FIRE (balls stay tappable, it lifts if you unload one)
        G.hooks.saidFire = true; G.hooks.softSpot = true;
        Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.45, pad: 24 });
        VO.say('tutTapFireMany', 0.5);
      }
      if (filled < n && G.hooks.softSpot) { G.hooks.softSpot = false; Spot.hide(); }
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
    tasks.push(Stage.camTo({ fx: CX + 50 }, 0.3, Ease.outQuad).then(() => Stage.camTo({ fx: CX }, 0.6, Ease.outCubic)));
  }
  await Promise.all(tasks);
  if (sid !== G.session) return;
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad();
  else if (R.slots > 1 && !G.taughtSeq) after = await tutorialSeq();
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
  refreshBalls([]); G.rackFor = null;
  Stage.camTo({ fx: CX, fy: 300, z: 1.05 }, 0.8, Ease.outCubic); // the end card is framed a little closer
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
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; Spot.hide();
  $('#endUI').classList.remove('on');
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.parts = [];
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset();
  G.rackFor = null;
  runSession();
}

// ---- pause ----
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p;
  $('#pauseBtn img').src = IMG + (p ? 'play.webp' : 'pause.webp');
  $('#pauseBtn').setAttribute('aria-label', T(p ? 'btnResume' : 'btnPause'));
  if (p) { gsap.globalTimeline.pause(); Music.pause(); Sound.suspend(); VO.pause(); }
  else { gsap.globalTimeline.resume(); Music.resume(); Sound.resume(); VO.resume(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient(); VO.pickVoice();
  G.welcome = VO.say('voWelcome', 0.15); // said while the scene builds itself
  $('#credits').classList.add('hide');
  flashScreen();
  // zoom-through: the camera punches toward the Play button while the start screen bursts away…
  Stage.camTo({ fx: TL.play.x, fy: TL.play.y, z: 1.15 }, 0.3, Ease.inCubic);
  await Title.exit();
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.y = -470; Cannon.morphS = 0.001; Rack.enterY = 330;
  $('#world').classList.remove('title');
  // …and the play scene eases out from that close framing while it builds itself
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 0.9, Ease.outCubic);
  Sound.swoosh();
  await Promise.all([
    tween(0.8, (e) => (Cloud.y = -470 * (1 - e)), Ease.outBack),
    tween(0.75, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBack, 0.12).then(() => Sound.settle()),
    tween(0.6, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack, 0.38).then(() => { Sound.clunk(); Cannon.groundDust(true); Stage.hit({ trauma: 0.12, ky: 6 }); }),
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
  if (G.state === 'title' && !Motion.reduced) { const c = Stage.cam, tt = t - Title.t0; c.fx = CX + Math.sin(tt * 0.22) * 28; c.fy = CY + Math.sin(tt * 0.31) * 10; c.z = 1.05 + Math.sin(tt * 0.17) * 0.02; } // (drifts from where the loading screen left it)
  Cloud.apply(t, dt); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(rdt); Spot.update(dt, t); FX.update(dt); FX.draw();
}
async function boot() {
  Motion.init();
  const names = ['bg_mount.webp', 'bg_trees.webp', 'bg_lake.webp', 'bg_ground.webp', 'bg_foreL.webp', 'bg_foreR.webp', 'cloud.webp', 'cage_x.webp', 'xchar.webp', 'fire.webp', 'pause.webp', 'play.webp', 'sound.webp', 'rack.webp', 'rack_front.webp', 'cannon1.webp', 'cannon2.webp', 'cannon1_front.webp', 'cannon2_front.webp', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `ball_${i}.webp`),
    'playbtn.webp', 't_logo.webp', 't_cage.webp', 't_cannon.webp', 't_fire.webp'];
  // the loading screen (js/loader.js): lay the scene out at once, so it shows behind the bar as soon as its pictures are in…
  FX.init(); Stage.init(); Perf.init();
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 }); Stage.snap(); Stage.update(0);
  Loader.scene();
  await Loader.load(names, IMG); // …while the bar fills with every picture (and the font)
  Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); Title.init(); Spot.init(); Skip.init();
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  wireInput();
  gsap.ticker.add(frame);
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX };
  await Loader.finish(); // the bar fills, flashes and collapses: the Play button pops in where it was
  G.state = 'title';
  Title.start();
  $('#credits').classList.remove('hide');
}
boot();
