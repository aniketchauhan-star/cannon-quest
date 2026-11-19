#!/usr/bin/env node
// locales/locales.json → locales/locales.js (window.GAME_LOCALES), the copy the game reads when it is
// opened from disk (file://). Also checks the JSON: valid, and every language has exactly English's
// keys in the same order (claude/skills/translation_skill.md). Run by ./build.sh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'locales', 'locales.json');
const OUT = path.join(ROOT, 'locales', 'locales.js');
const META = new Set(['defaultLanguage', 'languageLabels', 'supportedLanguages']);

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (!data.en) { console.error('locales.json has no "en"'); process.exit(1); }
const enKeys = Object.keys(data.en);
let bad = 0;
for (const lang of Object.keys(data).filter((k) => !META.has(k) && k !== 'en')) {
  const keys = Object.keys(data[lang]);
  const missing = enKeys.filter((k) => !(k in data[lang])), extra = keys.filter((k) => !(k in data.en));
  if (missing.length || extra.length || keys.join() !== enKeys.join()) {
    bad++;
    console.error(`locales.json "${lang}": ${missing.length} missing, ${extra.length} extra${!missing.length && !extra.length ? ', order differs from "en"' : ''}`);
  }
}
const head = '/* Generated from locales/locales.json by tools/gen_locales.mjs (./build.sh runs it): do not edit by hand.\n   The game reads this copy when it is opened from disk (file://). */\n';
fs.writeFileSync(OUT, head + 'window.GAME_LOCALES = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(`locales.js: ${enKeys.length} keys${bad ? `, ${bad} language(s) to fix` : ''}`);
process.exit(bad ? 1 : 0);
