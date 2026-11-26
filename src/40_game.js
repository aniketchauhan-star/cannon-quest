
// =====================================================================
//  GAME FLOW
// =====================================================================
const G = {
  state: 'boot', session: 0, idx: 0, freed: 0, eq: null, sockets: [], inputOn: false, fireResolve: null, hooks: {},
  taught1: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false, tl: null,
  welcome: null, said: { freed: 0, stuck: 0, next: 0 },
  results: [],          // per equation: 'ok' (x freed at the first try), 'ok2' (on the retry), 'miss' (the game showed how)
  celebrate: false,     // x is being freed: a tap anywhere skips to the next question
  orderShown: false,    // the 1 / 2 chips of the first two-socket round have been shown (once a visit)
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
let loadCount = 0; // (numbers the balls as they go in, so a new orb knows which loaded one went in last)
function seat(b, i, dur = Motion.BEAT.TAP_FLY, arc = 230) {
  G.sockets[i] = b; b.where = 'socket'; b.socket = i; b.loadN = ++loadCount;
  Rack.balls.forEach((x) => (x.guide = false));
  flyBall(b, dur, arc); Sound.pop(1); Sound.whoosh(0.35);
  b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); FX.star(p.x, p.y, '#fff1a8', 110, 0.24, { n: 6 }); Stage.hit({ trauma: 0.08, ky: 3 }); };
}
// a ball goes back to its cup in the tray (whoever calls this has already emptied its socket)
function unseat(b, dur = Motion.BEAT.TAP_FLY - 0.05, arc = 180) {
  b.where = 'rack'; b.socket = -1;
  flyBall(b, dur, arc); Sound.unload();
  b.onLand = () => Sound.settle();
}
// the socket whose ball went in last (−1: nothing loaded)
const lastLoaded = () => G.sockets.reduce((j, s, k) => (s && (j < 0 || s.loadN > G.sockets[j].loadN) ? k : j), -1);
function tapBall(b, tap = false) { // (tap: a press on the screen; false: a key)
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn || !b || b.where === 'gone' || b.where === 'loading' || b.drag) return;
  if (G.spotOnly && G.spotOnly !== b) { Sound.nope(); Spot.nudge(); return; } // guided step: only the highlighted ball
  idleReset();
  if (b.where === 'rack') {
    // every socket already loaded: the new orb takes the place of the one loaded last, which flies back to its cup
    // (the user, 25 Nov 2026: "if I click on other ops, they replace the loaded cannon ops automatically")
    let i = G.sockets.indexOf(null);
    if (i < 0) { i = lastLoaded(); if (i < 0) { Sound.nope(); return; } unseat(G.sockets[i]); }
    seat(b, i);
  } else if (b.where === 'socket') {
    G.sockets.splice(b.socket, 1); G.sockets.push(null);
    G.sockets.forEach((s, k) => { if (s && s.socket !== k) { s.socket = k; flyBall(s, 0.45, 40); } });
    unseat(b);
  }
  onSocketsChanged();
}

// ---- drag a ball into the cannon (or just tap it). A press that moves a few px becomes a drag: the ball lifts out
// of its cup and follows the finger above everything (the tray's lip, the cannon's ring, the tutorial's dim). Near
// the cannon the nearest empty socket glows, draws the ball in and the ball shrinks toward its size; let go there and
// it drops in and fills the hole. With every socket loaded, the nearest loaded one glows instead: let go there and the
// ball takes its place (its orb flies back to the tray). Let go anywhere else and it flies home. A press that doesn't move is a tap.
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
  // the socket it would drop into, once the ball is over the cannon (near any of its sockets): the nearest empty one,
  // or with every socket loaded, the nearest loaded one (the ball would take its place)
  aimAt(b) {
    const d = b.drag, holes = Cannon.holes(), CATCH = Math.max(130, holes[0].r * 3), full = G.sockets.every(Boolean);
    let near = Infinity, best = -1, bd = Infinity;
    holes.forEach((h, i) => {
      const q = Math.hypot(d.px - h.x, d.py - h.y); near = Math.min(near, q);
      if ((full || !G.sockets[i]) && q < bd) { bd = q; best = i; }
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
    const i = this.aim;
    this.release(b);
    if (i >= 0 && G.inputOn && !G.paused && i < G.sockets.length) {
      if (G.sockets[i]) unseat(G.sockets[i]); // (a loaded socket: its orb makes room)
      seat(b, i, 0.3, 14); onSocketsChanged(); return;
    }
    this.home(b);
  },
  // back to its cup (under the tray's lip again at once, so it lands into the tray)
  home(b) {
    $('#balls').appendChild(b.el); b.lifted = false;
    unseat(b, 0.5, 50);
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
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); Cannon.wiggleFire(); Cannon.tip(); return; }
  G.inputOn = false; Drag.cancel(); // (a ball still in hand goes home)
  const r = G.fireResolve; G.fireResolve = null; if (r) r();
}

// ---- one shot: cannon → cloud → two identical tokens land on both sides ----
function makeFlyBall(b, s) {
  const el = document.createElement('div'); el.className = 'ball'; el.style.pointerEvents = 'none';
  el.innerHTML = `<img src="${IMG}ball_${b.art}.webp" alt=""><b>${labelHTML(b.op)}</b>`;
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
function roundTimeline(opts = {}) {
  const tl = gsap.timeline({ paused: true });
  const balls = G.sockets.slice(), eqs = [G.eq];
  let solvedAt = -1;
  for (let i = 0; i < balls.length && solvedAt < 0; i++) {
    const nx = balls[i] ? shownAfter(applyOp(eqs[i], balls[i].op)) : eqs[i]; // (what the cloud reads after the shot)
    eqs.push(nx);
    if (balls[i] && isSolved(nx)) solvedAt = i;
  }
  let at = 0.15, first = true;
  for (let i = 0; i < eqs.length - 1; i++) if (balls[i]) { at = addShot(tl, at, i, balls[i], eqs[i], applyOp(eqs[i], balls[i].op), first, i === solvedAt); first = false; }
  const solved = solvedAt >= 0;
  if (solved) {
    const rest = balls.slice(solvedAt + 1).filter(Boolean); // x is already free: the other loaded balls fizzle
    if (rest.length) tl.call(() => rest.forEach(fizzle), null, at);
    addFreed(tl, at, opts);
  } else addStuck(tl, at, opts.stuckLine);
  return { tl, solved };
}
// one shot: cannon → cloud → two identical terms land on both sides → the equation simplifies. Returns its end time.
// The camera is directed beat by beat (docs/GAME_PROMPT.md §6.5 + §7.2): wind-up on the cannon → recoil kick and
// shake as it fires → it follows the ball up → impact (a soft jolt, no freeze-frame) → it holds on the equation for reading.
// Every step is its own beat from Motion.BEAT, with a pause to read between the steps. The pushes are gentle now, so
// the tray stays on screen (design review, 23 Nov 2026: "the camera pushes in and the tray drops off-screen at the
// bottom. Keep the tray anchored"): the view always reaches down past the orbs.
// eq1 is the equation right after the shot; when the shot added a number to a bracket, two more beats follow: the
// bracket is multiplied out, then the numbers are joined ("3(x + 2) − 6 = 15" → "3x + 6 − 6 = 15" → "3x = 15").
// last: the shot that frees x (no reading pause after it: the freeing starts as the equation settles)
const SHOT_CAM = { WIND: { fx: CX, fy: 455, z: 1.04 }, FOLLOW: { fx: CX, fy: 460, z: 1.03 }, READ: { fx: CX, fy: 455, z: 1.04 } };
function addShot(tl, t0, i, b, eq0, eq1, first = true, last = false) {
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
  const twinkle = () => EqUI.el.querySelectorAll('.tk.pop').forEach((e) => { const w = EqUI.worldAt(e); FX.star(w.x, w.y, '#ffd84a', 80, 0.45, { n: 4, paint: true }); });
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  tl.call(twinkle, null, ts + B.SETTLE * 0.7);
  let end = ts + B.SETTLE;
  const ex = expandStep(eq1);
  if (ex) { // the bracket: it lights up, is multiplied out ("3x + 6 − 6"), then its numbers are joined ("3x")
    const nf = normalize(eq1), t1 = end + B.READ * 0.6, t2 = t1 + B.PAIR, t3 = t2 + B.EXPAND + B.READ * 0.7, t4 = t3 + B.PAIR, t5 = t4 + B.CANCEL;
    tl.call(() => { EqUI.pair(ex); Sound.tick(); }, null, t1);
    tl.call(() => { EqUI.rewrite(ex); Sound.ding(1); }, null, t2);
    tl.call(twinkle, null, t2 + B.EXPAND * 0.6);
    tl.call(() => { EqUI.pair(nf); Sound.tick(); }, null, t3);
    tl.call(() => { EqUI.vanish(nf); Sound.sparkle(); }, null, t4);
    tl.call(() => { EqUI.settle(nf); G.eq = nf; }, null, t5);
    tl.call(twinkle, null, t5 + B.SETTLE * 0.7);
    end = t5 + B.SETTLE;
  }
  return end + (last ? 0 : B.READ2); // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes. x freed: the payoff happens on the deck (design review, 23 Nov 2026: "keep the caged X visible on
// deck during play as the cannon's target… the payoff (cage cracks open) happens in the world"; "shorten the
// correct-answer sequence to under 8 seconds, and let a tap skip the celebration"; the user then found it too fast,
// 25 Nov: "make it slow so that user can understand", so each beat is longer again, Motion.BEAT). Every stage of
// the user's cinematic break (23 Nov: "extreme… cage crack, and x come out from that… cloudburst"), each its own beat:
// 0) "x = 2" lights up on the cloud, grows and twinkles, and stays a moment to be read (BEAT.SOLVED);
// 1) a bolt of light flies from its x down to x's cage on the deck (the camera leans toward it, the edges darken a
//    little); 2) it strikes: x pushes three times and the cage cracks, light
//    leaking out (CageBreak); 3) it bursts along its cracks: shards, a flash, rings, sparks; 4) x rises out of the
//    light, hovers with sparkles circling it and lands where it stood, with the fanfare and confetti, and dances there
//    a moment (BEAT.CHEER); 5) it hops away to the right and off the screen, as the camera eases back to the whole
//    scene; 6) with x gone, the cloud has done its job: it draws in its breath and bursts in place; then a moment of
//    clear sky (BEAT.BREATH). Then playRound: the next question's cloud forms where this one was (the new equation,
//    with its orbs), and only then does a new cage drop onto the deck. One after another, never two at once (the
//    user, 25 Nov 2026: "the animation should come one by one").
// opts.shown: the game showed the way (no "you did it")
function addFreed(tl, t0, opts = {}) {
  const B = Motion.BEAT, tz = t0 + B.SOLVED, tc = tz + B.BOLT, tb = tc + B.CRACK, tland = tb + B.RISE, tgo = tland + B.CHEER;
  const cagePt = () => { const c = EqUI.cage(); return c ? EqUI.worldAt(c) : { x: DECK.x, y: DECK.foot - DECK.h / 2 }; };
  // 0) "x = 2" lights up (CSS .win: it grows with a gold glow) with a twinkle on each side, and is read
  tl.call(() => {
    G.celebrate = true;
    EqUI.el.querySelectorAll('[data-key="x"],[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.pop(1.25); Sound.chime();
    for (const k of ['x', 'rhs']) { const e = EqUI.el.querySelector(`[data-key="${k}"]`); if (e) { const w = EqUI.worldAt(e); FX.star(w.x, w.y, '#ffd84a', 110, 0.5, { n: 6, paint: true }); } }
  }, null, t0);
  // 1) the cage starts to glow and a bolt of light flies from the x on the cloud down to it
  tl.call(() => {
    const c = EqUI.cage(), xe = EqUI.xTerm();
    CageBreak.prep(c); if (c) c.classList.add('glowx');
    FX.bolt(xe ? EqUI.worldAt(xe) : { ...CLOUD_HIT }, cagePt(), B.BOLT); Sound.whistle();
    Vignette.to(0.4, B.BOLT + B.CRACK * 0.5);
  }, null, tz);
  camDrive(tl, tz - 0.2, { fx: 1040, fy: 440, z: Motion.reduced ? 1 : CAGE.zoom }, 0.2 + B.BOLT + B.CRACK, Ease.inOutCubic); // (the cloud and the tray stay in view; the cloud's top stays under the question board)
  // 2) it strikes the cage, and x pushes three times: it cracks further each time (the user's cracks, played at CAGE.T / CRACK)
  tl.call(() => { const w = cagePt(); FX.star(w.x, w.y, '#efe0ff', 220, 0.3, { n: 8 }); FX.burst(w.x, w.y, '#c58bff', 18, 380, { white: 0.3 }); Sound.rumble(); Stage.hit({ trauma: 0.16, zoom: 0.012 }); }, null, tc);
  drive(B.CRACK, (e, k) => CageBreak.strain(k * CAGE.T), Ease.linear, tl, tc);
  CAGE.push.forEach((sp, i) => tl.call(() => CageBreak.push(i), null, tc + (sp / CAGE.T) * B.CRACK));
  // 3) it bursts along its cracks: the shards fly, a flash, a starburst, rings of gold and light, sparks, glitter
  tl.call(() => {
    const p = cagePt();
    CageBreak.burst(); DeckCage.state = 'free';
    Vignette.to(0, 0.6); flashScreen();
    Sound.shatter(); Sound.spring();
    FX.flash(p.x, p.y, 240, 0.22, '#fffaf0'); FX.star(p.x, p.y, '#fff3c0', 300, 0.3, { n: 9 });
    FX.ring(p.x, p.y, '#ffd84a', 260, { lw: 16, life: 0.55, paint: true }); FX.ring(p.x, p.y, '#ffffff', 430, { lw: 6, life: 0.8, delay: 0.05 });
    FX.burst(p.x, p.y, '#ffc21a', 34, 640, { paint: true, size: 0.8, white: 0.15 }); FX.burst(p.x, p.y, '#b36bff', 22, 520, { paint: true, size: 0.7, white: 0.1 });
    FX.burst(p.x, p.y, '#ffffff', 16, 460); FX.glitter(p.x, p.y, 26);
    Stage.hit({ trauma: 0.38, zoom: 0.035 }); Haptic.buzz([20, 40, 20]);
  }, null, tb);
  // 4) x rises out of the light, hovers (sparkles circle it), comes down and lands: the fanfare, confetti
  drive(B.RISE, (e, k) => CageBreak.rise(k), Ease.linear, tl, tb);
  tl.call(() => Sound.rise(), null, tb + 0.1);
  tl.call(() => CageBreak.orbit(), null, tb + B.RISE * CAGE.rise.up * 0.55);
  tl.call(() => {
    CageBreak.landFx(); Sound.fanfare();
    const w = cagePt(); FX.confetti(w.x - 70, w.y + 50, 70, 950, -0.4); FX.confetti(w.x + 70, w.y + 50, 60, 900, 0.35);
  }, null, tb + B.RISE * CAGE.rise.drop);
  if (!opts.shown) tl.call(() => react('freed'), null, tb + 0.2);
  // 5) after its dance, x hops away to the right and off the screen, while the camera eases back to the whole scene
  const toff = DeckCage.leaveTL(tl, tgo);
  camDrive(tl, tgo - 0.1, { fx: CX, fy: CY, z: 1 }, B.HOP_OFF * 0.75, Ease.inOutCubic);
  // 6) only then, the cloudburst; and a moment of clear sky before the next question (playRound)
  const tp = Cloud.burstTL(tl, toff + 0.2);
  tl.call(() => { G.celebrate = false; }, null, tp + B.BURST);
  tl.to({}, { duration: 0.01 }, tp + B.BURST + B.BREATH);
}
// x still caged ("not yet", never "wrong"): the cage on the deck rattles, sparks flying off its bars at each knock, the
// cloud rocks. The cloud stays: the same question comes back for a retry, or for the game to show the way (playRound)
function addStuck(tl, t0, line = 'voStuck1') {
  const B = Motion.BEAT, tr = t0 + 0.35;
  camDrive(tl, t0, { fx: CX + 70, fy: CY, z: 1.02 }, 0.6, Ease.inOutCubic); // (the cloud and the cage both in view)
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.28, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  for (let i = 0; i < 6; i++) tl.call(() => { // (the rattle's knocks: CSS .rattle, 0.16 s each)
    const c = EqUI.cage(); if (!c) return;
    const r = c.getBoundingClientRect(), w = Stage.s2w(i % 2 ? r.right - r.width * 0.12 : r.left + r.width * 0.12, r.top + r.height * rr(0.35, 0.7));
    FX.burst(w.x, w.y, '#ffc21a', 5, 200, { paint: true, size: 0.45, g: 700, dir: i % 2 ? -0.5 : -Math.PI + 0.5, spread: 0.8, white: 0.2 });
  }, null, tr + 0.08 + i * 0.16);
  tl.call(() => { if (!Motion.skipping) VO.say(line, 0.2); }, null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => { EqUI.el.classList.remove('wob'); const c = EqUI.cage(); if (c) c.classList.remove('rattle'); }, null, tr + B.RATTLE);
  camDrive(tl, tr + B.RATTLE - 0.2, { fx: CX, fy: CY, z: 1 }, 0.5, Ease.inOutCubic);
  tl.to({}, { duration: 0.01 }, tr + B.RATTLE + 0.3);
}
function playShots(opts = {}) {
  const { tl, solved } = roundTimeline(opts);
  G.tl = tl;
  Cannon.live = 3; // the cannon gets its own layer now (at the tap), not mid-shot
  return new Promise((res) => {
    tl.eventCallback('onComplete', () => { if (G.tl === tl) G.tl = null; G.celebrate = false; Skip.hide(); res(solved); });
    // Skip: the shot lands at its end, silently; the camera snaps to its final framing, no freeze or shake left
    Skip.show(() => { if (G.tl === tl) { VO.stop(); Motion.skip(tl); TimeFx.reset(); Cannon.settle(); Stage.snap(); } });
    tl.play();
  });
}

// ---- the tutorial: ONE, on the first screen (x + 5 = 7) of the first game on this device, and on no other screen
// (user, 20 Nov). Five steps: the spotlight shows the three parts in turn (1 the equation, 2 the cannon, 3 the
// orbs); 4 the hand taps the glowing −5 and the player taps it (or drags it, or presses its key): it flies into the
// cannon; 5 the hand moves to FIRE and the player taps it (or presses Enter), and the shot goes (user, 20 Nov: "the 5
// one is click fire button"; before, the cannon fired by itself). Every line by key. It cannot be skipped: there is
// no Skip button (the user, 26 Nov 2026: "Skip ki bhi [need ni hai]").
// It plays every time the game is opened (user, 20 Nov: "in this screen, add a tutorial part": it had been saved in
// the browser after one showing, so it never came again). Only Play again, in the same visit, goes straight into play.
const sockSpot = (i = 0) => () => { const h = Cannon.holes()[i]; return Spot.worldBox(h.x, h.y, h.r * 2, h.r * 2); };
// the three parts the tutorial shows, as boxes on screen (stage units)
const eqSpot = () => Spot.boxOf(EqUI.el);
const cannonSpot = () => Spot.boxOf([$('#c1'), $('#c2'), $('#fireBtn')]); // (the hidden body has no box, so only the one showing counts)
const orbsSpot = () => Spot.boxOf(Rack.balls.filter((b) => b.where === 'rack').map((b) => b.el));
// (a circle, front on like the orb, as the tray's hint rings are: the user, 26 Nov 2026; room for its hop above the cup)
const ballSpot = (b) => () => { const r = Rack.restPos(b.holder); return Spot.worldBox(r.x, r.y - 11, BALL_D + 22, BALL_D + 22); };
const fireSpot = () => Spot.boxOf($('#fireBtn'));
async function tutorialLoad() {
  G.taught1 = true;
  // 1) the equation, 2) the cannon, 3) the orbs: one at a time, everything else dimmed (not blurred: the equation
  // must stay readable in every step, user 23 Nov)
  const parts = [
    [eqSpot, { sx: 1.3, sy: 1.45, pad: 30, glow: [EqUI.el] }, 'tutEquation'], // (Poppins Bold is wider than Trig Text: the clear hole takes the 7 and the x)
    [cannonSpot, { sx: 1.12, sy: 1.12, pad: 20, glow: [$('#c1'), $('#c2')] }, 'tutCannon'],
    [orbsSpot, { sx: 1.5, sy: 2, pad: 24 }, 'tutOrbs'], // (the orbs glow one after another: Rack.glowWave)
  ];
  for (const [box, o, line] of parts) {
    Spot.show(box, o);
    if (line === 'tutOrbs') Rack.glowWave();
    await VO.say(line, 0.5);
  }
  return () => {
    // 4) tap the glowing −5: the hand taps it, and only it can be loaded (a key or a drag loads it too)
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(ballSpot(gb), { hand: true, sx: 1.15, sy: 1.15, pad: 18, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26 }); }
    else Rack.glowWave();
    VO.say('tutTapOrb', 0.5);
    // 5) it flies into the cannon; once it has landed in its socket, the spotlight moves to FIRE (the loaded socket
    // stays clear beside it) and the hand taps it. The −5 stays in now: only FIRE answers (it may be tapped at once)
    G.hooks.onFill = (filled, n) => {
      if (filled !== n || G.hooks.fireStep) return;
      G.hooks.fireStep = true; G.spotOnly = 'fire';
      wait(Motion.BEAT.TAP_FLY + 0.15).then(() => {
        if (!G.fireResolve) return; // (FIRE already tapped)
        Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.3, pad: 20, also: sockSpot(0), sx2: 1.25, sy2: 1.25, pad2: 26, glow: [$('#fireBtn')] });
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
// the equation glides back to how it started (a retry, or before the game shows the way)
async function rewindEq(start) {
  Sound.whoosh(0.5); Cloud.squash();
  EqUI.setEq(start, true);
  await wait(Motion.BEAT.REWIND);
}
// x is still stuck after the first try: one more try (design review, 23 Nov 2026: "offer one retry"). The equation
// glides back to how it started and the fired orbs drop back into their cups, and that is all: NO orb glows, the
// player works it out again on their own (the user, 26 Nov 2026: "first time incorrect ke baad turant correct answer
// mat do… let the user try again, agar tb bhi glat kre tb denge"); only a second miss shows the answer (showHow). No
// "Try again!" panel under the cloud (the user, 25 Nov 2026: "remove the try again screen panel")
async function retry(sid, start) {
  VO.sayAfter('voRetry', 0.3);
  G.sockets = G.sockets.map(() => null); G.eq = start;
  await Promise.all([rewindEq(start), Rack.restore()]);
}
// …and still stuck after the retry: the game shows the way, step by step ("then show the correct path step by step
// before moving on"). The equation and the orbs go back; the orbs that free x glow and fly into the cannon one by
// one, it fires them, and every step plays as a normal shot, down to x freed (it doesn't count: its dot says so)
async function showHow(sid, start) {
  Note.banner(T('chipWatch'), '', 2);
  VO.sayAfter('voShowHow', 0.3);
  G.sockets = G.sockets.map(() => null); G.eq = start;
  await Promise.all([rewindEq(start), Rack.restore()]);
  const path = solvePath(start).steps;
  for (let k = 0; k < path.length && k < G.sockets.length; k++) {
    if (sid !== G.session) return;
    const b = Rack.balls.find((o) => o.where === 'rack' && o.op.label === path[k]);
    if (!b) break;
    b.guide = true; await wait(0.5); b.guide = false;
    seat(b, k); await wait(Motion.BEAT.TAP_FLY + 0.15);
  }
  if (sid !== G.session) return;
  Cannon.pressT = 1; Sound.press(); await wait(0.25);
  if (sid !== G.session) return;
  await playShots({ shown: true });
}
async function playRound(sid, i) {
  const R = ROUNDS[i], start = { layers: initLayers(R.eq), rhs: F(R.rhs) };
  G.idx = i; G.hooks = {};
  Perf.step(); // a lower quality tier, if frames have been slow, applies here between shots (never mid-shot)
  G.eq = start;
  G.sockets = new Array(R.slots).fill(null);
  const tasks = [Cannon.morph(R.slots)];
  if (G.rackFor !== R) { tasks.push(refreshBalls(R.balls)); G.rackFor = R; }
  EqUI.setEq(G.eq, false);
  const next = !G.firstEntry; // (the first question's cage fell onto the deck as the scene built itself: onPlay)
  if (G.firstEntry) { G.firstEntry = false; tasks.push(firstEntry()); }
  else tasks.push(Cloud.enter()); // the next question: its cloud forms where the last one burst, with the new equation (and its orbs come in)
  // (no level banner between rounds: the user, 25 Nov 2026: "remove the level 2, no need of this type of things")
  await Promise.all(tasks);
  if (sid !== G.session) return;
  // …and only then does x's new cage drop onto the deck; play starts once it has landed (the user, 25 Nov 2026:
  // "cloud is burst, equation will change. And again x cage come")
  if (next && DeckCage.state !== 'caged') { await DeckCage.drop(); if (sid !== G.session) return; }
  if (R.slots === 2 && !G.orderShown) { G.orderShown = true; Cannon.showOrder(); } // (1 and 2 on the sockets, this once)
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad(); // (the only tutorial: the first −5 shot, first game only)
  else VO.sayAfter(introLine(i), 0.4); // a short intro, once the reaction before it has finished (play starts at once)
  if (sid !== G.session) return;
  let result = 'miss';
  for (let attempt = 1; ; attempt++) {
    const fired = new Promise((res) => (G.fireResolve = res));
    G.inputOn = true; idleReset(); onSocketsChanged();
    if (after) { after(); after = null; }
    await fired;
    if (sid !== G.session) return;
    G.spotOnly = null; Spot.hide(); Cannon.hideOrder();
    G.inputOn = false; G.hooks = {}; Cannon.setFireActive(false);
    Rack.balls.forEach((b) => (b.guide = false));
    VO.stop();
    const solved = await playShots({ stuckLine: attempt === 1 ? 'voStuck1' : 'voStuck2' }); // the shots and their outcome: one timeline, skippable
    if (sid !== G.session) return;
    if (solved) { result = attempt === 1 ? 'ok' : 'ok2'; break; }
    if (attempt === 1) { await retry(sid, start); if (sid !== G.session) return; continue; }
    await showHow(sid, start);
    break;
  }
  if (sid !== G.session) return;
  G.results[i] = result;
  if (result !== 'miss') G.freed++;
}
async function runSession() {
  const sid = ++G.session;
  G.freed = 0; G.state = 'play'; G.said = { freed: 0, stuck: 0, next: 0 }; G.results = [];
  for (let i = 0; i < ROUNDS.length; i++) {
    if (sid !== G.session) return;
    await playRound(sid, i);
  }
  if (sid !== G.session) return;
  await showEnd(sid);
}
// ---- fireworks over the end screen: rockets climb from behind the deck with a trail of sparks and burst in the open
// sky either side of the title and of x (never over the title's letters or over x), one after another ----
const Fireworks = {
  calls: [],
  SPOTS: [[300, 205], [1390, 195], [180, 330], [1500, 320], [330, 75], [1350, 70], [1210, 330], [470, 320]],
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
// ---- the end screen (the user, 25 Nov 2026: "no need of this amazing panel… Quest complete, I want in a good text,
// in upper side, and in between I want X should be dancing in the between, and the cage behind of the X. And cage is
// in broken"; it replaced the design review's results card, with its stars, score line and missed equations). The
// last cloud has burst, so the sky is clear. One after another: x's broken cage drops into the middle of the deck
// (EndX); "Quest complete!" drops in at the top word by word, lettered like the game's logo, with a twinkle as each
// word lands, then floats gently; x jumps out of its cage and dances; only once x has danced a while does Play again
// pop up under x (the user, 25 Nov 2026: "add a play again in last after x dancing, do this nicely"), Home just after
// it, and then Play again asks for the tap with a soft ripple and a gleam now and then. The end line is still said, on
// the caption board at the left. GSAP, transform + opacity only; under reduced motion it is all simply there ----
const END_DANCE = 2; // dance loops x gets before Play again comes up (SPR.dance: one loop ≈ 1.5 s)
const EndCard = {
  tl: null, float: null, loops: [],
  // btnAt: when the buttons come up, in s from now (EndX.show tells when x starts dancing: they come END_DANCE loops after)
  show(btnAt = 2.4) {
    const t = $('#endTitle'), b = $('#endBtns'), line = T('endTitle');
    this.hide();
    t.setAttribute('aria-label', line);
    t.replaceChildren(...line.split(/\s+/).filter(Boolean).map((word) => { // (its words: each drops in on its own)
      const w = document.createElement('span'), f = document.createElement('span');
      w.className = 'w'; w.setAttribute('aria-hidden', 'true');
      f.className = 'f'; f.dataset.t = word; f.textContent = word;
      w.appendChild(f); return w;
    }));
    const words = [...t.children];
    if (Motion.still()) { gsap.set([t, b], { opacity: 1 }); b.classList.add('on'); Sound.fanfare(); return; }
    const tl = this.tl = gsap.timeline(), D = 0.75, GAP = 0.16, T0 = 0.75; // (after x's broken cage has landed: EndX)
    tl.set(t, { opacity: 1 }, 0)
      .fromTo(words, { opacity: 0, y: -120, scale: 0.55, rotation: (i) => (i % 2 ? 7 : -7) },
        { opacity: 1, y: 0, scale: 1, rotation: 0, duration: D, ease: 'back.out(1.6)', stagger: GAP }, T0)
      .call(() => Sound.fanfare(), null, T0 + 0.4);
    words.forEach((w, i) => tl.call(() => this.twinkle(w), null, T0 + i * GAP + D * 0.62));
    tl.call(() => { this.float = gsap.to(t, { y: -6, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 }); }, null, T0 + words.length * GAP + D);
    // the buttons, one after the other: each pops up out of the deck (from small, overshooting a little) and settles;
    // Play again with the start screen's Play sound and a puff of glitter off its ends, Home softer just after it
    const again = $('#againBtn'), home = $('#homeBtn'), B = Math.max(btnAt, T0 + words.length * GAP + D);
    gsap.set([again, home], { opacity: 0, transition: 'none' }); // (no CSS hover transition while GSAP moves them)
    tl.set(b, { opacity: 1 }, B)
      .call(() => b.classList.add('on'), null, B)
      .fromTo(again, { opacity: 0, y: 70, scale: 0.4 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.9)', clearProps: 'transform,transition' }, B)
      .call(() => Sound.cork(), null, B + 0.04)
      .call(() => this.puff(again), null, B + 0.3)
      .fromTo(home, { opacity: 0, y: 60, scale: 0.5 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.7)', clearProps: 'transform,transition' }, B + 0.38)
      .call(() => Sound.pop(0.85), null, B + 0.42)
      .call(() => this.invite(again), null, B + 1.2); // (after puff's own ripple has run out)
  },
  // Play again has popped up: glitter off both its ends (not over its word), and a first, stronger ripple
  puff(el) {
    const r = el.getBoundingClientRect(), y = r.top + r.height / 2;
    for (const sx of [r.left + r.height * 0.3, r.right - r.height * 0.3]) { const p = Stage.s2w(sx, y); FX.uiMode = false; FX.glitter(p.x, p.y, 9, 0.75); }
    gsap.fromTo(el.querySelector('.rip'), { opacity: 1, scaleX: 1, scaleY: 1 }, { opacity: 0, scaleX: 1.16, scaleY: 1.6, duration: 0.7, ease: 'power2.out' });
  },
  // …then, until it is tapped, it asks for the tap: a soft ripple runs out from it, and a gleam crosses it now and
  // then (its own elements, transform + opacity; they stop with the game's pause, as GSAP does)
  invite(el) {
    const rip = el.querySelector('.rip'), gl = el.querySelector('.gleam i'), w = el.offsetWidth;
    this.loops.push(
      gsap.fromTo(rip, { opacity: 0.85, scaleX: 1, scaleY: 1 }, { opacity: 0, scaleX: 1.1, scaleY: 1.42, duration: 1.2, ease: 'power1.out', repeat: -1, repeatDelay: 0.9 }),
      gsap.fromTo(gl, { x: 0, skewX: -20 }, { x: w * 1.6, skewX: -20, duration: 0.75, ease: 'power2.inOut', repeat: -1, repeatDelay: 2.4, delay: 0.4 })); // (from just off its left end to just off its right)
  },
  // a word has landed: a starburst and some glitter on it (in the sky: light shows on blue)
  twinkle(w) {
    const r = w.getBoundingClientRect(), p = Stage.s2w(r.left + r.width / 2, r.top + r.height * 0.45);
    FX.uiMode = false; FX.star(p.x, p.y, '#fff3b0', Math.min(240, r.width * 0.8), 0.4, { n: 8 }); FX.glitter(p.x, p.y, 12, 0.7);
  },
  // Play again: it all goes at once
  hide() {
    if (this.tl) { this.tl.kill(); this.tl = null; }
    if (this.float) { this.float.kill(); this.float = null; }
    for (const l of this.loops) l.kill(); this.loops = [];
    const t = $('#endTitle'), b = $('#endBtns'), parts = [...b.querySelectorAll('.pill, .rip, .gleam i')];
    gsap.killTweensOf([t, b, ...t.children, ...parts]);
    gsap.set([t, b], { opacity: 0, y: 0 }); b.classList.remove('on');
    gsap.set(parts, { clearProps: 'all' }); // (the buttons, their ripple and gleam: back to their CSS)
    t.replaceChildren();
  },
};
async function showEnd(sid) {
  G.state = 'end';
  Caption.place(true); // (the board lifts away: the end line is only said, no board)
  Note.hide(); Cannon.hideOrder(true);
  $('#fireBtn').classList.add('gone');
  Cannon.leave(); // (the cannon has done its work: it shrinks away, x takes the middle of the deck)
  refreshBalls([]); G.rackFor = null;
  tween(0.7, (e) => (Rack.enterY = 340 * e), Ease.inCubic, 0.35); // the empty tray slides away down the deck
  QCard.label(null);
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, Motion.BEAT.CLOUD_IN, Ease.inOutCubic);
  await DeckCage.away(); // (x has already hopped off to the right in the last round's timeline; this only waits if it hasn't…)
  if (sid !== G.session) return;
  const danceAt = EndX.show(G.freed); // (…its broken cage drops into the middle of the deck, and x jumps out of it and dances; none freed: x still in its cage)
  EndCard.show(G.freed ? danceAt + END_DANCE * SPR.dance.d.reduce((a, d) => a + d, 0) : 2.4); // (Play again once x has danced)
  if (G.freed) { FX.confetti(END.x, 175, 100 + G.freed * 30, 1100); Fireworks.show(2 + G.freed); } // (the more x freed, the more fireworks)
  VO.sayAfter(endLine(), 0.8);
}
async function restartGame() {
  G.session++;
  if (G.tl) { G.tl.kill(); G.tl = null; } // the running round's timeline is torn down with everything else in flight
  Motion.killAll(); Skip.hide();
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; G.celebrate = false; Drag.cancel(); Spot.hide();
  EndCard.hide(); Note.hide(); Cannon.hideOrder(true);
  Caption.place(false); // (the board comes back at the top with the next line)
  $('#fireBtn').classList.remove('gone');
  Cannon.back();
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.clear(); CageBreak.kill(); EndX.hide(); Fireworks.stop(); Vignette.to(0, 0);
  DeckCage.hide();
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset(); CloudBurst.reset();
  QCard.label(null); // back to no label during play
  if (Rack.enterY) { const y0 = Rack.enterY; tween(0.6, (e) => (Rack.enterY = y0 * (1 - e)), Ease.outBackSoft); } // (the tray comes back up)
  G.rackFor = null;
  runSession();
}
// Home: back to the start screen (the page starts again; the tutorial isn't shown again in this visit)
function goHome() {
  Sound.click();
  try { sessionStorage.setItem('cq.home', '1'); } catch (e) { /* (no storage: the tutorial shows again) */ }
  location.reload();
}

// ---- pause ----
// No pause button and no panel (the user, 25 Nov 2026: "remove this panel of paused"; 26 Nov 2026: "yh upar do buttons
// ki need ni hai", the Pause and Sound buttons): the game freezes only while its tab is hidden, and goes on by itself
// when it comes back (wireInput)
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p; Scenery.pause(p);
  if (p) { Drag.cancel(); gsap.globalTimeline.pause(); Music.pause(); Sound.suspend(); VO.pause(); } // (a ball in hand goes home)
  else { gsap.globalTimeline.resume(); Music.resume(); Sound.resume(); VO.resume(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient();
  flashScreen();
  // zoom-through: the camera punches toward the Play button while the start screen bursts away…
  Stage.camTo({ fx: TL.play.x, fy: TL.play.y, z: 1.15 }, 0.4, Ease.inCubic);
  await Title.exit();
  // …then the welcome, and the question board drops in at the top with it (once the start screen's sign has gone
  // from there); the board stays from now on, only its words change (Caption)
  G.welcome = VO.say('voWelcome', 0.15);
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.a = 0; Cloud.apply(Clock.t); Cannon.morphS = 0.001; Rack.enterY = 330; // (nothing of the scene shows before its turn)
  Rack.balls.forEach((b) => { b.scale = 0.001; b.drop = 420; }); // (the orbs wait above their cups, too small to see)
  QCard.hide();
  $('#world').classList.remove('title');
  // …and the play scene eases out from that close framing while it builds itself ONE PART AT A TIME (the user, 26 Nov
  // 2026: "when I tap the start button, then the things should come one by one"), each part only once the one before
  // has landed, never two at once, and the cloud LAST, its equation after it ("the cloud should come in last… all the
  // things come, cannon and others, then last cloud come and then equation come"): the cannon pops up onto the deck;
  // the orbs' stand (the tray) slides up; the orbs drop into its cups one after another; x's cage falls onto the deck;
  // the cloud forms in the sky, bare; then the equation pops onto it. Under reduced motion each part is simply there
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 1.1, Ease.outCubic);
  const gap = () => wait(Motion.d(0.15));
  await wait(Motion.d(0.3)); // (the board has dropped in)
  await tween(0.75, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack);
  Sound.clunk(); Cannon.groundDust(true); Stage.hit({ trauma: 0.12, ky: 6 });
  await gap();
  Sound.whoosh(0.4);
  await tween(0.8, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBackSoft);
  Sound.settle();
  await gap();
  await Promise.all(Rack.balls.map((b, i) => tween(Motion.BEAT.BALL_DROP, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 2.5)); b.drop = 420 * (1 - e); }, Ease.outBackSoft, i * 0.12)
    .then(() => { b.land = 1; Sound.pop(0.75 + i * 0.06); })));
  await gap();
  await DeckCage.drop();
  await gap();
  await Cloud.enter(false);
  await gap();
  await Cloud.showEq();
  G.firstEntry = true;
  runSession();
}

// =====================================================================
//  INPUT, LOOP, BOOT
// =====================================================================
function wireInput() {
  $('#fireBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapFire(); });
  $('#playBtn').addEventListener('click', onPlay);
  $('#againBtn').addEventListener('click', () => { Sound.click(); restartGame(); });
  $('#homeBtn').addEventListener('click', goHome);
  // a tap anywhere on the scene while x is being freed skips to the next question (design review: "let a tap skip
  // the celebration")
  $('#viewport').addEventListener('pointerdown', (e) => { if (G.celebrate && G.tl && !G.paused && !e.target.closest('button')) Skip.now(); });
  $('#rotateOk').addEventListener('click', () => $('#rotate').classList.add('dismissed'));
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (G.state === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPlay(); return; }
    if (G.paused) return;
    if (/^[1-8]$/.test(e.key)) { const b = Rack.balls.find((x) => x.holder === +e.key - 1); if (b) tapBall(b); }
    else if (e.key === 'Backspace') { const f = G.sockets.filter(Boolean); if (f.length) tapBall(f[f.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') { e.preventDefault(); tapFire(); }
  });
  // a tapped button shouldn't keep focus (no focus box, and Enter/Space stay for FIRE)
  addEventListener('pointerup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  addEventListener('resize', () => Stage.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'play') setPaused(true); } else setPaused(false); });
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
  Cloud.apply(t, dt); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt); Sprite.tick(t);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(rdt); Spot.update(dt, t); FX.update(dt); FX.draw();
}
// ---- pictures: there is no loading screen. The start screen shows as soon as its own pictures are in (the page
// preloads them); the play scene's arrive while the player is on the start screen (Title.exit waits for them,
// in case Play is tapped first) ----
const Pics = {
  TITLE: ['bg_sky', 'sun_glow', 'sun_rays', 'bg_mount', 'bg_trees', 'bg_plantL', 'bg_plantR', 'bg_deck', 't_logo', 't_cannon', 'playbtn', 'x_cry'],
  GAME: ['cloud', 'cloud_rim', 'cannon1', 'cannon2', 'cannon1_front', 'cannon2_front', 'rack', 'rack_front', 'fire', 'fire2', 'cage_empty', 'cage_crack', 'hand', 'question_board',
    ...[...new Set(Object.values(OP_ART))].map((i) => `ball_${i}`)], // (the orbs' four colours: OP_ART)
  LATER: ['x_dance', 'cage_broken'], // (wanted only once x is first freed, and at the end: fetched after the rest)
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
  try { if (sessionStorage.getItem('cq.home')) { sessionStorage.removeItem('cq.home'); G.taught1 = true; } } catch (e) { /* (no storage) */ } // (back from Home: no tutorial again)
  // the sound, now, so the start screen can be heard (its own few effects came with the page: js/sfx_title.js).
  // Where the browser still holds the page silent, it wakes on the first tap or key (Sound.listen)
  Sound.init(); Sound.listen();
  // lay the scene out at once (it stays hidden, over the plain sky, until its pictures are in)
  Scenery.build(); FX.init(); Stage.init(); Perf.init();
  removeEventListener('resize', fitStage); // (index.html's first fit; the game's Stage keeps the screen fitted from here)
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 }); Stage.snap(); Stage.update(0);
  await Pics.load(Pics.TITLE, 8); // usually in already: they have been downloading since the page's <head>
  if (Sound.live()) await Promise.race([Sound.ready(), later(1000)]); // (sound allowed at once: the entrance's sounds are decoded first)
  Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); DeckCage.init(); Title.init(); Spot.init(); Caption.init();
  wireInput();
  gsap.ticker.add(frame);
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Drag, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX, Pics, CageBreak, CloudBurst, Fracture, Vignette, Fireworks, Sprite, EndX, DeckCage, Caption, EndCard, Note };
  // the start screen: the scene fades in while the title plays its intro, and the Play button pops in
  G.state = 'title';
  Title.start();
  Motion.to($('#world'), { opacity: 1, duration: Motion.DUR.SLOW, ease: Motion.EASE.OUT });
  // …and the rest comes while the player looks at it (nothing of it was asked for before, so it never slowed the
  // start screen): the play scene's pictures (the markup's data-src ones, the tray's balls) + the font, then the sound effects
  for (const im of document.querySelectorAll('img[data-src]')) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  const font = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('600 64px Poppins', '0123456789+−×='), document.fonts.load('700 64px Poppins', 'Let\'s free 0123456789+−×÷=().'), document.fonts.load("italic 400 64px 'Swifty Math'", 'x'), document.fonts.load("400 64px 'Trig Text'", '0123456789+−×÷=()')]).catch(() => {}) : null;
  Pics.game = Pics.load(Pics.GAME, 15, font ? [font] : []);
  Pics.game.then(() => { CloudBurst.prepare(); CageBreak.load(); Pics.load(Pics.LATER, 30); }); // (the cloud's burst pieces are cut while the browser is idle; the cage's fracture is worked out; then x's dance and the end card's picture)
  const sfx = document.createElement('script'); sfx.src = 'js/sfx.js'; document.body.appendChild(sfx); // (it hands itself to Sound.loadSfx)
}
boot();
