
// =====================================================================
//  START SCREEN — the thumbnail from your art, brought to life:
//  logo drops in, the cannon fires the 8 balls into their arcs, the
//  caged x rattles, sparkles twinkle, and your Play button pops in.
// =====================================================================
const TL = (() => { // clean layout in art-space (1672×941): logo + cage on top, cannon bottom-left, two tidy ball arcs
  const cannon = { x: 290, y: 668, w: 410 };
  const arc = (cx, cy, r, deg) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy - r * Math.sin((deg * Math.PI) / 180) });
  const left = [62, 100, 138, 176].map((d) => arc(300, 512, 185, d)), right = [80, 42, 4, -34].map((d) => arc(1372, 520, 185, d));
  return {
    logo: { x: 836, y: 176, w: 580 },
    cage: { x: 1238, y: 170, w: 168 },
    lines: { x: 1356, y: 112, w: 62 },
    cannon,
    fire: { x: cannon.x + 0.048 * cannon.w, y: cannon.y + 0.2495 * cannon.w, w: 0.4606 * cannon.w },   // the FIRE plate on the cannon art
    muzzle: { x: cannon.x + 0.3209 * cannon.w, y: cannon.y - 0.322 * cannon.w },
    play: { x: 836, y: 548, w: 168 },
    balls: [1, 0, 2, 3, 4, 5, 6, 7].map((i, o) => ({ i, o, w: 100, ...(o < 4 ? left[o] : right[o - 4]) })), // sprite index, launch order
    sparks: [{ x: 520, y: 92, w: 38 }, { x: 1596, y: 268, w: 42 }],
  };
})();
const Title = {
  active: false, exiting: false, t0: 0, tx: 0, hover: false, press: 0, kick: 0, nextFire: 0, flashT: 0, fired: new Set(),
  init() {
    const box = $('#thumb'); this.box = box; this.play = $('#playBtn'); this.rays = $('#rays'); this.glow = $('#sunGlow');
    const add = (src, w) => {
      const im = document.createElement('img'); im.className = 'tp'; im.src = IMG + src + '.png'; im.alt = ''; im.draggable = false;
      im.style.width = w + 'px'; box.insertBefore(im, this.play); return im;
    };
    const sized = (el, x, y, w) => { const h = w * ((el.naturalHeight || 1) / (el.naturalWidth || 1)); Object.assign(el.style, { left: x - w / 2 + 'px', top: y - h / 2 + 'px' }); return h; };
    this.cannon = add('t_cannon', TL.cannon.w); sized(this.cannon, TL.cannon.x, TL.cannon.y, TL.cannon.w);
    // ground under the start-screen cannon: shadow, the golden glow ring from the mockup, cyan strip light
    const cw = TL.cannon.w, fx = TL.cannon.x, fy = (this.footY = TL.cannon.y + cw * (479 / 527) * (0.9958 - 0.5));
    const fw = cw * 0.95;
    this.cSh = groundGroup(box, 'shadow', fx, fy, this.cannon);
    groundBlob(this.cSh, 'cast', fw * 0.34, -20, fw * 1.1, fw * 0.15); groundBlob(this.cSh, 'soft', 8, 2, fw * 1.36, fw * 0.13); groundBlob(this.cSh, 'contact', -2, -2, fw * 1.12, 26);
    for (const sx of [-1, 1]) groundBlob(this.cSh, 'contact', sx * fw * 0.44 - 2, -2, fw * 0.26, 26);
    this.cGold = groundGroup(box, 'ring', fx, fy, this.cannon); groundBlob(this.cGold, 'gold', -4, -2, cw * 1.08, 46);
    this.cGlow = groundGroup(box, 'light', fx, fy, this.cannon);
    [[0.2312, 0.186], [0.8083, 0.1822]].forEach(([c, w]) => groundBlob(this.cGlow, 'glow', (c - 0.5) * cw, 8, w * cw * 1.7, 32));
    this.fire = add('t_fire', TL.fire.w); sized(this.fire, TL.fire.x, TL.fire.y, TL.fire.w);
    this.cage = add('t_cage', TL.cage.w); sized(this.cage, TL.cage.x, TL.cage.y, TL.cage.w);
    this.lines = add('t_lines', TL.lines.w); sized(this.lines, TL.lines.x, TL.lines.y, TL.lines.w);
    this.cage.style.transformOrigin = '50% 4%';
    this.logo = add('t_logo', TL.logo.w); this.logoH = sized(this.logo, TL.logo.x, TL.logo.y, TL.logo.w);
    this.balls = TL.balls.map((b) => { const el = add(`t_ball_${b.i}`, b.w); sized(el, b.x, b.y, b.w); return { ...b, el }; });
    this.sparks = TL.sparks.map((s) => { const el = add('t_spark', s.w); sized(el, s.x, s.y, s.w); return { ...s, el }; });
    Object.assign(this.play.style, { left: TL.play.x - TL.play.w / 2 + 'px', top: TL.play.y - TL.play.w * 0.508 + 'px', width: TL.play.w + 'px', height: TL.play.w * 1.016 + 'px' });
    for (const el of [this.rays, this.glow]) Object.assign(el.style, { left: TL.play.x + 'px', top: TL.play.y + 'px' });
    this.play.addEventListener('pointerenter', () => (this.hover = true));
    this.play.addEventListener('pointerleave', () => (this.hover = false));
    this.play.addEventListener('pointerdown', () => (this.press = 1));
    this.hideAll();
  },
  hideAll() { for (const el of this.box.querySelectorAll('.tp, #playBtn')) el.style.opacity = 0; },
  start() { this.active = true; this.t0 = Clock.t; this.nextFire = 4.6; },
  set(el, dx, dy, rot = 0, sc = 1, op = 1, sx = 1) {
    el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(sc * sx).toFixed(4)},${sc.toFixed(4)})`;
    el.style.opacity = op.toFixed(3);
  },
  titleDust(big) {
    FX.uiMode = true;
    const r = TL.cannon.w * 0.46;
    FX.dust(TL.cannon.x - r, this.footY, -1, big ? 7 : 3); FX.dust(TL.cannon.x + r, this.footY, 1, big ? 7 : 3);
    FX.uiMode = false;
  },
  muzzleFx(big) {
    FX.uiMode = true;
    const m = TL.muzzle, dir = { x: 0.6, y: -0.8 };
    FX.flash(m.x, m.y, big ? 150 : 110);
    FX.smoke(m.x + dir.x * 20, m.y + dir.y * 20, big ? 8 : 5, 90);
    for (let i = 0; i < (big ? 18 : 10); i++) FX.add({ k: 'spark', x: m.x, y: m.y, vx: (dir.x + rr(-0.5, 0.5)) * rr(200, 480), vy: (dir.y + rr(-0.5, 0.5)) * rr(200, 480), g: 300, drag: 2.2, life: rr(0.4, 0.8), max: 0.8, size: rr(14, 26), color: pick(['#ffd34d', '#ffffff', '#ffa31a']) });
    FX.uiMode = false;
  },
  update(t, dt) {
    if (!this.active) return;
    const T = t - this.t0, X = this.exiting ? t - this.exitT : -1;
    const pr = (s, d) => clamp((T - s) / d, 0, 1);
    const ex = (s, d) => (X < 0 ? 0 : clamp((X - s) / d, 0, 1));
    const out = 1 - ex(0, 0.25);
    // sun burst + rays
    const rIn = Ease.outCubic(pr(0, 0.9)), rOut = 1 - ex(0.15, 0.45);
    this.rays.style.opacity = (rIn * rOut * 0.5).toFixed(3);
    this.rays.style.transform = `translate(-50%,-50%) rotate(${((t * 6) % 360).toFixed(2)}deg)`;
    this.glow.style.opacity = (rIn * rOut * (0.6 + 0.12 * Math.sin(t * 1.7))).toFixed(3);
    this.glow.style.transform = `translate(-50%,-50%) scale(${(1 + 0.06 * Math.sin(t * 1.3)).toFixed(3)})`;
    // cannon: slides in, recoils on every shot, idles with a breath
    this.kick = Math.max(0, this.kick - dt * 3.2);
    const ck = Math.sin(this.kick * Math.PI), cIn = Ease.outBack(pr(0.3, 0.75)), cOut = Ease.inBack(ex(0.08, 0.5));
    const cdx = -560 * (1 - cIn) - 760 * cOut - 16 * ck * 0.6, cdy = 16 * ck * 0.8, breathe = 1 + Math.sin(t * 2.4) * 0.008;
    this.set(this.cannon, cdx, cdy, -2.5 * ck, breathe, pr(0.3, 0.2));
    const gtr = `translate(${cdx.toFixed(1)}px,${cdy.toFixed(1)}px)`, cOp = pr(0.3, 0.2);
    this.cSh.style.transform = this.cGold.style.transform = this.cGlow.style.transform = gtr;
    this.cSh.style.opacity = cOp.toFixed(3);
    this.cGold.style.opacity = (cOp * Ease.outCubic(pr(1.0, 0.5)) * (0.82 + 0.18 * Math.sin(t * 2.2))).toFixed(3);
    this.cGlow.style.opacity = Math.min(1, cOp * (0.75 + 0.2 * Math.sin(t * 2.6)) + 0.3 * ck).toFixed(3);
    if (!this.cLanded && pr(0.3, 0.75) >= 1) { this.cLanded = true; this.titleDust(true); }
    const fireGlow = 1 + 0.18 * Math.max(0, Math.sin(t * 3.2));
    this.set(this.fire, cdx, cdy, -2.5 * ck, breathe * (1 + 0.03 * Math.sin(t * 3.2)), pr(0.3, 0.2));
    this.fire.style.filter = `brightness(${fireGlow.toFixed(3)}) drop-shadow(0 0 ${(6 + 10 * (fireGlow - 1) / 0.18).toFixed(1)}px rgba(255,90,40,.7))`;
    // balls: shot from the cannon into two arcs, then bob in a travelling wave
    const wavePhase = ((T - 3.2) / 2.6) % 1 * 11 - 1.5;
    for (const b of this.balls) {
      const L = b.o < 4 ? 0.95 + b.o * 0.17 : 1.7 + (b.o - 4) * 0.17, dur = b.o < 4 ? 0.5 : 0.78;
      const k = pr(L, dur), e = Ease.outCubic(k), m = TL.muzzle;
      if (k > 0 && !this.fired.has(b.o)) { this.fired.add(b.o); this.kick = 1; this.muzzleFx(b.o === 0); if (Sound.ctx) { Sound.pop(1.1); } }
      let x, y, rot, sc;
      if (k < 1) {
        const cx = b.o < 4 ? (m.x + b.x) / 2 : (m.x + b.x) / 2, cy = b.o < 4 ? Math.min(m.y, b.y) - 170 : -170;
        x = bez(m.x, cx, b.x, e); y = bez(m.y, cy, b.y, e); rot = (1 - e) * 540 * (b.o % 2 ? 1 : -1); sc = 0.35 + 0.65 * e;
        if (k > 0 && Math.random() < 0.9) { FX.uiMode = true; FX.trail(x, y, pick(['#ffd34d', '#fff1a8', '#ffffff'])); FX.uiMode = false; }
      } else {
        const w = Math.exp(-Math.pow(wavePhase - b.o, 2) / 0.6);
        x = b.x + Math.sin(t * 1.9 + b.o * 0.8) * 4; y = b.y + Math.sin(t * 2.3 + b.o * 0.7) * 7 - w * 16;
        rot = Math.sin(t * 1.6 + b.o) * 6; sc = 1 + w * 0.12 + Math.sin(t * 2.8 + b.o) * 0.015;
      }
      const d = { x: b.x - 836, y: b.y - 470 }, dl = Math.hypot(d.x, d.y) || 1, eo = Ease.inCubic(ex(0.04 + b.o * 0.02, 0.5));
      this.set(b.el, x - b.x + (d.x / dl) * 1100 * eo, y - b.y + (d.y / dl) * 1100 * eo, rot + eo * 400, sc, k > 0 ? 1 : 0);
      if (k >= 1 && !b.landed) { b.landed = true; FX.uiMode = true; FX.burst(b.x, b.y, '#fff3b0', 10, 220, { g: 0 }); FX.uiMode = false; }
    }
    // logo: bounces down from the sky, floats, flashes now and then
    const lIn = Ease.outBounce(pr(0.12, 1.0)), lOut = Ease.inBack(ex(0.04, 0.55));
    const flash = Math.max(0, Math.sin(clamp(((T - 3) % 4.5) / 0.5, 0, 1) * Math.PI));
    this.set(this.logo, 0, -560 * (1 - lIn) - 760 * lOut + Math.sin(t * 1.6) * 7, Math.sin(t * 1.1) * 1.3 - 8 * lOut, 1 + Math.sin(t * 2.2) * 0.012, pr(0.12, 0.15));
    this.logo.style.filter = flash > 0.01 ? `brightness(${(1 + flash * 0.22).toFixed(3)}) drop-shadow(0 0 ${(flash * 16).toFixed(1)}px rgba(255,236,150,.9))` : '';
    if (T > 3 && Math.random() < dt * 0.9) { FX.uiMode = true; FX.add({ k: 'spark', x: TL.logo.x + rr(-250, 250), y: TL.logo.y + rr(-130, 90), vx: 0, vy: -20, g: 0, drag: 1, life: 0.7, max: 0.7, size: rr(18, 34), color: '#fff6c2' }); FX.uiMode = false; }
    // cage: swings in, then x keeps trying to break out (rattle + action lines)
    const gIn = pr(0.5, 1.1), sway = gIn < 1 ? 22 * Math.exp(-4 * gIn) * Math.cos(gIn * 14) : 0;
    const rt = (T - 2.2) % 2.6, rat = T > 2.2 && rt < 0.6 ? 1 - rt / 0.6 : 0;
    const gOut = Ease.inBack(ex(0.06, 0.55));
    const gdx = Math.sin(rt * 38) * 6 * rat + 700 * gOut, gdy = -480 * (1 - Ease.outCubic(Math.min(1, gIn * 1.6))) - 520 * gOut;
    this.set(this.cage, gdx, gdy, sway + Math.sin(rt * 46) * 6 * rat + 25 * gOut, 1, pr(0.5, 0.15));
    const lp = rat > 0 ? Math.sin((1 - rat) * Math.PI) : 0;
    this.set(this.lines, gdx * 0.6 + lp * 6, gdy, 0, 0.85 + lp * 0.3, pr(1.4, 0.3) * (0.45 + 0.55 * lp) * out);
    // sparkles
    this.sparks.forEach((s, j) => {
      const k = Ease.outBack(pr(2.1 + j * 0.15, 0.5));
      this.set(s.el, 0, 0, t * 40 + j * 40, k * (0.7 + 0.4 * Math.abs(Math.sin(t * 2.3 + j * 1.7))), Math.min(1, k) * out);
    });
    // play button: pops in last, breathes, reacts to hover/press
    this.press = Math.max(0, this.press - dt * 4);
    const pIn = pr(2.55, 0.9), pk = Ease.outElastic(pIn);
    const pX = ex(0, 0.12), pBoom = ex(0.12, 0.25);
    const psc = pk * (1 + 0.03 * Math.sin(t * 3.4) + (this.hover ? 0.07 : 0) - this.press * 0.12) * (1 - 0.15 * pX + 0.5 * pBoom);
    this.set(this.play, 0, 0, -120 * (1 - Math.min(1, pIn * 1.4)), Math.max(0.001, psc), Math.min(1, pIn * 3) * (1 - pBoom));
    const gl = 7 + 7 * (0.5 + 0.5 * Math.sin(t * 3.4));
    this.play.style.filter = `drop-shadow(0 6px 10px rgba(80,20,0,.35)) drop-shadow(0 0 ${gl.toFixed(1)}px rgba(255,214,90,.85)) brightness(${this.hover ? 1.08 : 1})`;
    if (pIn > 0.25) this.play.classList.add('live');
    // the cannon keeps firing little celebration shots while waiting
    if (!this.exiting && T > this.nextFire) { this.nextFire = T + 4.6; this.kick = 1; this.muzzleFx(false); this.titleDust(false); }
    if (this.exiting && X > 0.9) { this.active = false; this.box.classList.add('gone'); }
  },
  exit() {
    this.exiting = true; this.exitT = Clock.t; this.play.classList.remove('live');
    this.kick = 1; this.muzzleFx(true);
    FX.uiMode = true;
    FX.burst(TL.play.x, TL.play.y, '#ffd34d', 50, 600, { g: 0 }); FX.burst(TL.play.x, TL.play.y, '#ffffff', 24, 440, { g: 0 }); FX.ring(TL.play.x, TL.play.y, '#fff3c4', 200);
    FX.uiMode = false;
    Sound.boom(); Sound.whoosh(0.7); Stage.shake(0.35);
    return wait(0.62);
  },
};
