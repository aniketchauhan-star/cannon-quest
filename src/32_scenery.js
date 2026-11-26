// =====================================================================
//  SCENERY: the living background on the user's deck picture (art/background/new_background.png, cut into
//  layers by tools/cut_deck_bg.py). Only transform and opacity move, almost all in CSS keyframes, so it runs on the
//  compositor thread and never stutters.
//  • SUN: top right. The sky brightens toward it; a white disc with its bloom and two slowly counter-turning glare
//    layers (sun_glow / sun_rays, drawn by tools/make_sun.py).
//  • NO painted clouds: the only cloud in the game is the equation's (the user, 19 Nov).
//  • JUNGLE: low mist drifting between the trees, soft shafts of sunlight that breathe, sunlit specks floating up,
//    and now and then a leaf tumbling down from the trees.
//  • BIRDS: a small flock (1–3) now and then, in the sky either side of the cloud, into or out of the treetops. They flap a few beats
//    and glide. GSAP, so they stop with the game on pause; none under reduced motion.
//  • WIND: the two leafy plants behind the railing sway on one gust curve (Wind.lean). Each plant's delay follows
//    its x, so a gust crosses the scene from left to right. The sway starts and ends upright, as painted.
//  Freezes with the game on pause. Under reduced motion it stands still (each CSS loop ends where it rests).
// =====================================================================

// (bg units = the 1672×941 frame)
const SUN = { x: 1490, y: 96 }; // top right: clear of the HUD, the equation cloud and the title's caged x
// the jungle pieces. Mist: centre, size, how far it drifts each way, seconds per sweep, strength.
const MIST = [
  { x: 520, y: 520, w: 900, h: 120, mx: 70, T: 52, o: 0.7 },
  { x: 1220, y: 505, w: 820, h: 110, mx: -60, T: 64, o: 0.6 },
  { x: 880, y: 560, w: 1100, h: 130, mx: 50, T: 58, o: 0.55 },
  { x: 150, y: 545, w: 600, h: 110, mx: -40, T: 46, o: 0.5 },
];
// light shafts: from the sun toward these points in the forest (x, y), width; the near part is masked off so each
// shaft only shows as it falls through the trees
const SHAFTS = [[1210, 590, 110], [1040, 610, 70], [880, 600, 130], [1390, 620, 60], [700, 610, 80]];
// where leaves fall from (under the crowns of the trees that stand out of the forest; the three biggest were taken
// out on 23 Nov, tools/thin_trees.py): x, y; each falls with its own timing. Sunlit yellow-green and a few golden
// ones, so they show against the green trees
const LEAF_FROM = [[150, 400], [230, 405], [560, 430], [650, 425], [1120, 415], [1260, 420], [1345, 430], [1600, 440]];
const LEAF_HUE = ['#d4ec4c', '#f2c94c', '#c3e24a', '#ffd95a'];

// ---------- WIND ----------
const PLANTS = ['#bgPlantL', '#bgPlantR']; // (their boxes are #bgPlantL / #bgPlantR in src/00_head.html)
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
  // CSS keyframes (transform only; linear between 72 samples of the curve), measured from the lean at the start of
  // the cycle, so the first and last frames are the plant as painted (that is also where reduced motion leaves it)
  css() {
    const N = 72, L0 = this.lean(0);
    let s = '@keyframes wplant{';
    for (let i = 0; i <= N; i++) {
      const L = this.lean(i / N) - L0;
      s += `${((i * 100) / N).toFixed(2)}%{transform:rotate(${(2.4 * L).toFixed(2)}deg) skewX(${(-2 * L).toFixed(2)}deg)}`;
    }
    return s + '}';
  },
  delay(x) { return (x / this.SPEED - this.PERIOD).toFixed(2) + 's'; }, // (negative: every plant is mid-sway from the start)
};

// a small seeded random, so the scene is the same on every load
const scnRand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
const scnPiece = (box, cls, css, vars) => {
  const e = document.createElement('i'); e.className = cls; Object.assign(e.style, css);
  if (vars) for (const k in vars) e.style.setProperty(k, vars[k]);
  box.appendChild(e); return e;
};

// ---------- SUN ----------
const Sun = {
  build() {
    const el = $('#bgSun'); el.style.left = SUN.x + 'px'; el.style.top = SUN.y + 'px';
    const add = (tag, cls, src) => { const e = document.createElement(tag); e.className = cls; if (src) { e.src = IMG + src; e.alt = ''; } el.appendChild(e); };
    add('i', 'sk'); add('img', 'sg', 'sun_glow.webp'); add('img', 'sr r1', 'sun_rays.webp'); add('img', 'sr r2', 'sun_rays.webp');
    add('i', 'ss'); add('i', 'sd');
  },
};

// ---------- JUNGLE ----------
const Jungle = {
  build() {
    const box = $('#bgJungle'), R = scnRand;
    MIST.forEach((m) => scnPiece(box, 'ms', {
      left: m.x - m.w / 2 + 'px', top: m.y - m.h / 2 + 'px', width: m.w + 'px', height: m.h + 'px', opacity: m.o,
      animationDuration: m.T + 's', animationDelay: (-m.T * R()).toFixed(2) + 's',
    }, { '--mx': m.mx + 'px' }));
    SHAFTS.forEach(([tx, ty, w], i) => { // a long soft beam hung from the sun, turned to point at its spot in the forest
      const dx = tx - SUN.x, dy = ty - SUN.y, len = Math.hypot(dx, dy) * 1.12, ang = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      scnPiece(box, 'sh', {
        left: SUN.x - w / 2 + 'px', top: SUN.y + 'px', width: w + 'px', height: len + 'px', transform: `rotate(${ang.toFixed(2)}deg)`,
        animationDuration: (6 + i * 1.7).toFixed(1) + 's', animationDelay: (-4 * R()).toFixed(2) + 's',
      });
    });
    for (let i = 0; i < 18; i++) { // sunlit specks, mostly on the sunny right, drifting up and a little toward the sun
      const T = 7 + R() * 6;
      scnPiece(box, 'mt', {
        left: 760 + R() * 880 + 'px', top: 330 + R() * 230 + 'px', animationDuration: T.toFixed(2) + 's', animationDelay: (-T * R()).toFixed(2) + 's',
      }, { '--mx': (R() * 50 - 15).toFixed(1) + 'px', '--my': -(40 + R() * 60).toFixed(1) + 'px' }).style.scale = (0.7 + R() * 0.7).toFixed(2);
    }
    LEAF_FROM.forEach(([x, y], i) => { // each leaf falls for ~60 % of its loop and rests unseen for the rest
      const T = 14 + R() * 9, c = LEAF_HUE[i % LEAF_HUE.length];
      const e = scnPiece(box, 'lf', { left: x + 'px', top: y + 'px', animationDuration: T.toFixed(2) + 's', animationDelay: (-T * R()).toFixed(2) + 's' },
        { '--lx': (R() * 70 - 35).toFixed(1) + 'px', '--ly': (125 + R() * 35).toFixed(1) + 'px' }); // (fades out just above the railing)
      e.innerHTML = `<b style="animation-duration:${(2.2 + R()).toFixed(2)}s;animation-delay:${(-2 * R()).toFixed(2)}s"><svg viewBox="0 0 20 20" style="animation-duration:${(1.6 + R() * 0.8).toFixed(2)}s"><path d="M10 1C15 5 16 12 10 19C4 12 5 5 10 1Z" fill="${c}" stroke="rgba(70,100,10,.7)" stroke-width="1"/><path d="M10 3V17" stroke="rgba(70,100,10,.6)" stroke-width="1.1" fill="none"/></svg></b>`;
    });
  },
};

// ---------- BIRDS ----------
const BIRD_SVG = '<span class="bb"><svg viewBox="0 0 44 30"><path class="w" d="M22 15C17 9 10 6 2 8C9 9.5 15 12 20 17Z"/><path class="w" d="M22 15C27 9 34 6 42 8C35 9.5 29 12 24 17Z"/>'
  + '<path d="M16.5 16L11.5 14.2L12.2 18.2Z"/><ellipse cx="22" cy="16" rx="5.6" ry="2.6"/><circle cx="27.2" cy="14.9" r="2.2"/></svg></span>';
// Birds keep to the open sky either side of the cloud and never cross it (the user, 26 Nov 2026: "the birds should
// not overlap with the cloud"): a flock glides in from one side of the screen and comes down into the trees on that
// side, or rises out of them and flies off that side. They meet the treetops at BIRD_SKY (art px), well clear of the
// cloud (x 617–1039, y 160–339) and of the question board at the top, also with the camera leaning in (their layer
// drifts at most ~40 px against the cloud's). The birds of a flock follow one another along the same line, a moment
// apart, each a little above or below it.
const BIRD_SKY = { left: [370, 490], right: [1180, 1300], edgeY: [185, 255], treeY: [440, 470] };
const Birds = {
  live: 0,
  start() { gsap.delayedCall(2.5, () => this.next()); }, // the first flock soon after the start screen shows
  next() {
    if (!Motion.reduced && this.live < 2) this.flock();
    gsap.delayedCall(9 + Math.random() * 9, () => this.next()); // then one every 9–18 s (game time)
  },
  flock() {
    const box = $('#bgBirds'), r = Math.random(), n = r < 0.4 ? 1 : r < 0.75 ? 2 : 3, rnd = (a, b) => a + Math.random() * (b - a);
    const left = Math.random() < 0.5, up = Math.random() < 0.5; // which side; rising out of the trees (or coming down into them)
    const [a, b] = left ? BIRD_SKY.left : BIRD_SKY.right;
    const edge = { x: left ? -90 : DW + 90, y: rnd(...BIRD_SKY.edgeY) }, tree = { x: rnd(a, b), y: rnd(...BIRD_SKY.treeY) };
    const [p0, p1] = up ? [tree, edge] : [edge, tree], dir = p1.x > p0.x ? 1 : -1, dur = rnd(6.5, 9);
    let alive = n; this.live++;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'bird'; el.innerHTML = BIRD_SVG; box.appendChild(el);
      const beat = 2.2 + Math.random() * 0.6, ph = -Math.random() * beat; // its own wingbeat and phase
      el.querySelectorAll('.bb,.w').forEach((p) => { p.style.animationDuration = beat + 's'; p.style.animationDelay = ph + 's'; });
      const delay = i * rnd(0.35, 0.6), dy = i ? (i % 2 ? 1 : -1) * rnd(10, 22) : 0, s = rnd(0.72, 1.02) * (i ? 0.9 : 1);
      // into the trees: level at first, then dipping (nose down), fading as the leaves take it; out of them: a steep
      // climb that levels off, coming into sight from behind the treetops
      const tilt = dir * (up ? -12 : 13);
      gsap.set(el, { x: p0.x, y: p0.y + dy, scaleX: dir * s, scaleY: s, rotation: up ? tilt : 0, opacity: up ? 0 : 1 });
      gsap.to(el, { x: p1.x, duration: dur, delay, ease: 'none', onComplete: () => { el.remove(); if (--alive === 0) this.live--; } });
      gsap.to(el, { y: p1.y + dy, duration: dur, delay, ease: up ? 'power1.out' : 'power1.in' });
      gsap.to(el, { rotation: up ? 0 : tilt, duration: dur * 0.7, delay: delay + (up ? dur * 0.3 : 0), ease: 'sine.inOut' });
      gsap.to(el, up ? { opacity: 1, duration: dur * 0.2, delay: delay + dur * 0.05 } : { opacity: 0, duration: dur * 0.18, delay: delay + dur * 0.8 });
    }
  },
};

const Scenery = {
  // at boot, before the start screen shows: the sun, the jungle's life, the plants' wind; then the birds start
  build() {
    Sun.build(); Jungle.build();
    PLANTS.forEach((id) => {
      const el = $(id);
      el.querySelector('img').style.animationDelay = Wind.delay(parseFloat(getComputedStyle(el).left) + el.offsetWidth / 2);
    });
    const st = document.createElement('style'); st.textContent = Wind.css(); document.head.appendChild(st);
    Birds.start();
  },
  pause(p) { document.body.classList.toggle('scnPause', p); },
};
