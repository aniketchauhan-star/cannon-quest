
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
const CANNON = { x: 836, bottom: 762, h: 360, src: { 1: [613, 449], 2: [613, 449] },
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
    // a calm, far-off drift: a slow rise and fall (~11 s) and a slower sideways sway (~23 s); still with reduced motion.
    // jx / jy: a tremble, just before it bursts
    const calm = !Motion.reduced, by = calm ? Math.sin(t * 0.55) * 4 : 0, bx = calm ? Math.sin(t * 0.27 + 1) * 5 : 0, q = this.sq.update(dt);
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
  async enter() {
    CloudBurst.reset();
    const box = $('#eqBox'), m = CLOUD_MID;
    QCard.hide();
    Sound.swoosh();
    CloudBurst.make();
    if (CloudBurst.bits.length && !Motion.still()) {
      Object.assign(this, { x: 0, y: 0, s: 1, a: 1, blur: 0, rot: 0, jx: 0, jy: 0 });
      FX.gather(m.x, m.y + 26, 460, 180, 18);
      CloudBurst.gatherFrom();
      box.style.willChange = 'transform,opacity'; box.style.opacity = '0';
      await tween(Motion.BEAT.CLOUD_IN, (e, k) => {
        CloudBurst.gather(k);
        const q = clamp((k - 0.72) / 0.28, 0, 1); // the equation pops in as the cloud closes
        box.style.opacity = Ease.outQuad(q).toFixed(3); box.style.transform = `scale(${(0.8 + 0.2 * Ease.outBackSoft(q)).toFixed(4)})`;
      }, Ease.linear);
      CloudBurst.reset();
      Sound.chime();
      FX.star(m.x - 150, m.y + 12, '#ffd84a', 60, 0.5, { n: 4, paint: true }); FX.star(m.x + 170, m.y - 22, '#ffffff', 48, 0.5, { n: 4, delay: 0.12 });
      FX.star(m.x + 40, m.y - 80, '#ffd84a', 44, 0.5, { n: 4, paint: true, delay: 0.22 });
    } else {
      Object.assign(this, { x: 0, y: 18, s: 0.88, a: 0, blur: 0, rot: 0, jx: 0, jy: 0 });
      FX.gather(m.x, m.y + 26, 380, 150, 14);
      await tween(Motion.BEAT.CLOUD_IN, (e, k) => { this.a = Ease.outQuad(Math.min(1, k * 1.4)); this.s = lerp(0.88, 1, e); this.y = lerp(18, 0, e); }, Ease.outBackSoft);
    }
    QCard.pop();
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
// of it, with a soft edge, so each piece is a soft lump of this very cloud; the flat blue base is cut into four
// lengths. Each piece also has a blurred twin, so it can melt into mist as it goes. At the pop the pieces sit exactly
// on the cloud and the cloud's picture lets go under them, so the swap never shows; they drift out from its middle
// (the inner ones first), slowing as air does, rising a little and swelling, and soften into mist that fades. If the
// cloud is repainted, keep CLOUD_PUFFS in step with paint_cloud.py (another cloud still bursts, only not along its
// own puffs).
const CLOUD_ART = { w: 760, h: 281, x: -52, y: 10, base: 262, mid: [392, 186] }; // (.cl in #cloud's box; its flat underside; the burst's centre)
const CLOUD_PUFFS = [[392, 122, 120, 0], [250, 164, 94, 1], [536, 160, 92, 2], [166, 206, 64, 3], [636, 212, 58, 4], [112, 244, 32, 5],
  [682, 246, 28, 6], [236, 256, 56, 7], [398, 252, 78, 8], [560, 258, 58, 9]];
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
    // the puffs: each keeps what it shows of itself (less the puffs in front of it), down to the flat underside
    CLOUD_PUFFS.forEach(([x, y, r, z]) => cut(x - r - F, y - r - F, x + r + F, Math.min(y + r + F, A.base + 2), x, Math.min(y, A.base - 30), (g, X, Y, disc, c) => {
      g.globalCompositeOperation = 'destination-in';
      disc(x, y, r);
      const lg = g.createLinearGradient(0, Y(A.base - 4), 0, Y(A.base + 1)); lg.addColorStop(0, '#000'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out';
      CLOUD_PUFFS.forEach(([x2, y2, r2, z2]) => { if (z2 > z && Math.hypot(x2 - x, y2 - y) < r + r2 + F) disc(x2, y2, r2); });
    }));
    // the flat base, in four lengths: what lies under the puffs' line, and what shows between them above it
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
    if (this.cl) this.cl.style.opacity = (this.bits.length ? 1 - Ease.inQuad(Math.min(1, t / 0.2)) : 1 - Ease.inQuad(k)).toFixed(3);
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
    if (this.cl) this.cl.style.opacity = '0';
    this.gather(0);
  },
  // k = 0…1 of Motion.BEAT.CLOUD_IN
  gather(k) {
    if (!this.on) return;
    const T = Motion.BEAT.CLOUD_IN, t = k * T, end = T * 0.8;
    if (this.cl) this.cl.style.opacity = Ease.inOutQuad(clamp((k - 0.62) / 0.3, 0, 1)).toFixed(3); // the picture comes in under them
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
    if (this.cl) this.cl.style.opacity = '';
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
const CAGE = { w: 199, h: 262, x: { cx: 99.6, feet: 229.7, h: 134.4 }, rest: 0.75, shift: -0.17 / 1.72,
  core: [100, 164], hands: [[51.4, 186.7], [149.6, 186.8]], // x's chest (the fracture's centre) and its gloves on the front bars (where the pushes land)
  push: [0.15, 1.0, 1.85],                           // the three pushes, s into Motion.BEAT.CRACK (the break comes at its end)
  rise: { up: 0.47, hover: 0.72, drop: 0.86, top: -0.07 } }; // x's rise, as fractions of Motion.BEAT.RISE: up out of the light, hover, drop, land (top: its feet at the hover, of the cage's height from its middle)
// (x in its cage: centre, feet, height. The free x stands 75 % of the cage's height tall where it stood (its feet on the
// cage's floor), 0.17 em left of the cage's middle: the "x = 2" spacing it always had, kept without moving the
// equation's layout)

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
    const k = ((r.width / w) || 1) * (CAM.ZMAX / (Stage.z || 1)) * Math.min(2, devicePixelRatio || 1);
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
    const P = CAGE.push, T = Motion.BEAT.CRACK;
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

// ---------- the end card: x on the deck, right of the cannon (the user's art, 23 Nov) ----------
// x freed at least once: x free and dancing by its broken cage (x_free.webp); never: x still crying in its cage (its
// crying frames: "Play again to free them all!"). It stands on the deck right of the cannon, clear of the caption on
// the left: it jumps up from behind the railing, lands on the boards with a squash, a puff of dust and its shadow,
// and then the free x keeps hopping to the music's beat (2 hops, ~81 bpm, swaying left and right); the caged one just
// cries. Transform + opacity only, on GSAP, so it freezes on pause; under reduced motion it simply stands there.
// XEND: where its feet are (art px), and how tall it is, free or caged; FREE_PIC: x_free.webp's size, and what
// touches the ground in it (each: its middle, as a fraction of the width; how far up from the picture's foot, as a
// fraction of the height; its width, as a fraction of the width): the cage's base, the bars and bolt in front of it,
// and x's foot
const XEND = { x: 1330, foot: 732, free: 300, cage: 262 };
const FREE_PIC = { w: 900, h: 762, touch: [[0.171, 0.118, 0.33], [0.175, 0.012, 0.3], [0.42, 0.012, 0.1]] };
const EndX = {
  el: null, sh: null, tl: null, loop: null,
  show(freed) {
    this.hide();
    const free = freed > 0, h = free ? XEND.free : XEND.cage;
    const w = free ? (h * FREE_PIC.w) / FREE_PIC.h : (h * SPR.cry.w) / SPR.cry.h;
    const el = this.el = document.createElement('div');
    el.id = 'xEnd';
    el.innerHTML = free ? `<img src="${IMG}x_free.webp" alt="${T('altXFree')}" draggable="false">` : Sprite.html('cry', '', T('altXCaged'));
    // (the caged one's frames keep a little clear space under the cage's base: its base sits on the boards)
    const lift = free ? 0 : h * (11 / SPR.cry.h);
    Object.assign(el.style, { left: (XEND.x - w / 2).toFixed(1) + 'px', top: (XEND.foot - h + lift).toFixed(1) + 'px', width: w.toFixed(1) + 'px', height: h + 'px' });
    $('#world').insertBefore(el, $('#cannon'));
    if (!free) Sprite.play(el.firstChild);
    // its shadow on the deck: one soft pool under all of it, and a darker contact under what touches the boards
    const sh = this.sh = groundGroup($('#ground'), 'shadow', XEND.x, XEND.foot);
    groundBlob(sh, 'soft', w * 0.04, 2, w * 0.92, 30);
    if (free) for (const [fx, fy, fw] of FREE_PIC.touch) groundBlob(sh, 'contact', (fx - 0.5) * w, -fy * h, fw * w, 14);
    else groundBlob(sh, 'contact', 0, 0, w * 0.86, 16);
    if (Motion.still()) return;
    // the jump up onto the deck: up from behind the railing (stretched), down, a squash on the boards, settle
    gsap.set(el, { opacity: 0, y: 80, scaleX: 0.9, scaleY: 1.1 });
    gsap.set(sh, { opacity: 0, scale: 0.5 });
    const tl = this.tl = gsap.timeline({ delay: 0.35 });
    tl.to(el, { opacity: 1, duration: 0.12, ease: 'none' }, 0)
      .to(el, { y: -54, scaleX: 0.96, scaleY: 1.06, duration: 0.34, ease: 'power2.out' }, 0)
      .to(sh, { opacity: 0.55, scale: 0.7, duration: 0.34, ease: 'power2.out' }, 0)
      .to(el, { y: 0, scaleX: 1, scaleY: 1, duration: 0.26, ease: 'power2.in' })
      .to(sh, { opacity: 1, scale: 1, duration: 0.26, ease: 'power2.in' }, '<')
      .call(() => { Sound.land(); FX.dust(XEND.x - w * 0.25, XEND.foot, -1, 7); FX.dust(XEND.x + w * 0.25, XEND.foot, 1, 7); })
      .to(el, { scaleX: 1.08, scaleY: 0.9, duration: 0.08, ease: 'power2.out' })
      .to(el, { scaleX: 1, scaleY: 1, duration: 0.36, ease: 'back.out(2)' });
    if (!free) return;
    // then it dances: a hop on each beat, leaning one way, then the other
    tl.call(() => {
      const L = this.loop = gsap.timeline({ repeat: -1 });
      for (const lean of [-2.5, 2.5]) {
        L.to(el, { y: -16, rotation: lean, duration: 0.26, ease: 'power2.out' })
          .to(sh, { scale: 0.86, opacity: 0.75, duration: 0.26, ease: 'power2.out' }, '<')
          .to(el, { y: 0, rotation: 0, duration: 0.2, ease: 'power2.in' })
          .to(sh, { scale: 1, opacity: 1, duration: 0.2, ease: 'power2.in' }, '<')
          .to(el, { scaleX: 1.05, scaleY: 0.94, duration: 0.07, ease: 'power2.out' })
          .to(el, { scaleX: 1, scaleY: 1, duration: 0.211, ease: 'power2.out' });
      }
    });
  },
  // the end card goes (Play again): its timelines are killed, x and its shadow taken away
  hide() {
    for (const k of ['tl', 'loop']) if (this[k]) { this[k].kill(); this[k] = null; }
    if (this.el) { gsap.killTweensOf(this.el); this.el.remove(); this.el = null; }
    if (this.sh) { gsap.killTweensOf(this.sh); this.sh.remove(); this.sh = null; }
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
  el: null, maxW: 440, maxH: 124, // (the cloud's body, with a margin: the equation always stays inside the cloud)
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
