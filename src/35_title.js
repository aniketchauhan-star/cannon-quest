
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
//  the boards, a glint of light runs over their gold now and then (Title.glint), and only x moves: in a loop it
//  peeks through the bars, shoves the left bars, shoves the right bars, jumps at the roof and rattles the bars
//  (one GSAP timeline), with sparks where it hits. The cage does not budge.
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
  active: false, exiting: false, t0: 0, hover: false, press: 0, kick: 0, handlers: [], tl: null, landed: 0, cLanded: false,
  // springs for the arrivals only (each settles by itself, then the piece stands still): the cannon's last rock
  // after it drops back flat, the cage's rock as it settles (degrees; it tips onto the edge it leans to) and its
  // squash on touch-down, and x's squash. cg.shake (0..1) = x rattling the bars (only x shakes)
  cRock: new Spring(4.5, 0.42), rock: new Spring(2.6, 0.38), squash: new Spring(5, 0.4), xsq: new Spring(5, 0.3),
  cg: { shake: 0 }, xs: { x: 0, y: 0, r: 0, sx: 1, sy: 1 },
  // the entrance: [start, length] in s after the start screen shows. One after another (the user, 20 Nov: "the text
  // come and cannon and the cage come"), so each lands on its own beat and its sound is heard on its own
  IN: { logo: [0.2, 0.85], cannon: [0.7, 0.66], cage: [1.15, 0.68], play: [1.95, 0.6], escape: 3.1, glint: 3.3 },
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
    // the cage, one group: its whole picture (behind x), x's shadow on the floor, x, its front bars, the glint
    const g = (this.cage = document.createElement('div')); g.className = 'tp tgrp tcage'; box.insertBefore(g, this.play);
    place(g, cg.x, cg.y, cg.w, cg.h); g.style.transformOrigin = `50% ${TL.cageFoot.pivot * 100}%`;
    place(img('t_cage.webp', '', g), 0, 0, cg.w, cg.h);
    const X = TL.x;
    this.xShadow = document.createElement('i'); this.xShadow.className = 'xsh'; g.appendChild(this.xShadow);
    place(this.xShadow, X.x + X.w * 0.14, X.y + X.h - 18, X.w * 0.72, 22);
    this.x = img('t_x.webp', 'tx', g); place(this.x, X.x, X.y, X.w, X.h);
    place(img('t_cage_front.webp', '', g), 0, 0, cg.w, cg.h);
    this.gGlint = glint(g, 't_cage_glint.webp', cg.w, cg.h);
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
  // x tries to get out: one looping timeline (~10 s). Only x moves: the cage stands firm on the deck, and where x
  // hits the bars or the roof, sparks fly and the metal rings (the callbacks)
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
    // 4. a jump at the roof: crouch, spring up, bonk, fall, land on the cage floor
      .to(X, { sx: 1.12, sy: 0.82, duration: 0.32, ease: 'power2.out' }, '+=0.45')
      .to(X, { y: -U * 1.6, sx: 0.92, sy: 1.1, duration: 0.18, ease: 'power2.out' })
      .addLabel('bonk')
      .call(() => this.bonk(), null, 'bonk')
      .to(X, { y: 0, sx: 1, sy: 1, duration: 0.26, ease: 'power2.in' }, 'bonk+=0.04')
      .call(() => this.thud(), null, 'bonk+=0.3')
    // 5. it grabs the bars and rattles them (x shakes; the bars hold)
      .to(C, { shake: 1, duration: 0.15, ease: 'power1.out' }, '+=0.45')
      .to(C, { shake: 0, duration: 0.3, ease: 'power1.in' }, '+=0.75')
    // 6. a sigh, a rest, and it tries again
      .to(X, { sy: 0.94, sx: 1.03, duration: 0.55, ease: 'sine.inOut' }, '+=0.15')
      .to(X, { sy: 1, sx: 1, duration: 0.7, ease: 'sine.inOut' })
      .to({}, { duration: 1.1 });
    return tl;
  },
  at(fx, fy) { const cg = TL.cage; return { x: cg.x + fx, y: cg.y + fy }; }, // a point of the cage, in art space
  bump(side) { // x hits the side bars: sparks at the bars, the metal rings
    const p = this.at(side < 0 ? TL.bars.l : TL.bars.r, TL.x.y + TL.x.h * 0.45);
    FX.uiMode = true; FX.burst(p.x, p.y, '#ffd34d', 9, 260, { g: 300, dir: side < 0 ? Math.PI : 0, spread: 1.1, size: 0.6 }); FX.uiMode = false;
    if (Sound.live()) Sound.rattle();
  },
  bonk() { // x's head hits the top ring
    const p = this.at(TL.cage.w / 2, TL.bars.top);
    FX.uiMode = true; FX.burst(p.x, p.y, '#ffd34d', 8, 220, { g: 300, dir: -Math.PI / 2, spread: 1.2, size: 0.6 }); FX.uiMode = false;
    if (Sound.live()) Sound.clunk();
  },
  thud() { // x lands back on the cage floor: it squashes
    this.xsq.kick(0.08);
    if (Sound.live()) Sound.land();
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
    if (this.landed === 0 && gs >= G.fall) { this.landed = 1; if (!R) { this.cageDust(true); this.squash.kick(0.035); this.xsq.kick(0.1); this.rock.kick(1.3); } }
    if (this.landed === 1 && gs >= G.fall + 2 * G.up) { this.landed = 2; if (!R) { this.cageDust(false); this.squash.kick(0.015); this.xsq.kick(0.05); } }
    const rock = this.rock.update(dt), sq = this.squash.update(dt), xsq = this.xsq.update(dt);
    const rot = rock + 6 * gOut;
    const tip = -TL.cage.w * 0.5 * Math.abs(Math.sin(rot * D2R)); // it tips on its edge: the low side stays on the deck
    const gdx = 760 * gOut, gy = up - 120 * gOut;
    this.cage.style.transform = `translate(${gdx.toFixed(1)}px,${(gy + tip).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 + 0.6 * sq).toFixed(4)},${(1 - sq).toFixed(4)})`;
    this.cage.style.opacity = clamp(gs / 0.08, 0, 1).toFixed(3);
    const air = clamp(-gy / 160, 0, 1); // its shadow shrinks and fades while it is up in the air
    this.set(this.gSh, gdx, 0, 0, 1 - 0.5 * air, clamp(gs / 0.15, 0, 1) * (1 - 0.7 * air) * (1 - gOut));
    // x inside: its pose from the timeline, a slow breath, the rattle, and a squash on each landing
    const sh = this.cg.shake, w7 = R ? 0 : Math.sin(tt * Math.PI * 2 * 7), w7b = R ? 0 : Math.sin(tt * Math.PI * 2 * 7 + 1.3);
    const xb = 1 + (R ? 0 : Math.sin(tt * 2.6) * 0.018), xs = this.xs;
    this.set(this.x, xs.x + sh * 3 * w7b, xs.y, xs.r + sh * 7 * w7, xb * xs.sy * (1 - xsq), 1, (xs.sx * (1 + 0.7 * xsq)) / (xs.sy * (1 - xsq)));
    const xUp = clamp(-xs.y / 30, 0, 1); // its shadow on the cage floor
    this.set(this.xShadow, xs.x, 0, 0, 1 - 0.35 * xUp, 0.9 - 0.5 * xUp);
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
