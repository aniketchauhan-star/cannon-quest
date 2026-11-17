
// =====================================================================
//  GAME FLOW
// =====================================================================
const G = {
  state: 'boot', session: 0, idx: 0, freed: 0, eq: null, sockets: [], inputOn: false, fireResolve: null, hooks: {},
  taught1: false, taughtSeq: false, idle: 0, rackFor: null, firstEntry: false, paused: false, helping: false,
};
function flashScreen() { const f = $('#flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 90); }
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
    b.onLand = () => { Sound.clunk(); const p = Cannon.socketPos(b.socket); FX.burst(p.x, p.y, b.hex, 16, 300); FX.ring(p.x, p.y, '#fff1a8', 70); Stage.shake(0.08); };
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
  if (G.sockets.some((s) => !s)) { Sound.nope(); Cannon.pulseSockets(); return; }
  G.inputOn = false;
  const r = G.fireResolve; G.fireResolve = null; if (r) r();
}

// ---- one shot: cannon → cloud → two identical tokens land on both sides ----
function makeFlyBall(b, s) {
  const el = document.createElement('div'); el.className = 'ball'; el.style.pointerEvents = 'none';
  el.innerHTML = `<img src="${IMG}ball_${b.i}.png" alt=""><b>${labelHTML(b.op)}</b>`;
  $('#fly').appendChild(el);
  const o = { el, x: MUZZLE.x, y: MUZZLE.y, s, r: 0 };
  o.apply = () => (el.style.transform = `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px) rotate(${o.r.toFixed(1)}deg) scale(${o.s.toFixed(3)})`);
  o.apply();
  return o;
}
async function shoot(b) {
  const p = makeFlyBall(b, 0.62), to = { x: 828, y: 250 };
  Sound.whistle();
  await tween(0.5, (e) => {
    p.x = bez(MUZZLE.x, MUZZLE.x - 30, to.x, e); p.y = bez(MUZZLE.y, MUZZLE.y - 120, to.y, e); p.r += 18; p.s = 0.62 - 0.12 * e; p.apply();
    FX.trail(p.x, p.y + 30, b.hex); FX.trail(p.x, p.y + 30, '#ffffff');
  }, Ease.inOutQuad);
  p.el.remove();
  FX.burst(to.x, to.y, b.hex, 60, 620); FX.burst(to.x, to.y, '#ffffff', 22, 400); FX.ring(to.x, to.y, '#ffffff', 170);
  Sound.pop(1.5); Stage.shake(0.12);
  return to;
}
async function landTokens(b, start, inL, inR) {
  const ms = [makeFlyBall(b, 0.5), makeFlyBall(b, 0.5)];
  ms.forEach((m) => { m.x = start.x; m.y = start.y; m.apply(); });
  const tg = [{ x: start.x, y: start.y }, { x: start.x, y: start.y }];
  await tween(0.55, (e) => {
    [inL, inR].forEach((el, k) => {
      if (el) tg[k] = EqUI.worldAt(el);
      const m = ms[k];
      m.x = bez(start.x, (start.x + tg[k].x) / 2, tg[k].x, e); m.y = bez(start.y, Math.min(start.y, tg[k].y) - 120, tg[k].y, e);
      m.s = 0.5 - 0.22 * e; m.r += 14; m.apply();
      if (Math.random() < 0.6) FX.trail(m.x, m.y, b.hex);
    });
  }, Ease.inOutCubic);
  ms.forEach((m) => m.el.remove());
  [inL, inR].forEach((el, k) => { if (el) { el.classList.remove('hid'); el.classList.add('pop'); } FX.burst(tg[k].x, tg[k].y, b.hex, 22, 320); });
  Sound.ding(0); Sound.ding(2);
}
function fizzle(b) {
  FX.burst(b.x, b.y, b.hex, 16, 300);
  tween(0.35, (e) => (b.scale = Math.max(0.001, 1 - e)), Ease.inBack).then(() => (b.where = 'gone'));
}
async function playback(sid) {
  const n = G.sockets.length;
  for (let i = 0; i < n; i++) {
    const b = G.sockets[i];
    if (!b || sid !== G.session) continue;
    Cannon.highlight(i, true); Sound.tick(); b.land = 1;
    await wait(0.45);
    b.where = 'loading'; flyBall(b, 0.28, 24);
    await wait(0.3);
    b.where = 'gone'; Cannon.highlight(i, false);
    Cannon.fireKick(); Sound.boom(); Stage.shake(0.62); Cannon.groundDust(true);
    FX.flash(MUZZLE.x, MUZZLE.y, 230); FX.smoke(MUZZLE.x, MUZZLE.y, 16, 170); FX.burst(MUZZLE.x, MUZZLE.y, '#ffcf5a', 40, 560, { up: 260 }); FX.ring(MUZZLE.x, MUZZLE.y, '#fff3c4', 150);
    Stage.camTo({ fy: CY - 70, z: 1.05 }, 0.6, Ease.outCubic);
    const hit = await shoot(b);
    const [inL, inR] = EqUI.showImpact(G.eq, b.op, b.ink);
    await landTokens(b, hit, inL, inR);
    await wait(1.15);                                    // reading beat: "x + 5 − 5 = 7 − 5"
    const next = applyOp(G.eq, b.op);
    await EqUI.simplify(next); G.eq = next;
    Stage.camTo({ fy: CY, z: 1 }, 1.0);
    await wait(1.25);                                    // reading beat: simplified equation
    if (isSolved(G.eq)) { for (let k = i + 1; k < n; k++) if (G.sockets[k]) fizzle(G.sockets[k]); return true; }
  }
  return isSolved(G.eq);
}

// ---- outcomes: no "wrong" label, no hints, no retry — both outcomes advance ----
async function outcomeFreed() {
  const cage = EqUI.cage(), img = cage && cage.querySelector('img');
  // 1) the cage glows… and unlocks
  if (cage) cage.classList.add('glowx');
  Sound.ding(1);
  await wait(0.85);
  Sound.unlock();
  await wait(0.4);
  // 2) the cage bursts open — the free x stays on the cloud so it reads “x = 2”
  const p = img ? EqUI.worldAt(img) : { x: 700, y: 170 };
  if (img) { img.src = IMG + 'xchar.png'; cage.classList.remove('glowx'); cage.classList.add('free'); }
  EqUI.el.querySelectorAll('[data-key="eq"],[data-key="rhs"]').forEach((e) => e.classList.add('win'));
  Sound.creak(); Sound.spring(); Sound.fanfare(); flashScreen();
  FX.burst(p.x, p.y, '#ffd34d', 46, 560); FX.burst(p.x, p.y, '#c58bff', 40, 480); FX.ring(p.x, p.y, '#ffffff', 200);
  FX.confetti(p.x, p.y, 140, 1000);
  Stage.shake(0.15);
  Stage.camTo({ fy: 330, z: 1.08 }, 0.8);
  await wait(1.9);                                     // reading beat: the value of x
  // 3) x does a happy hop… and disappears in a poof of sparkles (it never comes down)
  const q = img ? EqUI.worldAt(img) : p;
  const s0 = img ? img.getBoundingClientRect().height / (Stage.S * Stage.z) / 107 : 1;
  const fl = document.createElement('div'); fl.className = 'xfly'; fl.innerHTML = `<img src="${IMG}xchar.png" alt="">`;
  $('#fly').appendChild(fl);
  if (img) img.style.visibility = 'hidden';
  EqUI.el.classList.add('fadeout');
  Sound.spring();
  const put = (x, y, r, s, o) => { fl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`; fl.style.opacity = o.toFixed(3); };
  await tween(0.45, (e) => put(q.x, q.y - 70 * e, 8 * Math.sin(e * Math.PI), s0 * (1 + 0.18 * e), 1), Ease.outCubic);
  Sound.sparkle();
  await tween(0.32, (e) => {
    put(q.x, q.y - 70 - 12 * e, 8 + 260 * e, s0 * 1.18 * (1 - e), 1 - e * 0.6);
    if (Math.random() < 0.9) FX.trail(q.x + rr(-30, 30), q.y - 70 + rr(-30, 30), pick(['#d4b0ff', '#fff1a8', '#ffffff']));
  }, Ease.inBack);
  FX.burst(q.x, q.y - 80, '#d4b0ff', 34, 380, { g: 0 }); FX.burst(q.x, q.y - 80, '#ffffff', 18, 260, { g: 0 }); FX.ring(q.x, q.y - 80, '#ffffff', 110);
  Sound.pop(1.6);
  fl.remove();
  // 4) the cloud clears; the next round brings in a new cloud
  Stage.camTo({ fy: CY, z: 1 }, 1.0);
  await Cloud.clear();
  await wait(0.3);
}
async function outcomeStuck() {
  const cage = EqUI.cage();
  await wait(0.45);
  if (cage) cage.classList.add('rattle');
  Sound.rattle(); Sound.wobble(); Stage.shake(0.2);
  EqUI.el.classList.add('wob');
  await Cloud.wobble();
  EqUI.el.classList.remove('wob');
  await Cloud.leave();
}

// ---- tutorials (first entry only; replayable from the pause menu) ----
async function tutorialLoad() {
  G.taught1 = true;
  const cage = EqUI.cage(); if (cage) cage.classList.add('push');
  // 1) this is x — everything else blurs
  Spot.show(() => EqUI.cage(), { sx: 1.15, sy: 1.08, pad: 30 });
  await VO.say("Let's free x!", 0.35, 'free-x');
  return () => {
    // 2) the glowing −5 is the only ball you can tap
    const guide = ROUNDS[G.idx].guide || [];
    Rack.balls.forEach((b) => (b.guide = guide.some((g) => parseOp(g).label === b.op.label)));
    const gb = Rack.balls.find((b) => b.guide);
    if (gb) { G.spotOnly = gb; Spot.show(() => gb.el, { hand: true, sx: 1.2, sy: 1.2, pad: 26 }); } else Rack.glowWave();
    VO.say('Tap an operation to load the cannon.', 0.5, 'tap-op');
    // 3) once it is loaded, the spotlight moves to FIRE
    G.hooks.onFill = (filled, n) => {
      if (filled === n && !G.hooks.saidFire) {
        G.hooks.saidFire = true;
        if (G.spotOnly) { G.spotOnly = 'fire'; wait(0.45).then(() => { if (G.spotOnly === 'fire') Spot.show(() => $('#fireBtn'), { hand: true, sx: 1.12, sy: 1.45, pad: 24 }); }); }
        VO.say('Tap Fire to launch your operation.', 0.5, 'tap-fire-1');
      }
    };
  };
}
async function tutorialSeq() {
  G.taughtSeq = true;
  // the two sockets (with their 1 and 2 markers) are the focus while the order is explained
  Spot.show(() => [...Cannon.sock, ...Cannon.tags], { sx: 1.1, sy: 1.2, pad: 30 });
  await VO.say('Load the operations into the cannon in the order you want to apply them.', 0.15, 'order');
  Cannon.pulseSockets();
  await VO.say('The cannon fires from left to right.', 0.3, 'left-right');
  Spot.hide();
  return () => {
    G.hooks.onFill = (filled, n) => {
      if (filled === 1 && !G.hooks.saidNext) { G.hooks.saidNext = true; VO.say('Now load your next operation.', 0.5, 'next-op'); }
      if (filled === n && !G.hooks.saidFire) { // a soft spotlight on FIRE (balls stay tappable, it lifts if you unload one)
        G.hooks.saidFire = true; G.hooks.softSpot = true;
        Spot.show(() => $('#fireBtn'), { hand: true, sx: 1.12, sy: 1.45, pad: 24 });
        VO.say('Tap Fire to launch your operations.', 0.5, 'tap-fire-n');
      }
      if (filled < n && G.hooks.softSpot) { G.hooks.softSpot = false; Spot.hide(); }
    };
  };
}

// ---- a full round ----
async function firstEntry() { // the play scene has just built itself after the start screen
  EqUI.el.style.transition = 'opacity .35s'; EqUI.el.style.opacity = 1;
  await wait(0.2);
}
async function playRound(sid, i) {
  const R = ROUNDS[i];
  G.idx = i; G.hooks = {};
  G.eq = { layers: initLayers(R.eq), rhs: F(R.rhs) };
  G.sockets = new Array(R.slots).fill(null);
  const tasks = [Cannon.morph(R.slots)];
  if (G.rackFor !== R) { tasks.push(refreshBalls(R.balls)); G.rackFor = R; }
  EqUI.setEq(G.eq, false);
  if (G.firstEntry) { G.firstEntry = false; tasks.push(firstEntry()); }
  else { tasks.push(Cloud.enter()); Stage.cam.fx = CX + 60; tasks.push(Stage.camTo({ fx: CX }, 1.3)); }
  await Promise.all(tasks);
  if (sid !== G.session) return;
  let after = null;
  if (i === 0 && !G.taught1) after = await tutorialLoad();
  else if (R.slots > 1 && !G.taughtSeq) after = await tutorialSeq();
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
  await wait(0.15);
  const solved = await playback(sid);
  if (sid !== G.session) return;
  if (solved) { G.freed++; await outcomeFreed(); } else await outcomeStuck();
}
async function runSession() {
  const sid = ++G.session;
  G.freed = 0; G.state = 'play';
  for (let i = 0; i < ROUNDS.length; i++) {
    if (sid !== G.session) return;
    await playRound(sid, i);
  }
  if (sid !== G.session) return;
  await showEnd();
}
async function showEnd() {
  G.state = 'end';
  EqUI.render(msgHTML('You freed', `${G.freed} out of ${ROUNDS.length}!`), false);
  refreshBalls([]); G.rackFor = null;
  await Cloud.enter();
  Sound.fanfare();
  if (G.freed) FX.confetti(828, 200, 100 + G.freed * 30, 1100);
  $('#endUI').classList.add('on');
}
async function restartGame() {
  G.session++; tweens.clear();
  VO.stop(); G.inputOn = false; G.fireResolve = null; G.hooks = {}; G.helping = false; G.spotOnly = null; Spot.hide();
  $('#endUI').classList.remove('on');
  Cannon.setFireActive(false); for (let i = 0; i < 2; i++) Cannon.highlight(i, false);
  $('#fly').innerHTML = '';
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1 });
  Cloud.a = 1; Cloud.s = 1; Cloud.blur = 0; Cloud.rot = 0;
  G.rackFor = null;
  runSession();
}

// ---- pause ----
function setPaused(p) {
  if (G.state === 'title' || G.state === 'boot' || G.paused === p) return;
  G.paused = p; Clock.paused = p;
  $('#pauseBtn img').src = IMG + (p ? 'play.png' : 'pause.png');
  $('#pauseBtn').setAttribute('aria-label', p ? 'Resume' : 'Pause');
  if (p) { Music.pause(); Sound.suspend(); VO.pause(); }
  else { Music.resume(); Sound.resume(); VO.resume(); last = performance.now(); }
}

// ---- title / thumbnail ----
async function onPlay() {
  if (G.state !== 'title') return;
  G.state = 'starting';
  Sound.init(); Sound.resume(); Music.start(); Sound.startAmbient(); VO.pickVoice();
  $('#credits').classList.add('hide');
  flashScreen();
  await Title.exit();
  EqUI.setEq({ layers: initLayers(ROUNDS[0].eq), rhs: F(ROUNDS[0].rhs) }, false);
  Cloud.y = -470; Cannon.morphS = 0.001; Rack.enterY = 330;
  $('#world').classList.remove('title');
  Stage.camTo({ fx: CX, fy: CY, z: 1 }, 1.3, Ease.inOutCubic);
  Sound.swoosh();
  await Promise.all([
    tween(1.05, (e) => (Cloud.y = -470 * (1 - e)), Ease.outBack),
    tween(0.75, (e) => (Rack.enterY = 330 * (1 - e)), Ease.outBack, 0.12).then(() => Sound.settle()),
    tween(0.6, (e) => (Cannon.morphS = Math.max(0.001, e)), Ease.outBack, 0.38).then(() => { Sound.clunk(); Cannon.groundDust(true); Stage.shake(0.12); }),
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') setPaused(true); last = performance.now(); });
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * (window.__cqSpeed || 1); last = now;
  if (Clock.paused) return;
  Clock.t += dt; const t = Clock.t;
  updateTweens(dt); Music.update(dt);
  if (G.state === 'title') { const c = Stage.cam; c.fx = CX + Math.sin(t * 0.22) * 28; c.fy = CY + Math.sin(t * 0.31) * 10; c.z = 1.05 + Math.sin(t * 0.17) * 0.02; }
  Minis.update(dt); Cloud.apply(t); Cannon.update(dt, t); updateBalls(dt, t); Rack.applyEnter(); Title.update(t, dt);
  if (G.inputOn && !G.helping) { G.idle += dt; if (G.idle > 7) { G.idle = 0; idleHint(); } }
  Stage.update(dt, t); Spot.update(dt, t); FX.update(dt); FX.draw();
}
async function boot() {
  const names = ['bg.jpg', 'cloud.png', 'cage_x.png', 'cage.png', 'xchar.png', 'fire.png', 'pause.png', 'play.png', 'sound.png', 'rack.png', 'rack_front.png', 'cannon1.png', 'cannon2.png', 'cannon1_front.png', 'cannon2_front.png', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `ball_${i}.png`),
    'playbtn.png', 't_logo.png', 't_cage.png', 't_lines.png', 't_cannon.png', 't_fire.png', 't_spark.png', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `t_ball_${i}.png`)];
  const load = (n) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = () => r(); im.src = IMG + n; });
  try { await Promise.race([Promise.all([...names.map(load), document.fonts.load('700 64px Fredoka')]), later(9000)]); } catch (e) { /* carry on */ }
  FX.init(); Stage.init(); Cloud.init(); Cannon.init(); Rack.init(); EqUI.init(); Minis.init(); Title.init(); Spot.init();
  Rack.balls = ROUNDS[0].balls.map((s, i) => createBall(s, i)); G.rackFor = ROUNDS[0];
  wireInput();
  Object.assign(Stage.cam, { fx: CX, fy: CY, z: 1.05 });
  G.state = 'title';
  requestAnimationFrame((n) => { last = n; frame(n); });
  window.__cqBooted = true; window.__cq = { G, Clock, Rack, Sound, Music, Stage, EqUI, VO };
  await later(300);
  $('#loading').classList.add('hide');
  await later(250);
  Title.start();
}
boot();
