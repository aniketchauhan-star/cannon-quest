
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
  // no fast spins. Scene moves (a cloud gathering or bursting) may take up to 1.2 s. Tune the whole game here.
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
    // freed (the user, 23 Nov: "extreme… slow animation of cage crack and x come out from them… cloudburst after x
    // compose"): a slow, cinematic beat for each stage, so every one of them can be seen
    FOCUS: 0.9,      // the screen's edges darken and the camera closes in on the cage, which starts to glow…
    CRACK: 2.6,      //   …x pushes three times (CAGE.push): each push cracks it further, light leaks out; it trembles…
    SHATTER: 1.8,    //   …and bursts along its cracks: the shards tumble away, hang in the air and fade
    RISE: 1.6,       //   x rises out of the light, hovers (sparkles circle it), comes down and lands where the cage stood
    HOLD: 5.0,       //   "x = 2" rests on the cloud (the user, 23 Nov: "after 5 seconds the cloud is fade and burst")
    INHALE: 0.7,     // the cloudburst: the cloud draws in its breath (it squeezes, trembles, glows; "x = 2" is drawn in)…
    BURST: 1.6,      //   …and bursts in place: its puffs blast apart, a flash, rings, a shower (it never sails off sideways)
    BREATH: 0.5,     //   a breath before the next question
    RATTLE: 1.3,     // stuck: the cage rattles, the cloud wobbles (then the cloud bursts too, gently)
    CLOUD_IN: 1.3,   // a new question's cloud forms in the same place, out of puffs that drift together
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
