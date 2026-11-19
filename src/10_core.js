'use strict';
// =====================================================================
//  CANNON QUEST (2D) — core: helpers, tweens, exact maths engine, rounds
// =====================================================================
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};
const rr = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const later = (ms) => new Promise((r) => setTimeout(r, ms)); // boot only (not motion)

// (the game clock, tween() and wait() live in 12_motion.js: GSAP-driven, time-based)
const bez = (a, c, b, e) => { const u = 1 - e; return u * u * a + 2 * u * e * c + e * e * b; };

// =====================================================================
//  Exact fractions + the equation engine. A side is an "onion" of layers
//  around x, e.g. 2(3x+1)+4 = [×3, +1, ×2, +4]. Every shot is applied
//  to the WHOLE of both sides.
// =====================================================================
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
class Frac {
  constructor(n, d = 1) {
    if (d === 0) throw new Error('division by zero');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    this.n = n / g || 0; this.d = d / g;
  }
  add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  abs() { return new Frac(Math.abs(this.n), this.d); }
  isZero() { return this.n === 0; }
  isOne() { return this.n === 1 && this.d === 1; }
}
const F = (n, d = 1) => new Frac(n, d);
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
function parseOp(s) {
  const k = s[0], n = parseInt(s.slice(1), 10);
  if (!n) throw new Error('×0 / ÷0 are never offered');
  const layer = k === '+' ? { t: 'add', v: F(n) } : k === '-' ? { t: 'add', v: F(-n) } : k === '*' ? { t: 'mul', v: F(n) } : { t: 'mul', v: F(1, n) };
  return { k, n, sym: SYM[k], label: SYM[k] + n, layer };
}
const initLayers = (spec) => spec.map(([k, n]) => parseOp(k + n).layer);
function addLayer(layers, L) {
  if (L.t === 'add') {
    const out = layers.slice(), top = out[out.length - 1];
    if (top && top.t === 'add') { const v = top.v.add(L.v); out.pop(); if (!v.isZero()) out.push({ t: 'add', v }); }
    else out.push({ t: 'add', v: L.v });
    return out;
  }
  return mulLayers(layers, L.v);
}
function mulLayers(layers, v) {
  if (!layers.length) return v.isOne() ? [] : [{ t: 'mul', v }];
  const top = layers[layers.length - 1], rest = layers.slice(0, -1);
  if (top.t === 'mul') { const nv = top.v.mul(v); return nv.isOne() ? rest : [...rest, { t: 'mul', v: nv }]; }
  return addLayer(mulLayers(rest, v), { t: 'add', v: top.v.mul(v) }); // (inner + c)·v = inner·v + c·v
}
function applyOp(eq, op) {
  const L = op.layer;
  return { layers: addLayer(eq.layers, L), rhs: L.t === 'add' ? eq.rhs.add(L.v) : eq.rhs.mul(L.v) };
}
const isSolved = (eq) => eq.layers.length === 0;

// ---------- question bank (from the brief) ----------
const ROUNDS = [
  { eq: [['+', 5]], rhs: 7, slots: 1, balls: ['+5', '-5', '*5', '/5', '+3', '-3', '+2', '-2'], guide: ['-5'] },
  { eq: [['*', 2], ['+', 3]], rhs: 11, slots: 2, balls: ['+3', '-3', '*2', '/2', '+2', '-2', '*3', '/3'] },
  { eq: [['*', 3]], rhs: 18, slots: 1, balls: ['+3', '-3', '*3', '/3', '+5', '-5', '+2', '-2'] },
  { eq: [['/', 3], ['+', 2]], rhs: 6, slots: 2, balls: ['-2', '*3', '-6', '/3', '+2', '+6', '-3', '*2'] },
  { eq: [['*', 2], ['+', 7]], rhs: 1, slots: 2, balls: ['-7', '/2', '+7', '*2', '-2', '+2', '-6', '/7'] },
  { eq: [['+', 2], ['*', 3]], rhs: 21, slots: 2, balls: ['/3', '-2', '*3', '+2', '-3', '/2', '-6', '+6'] },
];
// ball art from the asset sheet (magenta, pink, green, cyan, coral, blue, yellow, purple) + darker ink for tokens
const BALL_HEX = ['#e33bf8', '#fb2c91', '#4fbf00', '#00b8d4', '#fd5c53', '#3185fd', '#f2b800', '#a54afb'];
const BALL_INK = ['#a312c0', '#d0106d', '#2f8a00', '#0089a6', '#d8352b', '#1d5fd1', '#c27f00', '#7a22d6'];

// =====================================================================
//  Equation → HTML shown on the cloud. data-key lets tokens glide to
//  their new places when the equation changes (FLIP animation).
// =====================================================================
const IMG = 'assets/img/';
const symHTML = (s) => (s === '÷' ? '<span class="dv"></span>' : s);
const labelHTML = (op) => symHTML(op.sym) + op.n;
const cageHTML = () => `<span class="tk cage" data-key="x"><img class="cg" src="${IMG}cage_x.webp" alt="${T('altX')}" draggable="false"></span>`;
const tk = (cls, key, inner) => `<span class="tk ${cls}" data-key="${key}">${inner}</span>`;
function numHTML(fr) {
  const neg = fr.n < 0, a = Math.abs(fr.n);
  if (fr.d === 1) return (neg ? '−' : '') + a;
  return (neg ? '<span class="ng">−</span>' : '') + `<span class="frac"><span class="fn">${a}</span><span class="fb"></span><span class="fd">${fr.d}</span></span>`;
}
function sideHTML(layers) {
  let html = cageHTML(), kind = 'x';
  layers.forEach((L, i) => {
    if (L.t === 'add') {
      html += tk('op', `a${i}o`, L.v.n < 0 ? '−' : '+') + tk('num', `a${i}n`, numHTML(L.v.abs()));
      kind = 'sum';
      return;
    }
    const p = L.v.n, q = L.v.d;
    const wrapped = kind === 'sum' ? tk('paren', `p${i}l`, '(') + html + tk('paren', `p${i}r`, ')') : html;
    let numer;
    if (p === 1) numer = q !== 1 && kind === 'sum' ? html : wrapped;
    else numer = tk('num', `m${i}`, (p < 0 ? '−' : '') + (Math.abs(p) === 1 ? '' : Math.abs(p))) + wrapped;
    if (q === 1) { html = numer; kind = 'prod'; }
    else { html = `<span class="tk frac" data-key="f${i}"><span class="fn">${numer}</span><span class="fb"></span><span class="fd">${q}</span></span>`; kind = 'frac'; }
  });
  return { html, kind };
}
const eqHTML = (eq) => sideHTML(eq.layers).html + tk('op eqs', 'eq', '=') + tk('num', 'rhs', numHTML(eq.rhs));
function impactHTML(eq, op, color) {
  const S = sideHTML(eq.layers);
  const inc = (k) => `<span class="tk inc hid" data-key="${k}" style="--tok:${color}"><span class="op">${symHTML(op.sym)}</span>${op.n}</span>`;
  const left = op.layer.t === 'mul' && S.kind !== 'x' ? tk('paren', 'ipl', '(') + S.html + tk('paren', 'ipr', ')') : S.html;
  return left + inc('inL') + tk('op eqs', 'eq', '=') + tk('num', 'rhs', numHTML(eq.rhs)) + inc('inR');
}
const msgHTML = (a, b) => `<div class="tk msg" data-key="msg"><span class="m1">${a}</span><span class="m2">${b}</span></div>`;
