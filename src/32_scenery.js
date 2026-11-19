// =====================================================================
//  SCENERY: the living background. Only transform + opacity move, plus one canvas for the water.
//  • WIND: the bank's grass, bushes and tufts and the corner plants sway on one gust curve (Wind.lean). The
//    curve becomes CSS keyframes, so the sway runs on the compositor thread and never stutters. Each plant's
//    delay follows its x, so every gust travels across the scene from left to right.
//  • WATER: a canvas over the lake picture, redrawn each frame on real time. Its rows ripple side to side
//    (more near the shore than far out), the far trees are mirrored in the water, and glints twinkle on the
//    surface, thickest in the sun's path.
//  • SUN: a white disc (CSS) with its bloom and two counter-turning glare layers (sun_glow / sun_rays, drawn
//    by tools/make_sun.py), a warm haze over the far hills, and a faint lens flare along the line from the sun
//    through the screen centre that follows the camera.
//  Freezes with the game on pause. Under reduced motion it stands still (one still frame of water). On the low
//  quality tier (Perf) the water is drawn coarser, at half rate, with fewer glints.
// =====================================================================

// The ground's pieces from tools/compose_bg.py (bg_ground.json), in ground units inside the ground box.
// Back to front: bank, grass strip, plaza, bushes, rocks, tufts.
const GROUND = {
  box: { x: -60, y: 560, w: 1792, h: 411 },
  bank: { y: 102, top: [121, 205, 58], bot: [98, 188, 46] },
  grass: { y: 80.5, w: 151.5, h: 35.5, at: [[-20, 1], [113.5, 0], [247, 1], [380.5, 0], [514, 1], [647.5, 1], [781, 0], [914.5, 1], [1048, 0], [1181.5, 1], [1315, 0], [1448.5, 1], [1582, 0], [1715.5, 0]] },
  plaza: { src: 'bg_plaza', x: 0, y: 119.5, w: 1792, h: 291.5 },
  bushes: [{ src: 'bg_bush', x: 50, y: 15, w: 187, h: 111, flip: 0 }, { src: 'bg_bush', x: 1560, y: 17, w: 187, h: 111, flip: 1 }],
  rocks: [{ src: 'bg_rocksL', x: 134, y: 6.5, w: 447.5, h: 119.5 }, { src: 'bg_rocksR', x: 1173.5, y: 13, w: 469.5, h: 113 }],
  tufts: [{ src: 'bg_tuft1', x: 580, y: 74.5, w: 75.5, h: 47.5, flip: 0 }, { src: 'bg_tuft2', x: 1110, y: 74.5, w: 98.5, h: 49.5, flip: 1 }],
};
// The lake and trees layers (bg units; see #bgLake / #bgTrees). In lake units, the water is solid from row `top`
// to row `bottom`. The trees' foot is hidden under the lake, so they meet the water at the lake's top row.
const LAKE = { x: -134, y: 546, w: 1940, h: 121.5, top: 8, bottom: 114 };
const TREES = { y: 404, h: 168 };
const SUN = { x: 1490, y: 92 }; // top right, clear of the HUD, the equation cloud and the title's caged x
const kOf = (id) => (PARALLAX.find((p) => p[0] === id) || [0, 1])[1];

// ---------- WIND ----------
const Wind = {
  PERIOD: 12, SPEED: 560, // one gust cycle, in seconds; how fast a gust crosses the scene (bg units per second)
  // the lean (0 = upright, 1 = a full gust) over one cycle, u in 0..1. A breeze that never quite stops, two gusts
  // of different strength, and a small spring back after each one.
  lean(u) {
    const P = Math.PI * 2;
    const g = (c, w) => { let d = Math.abs(u - c); d = Math.min(d, 1 - d); return Math.exp(-((d / w) ** 2)); };
    return 0.3 + 0.1 * Math.sin(P * u + 0.4) + 0.07 * Math.sin(P * 2 * u + 1.9) + 0.04 * Math.sin(P * 5 * u + 0.8) + 0.025 * Math.sin(P * 11 * u)
      + 0.62 * g(0.3, 0.075) - 0.2 * g(0.405, 0.05) + 0.36 * g(0.72, 0.055) - 0.12 * g(0.79, 0.04);
  },
  // CSS keyframes for each kind of plant (transform only; linear between 72 samples of the curve)
  css() {
    const N = 72;
    const kf = (name, f) => {
      let s = `@keyframes ${name}{`;
      for (let i = 0; i <= N; i++) s += `${((i * 100) / N).toFixed(2)}%{transform:${f(this.lean(i / N))}}`;
      return s + '}';
    };
    return kf('wgrass', (L) => `skewX(${(-7.5 * L).toFixed(2)}deg)`)
      + kf('wtuft', (L) => `skewX(${(-9 * L).toFixed(2)}deg)`)
      + kf('wbush', (L) => `rotate(${(2.6 * L).toFixed(2)}deg) skewX(${(-2.2 * L).toFixed(2)}deg)`)
      + kf('wfore', (L) => `rotate(${(2.2 * L - 0.5).toFixed(2)}deg) skewX(${(-1.8 * L + 0.4).toFixed(2)}deg)`);
  },
  delay(x) { return (x / this.SPEED - this.PERIOD).toFixed(2) + 's'; }, // (negative: every plant is mid-sway from the start)
};

function buildGround() {
  const box = $('#bgGround'), G = GROUND;
  const put = (tag, cls, d, parent = box) => {
    const e = document.createElement(tag); e.className = cls;
    Object.assign(e.style, { left: d.x + 'px', top: d.y + 'px', width: d.w + 'px', height: d.h + 'px' });
    parent.appendChild(e); return e;
  };
  const pic = (src, parent, flip) => { const im = document.createElement('img'); im.src = IMG + src + '.webp'; im.alt = ''; if (flip) im.className = 'fl'; parent.appendChild(im); return im; };
  const plant = (cls, d, src, flutter) => {
    const w = put('div', 'wnd ' + cls, d); w.style.animationDelay = Wind.delay(G.box.x + d.x + d.w / 2);
    pic(src, flutter ? put('div', 'flt', { x: 0, y: 0, w: d.w, h: d.h }, w) : w, d.flip);
    if (flutter) w.firstChild.style.animationDelay = (-(d.x % 1.7)).toFixed(2) + 's';
  };
  const bank = put('i', 'gbank', { x: 0, y: G.bank.y, w: G.box.w, h: G.box.h - G.bank.y });
  bank.style.background = `linear-gradient(rgb(${G.bank.top}),rgb(${G.bank.bot}))`;
  G.grass.at.forEach(([x, flip]) => plant('wg', { x, y: G.grass.y, w: G.grass.w, h: G.grass.h, flip }, 'bg_grass', false));
  pic(G.plaza.src, put('div', 'gstill', G.plaza));
  G.bushes.forEach((d) => plant('wb', d, d.src, true));
  G.rocks.forEach((d) => pic(d.src, put('div', 'gstill', d)));
  G.tufts.forEach((d) => plant('wt', d, d.src, false));
  // the corner plants (their own parallax layers) join the same wind
  ['#bgForeL', '#bgForeR'].forEach((id) => {
    const el = $(id), im = el.querySelector('img');
    im.style.animationDelay = Wind.delay(parseFloat(getComputedStyle(el).left) + el.offsetWidth / 2);
  });
  const st = document.createElement('style'); st.textContent = Wind.css(); document.head.appendChild(st);
}

// ---------- WATER ----------
// soft light sprites, drawn once: a round glow (stretched flat for glints) and a four-point sparkle
function lightSprite(star) {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), h = n / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, star ? h * 0.42 : h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,244,.8)');
  gr.addColorStop(0.65, 'rgba(255,250,222,.22)'); gr.addColorStop(1, 'rgba(255,250,222,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  if (star) {
    for (const [w, hh] of [[n, 3], [3, n * 0.62]]) {
      const lg = w > hh ? g.createLinearGradient(0, 0, n, 0) : g.createLinearGradient(0, h - hh / 2, 0, h + hh / 2);
      lg.addColorStop(0, 'rgba(255,255,240,0)'); lg.addColorStop(0.5, 'rgba(255,255,250,.95)'); lg.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = lg; g.fillRect(h - w / 2, h - hh / 2, w, hh);
    }
  }
  return c;
}
const Water = {
  on: false, cv: null, ctx: null, img: null, trees: null, refl: null, glow: null, star: null,
  r: 1, W: 0, H: 0, bandPx: 2, t: 0, odd: false, tier: 0, key: '', drawn: '', parts: [], nParts: 0,
  REFL_H: 46, REFL_SQ: 0.82, REFL_A: 0.72, // how far down the trees' mirror image reaches (lake units), its squash, strength
  init() {
    const box = $('#bgLake'); this.img = box.querySelector('img'); this.trees = $('#bgTrees');
    const cv = document.createElement('canvas');
    let ctx = null;
    try { ctx = cv.getContext('2d'); } catch (e) { /* no canvas: the still picture stays */ }
    if (!ctx) return;
    box.appendChild(cv); this.cv = cv; this.ctx = ctx;
    this.glow = lightSprite(false); this.star = lightSprite(true);
    for (let i = 0; i < 120; i++) this.parts.push({ x: 0, y: 0, len: 0, h: 0, life: 1, age: 0, peak: 0, vx: 0, star: false, streak: false });
    this.on = true;
  },
  // the canvas matches the lake's size on screen (capped), and the trees' mirror image is redrawn at that size
  configure() {
    const tier = Perf.tier, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = clamp(Stage.S * (Stage.bgK || 1) * dpr * 1.12, 0.5, tier > 1 ? 2 : 1.15);
    this.r = r; this.tier = tier;
    this.W = this.cv.width = Math.round(LAKE.w * r); this.H = this.cv.height = Math.round(LAKE.h * r);
    this.bandPx = Math.max(1, Math.round(r * (tier > 1 ? 1.25 : 2.5))); // rows drawn per ripple step
    this.nParts = tier > 1 ? 120 : 52;
    // the far trees, mirrored about the waterline, squashed, tinted toward the water and fading with depth
    const c = this.refl || (this.refl = document.createElement('canvas')), g = c.getContext('2d');
    c.width = this.W; c.height = Math.ceil(this.REFL_H * r);
    const wl = LAKE.y + LAKE.top - TREES.y, sq = this.REFL_SQ;
    g.setTransform(r, 0, 0, -sq * r, 0, wl * sq * r);
    g.drawImage(this.trees, 0, 0, LAKE.w, TREES.h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,118,168,.34)'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.3, 'rgba(0,0,0,.62)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    for (const p of this.parts) this.spawn(p, true);
  },
  // the sun's x over the lake (lake units): the sun and the lake drift apart a little as the camera moves
  sunX() { return SUN.x - LAKE.x + ((Stage.fx - CX) * (kOf('#bgLake') - kOf('#bgSun'))) / (Stage.bgK || 1); },
  gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; },
  // a glint: most sit in the sun's path (a broad band under the sun, wider near the shore), the rest anywhere;
  // a few are long, slow streaks of light that drift
  spawn(p, first) {
    const L = LAKE, R = Math.random();
    p.y = L.top + 5 + Math.pow(Math.random(), 0.85) * (L.bottom - L.top - 9);
    const d = (p.y - L.top) / (L.bottom - L.top), near = 0.55 + 0.9 * d;
    p.streak = R > 0.9; p.star = false; p.vx = 0;
    if (p.streak) {
      p.x = Math.random() * L.w; p.len = (34 + Math.random() * 56) * near; p.h = 2.4 * near;
      p.life = 2.6 + Math.random() * 2.4; p.peak = 0.3 + Math.random() * 0.25; p.vx = (Math.random() - 0.35) * 7;
    } else if (R < 0.64) { // (the sun's path shows most on the far water, above the rocks)
      p.y = L.top + 4 + Math.pow(Math.random(), 1.7) * (L.bottom - L.top - 8);
      const dd = (p.y - L.top) / (L.bottom - L.top), nn = 0.55 + 0.9 * dd;
      p.x = this.sunX() + this.gauss() * (150 + 320 * dd); p.len = (9 + Math.random() * 15) * nn; p.h = p.len * 0.3;
      p.life = 0.22 + Math.random() * 0.6; p.peak = 0.65 + Math.random() * 0.35; p.star = Math.random() < 0.25;
    } else {
      p.x = Math.random() * L.w; p.len = (7 + Math.random() * 12) * near; p.h = p.len * 0.3;
      p.life = 0.5 + Math.random() * 1.3; p.peak = 0.3 + Math.random() * 0.35;
    }
    p.age = first ? Math.random() * p.life : 0;
  },
  update(rdt) {
    if (!this.on || !this.img.complete || !this.img.naturalWidth || !this.trees.complete || !this.trees.naturalWidth) return;
    const key = Perf.tier + ':' + Stage.S.toFixed(4) + ':' + (Stage.bgK || 1).toFixed(4) + ':' + (window.devicePixelRatio || 1);
    if (key !== this.key) { this.key = key; this.configure(); }
    const pdx = ((Stage.fx - CX) * (kOf('#bgLake') - kOf('#bgTrees'))) / (Stage.bgK || 1);
    if (Motion.reduced) { // one still frame, redrawn only when something it shows has changed
      const k = key + ':' + pdx.toFixed(1);
      if (k !== this.drawn) { this.drawn = k; this.draw(0, pdx, false); }
      return;
    }
    this.t += rdt;
    if (this.tier < 2 && (this.odd = !this.odd)) return; // the low tier draws every other frame
    for (let i = 0; i < this.nParts; i++) { const p = this.parts[i]; p.age += this.tier < 2 ? rdt * 2 : rdt; p.x += p.vx * rdt; if (p.age >= p.life) this.spawn(p, false); }
    this.draw(this.t, pdx, true);
  },
  draw(t, pdx, glints) {
    const c = this.ctx, r = this.r, W = this.W, H = this.H, img = this.img, L = LAKE, b = this.bandPx;
    const sk = img.naturalHeight / L.h, sw = img.naturalWidth;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    // 1. the water: each band of rows drifts side to side on two slow waves (bigger near the shore). Whole
    //    canvas rows, so the bands meet without seams.
    for (let y = 0; y < H; y += b) {
      const yu = y / r, d = clamp((yu - L.top) / (L.bottom - L.top), 0, 1), amp = 0.5 + 2.6 * d;
      const dx = amp * (0.62 * Math.sin(yu * 0.52 - t * 1.25) + 0.38 * Math.sin(yu * 0.19 + t * 0.71 + 1.7));
      const h = Math.min(b, H - y);
      c.drawImage(img, 0, (y / r) * sk, sw, (h / r) * sk, dx * r, y, W, h);
    }
    if (!this.cv.classList.contains('live')) { this.cv.classList.add('live'); img.style.visibility = 'hidden'; } // (the canvas is the lake now)
    // 2. the far trees, mirrored: the deeper the row, the more the ripples break it up
    const rf = this.refl, RH = rf.height, top = Math.round(L.top * r);
    c.globalAlpha = this.REFL_A;
    for (let y = 0; y < RH; y += b) {
      const yu = y / r, u = y / RH, amp = 0.6 + 3.4 * u;
      const dx = amp * (0.6 * Math.sin(yu * 0.95 - t * 1.7) + 0.4 * Math.sin(yu * 0.37 + t * 1.05 + 0.6));
      const h = Math.min(b, RH - y);
      c.drawImage(rf, 0, y, W, h, (pdx + dx) * r, top + y, W, h);
    }
    if (!glints) { c.globalAlpha = 1; return; }
    // 3. the sun's sheen on the far water (a soft broad light under the sun that breathes), then the glints:
    //    light added on top, each fading in and out over its short life
    c.globalCompositeOperation = 'lighter';
    const sx = this.sunX();
    c.globalAlpha = 0.13 + 0.035 * Math.sin(t * 0.9) + 0.02 * Math.sin(t * 2.3);
    c.drawImage(this.glow, (sx - 430) * r, (L.top - 10) * r, 860 * r, 76 * r);
    for (let i = 0; i < this.nParts; i++) {
      const p = this.parts[i], k = Math.sin((Math.PI * p.age) / p.life), a = p.peak * k * k * (p.streak ? 1 : k);
      if (a < 0.02 || p.x < -60 || p.x > L.w + 60) continue;
      c.globalAlpha = a;
      if (p.star) { const s = p.len * 1.5 * r; c.drawImage(this.star, p.x * r - s / 2, p.y * r - s / 2, s, s); }
      else c.drawImage(this.glow, (p.x - p.len / 2) * r, (p.y - p.h / 2) * r, p.len * r, p.h * r);
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  },
};

// ---------- SUN ----------
const Sun = {
  el: null, flare: null, ghosts: [], last: '', lastO: '',
  // the lens flare: ghosts along the line from the sun through the screen centre (t = how far along it), in
  // stage units, with their strength
  GHOSTS: [[0.16, 64, 'fgd', 0.5], [0.29, 34, 'fgh', 0.55], [0.41, 132, 'fgr', 0.5], [0.52, 20, 'fgd', 0.7], [0.66, 86, 'fgh', 0.3]],
  init() {
    const el = (this.el = $('#bgSun'));
    el.style.left = SUN.x + 'px'; el.style.top = SUN.y + 'px';
    const haze = $('#bgHaze'); haze.style.left = SUN.x - 800 + 'px'; haze.style.top = SUN.y - 800 + 'px';
    const add = (tag, cls, src) => { const e = document.createElement(tag); e.className = cls; if (src) { e.src = IMG + src; e.alt = ''; } el.appendChild(e); return e; };
    add('img', 'sg', 'sun_glow.webp'); add('img', 'sr r1', 'sun_rays.webp'); add('img', 'sr r2', 'sun_rays.webp');
    add('i', 'ss'); add('i', 'sd');
    this.flare = $('#flare');
    this.ghosts = this.GHOSTS.map(([t, d, cls, o]) => {
      const g = document.createElement('i'); g.className = cls;
      Object.assign(g.style, { width: d + 'px', height: d + 'px', marginLeft: -d / 2 + 'px', marginTop: -d / 2 + 'px', opacity: o });
      this.flare.appendChild(g); return { el: g, t };
    });
  },
  // the sun's place on the stage, then each ghost's place in the world (the flare layer sits in #world, under
  // the cloud and the cannon). The flare fades as the sun leaves the screen.
  update() {
    const kb = Stage.bgK || 1, k = kOf('#bgSun'), b = Stage.bgRect;
    const s = Stage.w2st(b.l + kb * SUN.x + (Stage.fx - CX) * (1 - k), b.t + kb * SUN.y + (Stage.fy - CY) * (1 - k));
    const key = s.x.toFixed(1) + ',' + s.y.toFixed(1) + ',' + Stage.z.toFixed(4);
    if (key === this.last) return;
    this.last = key;
    const out = Math.max(0, -s.x, s.x - DW, -s.y, s.y - DH), o = clamp(1 - out / 160, 0, 1).toFixed(2);
    if (o !== this.lastO) { this.flare.style.opacity = o; this.lastO = o; }
    const z = Stage.z, cs = Stage.cs, sn = Stage.sn;
    for (const g of this.ghosts) {
      const X = s.x + (CX - s.x) * g.t - CX, Y = s.y + (CY - s.y) * g.t - CY;
      const wx = Stage.fx + (X * cs + Y * sn) / z, wy = Stage.fy + (-X * sn + Y * cs) / z;
      g.el.style.transform = `translate(${wx.toFixed(1)}px,${wy.toFixed(1)}px)`;
    }
  },
};

const Scenery = {
  ready: false,
  build() { buildGround(); Sun.init(); }, // at boot, before the loading screen shows the scene
  init() { Water.init(); this.ready = true; }, // once the pictures are in
  update(rdt) { if (!this.ready) return; Water.update(rdt); Sun.update(); }, // each frame, after the camera
  pause(p) { document.body.classList.toggle('scnPause', p); },
};
