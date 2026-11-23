
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
  b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); FX.star(p.x, p.y, '#fff1a8', 110, 0.24, { n: 6 }); Stage.hit({ trauma: 0.08, ky: 3 }); };
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
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  tl.call(() => {
    EqUI.el.querySelectorAll('.tk.pop').forEach((e) => { const w = EqUI.worldAt(e); FX.star(w.x, w.y, '#ffd84a', 80, 0.45, { n: 4, paint: true }); });
  }, null, ts + B.SETTLE * 0.7);
  return ts + B.SETTLE + B.READ2; // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes: no "wrong" label, no hints, no retry; both outcomes advance ----
// x freed (the user, 23 Nov: "the cage is burst, like cage broken, and then x comes out… x = something, and after 5
// seconds the cloud fades and bursts"; later that day: "extreme… cage crack, and x come out from that… slow
// animation of cage crack and x come out… cloudburst after x compose"). One cinematic beat after another:
// 1) the screen's edges darken and the camera closes in on the cage (centred on the cloud, so the cloud never slides
//    sideways), with a low rumble; 2) x pushes on its bars three times and each push cracks the cage further: glowing
//    cracks run over its gold, light leaks through them and rays wake behind it (CageBreak); it trembles; 3) it bursts
//    along its cracks in a flash: shards tumble away, rings of light, sparks; 4) x rises out of the light, hovers with
//    sparkles circling it and lands where the cage stood; "= 2" lights up, with the fanfare and confetti from both
//    sides; 5) "x = 2" rests on the cloud for 5 s (twinkles, a halo of rays behind x); 6) the cloudburst
//    (Cloud.burstTL). The camera eases back to the base framing only once the cloud has burst.
function addFreed(tl, t0) {
  const B = Motion.BEAT, tc = t0 + B.FOCUS * 0.45, tb = tc + B.CRACK;
  let p = null;
  // 1) focus: the cage starts to glow (its rays, cracks and the free x are laid in, hidden), the edges darken, a rumble
  tl.call(() => { const c = EqUI.cage(); CageBreak.prep(c); if (c) c.classList.add('glowx'); Vignette.to(0.65, B.FOCUS); Sound.rumble(); }, null, t0);
  // (under reduced motion the camera cuts instead of moving, so it only goes as close as before: 1.18)
  camDrive(tl, t0, () => { const c = EqUI.cage(), w = c ? EqUI.worldAt(c) : { y: 200 }; return { fx: CLOUD_MID.x, fy: w.y + 30, z: Motion.reduced ? 1.18 : 1.68 }; }, B.FOCUS + 0.3, Ease.inOutCubic);
  camDrive(tl, t0 + B.FOCUS + 0.3, () => ({ z: Motion.reduced ? 1.18 : 1.78 }), tb - (t0 + B.FOCUS + 0.3), Ease.inOutQuad); // a slow creep in while it cracks (the tension)
  // 2) three pushes, each cracking it further (CageBreak.strain draws it all from the time: bulges, cracks, light)
  drive(B.CRACK, (e, k) => CageBreak.strain(k * B.CRACK), Ease.linear, tl, tc);
  CAGE.push.forEach((s, i) => tl.call(() => CageBreak.push(i), null, tc + s));
  // 3) it bursts along its cracks: the shards fly (on the FX canvas, by themselves), a flash (the edges light up
  // again), a starburst, rings of gold and light, sparks of gold, purple and white, glitter. The big moment: a shake
  // and a zoom punch (no freeze-frame or slow-mo: on screen they read as lag)
  tl.call(() => {
    const c = EqUI.cage(); p = c ? EqUI.worldAt(c) : { x: CLOUD_MID.x, y: 170 };
    CageBreak.burst();
    Vignette.to(0, 0.7); flashScreen();
    Sound.shatter(); Sound.spring();
    FX.flash(p.x, p.y, 240, 0.22, '#fffaf0'); FX.star(p.x, p.y, '#fff3c0', 300, 0.3, { n: 9 });
    FX.ring(p.x, p.y, '#ffd84a', 260, { lw: 16, life: 0.55, paint: true }); FX.ring(p.x, p.y, '#ffffff', 430, { lw: 6, life: 0.8, delay: 0.05 });
    FX.burst(p.x, p.y, '#ffc21a', 34, 640, { paint: true, size: 0.8, white: 0.15 }); FX.burst(p.x, p.y, '#b36bff', 22, 520, { paint: true, size: 0.7, white: 0.1 });
    FX.burst(p.x, p.y, '#ffffff', 16, 460); FX.glitter(p.x, p.y, 26);
    Stage.hit({ trauma: 0.42, zoom: 0.04 }); Haptic.buzz([20, 40, 20]);
  }, null, tb);
  // 4) x rises out of the light, hovers (sparkles circle it), comes down and lands
  drive(B.RISE, (e, k) => CageBreak.rise(k), Ease.linear, tl, tb);
  tl.call(() => Sound.rise(), null, tb + 0.12);
  tl.call(() => CageBreak.orbit(), null, tb + B.RISE * CAGE.rise.up * 0.55);
  tl.call(() => CageBreak.landFx(), null, tb + B.RISE * CAGE.rise.drop);
  tl.call(() => react('freed'), null, tb + 0.3); // just after the burst, over the "x = 2" reading beat
  camDrive(tl, tb + 0.5, { z: 1.2 }, 1.6, Ease.inOutQuad); // eases back while x lands, so "x = 2" reads with its cloud
  // …"= 2" lights up beside it, with the fanfare, a starburst on the 2, and confetti from both sides of the cloud
  const tw = tb + B.RISE;
  tl.call(() => {
    EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.pop(1.25); Sound.fanfare();
    const r = EqUI.el.querySelector('[data-key="rhs"]'), q = r ? EqUI.worldAt(r) : p;
    if (q) { FX.star(q.x, q.y, '#ffc21a', 160, 0.45, { n: 8, paint: true }); FX.burst(q.x, q.y, '#ffd84a', 16, 320, { paint: true, size: 0.6, white: 0.3 }); }
    FX.confetti(CLOUD_MID.x - 300, CLOUD_MID.y + 110, 70, 1000, 0.45); FX.confetti(CLOUD_MID.x + 300, CLOUD_MID.y + 110, 70, 1000, -0.45);
  }, null, tw);
  // 5) "x = 2" rests on the cloud for 5 s; 6) then the cloudburst; once it has popped, the camera eases back
  drive(B.HOLD, (e, k) => CageBreak.hold(k), Ease.linear, tl, tw);
  const tp = Cloud.burstTL(tl, tw + B.HOLD);
  camDrive(tl, tp + 0.25, { fx: CX, fy: CY, z: 1 }, B.BURST, Ease.inOutCubic);
  tl.to({}, { duration: B.BREATH }, tp + B.BURST); // a breath before the next round
}
// x still caged ("not yet", never "wrong"): the cage rattles, sparks flying off its bars at each knock, the cloud rocks,
// then a gentler cloudburst (no shower)
function addStuck(tl, t0) {
  const B = Motion.BEAT, tr = t0 + 0.6;
  camDrive(tl, t0, { fx: CX, fy: 330, z: 1.08 }, 0.8, Ease.inOutCubic); // the camera holds on the cloud
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.3, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  for (let i = 0; i < 6; i++) tl.call(() => { // (the rattle's knocks: CSS .rattle, 0.16 s each)
    const c = EqUI.cage(); if (!c) return;
    const r = c.getBoundingClientRect(), w = Stage.s2w(i % 2 ? r.right - r.width * 0.12 : r.left + r.width * 0.12, r.top + r.height * rr(0.35, 0.7));
    FX.burst(w.x, w.y, '#ffc21a', 5, 200, { paint: true, size: 0.45, g: 700, dir: i % 2 ? -0.5 : -Math.PI + 0.5, spread: 0.8, white: 0.2 });
  }, null, tr + 0.08 + i * 0.16);
  tl.call(() => react('stuck'), null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => EqUI.el.classList.remove('wob'), null, tr + B.RATTLE);
  // a beat to see it is still caged, then the cloud bursts in place, gently (it no longer sails off to the left)
  const tp = Cloud.burstTL(tl, tr + B.RATTLE + 0.3, true);
  camDrive(tl, tp + 0.25, { fx: CX, fy: CY, z: 1 }, B.BURST, Ease.inOutCubic); // back to the base framing once it has popped
  tl.to({}, { duration: B.BREATH }, tp + B.BURST);
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
// (user, 20 Nov). Five steps: the spotlight shows the three parts in turn (1 the equation, 2 the cannon, 3 the
// orbs); 4 the hand taps the glowing −5 and the player taps it (or drags it, or presses its key): it flies into the
// cannon; 5 the hand moves to FIRE and the player taps it (or presses Enter), and the shot goes (user, 20 Nov: "the 5
// one is click fire button"; before, the cannon fired by itself). Every line by key; Skip ends it.
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
const fireSpot = () => Spot.boxOf($('#fireBtn'));
async function tutorialLoad() {
  G.taught1 = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  // 1) the equation, 2) the cannon, 3) the orbs: one at a time, everything else dimmed (not blurred: the equation
  // must stay readable in every step, user 23 Nov)
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
    // 5) it flies into the cannon; once it has landed in its socket, the spotlight moves to FIRE (the loaded socket
    // stays clear beside it) and the hand taps it. The −5 stays in now: only FIRE answers (it may be tapped at once)
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip || filled !== n || G.hooks.fireStep) return;
      G.hooks.fireStep = true; G.spotOnly = 'fire';
      wait(Motion.BEAT.TAP_FLY + 0.15).then(() => {
        if (G.tutSkip || !G.fireResolve) return; // (skipped, or FIRE already tapped)
        Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.3, pad: 20, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26 });
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
  else tasks.push(Cloud.enter()); // the next question's cloud gathers where the last one burst
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
// ---- fireworks over the end card: rockets climb from behind the deck with a trail of sparks and burst in the open
// sky either side of the score cloud (never over the white cloud, where light doesn't show), one after another ----
const Fireworks = {
  calls: [],
  SPOTS: [[330, 200], [1340, 185], [500, 110], [1180, 105], [240, 320], [1450, 300], [660, 70], [1010, 65]],
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
async function showEnd() {
  G.state = 'end';
  EqUI.render(msgHTML(T('endFreed'), T('endScore', { freed: G.freed, total: ROUNDS.length })), false);
  QCard.label('qScore'); // the label on the cloud now reads "Your score"
  refreshBalls([]); G.rackFor = null;
  Stage.camTo({ fx: CX, fy: 300, z: 1.05 }, Motion.BEAT.CLOUD_IN, Ease.inOutCubic); // the end card is framed a little closer
  await Cloud.enter();
  Sound.fanfare();
  if (G.freed) { FX.confetti(CLOUD_MID.x, CLOUD_MID.y + 40, 100 + G.freed * 30, 1100); Fireworks.show(2 + G.freed); } // (the more x freed, the more fireworks)
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
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.clear(); CageBreak.kill(); Fireworks.stop(); Vignette.to(0, 0);
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset(); CloudBurst.reset();
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
  GAME: ['cloud', 'cannon1', 'cannon2', 'cannon1_front', 'cannon2_front', 'rack', 'rack_front', 'fire', 'fire2', 'cage_x', 'cage_empty', 'xchar', 'hand', 'pause', 'play', 'sound', 'question_board',
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
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Drag, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX, Pics, CageBreak, CloudBurst, Fracture, Vignette, Fireworks };
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
  Pics.game.then(() => { CloudBurst.prepare(); CageBreak.load(); }); // (the cloud's burst pieces are cut while the browser is idle; the cage's fracture is worked out)
  const sfx = document.createElement('script'); sfx.src = 'js/sfx.js'; document.body.appendChild(sfx); // (it hands itself to Sound.loadSfx)
}
boot();
