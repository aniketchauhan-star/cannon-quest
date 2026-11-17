
// =====================================================================
//  STAGE — fixed 1672×941 art-space scaled to the screen, a 2D camera
//  (zoom / pan / shake), particles, and the scene sprites.
// =====================================================================
const DW = 1672, DH = 941, CX = DW / 2, CY = DH / 2;
const CANNON = { x: 836, bottom: 762, h: 342, src: { 1: [429, 347], 2: [530, 347] },
  // centre + inner radius of each gold socket ring (circle-fitted to the ring's inner edge), as fractions of the sprite width
  holes: { 1: [[0.5026, 0.455, 0.1139]], 2: [[0.3795, 0.4885, 0.0795], [0.6195, 0.4879, 0.0799]] },
  // base footprint width + the two cyan light strips (centre, width) as fractions of each sprite
  foot: { 1: { w: 0.99, strips: [[0.1621, 0.1445], [0.8353, 0.1469]] }, 2: { w: 0.994, strips: [[0.138, 0.1245], [0.8585, 0.1264]] } } };
const RACK = { left: 271, top: 778, w: 1130, srcW: 1451, holesX: [164.4, 327.6, 488.1, 650.2, 809.8, 970.5, 1129.4, 1291.3], holeY: 84.2 };
const BALL_D = 112, MUZZLE = { x: CANNON.x, y: CANNON.bottom - CANNON.h + 14 };

const Stage = {
  S: 1, ox: 0, oy: 0, W: innerWidth, H: innerHeight, tx: 0, ty: 0, z: 1,
  cam: { fx: CX, fy: CY, z: 1 }, trauma: 0, bgRect: { l: 0, t: 0, w: DW, h: DH },
  init() { this.el = $('#stage'); this.world = $('#world'); this.bg = $('#bg'); this.resize(); },
  resize() {
    const W = (this.W = innerWidth), H = (this.H = innerHeight);
    this.S = Math.min(W / DW, H / DH);
    this.ox = (W - DW * this.S) / 2; this.oy = (H - DH * this.S) / 2;
    this.el.style.transform = `translate(${this.ox}px,${this.oy}px) scale(${this.S})`;
    const k = (Math.max(W / DW, H / DH) / this.S) * 1.07, bw = DW * k, bh = DH * k;
    this.bgRect = { l: (DW - bw) / 2, t: (DH - bh) / 2, w: bw, h: bh };
    Object.assign(this.bg.style, { width: bw + 'px', height: bh + 'px', left: this.bgRect.l + 'px', top: this.bgRect.t + 'px' });
    FX.resize(W, H);
    if (typeof Spot !== 'undefined') Spot.layout();
  },
  shake(a) { this.trauma = Math.min(1, this.trauma + a); },
  update(dt, t) {
    const c = this.cam, z = Math.max(1, c.z);
    // keep the painted background covering the whole screen
    const hw = this.W / this.S / z / 2, hh = this.H / this.S / z / 2, b = this.bgRect;
    const fx = b.w > hw * 2 ? clamp(c.fx, b.l + hw, b.l + b.w - hw) : b.l + b.w / 2;
    const fy = b.h > hh * 2 ? clamp(c.fy, b.t + hh, b.t + b.h - hh) : b.t + b.h / 2;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const s = this.trauma * this.trauma * 18;
    const sx = s ? (Math.sin(t * 47.3) + Math.sin(t * 71.1) * 0.5) * s : 0, sy = s ? (Math.sin(t * 53.7) + Math.sin(t * 89.2) * 0.5) * s : 0;
    this.tx = CX - fx * z + sx; this.ty = CY - fy * z + sy;
    const rot = s ? Math.sin(t * 39.1) * this.trauma * this.trauma * 0.8 : 0;
    this.world.style.transform = `translate(${this.tx.toFixed(2)}px,${this.ty.toFixed(2)}px) scale(${z.toFixed(4)})` + (rot ? ` rotate(${rot.toFixed(3)}deg)` : '');
    this.z = z;
  },
  w2s(x, y) { return { x: this.ox + this.S * (x * this.z + this.tx), y: this.oy + this.S * (y * this.z + this.ty) }; },
  s2w(sx, sy) { return { x: ((sx - this.ox) / this.S - this.tx) / this.z, y: ((sy - this.oy) / this.S - this.ty) / this.z }; },
  camTo(o, dur = 0.8, ease = Ease.inOutCubic) {
    const c = this.cam, from = { ...c };
    return tween(dur, (e) => { for (const k in o) c[k] = lerp(from[k], o[k], e); }, ease);
  },
};

// ---------- particles on a screen-space canvas (positions live in art-space) ----------
const FX = {
  cv: null, ctx: null, dpr: 1, parts: [], dots: new Map(), uiMode: false,
  init() { this.cv = $('#fx'); this.ctx = this.cv.getContext('2d'); },
  resize(W, H) { this.dpr = Math.min(devicePixelRatio || 1, 2); this.cv.width = W * this.dpr; this.cv.height = H * this.dpr; },
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
  add(p) { p.ui = this.uiMode; if (this.parts.length < 1400) this.parts.push(p); },
  burst(x, y, color, n = 30, speed = 420, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * rr(0.3, 1);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g ?? 500, drag: 2.2, life: rr(0.5, 0.95), max: 0.95, size: rr(14, 30) * (o.size || 1), color: Math.random() < 0.35 ? '#ffffff' : color });
    }
  },
  trail(x, y, color) { this.add({ k: 'spark', x: x + rr(-6, 6), y: y + rr(-6, 6), vx: rr(-40, 40), vy: rr(-40, 40), g: 0, drag: 2, life: 0.45, max: 0.45, size: rr(18, 30), color }); },
  smoke(x, y, n = 10, spread = 120) {
    for (let i = 0; i < n; i++) this.add({ k: 'smoke', x: x + rr(-20, 20), y: y + rr(-10, 10), vx: rr(-spread, spread), vy: rr(-200, -60), g: -40, drag: 2.4, life: rr(0.8, 1.3), max: 1.3, size: rr(40, 70), grow: rr(1.5, 2.4) });
  },
  dust(x, y, dir = 0, n = 8) { // sand kicked up along the ground
    for (let i = 0; i < n; i++) {
      const d = dir || (Math.random() < 0.5 ? -1 : 1);
      this.add({ k: 'smoke', a: 0.42, col: pick(['#ead5b0', '#f5e8cf', '#dcc39a']), x: x + d * rr(0, 24), y: y + rr(-8, 2), vx: d * rr(90, 300), vy: rr(-80, -15), g: 90, drag: 2.8, life: rr(0.45, 0.85), max: 0.85, size: rr(16, 30), grow: rr(1.0, 1.5) });
    }
  },
  puffs(x, y, w, n = 16) { for (let i = 0; i < n; i++) this.add({ k: 'smoke', x: x + rr(-w / 2, w / 2), y: y + rr(-60, 60), vx: rr(-160, 160), vy: rr(-120, 40), g: 0, drag: 1.6, life: rr(0.7, 1.1), max: 1.1, size: rr(60, 110), grow: 1.6 }); },
  confetti(x, y, n = 140, power = 900) {
    const cols = ['#ff4f8b', '#ffd23f', '#36d97a', '#22d3ee', '#9b5cff', '#ff9f1c', '#ffffff', '#3b82f6'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rr(-1.1, 1.1), v = power * rr(0.4, 1);
      this.add({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 1.4, life: rr(2.2, 3.4), max: 3.4, w: rr(10, 18), h: rr(16, 28), rot: rr(0, 6), vr: rr(-12, 12), flip: rr(0, 6), color: pick(cols) });
    }
  },
  flash(x, y, size = 260) { this.add({ k: 'flash', x, y, life: 0.28, max: 0.28, size }); },
  ring(x, y, color = '#ffffff', size = 200) { this.add({ k: 'ring', x, y, life: 0.5, max: 0.5, size, color }); },
  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      if (p.vx !== undefined) {
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy = p.vy * d + (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'conf') { p.rot += p.vr * dt; p.flip += dt * 9; if (p.vy > 260) p.vy = 260; p.x += Math.sin(p.flip * 0.5) * 30 * dt; }
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  },
  draw() {
    const c = this.ctx, d = this.dpr, scW = Stage.S * (Stage.z || 1);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    for (const p of this.parts) {
      const s = p.ui ? { x: Stage.ox + Stage.S * p.x, y: Stage.oy + Stage.S * p.y } : Stage.w2s(p.x, p.y), k = p.life / p.max, X = s.x * d, Y = s.y * d, sc = p.ui ? Stage.S : scW;
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
      } else if (p.k === 'flash') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = k;
        const r = p.size * sc * d * (1.4 - k * 0.6);
        c.drawImage(this.dot('#ffd27a'), X - r, Y - r, r * 2, r * 2);
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
  el: null, x: 0, y: 0, s: 1, a: 1, blur: 0, rot: 0,
  init() { this.el = $('#cloud'); },
  apply(t) {
    const by = Math.sin(t * 1.1) * 5;
    this.el.style.transform = `translate(${this.x.toFixed(1)}px,${(this.y + by).toFixed(1)}px) rotate(${this.rot.toFixed(2)}deg) scale(${this.s.toFixed(4)})`;
    this.el.style.opacity = this.a.toFixed(3);
    if (this.a > 0.99) this.el.style.filter = '';
  },
  async enter(fromX = 1250) {
    Object.assign(this, { x: fromX, y: -40, s: 1, a: 1, blur: 0, rot: 0 });
    Sound.swoosh();
    await tween(1.25, (e) => { this.x = lerp(fromX, 0, e); this.y = lerp(-40, 0, e); }, Ease.outBack);
  },
  async leave(toX = -1250) {
    const x0 = this.x; Sound.swoosh();
    await tween(1.15, (e) => { this.x = lerp(x0, toX, e); this.y = -60 * e; this.rot = -5 * e; }, Ease.inCubic);
  },
  async clear() {
    FX.puffs(828, 190, 700, 26);
    this.el.style.filter = 'brightness(1.25)';
    await tween(0.9, (e) => { this.s = 1 + 0.22 * e; this.a = 1 - Ease.inQuad(e); this.y = -30 * e; }, Ease.outQuad);
  },
  async wobble() { await tween(1.5, (e, k) => { this.rot = Math.sin(k * Math.PI * 7) * 3.2 * (1 - k); this.s = 1 + Math.sin(k * Math.PI * 9) * 0.025 * (1 - k); }, Ease.linear); },
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
  init() {
    this.el = $('#cannon'); this.el.style.transformOrigin = `${CANNON.x}px ${CANNON.bottom}px`;
    this.c1 = $('#c1'); this.c2 = $('#c2'); this.fire = $('#fireBtn');
    this.front = $('#cannonFront'); this.front.style.transformOrigin = this.el.style.transformOrigin; this.c1f = $('#c1f'); this.c2f = $('#c2f');
    for (const id of ['#cannonBody', '#cannonFrontBody']) Object.assign($(id).style, { left: CANNON.x + 'px', top: CANNON.bottom + 'px' });
    this.c1.style.height = this.c2.style.height = this.c1f.style.height = this.c2f.style.height = CANNON.h + 'px';
    const fw = CANNON.h * 0.55, fh = CANNON.h * 0.257, fcy = CANNON.bottom - CANNON.h * 0.2005; // FIRE sits on the base, like the mockup
    Object.assign(this.fire.style, { left: CANNON.x - fw / 2 + 'px', top: fcy - fh / 2 + 'px', width: fw + 'px', height: fh + 'px' });
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
    this.setN(n); FX.smoke(CANNON.x, CANNON.bottom - 140, 14, 260); this.groundDust(false); Sound.clunk();
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
  fireKick() { this.recoil = 1; },
  update(dt, t = 0) {
    this.recoil = Math.max(0, this.recoil - dt * 2.6);
    const r = this.recoil, kick = r > 0.75 ? (1 - r) / 0.25 : r / 0.75;
    this.kickY = 16 * kick; this.kickS = 1 - 0.04 * kick;
    this.pressT = Math.max(0, this.pressT - dt * 5);
    const s = this.morphS;
    this.sx = s * (1 + 0.06 * kick); this.sy = s * (1 - 0.1 * kick);
    this.el.style.transform = this.front.style.transform = `translateY(${this.kickY.toFixed(2)}px) scale(${this.sx.toFixed(4)},${this.sy.toFixed(4)})`;
    this.fire.classList.toggle('press', this.pressT > 0);
    // the shadow slides with the recoil and grows with the cannon, so it stays glued to the ground
    const gt = `translate(0px,${this.kickY.toFixed(2)}px) scale(${(s * (1 + 0.07 * kick)).toFixed(4)},${s.toFixed(4)})`;
    this.gShadow.style.transform = gt; this.gLight.style.transform = gt;
    this.gLight.style.opacity = Math.min(1, 0.72 + 0.2 * Math.sin(t * 2.4) + 0.3 * kick).toFixed(3);
  },
};

// ---------- rack with 8 holders + the physical operation balls ----------
const Rack = {
  holes: [], glows: [], balls: [], enterY: 0,
  applyEnter() {
    const tr = this.enterY ? `translateY(${this.enterY.toFixed(1)}px)` : '';
    for (const id of ['#rack', '#rackFront', '#bshadows', '#hglows', '#rackShadow']) $(id).style.transform = tr;
  },
  init() {
    const sc = RACK.w / RACK.srcW, img = $('#rack');
    Object.assign(img.style, { left: RACK.left + 'px', top: RACK.top + 'px', width: RACK.w + 'px' });
    Object.assign($('#rackFront').style, { left: RACK.left + 'px', top: RACK.top + 'px', width: RACK.w + 'px' });
    // the tray sits on the plaza too: contact line along its bottom edge, pressed-in corners, soft + cast shade
    const rs = groundGroup($('#ground'), 'shadow', 0, 0); rs.id = 'rackShadow';
    const bot = RACK.top + 188 * sc, cx = RACK.left + RACK.w / 2, edgeL = RACK.left + 87 * sc, edgeR = RACK.left + 1365 * sc;
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
  restPos(i) { const h = this.holes[i]; return { x: h.x, y: h.y - 12, s: 1 }; }, // seated: the bottom dips into the cup
  glowWave() {
    this.glows.forEach((g, i) => { g.classList.remove('on'); void g.offsetWidth; g.style.animationDelay = i * 0.08 + 's'; g.classList.add('on'); });
    this.balls.forEach((b, i) => { if (b.where === 'rack') tween(0.5, (e, k) => (b.hop = Math.sin(k * Math.PI)), Ease.linear, i * 0.08); });
  },
};
function createBall(opStr, i) {
  const op = parseOp(opStr), el = document.createElement('div');
  el.className = 'ball';
  el.innerHTML = `<img src="${IMG}ball_${i}.png" alt="" draggable="false"><i class="ao"></i><b>${labelHTML(op)}</b>`; // ao = shade where it sinks into the cup
  $('#balls').appendChild(el);
  const r = Rack.restPos(i);
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
      const gh = b.guide && b.where === 'rack' ? Math.abs(Math.sin(t * 3.4)) * 22 : 0;
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
    b.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) rotate(${b.r.toFixed(1)}deg) scale(${(s * (1 + sq)).toFixed(4)},${(s * (1 - sq)).toFixed(4)})`;
    b.el.classList.toggle('guide', b.guide && b.where === 'rack');
    b.el.classList.toggle('hov', b.hover > 0.5);
    b.el.classList.toggle('seated', !b.flight && !!b.isSeated);
  }
  if (Rack.shadows) Rack.shadows.forEach((d, i) => d.classList.toggle('on', seated[i]));
}

// ---------- small drifting clouds for life in the sky ----------
const Minis = {
  list: [],
  init() {
    const box = $('#minis');
    [[120, 0.62, 18], [1450, 0.5, 12], [700, 0.42, 9], [1900, 0.56, 15]].forEach(([x, sc, v], i) => {
      const im = document.createElement('img'); im.src = IMG + 'cloud.png'; im.className = 'mini'; box.appendChild(im);
      this.list.push({ el: im, x, y: [70, 120, 250, 205][i], sc: sc * 0.55, v });
    });
  },
  update(dt) {
    for (const m of this.list) {
      m.x += m.v * dt; if (m.x > DW + 260) m.x = -320;
      m.el.style.transform = `translate(${m.x.toFixed(1)}px,${m.y}px) scale(${m.sc})`;
    }
  },
};

// =====================================================================
//  EQUATION UI — tokens glide (FLIP) when the equation changes
// =====================================================================
const EqUI = {
  el: null, maxW: 690,
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
      e.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sc})` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.3,1.25,.5,1)' });
    });
  },
  setEq(eq, flip = true) { this.render(eqHTML(eq), flip); },
  cage() { return this.el.querySelector('[data-key="x"]'); },
  showImpact(eq, op, color) {
    this.render(impactHTML(eq, op, color), true);
    return [this.el.querySelector('[data-key="inL"]'), this.el.querySelector('[data-key="inR"]')];
  },
  async simplify(next) {
    const html = eqHTML(next), tpl = document.createElement('div'); tpl.innerHTML = html;
    const keep = new Set([...tpl.querySelectorAll('[data-key]')].map((e) => e.dataset.key));
    const after = new Map([...tpl.querySelectorAll('[data-key]')].map((e) => [e.dataset.key, e.innerHTML]));
    let any = false;
    this.el.querySelectorAll('[data-key]').forEach((e) => {
      if (keep.has(e.dataset.key) || (e.parentElement && e.parentElement.closest('.van'))) return;
      if ([...e.querySelectorAll('[data-key]')].some((c) => keep.has(c.dataset.key))) return;
      e.classList.add('van'); any = true;
    });
    if (any) { Sound.sparkle(); await wait(0.46); }
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
//  SPOTLIGHT — first-time tutorial focus: everything is blurred + dimmed
//  except one target (a soft elliptical hole), with a gold ring and a
//  little hand that taps the thing to press.
// =====================================================================
const Spot = {
  el: null, ring: null, hand: null, get: null, opts: {}, active: false, cur: null, box: { l: 0, t: 0 }, nudgeT: 0, tapped: false,
  init() { this.el = $('#spot'); this.ring = $('#spotRing'); this.hand = $('#spotHand'); this.layout(); },
  layout() { // cover exactly the screen, in stage units
    if (!this.el) return;
    const S = Stage.S, l = -Stage.ox / S, t = -Stage.oy / S;
    this.box = { l, t };
    Object.assign(this.el.style, { left: l + 'px', top: t + 'px', width: Stage.W / S + 'px', height: Stage.H / S + 'px' });
  },
  rect(target) { // union of the target element(s), in stage units
    const v = typeof target === 'function' ? target() : target;
    const els = (Array.isArray(v) ? v : [v]).filter(Boolean);
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const e of els) { const q = e.getBoundingClientRect(); if (!q.width && !q.height) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
    if (l === Infinity) return null;
    const S = Stage.S;
    return { x: ((l + r) / 2 - Stage.ox) / S, y: ((t + b) / 2 - Stage.oy) / S, w: (r - l) / S, h: (b - t) / S };
  },
  show(target, opts = {}) {
    this.get = target; this.opts = opts; this.active = true;
    document.body.classList.add('spot');
    this.el.classList.add('on'); this.ring.classList.add('on'); this.hand.classList.toggle('on', !!opts.hand);
    const r = this.rect(target);
    if (r && !this.cur) this.cur = { x: r.x, y: r.y, rx: 1500, ry: 1100 }; // irises in from wide open
  },
  hide() {
    this.active = false; this.get = null;
    document.body.classList.remove('spot');
    for (const e of [this.el, this.ring, this.hand]) e.classList.remove('on');
    setTimeout(() => { if (!this.active) this.cur = null; }, 500);
  },
  nudge() { this.nudgeT = 1; },
  update(dt, t) {
    if (!this.cur) return;
    const c = this.cur, o = this.opts;
    if (this.active && this.get) {
      const r = this.rect(this.get);
      if (r) {
        const rx = (r.w / 2) * (o.sx ?? 1.3) + (o.pad ?? 24), ry = (r.h / 2) * (o.sy ?? 1.3) + (o.pad ?? 24), k = 1 - Math.exp(-9 * dt);
        c.x += (r.x - c.x) * k; c.y += (r.y - c.y) * k; c.rx += (rx - c.rx) * k; c.ry += (ry - c.ry) * k;
      }
    }
    this.nudgeT = Math.max(0, this.nudgeT - dt * 2.2);
    const pulse = 1 + 0.03 * Math.sin(t * 4) + 0.1 * Math.sin(this.nudgeT * Math.PI), es = this.el.style;
    es.setProperty('--x', (c.x - this.box.l).toFixed(1) + 'px'); es.setProperty('--y', (c.y - this.box.t).toFixed(1) + 'px');
    es.setProperty('--rx', c.rx.toFixed(1) + 'px'); es.setProperty('--ry', c.ry.toFixed(1) + 'px');
    const gx = c.rx * 0.8 * pulse, gy = c.ry * 0.8 * pulse; // the ring sits where the clear area starts to fade
    Object.assign(this.ring.style, { left: (c.x - gx).toFixed(1) + 'px', top: (c.y - gy).toFixed(1) + 'px', width: (2 * gx).toFixed(1) + 'px', height: (2 * gy).toFixed(1) + 'px' });
    if (o.hand && this.active) { // taps the target every 1.4 s, with a ripple on each tap
      const ph = (t % 1.4) / 1.4, press = ph > 0.4 && ph < 0.62 ? Math.sin(((ph - 0.4) / 0.22) * Math.PI) : 0;
      if (press > 0.9 && !this.tapped) { this.tapped = true; FX.uiMode = true; FX.ring(c.x, c.y, '#fff6c8', Math.min(c.rx, c.ry) * 0.9); FX.uiMode = false; }
      if (press === 0) this.tapped = false;
      const ax = Math.min(c.rx, 110) * 0.3, ay = Math.min(c.ry, 110) * 0.38;
      this.hand.style.transform = `translate(${(c.x + ax + 26 * (1 - press)).toFixed(1)}px,${(c.y + ay + 30 * (1 - press)).toFixed(1)}px) rotate(-26deg) scale(${(1 - 0.12 * press).toFixed(3)})`;
    }
  },
};
