/* ==========================================================================
 * Cannon Quest: i18n. Every word the player reads, and every voice clip, by key
 * (claude/skills/localization_skill.md).
 * --------------------------------------------------------------------------
 * Words: locales/locales.json, under "en" (English only, until another
 * language is asked for). The language comes from the address:
 *
 *     index.html?lan=hi     that language, if the file has it (?lang= works too)
 *     index.html            the file's defaultLanguage
 *
 * A key the language lacks falls back to English; a key English lacks shows
 * the key itself, so it can be seen and fixed in the JSON.
 *
 *   T('key')                    the line as text
 *   T('key', { freed: 3 })      {freed} in it filled in
 *   I18n.voice('key')           its clip: assets/VO/<lang>/<key>.webm
 *   I18n.say('key', { onended, onerror })   plays that clip, returns the <audio>
 *
 * Static markup is filled by I18n.applyStatic():
 *     data-i18n="key"                       textContent
 *     data-i18n-html="key"                  innerHTML (the JSON's own <br>, &amp;)
 *     data-i18n-attr="aria-label:key;alt:key"   attributes
 *
 * Opened from disk (file://) a browser won't read the JSON, so it reads the
 * generated copy locales/locales.js instead. ./build.sh regenerates it (and
 * checks every language has exactly English's keys); by hand:
 *
 *     node tools/gen_locales.mjs
 * ========================================================================== */
var I18n = (function () {
  'use strict';

  var JSON_PATH = 'locales/locales.json';
  var JS_PATH = 'locales/locales.js';
  var VO_DIR = 'assets/VO/';
  var VO_EXT = '.webm';
  var VOICE_LANGS = ['en'];            /* languages that have clips of their own; the others use English's */
  var BCP47 = { od: 'or' };            /* <html lang> where it differs from the file's code */
  var META = { defaultLanguage: 1, languageLabels: 1, supportedLanguages: 1 };

  var _data = null;
  var _lang = 'en';

  function _urlLang() {
    try {
      var p = new URLSearchParams(window.location.search);
      return String(p.get('lan') || p.get('lang') || '').trim().toLowerCase();
    } catch (e) { return ''; }
  }
  function _isLang(code) {
    return !!(code && _data && !META[code] && _data[code] && typeof _data[code] === 'object');
  }
  function _pick() {
    var want = _urlLang();
    if (_isLang(want)) return want;
    if (_isLang(_data && _data.defaultLanguage)) return _data.defaultLanguage;
    return 'en';
  }
  function _raw(key) {
    var dict = (_data && _data[_lang]) || {};
    var en = (_data && _data.en) || {};
    if (key in dict) return dict[key];
    if (key in en) return en[key];
    return undefined;
  }
  function _sub(str, repl) {
    if (!repl) return str;
    Object.keys(repl).forEach(function (k) { str = str.split('{' + k + '}').join(String(repl[k])); });
    return str;
  }

  /* T('key', { name: value }): the line in the current language (an array comes back as a fresh array) */
  function t(key, repl) {
    var val = _raw(key);
    if (val === undefined) return String(key);
    if (Array.isArray(val)) return val.map(function (v) { return _sub(String(v), repl); });
    return _sub(String(val), repl);
  }
  function has(key) { return _raw(key) !== undefined; }

  /* ---------- voice-over: one clip per key, the same key as its text ---------- */
  function voice(key) {
    var lang = VOICE_LANGS.indexOf(_lang) >= 0 ? _lang : 'en';
    return VO_DIR + lang + '/' + key + VO_EXT;
  }
  function say(key, opts) {
    opts = opts || {};
    var a = new Audio(voice(key));
    a.preload = 'auto';
    if (opts.onended) a.addEventListener('ended', opts.onended, { once: true });
    if (opts.onerror) a.addEventListener('error', opts.onerror, { once: true });
    var p = a.play();
    if (p && p.catch) p.catch(function (err) { if (opts.onerror && (!err || err.name !== 'AbortError')) opts.onerror(err); });
    return a;
  }

  /* ---------- static markup ---------- */
  function applyStatic(root) {
    root = root || document;
    var each = function (sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); };
    each('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    each('[data-i18n-html]', function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    each('[data-i18n-attr]', function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var at = pair.indexOf(':');
        if (at < 0) return;
        var attr = pair.slice(0, at).trim(), key = pair.slice(at + 1).trim();
        if (attr) el.setAttribute(attr, t(key));
      });
    });
  }

  /* ---------- loading ---------- */
  function _readJson(path, cb) {
    var xhr;
    try { xhr = new XMLHttpRequest(); xhr.open('GET', path, true); } catch (e) { return cb(null); }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 && xhr.status !== 0) return cb(null);
      try { cb(JSON.parse(xhr.responseText)); } catch (e) { cb(null); }
    };
    try { xhr.send(); } catch (e) { cb(null); }
  }
  function _readScript(path, cb) {
    if (window.GAME_LOCALES) return cb(window.GAME_LOCALES);
    var s = document.createElement('script');
    s.src = path;
    s.onload = function () { cb(window.GAME_LOCALES || null); };
    s.onerror = function () { cb(null); };
    (document.head || document.documentElement).appendChild(s);
  }
  function _finish(data, cb) {
    _data = data || { defaultLanguage: 'en', en: {} };
    _lang = _pick();
    try { document.documentElement.lang = BCP47[_lang] || _lang; } catch (e) { /* (no document) */ }
    if (cb) cb(_lang);
  }
  /* reads the words, then calls back with the language's code; the game always starts (with no file, every line shows its key) */
  function load(cb) {
    var fromScript = function () {
      _readScript(JS_PATH, function (js) {
        if (!js && window.console) console.warn('[i18n] could not read ' + JSON_PATH + ' or ' + JS_PATH + ': showing keys');
        _finish(js, cb);
      });
    };
    var local = false;
    try { local = window.location.protocol === 'file:'; } catch (e) { /* (no location) */ }
    if (local) return fromScript();
    _readJson(JSON_PATH, function (json) { if (json) _finish(json, cb); else fromScript(); });
  }

  function getLang() { return _lang; }
  function getSupportedLanguages() { return (_data && _data.supportedLanguages) || {}; }
  /* the address is the switch: a new language is a reload with ?lan=xx */
  function setLang(code) {
    code = String(code || '').toLowerCase();
    if (!_isLang(code) || code === _lang) return false;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('lan', code);
      url.searchParams.delete('lang');
      window.location.href = url.toString();
      return true;
    } catch (e) { return false; }
  }

  return { load: load, t: t, has: has, voice: voice, say: say, applyStatic: applyStatic, getLang: getLang, setLang: setLang, getSupportedLanguages: getSupportedLanguages };
})();

/* T('key'): the line in the current language (the localization skill's short name) */
var T = function (key, repl) { return I18n.t(key, repl); };
