// =====================================================================
//  SCENERY: the living background on the user's deck picture (art/background/new_background.png, cut into
//  layers by tools/cut_deck_bg.py). Only transform moves, all in CSS keyframes, so it runs on the compositor
//  thread and never stutters.
//  • WIND: the two leafy plants behind the railing sway on one gust curve (Wind.lean). Each plant's delay follows
//    its x, so a gust crosses the scene from left to right. The sway starts and ends upright, as painted.
//  • CLOUDS: the five painted clouds drift slowly to and fro, each at its own pace, and come back to where they
//    are painted.
//  Freezes with the game on pause. Under reduced motion it stands still, exactly as painted.
// =====================================================================

// The clouds (bg units): each one's box inside bg_clouds.webp (whose own box is CLOUD_PIC), how far it drifts
// (+ = right) and how long one to-and-fro takes, in seconds. Measured on the picture from tools/cut_deck_bg.py.
const CLOUD_PIC = { x: 68, y: 81, w: 1568, h: 263 };
const CLOUDS = [
  { x: 0, y: 0, w: 354, h: 104.5, dx: 14, T: 64 }, // top left, the big one
  { x: 129.5, y: 133, w: 267, h: 72, dx: 10, T: 50 }, // below it
  { x: 434.5, y: 226, w: 128, h: 37, dx: 8, T: 42 }, // the small one low in the middle
  { x: 1039, y: 203.5, w: 177, h: 49.5, dx: -9, T: 46 }, // the small one over the big tree
  { x: 1218.5, y: 26.5, w: 349.5, h: 107.5, dx: -12, T: 58 }, // top right
];
// the two plants (their boxes are #bgPlantL / #bgPlantR in src/00_head.html)
const PLANTS = ['#bgPlantL', '#bgPlantR'];

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

const Scenery = {
  // at boot, before the start screen shows: the clouds (windows onto the one cloud picture, so each can drift on its
  // own) and the plants' wind
  build() {
    const box = $('#bgClouds');
    CLOUDS.forEach((c, i) => {
      const e = document.createElement('i');
      Object.assign(e.style, {
        left: CLOUD_PIC.x + c.x + 'px', top: CLOUD_PIC.y + c.y + 'px', width: c.w + 'px', height: c.h + 'px',
        backgroundPosition: `${-c.x}px ${-c.y}px`, animationDuration: c.T + 's',
        animationDelay: (-c.T * ((i * 0.37) % 1)).toFixed(2) + 's', // (each at its own point of the drift)
      });
      e.style.setProperty('--dx', c.dx + 'px');
      box.appendChild(e);
    });
    PLANTS.forEach((id) => {
      const el = $(id);
      el.querySelector('img').style.animationDelay = Wind.delay(parseFloat(getComputedStyle(el).left) + el.offsetWidth / 2);
    });
    const st = document.createElement('style'); st.textContent = Wind.css(); document.head.appendChild(st);
  },
  pause(p) { document.body.classList.toggle('scnPause', p); },
};
