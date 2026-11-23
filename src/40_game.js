
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
  b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); Stage.hit({ trauma: 0.08, ky: 3 }); };
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
  let p = null, inL = null, inR = null, ms = null, tg = null;
  // 1) aim: the loaded socket glows while the camera leans in on the cannon (for a second ball, from the equation it was reading)
  tl.call(() => { Cannon.highlight(i, true); Sound.tick(); b.land = 1; }, null, t0);
  if (first) camDrive(tl, t0 + 0.1, SHOT_CAM.WIND, B.AIM + B.LOAD * 0.5, Ease.inOutQuad);
  else camDrive(tl, t0, SHOT_CAM.WIND, B.AIM + 0.3, Ease.inOutCubic);
  // 2) load: the ball sinks into the barrel and the cannon squats (anticipation)
  const tlo = t0 + B.AIM;
  tl.call(() => { b.where = 'loading'; flyBall(b, B.LOAD, 24); Sound.charge(); }, null, tlo);
  drive(B.LOAD, (e) => (Cannon.antic = e), Ease.inOutQuad, tl, tlo);
  const tf = tlo + B.LOAD; // 3) FIRE
  tl.call(() => {
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.shoot(); Sound.boom(); Music.punch(); Haptic.buzz(25); Cannon.groundDust(true);
    Stage.hit({ trauma: 0.42, ky: 14, zoom: 0.03 }); // the screen wiggle: a rounded shake + recoil kick + zoom punch
    // the blast: white-hot flash, fireball, shock ring, embers, and thick smoke that lingers and drifts
    // (the ball flies above all of it)
    FX.blast(MUZZLE.x, MUZZLE.y, -Math.PI / 2, 1);
    p = makeFlyBall(b, 0.66); Sound.whistle();
  }, null, tf);
  camDrive(tl, tf + 0.05, SHOT_CAM.FOLLOW, B.FLIGHT + 0.1, Ease.inOutQuad); // the camera follows the ball up to the cloud
  // the ball leaves the barrel fast and slows as it climbs (like a real throw), turning once, so its label lands upright
  drive(B.FLIGHT, (e) => {
    if (!p) return;
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r = 360 * e; p.s = 0.66 - 0.14 * e; p.apply();
    FX.trail(p.x, p.y + 30, b.hex); if (Math.random() < 0.6) FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.outQuad, tl, tf);
  const th = tf + B.FLIGHT; // 4) the hit: the term splits in two, and one copy flies to EACH side ("x + 5 − 5 = 7 − 5")
  camDrive(tl, th + 0.1, SHOT_CAM.READ, B.SPLIT + B.READ, Ease.inOutQuad); // a slow push-in through the reading beat
  tl.call(() => {
    if (p) p.el.remove(); p = null;
    FX.burst(to.x, to.y, b.hex, 40, 460); FX.burst(to.x, to.y, '#ffffff', 16, 320); FX.ring(to.x, to.y, '#ffffff', 170);
    Sound.pop(1.5);
    Stage.hit({ trauma: 0.16, ky: -6, zoom: 0.015 }); Cloud.squash(); // impact: a soft jolt and the cloud squashes (no freeze-frame: it reads as lag)
    [inL, inR] = EqUI.showImpact(eq0, b.op, b.ink);
    tg = [inL, inR].map((el) => (el ? EqUI.worldAt(el) : { ...to }));
    ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
    ms.forEach((m) => { m.x = to.x; m.y = to.y; m.apply(); });
  }, null, th);
  drive(B.SPLIT, (e) => {
    if (!ms) return;
    ms.forEach((m, j) => { // the copies stay upright (only a slight lean), so "−5" can be read on its way to each side
      m.x = bez(to.x, (to.x + tg[j].x) / 2, tg[j].x, e); m.y = bez(to.y, Math.min(to.y, tg[j].y) - 100, tg[j].y, e);
      m.s = 0.5 - 0.22 * e; m.r = (j ? 10 : -10) * Math.sin(e * Math.PI); m.apply();
      if (Math.random() < 0.5) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic, tl, th);
  const tl2 = th + B.SPLIT; // the copies land and become terms
  tl.call(() => {
    if (ms) ms.forEach((m) => m.el.remove()); ms = null;
    [inL, inR].forEach((el, j) => { if (el) { el.classList.remove('hid'); el.classList.add('pop'); } FX.burst(tg[j].x, tg[j].y, b.hex, 18, 260); });
    Sound.ding(0); Sound.ding(2); Stage.hit({ ky: 2 });
  }, null, tl2);
  const tp = tl2 + B.READ; // 5) after a reading beat, the terms that combine light up together…
  tl.call(() => { EqUI.pair(eq1); Sound.tick(); }, null, tp);
  const tv = tp + B.PAIR; // …the ones that cancel fade away…
  tl.call(() => { EqUI.vanish(eq1); Sound.sparkle(); }, null, tv);
  const ts = tv + B.CANCEL; // …and the simplified equation glides together
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  return ts + B.SETTLE + B.READ2; // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes: no "wrong" label, no hints, no retry; both outcomes advance ----
function addFreed(tl, t0) {
  const B = Motion.BEAT;
  let cage = null, img = null, p = null, q = null, s0 = 1, fl = null;
  // 1) the cage glows… and unlocks
  tl.call(() => { cage = EqUI.cage(); img = cage && cage.querySelector('img'); if (cage) cage.classList.add('glowx'); Sound.ding(1); }, null, t0);
  // the camera pushes in on the cage (framing x and its value together)
  camDrive(tl, t0, () => { const c = EqUI.cage(), w = c ? EqUI.worldAt(c) : { x: 700, y: 200 }; return { fx: (w.x + CLOUD_MID.x) / 2, fy: w.y + 60, z: 1.18 }; }, 0.9, Ease.inOutCubic);
  tl.call(() => Sound.unlock(), null, t0 + B.UNLOCK * 0.7);
  // 2) the cage bursts open; the free x stays on the card so it reads "x = 2"
  const tb = t0 + B.UNLOCK;
  tl.call(() => {
    p = img ? EqUI.worldAt(img) : { x: 700, y: 170 };
    if (img) { img.src = IMG + 'xchar.webp'; cage.classList.remove('glowx'); cage.classList.add('free'); }
    EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.creak(); Sound.spring(); Sound.fanfare(); flashScreen();
    FX.burst(p.x, p.y, '#ffd34d', 46, 560); FX.burst(p.x, p.y, '#c58bff', 40, 480); FX.ring(p.x, p.y, '#ffffff', 200);
    FX.confetti(p.x, p.y, 140, 1000);
    // the big moment: a shake and a zoom punch (no freeze-frame or slow-mo: on screen they read as lag)
    Stage.hit({ trauma: 0.28, zoom: 0.025 }); Haptic.buzz([15, 30, 15]);
  }, null, tb);
  tl.call(() => react('freed'), null, tb + 0.3); // just after the burst's first hit, over the "x = 2" reading beat
  camDrive(tl, tb + 0.3, { z: 1.15 }, 1.4, Ease.inOutQuad); // eases back a touch while "x = 2" is read
  // 3) after a reading beat (the value of x), x does a happy hop… and vanishes in a poof of sparkles
  const th = tb + B.HOLD; // “x = 2” rests on the card, pulsing gently
  tl.call(() => {
    q = img ? EqUI.worldAt(img) : p;
    s0 = img ? img.getBoundingClientRect().height / (Stage.S * Stage.z) / 115 : 1; // (.xfly is 115 tall: the flying x starts at the exact size of the one on the card)
    fl = document.createElement('div'); fl.className = 'xfly'; fl.innerHTML = `<img src="${IMG}xchar.webp" alt="">`;
    fl.style.willChange = 'transform,opacity';
    $('#fly').appendChild(fl);
    if (img) img.style.visibility = 'hidden';
    EqUI.el.classList.add('fadeout');
    Sound.spring();
  }, null, th);
  const put = (x, y, r, s, o) => { if (!fl) return; fl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`; fl.style.opacity = o.toFixed(3); };
  drive(B.HOP, (e) => put(q.x, q.y - 70 * e, 8 * Math.sin(e * Math.PI), s0 * (1 + 0.18 * e), 1), Ease.outQuad, tl, th);
  tl.call(() => Sound.sparkle(), null, th + B.HOP);
  drive(B.POOF, (e) => {
    put(q.x, q.y - 70 - 12 * e, 8 + 200 * e, s0 * 1.18 * (1 - e), 1 - e * 0.6);
    if (fl && Math.random() < 0.9) FX.trail(q.x + rr(-30, 30), q.y - 70 + rr(-30, 30), pick(['#d4b0ff', '#fff1a8', '#ffffff']));
  }, Ease.inCubic, tl, th + B.HOP);
  // 4) the cloud clears; the next round brings in a new cloud
  const tp = th + B.HOP + B.POOF;
  tl.call(() => {
    if (q) { FX.burst(q.x, q.y - 80, '#d4b0ff', 34, 340, { g: 0 }); FX.burst(q.x, q.y - 80, '#ffffff', 18, 240, { g: 0 }); FX.ring(q.x, q.y - 80, '#ffffff', 110); }
    Sound.pop(1.6);
    if (fl) fl.remove(); fl = null;
  }, null, tp);
  camDrive(tl, tp, { fx: CX, fy: CY, z: 1 }, B.CLEAR + 0.1); // back to the base framing as the cloud clears
  Cloud.clearTL(tl, tp);
  tl.to({}, { duration: B.BREATH }, tp + B.CLEAR); // a breath before the next round
}
function addStuck(tl, t0) {
  const B = Motion.BEAT, tr = t0 + 0.6;
  camDrive(tl, t0, { fx: CX, fy: 330, z: 1.08 }, 0.8, Ease.inOutCubic); // the camera holds on the cloud
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.3, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  tl.call(() => react('stuck'), null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => EqUI.el.classList.remove('wob'), null, tr + B.RATTLE);
  const tg = tr + B.RATTLE + 0.3; // a beat to see it is still caged, then the cloud sails away
  Cloud.leaveTL(tl, tg);
  camDrive(tl, tg, { fx: CX, fy: CY, z: 1 }, B.LEAVE); // back to the base framing as the cloud floats away
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
  // 1) the equation, 2) the cannon, 3) the orbs: one at a time, everything else dimmed and blurred
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
  else { // the camera glances toward the cloud coming in from the right, then settles with it
    tasks.push(Cloud.enter());
    tasks.push(Stage.camTo({ fx: CX + 50 }, 0.4, Ease.inOutQuad).then(() => Stage.camTo({ fx: CX }, 0.75, Ease.inOutCubic)));
  }
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
async function showEnd() {
  G.state = 'end';
  EqUI.render(msgHTML(T('endFreed'), T('endScore', { freed: G.freed, total: ROUNDS.length })), false);
  QCard.label('qScore'); // the label on the cloud now reads "Your score"
  refreshBalls([]); G.rackFor = null;
  Stage.camTo({ fx: CX, fy: 300, z: 1.05 }, Motion.BEAT.CLOUD_IN, Ease.inOutCubic); // the end card is framed a little closer
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
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; Drag.cancel(); Spot.hide();
  $('#endUI').classList.remove('on');
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.parts = [];
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset();
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
  GAME: ['cloud', 'cannon1', 'cannon2', 'cannon1_front', 'cannon2_front', 'rack', 'rack_front', 'fire', 'fire2', 'cage_x', 'xchar', 'hand', 'pause', 'play', 'sound', 'question_board',
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
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Drag, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX, Pics };
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
  const sfx = document.createElement('script'); sfx.src = 'js/sfx.js'; document.body.appendChild(sfx); // (it hands itself to Sound.loadSfx)
}
boot();
