#!/usr/bin/env node
// Make Cannon Quest's voice lines in the TTS studio "Ai Wala Human By Aamir", one at a time through
// its Single Generation tab, in ONE man's voice (the user's choice of 2026-11-18; "voice" in
// tools/vo_lines.json, by default 'Male Child (Energetic)' = Gemini voice Puck, an adult man's upbeat
// voice), language Hindi (English words in an Indian accent), format .MP3. Adapted from Crown Quest's
// tools/vo_studio.mjs (see crown quest/docs/VOICEOVER.md for the studio's settings and limits).
//
//   node tools/vo_studio.mjs                   every voiced key (tools/vo_lines.json) with no clip yet
//   node tools/vo_studio.mjs tutFreeX tutTapOp  just these keys (made again even if they have clips)
//   node tools/vo_studio.mjs --audition        4 sample lines in each of the studio's 3 men's voices,
//                                              into tools/studio_out/audition/<voice>/ (not into the game):
//                                              listen, then put the one you like in vo_lines.json "voice"
//   node tools/vo_studio.mjs --voice "Male Teacher (Formal)" …   another voice for this run only
//
// The studio reads only the words (it sends no style prompt), so a line's emotion comes from its
// wording and punctuation ("Boom! x is free!"): write the line in locales.json the way it should feel.
//
// The line's English comes from locales/locales.json (or tools/vo_lines.json "spoken" when the voice
// needs another form). Each finished MP3 is kept in tools/studio_out/<key>.mp3 at once (a rerun skips
// those); then `sh tools/vo_build.sh` turns them into assets/VO/en/<key>.webm. It stops at the first
// error the studio shows, such as "Exceeded monthly Gemini API spending cap" (the studio owner's
// billing: waiting is the only fix, never another voice tool). Needs Node 22+ and Playwright's cached
// headless shell (no npm install). Never plays a sound (--mute-audio).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO = 'https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/';
const LANG = 'hi';
// the studio's men's voices (its label → the Gemini voice it really uses)
const MEN = { 'Male Child (Energetic)': 'puck', 'Male Teacher (Formal)': 'charon', 'Male Senior (Pedagogical)': 'fenrir' };
const AUDITION = ['voWelcome', 'tutTapOp', 'voFreed1', 'voStuck1'];
const CACHE = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
const SHELL = process.env.CHROME || (() => {
  const dirs = fs.existsSync(CACHE) ? fs.readdirSync(CACHE).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) { const p = path.join(CACHE, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'); if (fs.existsSync(p)) return p; }
  return '';
})();
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'tools', 'studio_out');
const CLIPS = path.join(ROOT, 'assets', 'VO', 'en');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'locales.json'), 'utf8')).en;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'vo_lines.json'), 'utf8'));
const args = process.argv.slice(2);
const audition = args.includes('--audition');
const vi = args.indexOf('--voice');
const VOICE = vi >= 0 ? args[vi + 1] : cfg.voice || 'Male Child (Energetic)';
const want = args.filter((a, i) => !a.startsWith('--') && (vi < 0 || i !== vi + 1));
const bad = want.filter((k) => !cfg.keys.includes(k));
if (bad.length) { console.error('Not a voiced key (tools/vo_lines.json):', bad.join(', ')); process.exit(1); }
const one = (k, voice, dir) => ({ key: k, line: en[k], spoken: (cfg.spoken || {})[k] || en[k], voice, mp3: path.join(dir, k + '.mp3') });
const lines = audition
  ? Object.entries(MEN).flatMap(([label, id]) => AUDITION.map((k) => one(k, label, path.join(OUT, 'audition', id))))
  : cfg.keys.filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(CLIPS, k + '.webm')))).map((k) => one(k, VOICE, OUT));
const missing = lines.filter((L) => typeof L.line !== 'string');
if (missing.length) { console.error('No English line in locales.json for:', missing.map((L) => L.key).join(', ')); process.exit(1); }
if (!lines.length) { console.log('Nothing to make.'); process.exit(0); }
if (!SHELL) { console.error("Playwright's headless shell was not found in " + CACHE + ' (set CHROME=/path/to/chrome).'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// ---- a bare CDP connection to the headless shell
const port = 9300 + Math.floor(Math.random() * 600);
const prof = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'vo-studio-'));
const proc = spawn(SHELL, [`--remote-debugging-port=${port}`, '--disable-gpu', '--mute-audio', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const keep = setInterval(() => {}, 1000);
let ws;
const quit = async (code) => {
  try { ws && ws.close(); } catch {}
  const gone = new Promise((r) => proc.once('exit', r)); proc.kill(); await Promise.race([gone, sleep(3000)]);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  clearInterval(keep); process.exit(code);
};
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) })).json()).find((t) => t.type === 'page'); } catch {}
  if (!page) await sleep(250);
}
if (!page) { console.error('The headless shell did not start: ' + SHELL); await quit(1); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
};
const send = (method, params = {}, ms = 30000) => new Promise((res, rej) => {
  const i = ++seq, t = setTimeout(() => { pend.delete(i); rej(new Error('timeout ' + method)); }, ms);
  pend.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const run = async (expr, ms = 60000) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: STUDIO });
await sleep(8000);

let made = 0, failed = '';
for (const L of lines) {
  const mp3 = L.mp3;
  if (fs.existsSync(mp3) && !want.length) { console.log(L.key, 'already made'); made++; continue; }
  fs.mkdirSync(path.dirname(mp3), { recursive: true });
  errors.length = 0;
  const setup = await run(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll('button')].find(b => re.test(b.innerText.trim()));
    const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    btn(/Single Generation/)?.click(); await wait(300);
    set(document.querySelectorAll('select')[0], ${JSON.stringify(LANG)}); await wait(200);
    set(document.querySelectorAll('select')[1], ${JSON.stringify(L.voice)}); await wait(200);
    set(document.querySelector('textarea'), ${JSON.stringify(L.spoken)});
    set([...document.querySelectorAll('input')].find(i => i.type !== 'file'), ${JSON.stringify(L.key)});
    for (let k = 0; k < 6 && !/mp3/i.test(btn(/^\\.[A-Z0-9]{3,4}$/i)?.innerText || 'mp3'); k++) { btn(/^\\.[A-Z0-9]{3,4}$/i).click(); await wait(200); }
    window.__voOld = document.querySelector('audio')?.src || '';
    return [document.querySelectorAll('select')[0].value, document.querySelectorAll('select')[1].value, btn(/^\\.[A-Z0-9]{3,4}$/i)?.innerText].join(' / ');
  })()`);
  if (setup !== `${LANG} / ${L.voice} / .MP3`) { console.error(L.key, 'the studio page has changed (' + setup + '): update tools/vo_studio.mjs'); failed = 'page changed'; break; }
  await run(`[...document.querySelectorAll('button')].find(b => /GENERATE VOICEOVER/i.test(b.innerText)).click(), 1`);
  let r = null; const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await sleep(2000);
    r = await run(`(async () => {
      const a = document.querySelector('audio');
      if (a && a.src && a.src !== window.__voOld) {
        const u = new Uint8Array(await (await fetch(a.src)).arrayBuffer()); let s = '';
        for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
        return { b64: btoa(s) };
      }
      const busy = [...document.querySelectorAll('button')].some(b => /generating|processing/i.test(b.innerText));
      const err = [...document.querySelectorAll('div,p,span')].filter(e => !e.children.length && /error|exceed|failed|spending cap|too many|depleted/i.test(e.innerText)).map(e => e.innerText)[0];
      return { busy, err };
    })()`);
    if (r.b64 || (!r.busy && r.err && Date.now() - t0 > 6000)) break;
  }
  if (!r || !r.b64) {
    failed = (r && r.err) || 'no clip after 3 minutes';
    console.error(L.key, 'not made:', failed);
    errors.slice(0, 2).forEach((e) => console.error('  ' + e));
    break;
  }
  fs.writeFileSync(mp3, Buffer.from(r.b64, 'base64'));
  made++; console.log(L.key, 'made', `(${made}/${lines.length})`, L.voice, '·', L.line);
  await sleep(3000); // the studio's proxy allows 100 requests per 15 minutes per IP, shared with others
}
if (made && audition) console.log(`\n${made} sample(s) in tools/studio_out/audition/ (puck, charon, fenrir). Pick one, set it as "voice" in tools/vo_lines.json, then: node tools/vo_studio.mjs`);
else if (made) console.log(`\n${made} clip(s) in tools/studio_out/. Into the game: sh tools/vo_build.sh, then ./build.sh`);
await quit(failed ? 1 : 0);
