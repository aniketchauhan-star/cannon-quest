
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
