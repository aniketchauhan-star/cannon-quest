
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
