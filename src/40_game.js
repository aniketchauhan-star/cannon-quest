
// =====================================================================
//  GAME FLOW
// =====================================================================
const G = {
  state: 'boot', session: 0, idx: 0, freed: 0, eq: null, sockets: [], inputOn: false, fireResolve: null, hooks: {},
  taught1: false, taughtSeq: false, tutSkip: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false, tl: null,
  welcome: null, said: { freed: 0, stuck: 0, next: 0 },
};
// ---- the voice's lines through a session, in order: welcome → tutorial → a short intro on every other
// round → a reaction as the cage opens (or rattles) → the end line. Variants take turns, so a line never
// repeats back to back. The emotion is in the words (and, for the device's voice, VO_MOOD).
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
  if (old.length) {
    Sound.whoosh(0.3);
    await tween(0.3, (e) => old.forEach((b) => (b.scale = Math.max(0.001, 1 - e))), Ease.inBack);
    old.forEach((b) => FX.burst(b.x, b.y, b.hex, 8, 260));
  }
  Rack.balls.forEach(removeBall);
  Rack.balls = list.map((s, i) => createBall(s, i));
  Rack.balls.forEach((b) => { b.scale = 0.001; b.drop = 420; });
  await Promise.all(Rack.balls.map((b, i) => tween(0.7, (e, k) => { b.scale = Math.max(0.001, Math.min(1, k * 3)); b.drop = 420 * (1 - e); }, Ease.outElastic, 0.08 + i * 0.065)
    .then(() => { b.land = 1; Sound.pop(0.75 + i * 0.06); })));
}

function onSocketsChanged() {
  const filled = G.sockets.filter(Boolean).length, n = G.sockets.length;
  Cannon.setFireActive(G.inputOn && n > 0 && filled === n);
  if (G.hooks.onFill) G.hooks.onFill(filled, n);
}
function tapBall(b) {
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn || !b || b.where === 'gone' || b.where === 'loading') return;
  if (G.spotOnly && G.spotOnly !== b) { Sound.nope(); Spot.nudge(); return; } // guided step: only the highlighted ball
  idleReset();
  if (b.where === 'rack') {
    const i = G.sockets.indexOf(null);
    if (i < 0) { Sound.nope(); Cannon.pulseSockets(); tween(0.4, (e, k) => (b.hop = Math.sin(k * Math.PI) * 0.5), Ease.linear); return; }
    G.sockets[i] = b; b.where = 'socket'; b.socket = i;
    Rack.balls.forEach((x) => (x.guide = false));
    flyBall(b, 0.55, 230); Sound.pop(1); Sound.whoosh(0.35);
    b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); Stage.hit({ trauma: 0.08, ky: 3 }); };
  } else if (b.where === 'socket') {
    G.sockets.splice(b.socket, 1); G.sockets.push(null);
    G.sockets.forEach((s, k) => { if (s && s.socket !== k) { s.socket = k; flyBall(s, 0.3, 40); } });
    b.where = 'rack'; b.socket = -1;
    flyBall(b, 0.5, 180); Sound.unload();
    b.onLand = () => Sound.settle();
  }
  onSocketsChanged();
}
function tapFire() {
  if (G.paused) return;
  Sound.resume();
  if (!G.inputOn) return;
  if (G.spotOnly && G.spotOnly !== 'fire') { Sound.nope(); Spot.nudge(); return; }
  idleReset(); Cannon.pressT = 1; Sound.press();
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); Cannon.wiggleFire(); return; }
  G.inputOn = false;
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
  tween(0.35, (e) => (b.scale = Math.max(0.001, 1 - e)), Ease.inBack).then(() => (b.where = 'gone'));
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
// shake as it fires → it follows the ball up → impact (hit-stop, punch) → it holds on the equation for reading.
const SHOT_CAM = { WIND: { fx: CX, fy: 540, z: 1.06 }, FOLLOW: { fx: CX, fy: 260, z: 1.1 }, READ: { fx: CX, fy: 260, z: 1.12 } };
function addShot(tl, t0, i, b, eq0, eq1, first = true) {
  const to = { ...CLOUD_HIT };
  let p = null, inL = null, inR = null, ms = null, tg = null;
  tl.call(() => { Cannon.highlight(i, true); Sound.tick(); b.land = 1; }, null, t0);
  // wind-up: the camera leans in on the cannon (for a second ball, from the equation framing it was reading)
  if (first) camDrive(tl, t0 + 0.45, SHOT_CAM.WIND, 0.3, Ease.outQuad);
  else camDrive(tl, t0, SHOT_CAM.WIND, 0.72, Ease.inOutCubic);
  tl.call(() => { b.where = 'loading'; flyBall(b, 0.28, 24); Sound.charge(); }, null, t0 + 0.45);
  drive(0.28, (e) => (Cannon.antic = e), Ease.inQuad, tl, t0 + 0.45); // anticipation: the cannon squats
  const tf = t0 + 0.75; // FIRE
  tl.call(() => {
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.shoot(); Sound.boom(); Music.punch(); Haptic.buzz(25); Cannon.groundDust(true);
    Stage.hit({ trauma: 0.55, ky: 16, zoom: 0.035 }); // the screen wiggle: shake + recoil kick + zoom punch
    // the blast: white-hot flash, fireball, shock ring, embers, and thick smoke that lingers and drifts
    // (the ball flies above all of it)
    FX.blast(MUZZLE.x, MUZZLE.y, -Math.PI / 2, 1);
    p = makeFlyBall(b, 0.66); Sound.whistle();
  }, null, tf);
  camDrive(tl, tf + 0.05, SHOT_CAM.FOLLOW, 0.5, Ease.inOutQuad); // the camera follows the ball up to the cloud
  drive(0.5, (e, k) => {
    if (!p) return;
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r = 540 * k; p.s = 0.66 - 0.14 * e; p.apply();
    FX.trail(p.x, p.y + 30, b.hex); FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.inOutQuad, tl, tf);
  const th = tf + 0.5; // hits the cloud: "x + 5 − 5 = 7 − 5" appears, the two terms fly to their places
  camDrive(tl, th + 0.1, SHOT_CAM.READ, 1.6, Ease.inOutQuad); // a slow push-in through the reading beat
  tl.call(() => {
    if (p) p.el.remove(); p = null;
    FX.burst(to.x, to.y, b.hex, 60, 620); FX.burst(to.x, to.y, '#ffffff', 22, 400); FX.ring(to.x, to.y, '#ffffff', 170);
    Sound.pop(1.5);
    TimeFx.hitStop(0.06); Stage.hit({ trauma: 0.3, ky: -8, zoom: 0.02 }); Cloud.squash(); // impact: a 60 ms freeze, a jolt, the cloud squashes
    [inL, inR] = EqUI.showImpact(eq0, b.op, b.ink);
    tg = [inL, inR].map((el) => (el ? EqUI.worldAt(el) : { ...to }));
    ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
    ms.forEach((m) => { m.x = to.x; m.y = to.y; m.apply(); });
  }, null, th);
  drive(0.55, (e, k) => {
    if (!ms) return;
    ms.forEach((m, j) => {
      m.x = bez(to.x, (to.x + tg[j].x) / 2, tg[j].x, e); m.y = bez(to.y, Math.min(to.y, tg[j].y) - 120, tg[j].y, e);
      m.s = 0.5 - 0.22 * e; m.r = 460 * k; m.apply();
      if (Math.random() < 0.6) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic, tl, th);
  const tl2 = th + 0.55;
  tl.call(() => {
    if (ms) ms.forEach((m) => m.el.remove()); ms = null;
    [inL, inR].forEach((el, j) => { if (el) { el.classList.remove('hid'); el.classList.add('pop'); } FX.burst(tg[j].x, tg[j].y, b.hex, 22, 320); });
    Sound.ding(0); Sound.ding(2); Stage.hit({ ky: 2.5 });
  }, null, tl2);
  const tv = tl2 + 1.15; // after a reading beat, the terms that cancel vanish…
  tl.call(() => { EqUI.vanish(eq1); Sound.sparkle(); }, null, tv);
  const ts = tv + 0.46; // …and the simplified equation settles
  tl.call(() => { EqUI.settle(eq1); G.eq = eq1; }, null, ts);
  return ts + 1.25; // reading beat: the simplified equation (the camera holds on it; the next beat moves it)
}
// ---- outcomes: no "wrong" label, no hints, no retry; both outcomes advance ----
function addFreed(tl, t0) {
  let cage = null, img = null, p = null, q = null, s0 = 1, fl = null;
  // 1) the cage glows… and unlocks
  tl.call(() => { cage = EqUI.cage(); img = cage && cage.querySelector('img'); if (cage) cage.classList.add('glowx'); Sound.ding(1); }, null, t0);
  // the camera pushes in on the cage (framing x and its value together)
  camDrive(tl, t0, () => { const c = EqUI.cage(), w = c ? EqUI.worldAt(c) : { x: 700, y: 200 }; return { fx: (w.x + CLOUD_MID.x) / 2, fy: w.y + 60, z: 1.18 }; }, 0.6, Ease.outCubic);
  tl.call(() => Sound.unlock(), null, t0 + 0.85);
  // 2) the cage bursts open; the free x stays on the cloud so it reads "x = 2"
  const tb = t0 + 1.25;
  tl.call(() => {
    p = img ? EqUI.worldAt(img) : { x: 700, y: 170 };
    if (img) { img.src = IMG + 'xchar.webp'; cage.classList.remove('glowx'); cage.classList.add('free'); }
    EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
    Sound.creak(); Sound.spring(); Sound.fanfare(); flashScreen();
    FX.burst(p.x, p.y, '#ffd34d', 46, 560); FX.burst(p.x, p.y, '#c58bff', 40, 480); FX.ring(p.x, p.y, '#ffffff', 200);
    FX.confetti(p.x, p.y, 140, 1000);
    // the big moment: an 80 ms freeze, then slow-mo easing back to full speed, a shake and a zoom punch
    TimeFx.hitStop(0.08); TimeFx.slowMo(0.45, 0.35); Stage.hit({ trauma: 0.35, zoom: 0.03 }); Haptic.buzz([15, 30, 15]);
  }, null, tb);
  tl.call(() => react('freed'), null, tb + 0.3); // just after the burst's first hit, over the "x = 2" reading beat
  camDrive(tl, tb + 0.3, { z: 1.15 }, 1.2, Ease.inOutQuad); // eases back a touch while "x = 2" is read
  // 3) after a reading beat (the value of x), x does a happy hop… and vanishes in a poof of sparkles
  const th = tb + 1.9;
  tl.call(() => {
    q = img ? EqUI.worldAt(img) : p;
    s0 = img ? img.getBoundingClientRect().height / (Stage.S * Stage.z) / 107 : 1;
    fl = document.createElement('div'); fl.className = 'xfly'; fl.innerHTML = `<img src="${IMG}xchar.webp" alt="">`;
    fl.style.willChange = 'transform,opacity';
    $('#fly').appendChild(fl);
    if (img) img.style.visibility = 'hidden';
    EqUI.el.classList.add('fadeout');
    Sound.spring();
  }, null, th);
  const put = (x, y, r, s, o) => { if (!fl) return; fl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`; fl.style.opacity = o.toFixed(3); };
  drive(0.45, (e) => put(q.x, q.y - 70 * e, 8 * Math.sin(e * Math.PI), s0 * (1 + 0.18 * e), 1), Ease.outCubic, tl, th);
  tl.call(() => Sound.sparkle(), null, th + 0.45);
  drive(0.32, (e) => {
    put(q.x, q.y - 70 - 12 * e, 8 + 260 * e, s0 * 1.18 * (1 - e), 1 - e * 0.6);
    if (fl && Math.random() < 0.9) FX.trail(q.x + rr(-30, 30), q.y - 70 + rr(-30, 30), pick(['#d4b0ff', '#fff1a8', '#ffffff']));
  }, Ease.inBack, tl, th + 0.45);
  // 4) the cloud clears; the next round brings in a new cloud
  const tp = th + 0.77;
  tl.call(() => {
    if (q) { FX.burst(q.x, q.y - 80, '#d4b0ff', 34, 380, { g: 0 }); FX.burst(q.x, q.y - 80, '#ffffff', 18, 260, { g: 0 }); FX.ring(q.x, q.y - 80, '#ffffff', 110); }
    Sound.pop(1.6);
    if (fl) fl.remove(); fl = null;
  }, null, tp);
  camDrive(tl, tp, { fx: CX, fy: CY, z: 1 }, 0.8); // back to the base framing as the cloud clears
  Cloud.clearTL(tl, tp);
  tl.to({}, { duration: 0.3 }, tp + 0.7); // a breath before the next round
}
function addStuck(tl, t0) {
  const tr = t0 + 0.45;
  camDrive(tl, t0, { fx: CX, fy: 330, z: 1.08 }, 0.5, Ease.outCubic); // the camera holds on the cloud
  tl.call(() => {
    const cage = EqUI.cage();
    if (cage) cage.classList.add('rattle');
    Sound.rattle(); Sound.wobble(); Stage.hit({ trauma: 0.4, xOnly: true }); // a sideways "not yet" shake
    EqUI.el.classList.add('wob');
  }, null, tr);
  tl.call(() => react('stuck'), null, tr + 0.15); // gentle, never "wrong"
  Cloud.wobbleTL(tl, tr);
  tl.call(() => EqUI.el.classList.remove('wob'), null, tr + 0.9);
  Cloud.leaveTL(tl, tr + 0.9);
  camDrive(tl, tr + 0.9, { fx: CX, fy: CY, z: 1 }, 0.8); // back to the base framing as the cloud floats away
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

// ---- tutorials (first entry only), every line by key; Skip ends the tutorial ----
function skipTutorial() {
  G.tutSkip = true;
  VO.stop(); Spot.hide(); G.spotOnly = null;
  Rack.balls.forEach((b) => (b.guide = false));
  if (G.hooks) { G.hooks.onFill = null; G.hooks.softSpot = false; }
}
const fireSpot = () => { const f = Cannon.fireBox; return Spot.worldBox(f.x, f.y, f.w, f.h); };
async function tutorialLoad() {
  G.taught1 = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  const cage = EqUI.cage(); if (cage) cage.classList.add('push');
  // 1) this is x; everything else blurs
  Spot.show(() => Spot.boxOf(EqUI.cage()), { sx: 1.15, sy: 1.08, pad: 30 });
  await VO.say('tutFreeX', 0.35);
  return () => {
    if (G.tutSkip) return;
    // 2) the glowing −5 is the only ball you can tap (the spotlight covers its hop above the cup)
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(() => { const r = Rack.restPos(gb.holder); return Spot.worldBox(r.x, r.y - 11, BALL_D, BALL_D + 22); }, { hand: true, sx: 1.2, sy: 1.2, pad: 26 }); } else Rack.glowWave();
    VO.say('tutTapOp', 0.5);
    // 3) once it is loaded, the spotlight moves to FIRE
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip) return;
      if (filled === n && !G.hooks.saidFire) {
        G.hooks.saidFire = true;
        if (G.spotOnly) { G.spotOnly = 'fire'; wait(0.45).then(() => { if (G.spotOnly === 'fire' && !G.tutSkip) Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.45, pad: 24 }); }); }
        VO.say('tutTapFireOne', 0.5);
      }
    };
  };
}
async function tutorialSeq() {
  G.taughtSeq = true; G.tutSkip = false;
  Skip.show(skipTutorial);
  // the two sockets (with their 1 and 2 markers) are the focus while the order is explained
  Spot.show(() => Spot.boxOf([...Cannon.sock, ...Cannon.tags]), { sx: 1.1, sy: 1.2, pad: 30 });
  await VO.say('tutOrder', 0.15);
  if (G.tutSkip) return null;
  Cannon.pulseSockets();
  await VO.say('tutLeftRight', 0.3);
  if (G.tutSkip) return null;
  Spot.hide();
  return () => {
    if (G.tutSkip) return;
    G.hooks.onFill = (filled, n) => {
      if (G.tutSkip) return;
      if (filled === 1 && !G.hooks.saidNext) { G.hooks.saidNext = true; VO.say('tutNextOp', 0.5); }
      if (filled === n && !G.hooks.saidFire) { // a soft spotlight on FIRE (balls stay tappable, it lifts if you unload one)
        G.hooks.saidFire = true; G.hooks.softSpot = true;
        Spot.show(fireSpot, { hand: true, sx: 1.12, sy: 1.45, pad: 24 });
        VO.say('tutTapFireMany', 0.5);
      }
      if (filled < n && G.hooks.softSpot) { G.hooks.softSpot = false; Spot.hide(); }
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
    tasks.push(Stage.camTo({ fx: CX + 50 }, 0.3, Ease.outQuad).then(() => Stage.camTo({ fx: CX }, 0.6, Ease.outCubic)));
  }
  await Promise.all(tasks);
  if (sid !== G.session) return;
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad();
  else if (R.slots > 1 && !G.taughtSeq) after = await tutorialSeq();
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
  refreshBalls([]); G.rackFor = null;
  Stage.camTo({ fx: CX, fy: 300, z: 1.05 }, 0.8, Ease.outCubic); // the end card is framed a little closer
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
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; Spot.hide();
  $('#endUI').classList.remove('on');
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 }); Stage.snap(); TimeFx.reset(); Cannon.settle(); FX.parts = [];
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0; Cloud.sq.reset();
  G.rackFor = null;
  runSession();
}

// ---- pause ----
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p;
  $('#pauseBtn img').src = IMG + (p ? 'play.webp' : 'pause.webp');
  $('#pauseBtn').setAttribute('aria-label', T(p ? 'btnResume' : 'btnPause'));
  if (p) { gsap.globalTimeline.pause(); Music.pause(); Sound.suspend(); VO.pause(); }
  else { gsap.globalTimeline.resume(); Music.resume(); Sound.resume(); VO.resume(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient(); VO.pickVoice();
  G.welcome = VO.say('voWelcome', 0.15); // said while the scene builds itself
  $('#credits').classList.add('hide');
  flashScreen();
  // zoom-through: the camera punches toward the Play button while the start screen bursts away…
  Stage.camTo({ fx: TL.play.x, fy: TL.play.y, z: 1.15 }, 0.3, Ease.inCubic);
  await Title.exit();
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.y = -470; Cannon.morphS = 0.001; Rack.enterY = 330;
  $('#world').classList.remove('title');
  // …and the play scene eases out from that close framing while it builds itself
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 0.9, Ease.outCubic);
  Sound.swoosh();
  await Promise.all([
    tween(0.8, (e) => (Cloud.y = -470 * (1 - e)), Ease.outBack),
    tween(0.75, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBack, 0.12).then(() => Sound.settle()),
    tween(0.6, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack, 0.38).then(() => { Sound.clunk(); Cannon.groundDust(true); Stage.hit({ trauma: 0.12, ky: 6 }); }),
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
  if (G.state === 'title' && !Motion.reduced) { const c = Stage.cam, tt = t - Title.t0; c.fx = CX + Math.sin(tt * 0.22) * 28; c.fy = CY + Math.sin(tt * 0.31) * 10; c.z = 1.05 + Math.sin(tt * 0.17) * 0.02; } // (drifts from where the loading screen left it)
  Cloud.apply(t, dt); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(rdt); Spot.update(dt, t); FX.update(dt); FX.draw();
}
async function boot() {
  Motion.init();
  const names = ['bg_mount.webp', 'bg_trees.webp', 'bg_lake.webp', 'bg_ground.webp', 'bg_foreL.webp', 'bg_foreR.webp', 'cloud.webp', 'cage_x.webp', 'xchar.webp', 'fire.webp', 'pause.webp', 'play.webp', 'sound.webp', 'rack.webp', 'rack_front.webp', 'cannon1.webp', 'cannon2.webp', 'cannon1_front.webp', 'cannon2_front.webp', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `ball_${i}.webp`),
    'playbtn.webp', 't_logo.webp', 't_cage.webp', 't_cannon.webp', 't_fire.webp'];
  // the loading screen (js/loader.js): lay the scene out at once, so it shows behind the bar as soon as its pictures are in…
  FX.init(); Stage.init(); Perf.init();
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 }); Stage.snap(); Stage.update(0);
  Loader.scene();
  await Loader.load(names, IMG); // …while the bar fills with every picture (and the font)
  Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); Title.init(); Spot.init(); Skip.init();
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  wireInput();
  gsap.ticker.add(frame);
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Sound, Music, Stage, EqUI, VO, Motion, Skip, Spot, Title, Cloud, Cannon, TimeFx, Perf, FX };
  await Loader.finish(); // the bar fills, flashes and collapses: the Play button pops in where it was
  G.state = 'title';
  Title.start();
  $('#credits').classList.remove('hide');
}
boot();
