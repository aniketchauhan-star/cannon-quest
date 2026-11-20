#!/usr/bin/env python3
"""
Cannon Quest's voice is a real person's voice: one recording of the lines read aloud, cut into one clip per line.
No voice in this game is made by a machine: no TTS studio, no AI voice, no device voice (the user, 20 Nov 2026:
"natural voiceovers, not AI generated").

    python3 tools/vo_split.py --script                    write docs/VO_RECORD.txt, the lines to read, in order
    PY tools/vo_split.py recordings/take1.m4a --check     find every line in the recording (nothing is cut)
    PY tools/vo_split.py recordings/take1.m4a             cut it: assets/VO/en/<key>.webm, one clip per line
    PY tools/vo_split.py recordings/fix.m4a voFreed2 voStuck1      a recording of only these lines, in this order
    python3 tools/vo_split.py --script tutorial           only a group's lines (vo_lines.json "groups"), in
    PY tools/vo_split.py recordings/tut.m4a tutorial        docs/VO_RECORD_TUTORIAL.txt; a group cuts by its name
    ./build.sh                                            the game then plays them

PY is a Python with Vosk, the offline speech recogniser: ~/.cache/crown-quest/venv/bin/python, with its models in
~/.cache/crown-quest/vosk/ (Indian English and US English; both are tried and the one that hears the most wins).

The keys are tools/vo_lines.json "keys" (in the order the game says them, the order of docs/VO_RECORD.txt), or the
ones given. Their words are the English of locales/locales.json (vo_lines.json "spoken" only when the voice must say
something else). The recogniser hears the recording; each line is matched to the words it heard, in order. A line
said more than once (a stumble, then the line again) is taken from its LAST take; words that match no line are
left out. Each clip runs from just before its first word to just after its last (the voice's own trail is kept),
and never into the next line.

Every clip of one recording gets the same gain, so the reader's own ups and downs stay as they were: the recording
is brought to −16 LUFS (a little under the music, which ducks under the voice), with a limiter so nothing
distorts, an 80 Hz high-pass (desk thumps, handling noise) and 30 ms / 80 ms fades. --denoise adds a gentle
FFT noise reduction (ffmpeg's afftdn, plain signal processing) for a recording with fan or street hiss.
Clips: Opus in WebM, 32 kbps mono (assets/VO/en/<key>.webm, the localization skill's I18n.voice path).

Each cut is written down in tools/vo_takes.json (which recording, where, the words heard, each word's start in the
clip). ./build.sh lists only clips that are there, so a clip that didn't come from a recording is never played.
--out DIR puts the clips, and their record, somewhere else (for trying the tool): the game won't list them.
"""
import array
import datetime
import difflib
import glob
import json
import math
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINES = os.path.join(ROOT, "tools", "vo_lines.json")
LOCALES = os.path.join(ROOT, "locales", "locales.json")
TAKES = os.path.join(ROOT, "tools", "vo_takes.json")
VO_DIR = os.path.join(ROOT, "assets", "VO", "en")
SCRIPT_TXT = os.path.join(ROOT, "docs", "VO_RECORD.txt")
MODELS = sorted(glob.glob(os.path.expanduser("~/.cache/crown-quest/vosk/vosk-model-*")) +
                glob.glob(os.path.expanduser("~/.cache/vosk/vosk-model-*")))

SR = 16000      # samples a second, for the recogniser and the level meter
HOP = 0.01      # s per level reading
TARGET = -16.0  # LUFS
PRE, POST = 0.15, 0.25  # at least this much kept before the first word and after the last (s)
EXTRA = 0.3     # cost of a heard word inside a line's span that matches none of its words
EPS = 1e-4      # a tie between two takes of a line goes to the later one

SAY = {"x": "ex"}  # how a word on screen is said: the letter x
NUM = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
       "seventeen eighteen nineteen twenty").split()
SAME = {"ex": {"x", "eggs", "ax", "axe", "ecks", "acts", "ex's"}}  # what the recogniser may hear for "ex"
MOOD_SAY = {  # tools/vo_lines.json "mood", as a note to the reader
    "hype": "excited, inviting",
    "cheer": "big and happy: celebrate!",
    "teach": "calm and clear, like showing a friend",
    "soft": "gentle and kind, never like \"wrong\"",
    "warm": "warm and encouraging",
}


# ----------------------------------------------------------------------------------------------- the lines
def expand(keys):
    """Keys as given, with a group's name (vo_lines.json "groups", e.g. tutorial) standing for its keys."""
    groups = json.load(open(LINES, encoding="utf-8")).get("groups", {})
    return [k for g in keys for k in groups.get(g, [g])]


def load_lines(keys=None):
    cfg = json.load(open(LINES, encoding="utf-8"))
    en = json.load(open(LOCALES, encoding="utf-8"))["en"]
    keys = expand(keys) if keys else cfg["keys"]
    bad = [k for k in keys if k not in en]
    if bad:
        sys.exit("No such key in locales/locales.json: " + " ".join(bad))
    out = []
    for k in keys:
        text, spoken = en[k], cfg.get("spoken", {}).get(k)
        words = text.split()  # the caption's words (src/20_audio.js lays the line out word by word, the same way)
        if spoken:
            toks, owner = [t for w in spoken.split() for t in said(w)], None
        else:
            toks, owner = [], []
            for i, w in enumerate(words):
                for t in said(w):
                    toks.append(t)
                    owner.append(i)
        out.append({"key": k, "text": text, "words": words, "toks": toks, "owner": owner,
                    "mood": cfg.get("mood", {}).get(k), "when": cfg.get("when", {}).get(k)})
    return out


def said(word):
    """The words a word on screen is said as: 'x' → ['ex'], '7' → ['seven'], "Let's" → ["let's"]."""
    w = word.lower().replace("\u2019", "'")
    w = re.sub(r"(^|\s)[\u2212-](?=\d)", r"\1minus ", w)  # \u22125 (a real minus sign, or a hyphen)
    w = re.sub(r"(^|\s)\+(?=\d)", r"\1plus ", w)
    w = re.sub(r"[^a-z0-9']+", " ", w)
    out = []
    for t in w.split():
        t = t.strip("'")
        if not t:
            continue
        out.append(SAY.get(t) or (NUM[int(t)] if t.isdigit() and int(t) < len(NUM) else t))
    return out


def like(a, b):
    """How well a heard word b matches a said word a: 1 the same, less when near, 0 not at all."""
    a, b = a.replace("'", ""), b.replace("'", "")
    if a == b or b in SAME.get(a, ()):
        return 1.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    return 0.7 if r >= 0.75 else 0.4 if r >= 0.6 else 0.0


# ----------------------------------------------------------------------------------------------- the sound
def decode(path):
    """The recording as 16 kHz mono 16-bit samples (bytes)."""
    return subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                          capture_output=True, check=True).stdout


def levels(raw):
    """dB (full scale) of each 10 ms, and how many samples are at the very top (clipped)."""
    s = array.array("h")
    s.frombytes(raw)
    hop, out = int(SR * HOP), []
    for i in range(0, len(s) - hop + 1, hop):
        e = sum(x * x for x in s[i:i + hop]) / hop
        out.append(10 * math.log10(e / 1073741824.0 + 1e-12))
    return out, sum(1 for x in s if x >= 32600 or x <= -32600)


def lufs(path):
    """Integrated loudness (ffmpeg's EBU R128 meter)."""
    err = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"^\s+I:\s+(-?[\d.]+) LUFS", err, re.M)
    return float(m[-1]) if m else None


def heard(raw, model, grammar=None):
    """The words the recogniser hears: [(word, start, end)]."""
    import vosk
    r = vosk.KaldiRecognizer(model, SR, json.dumps(grammar)) if grammar else vosk.KaldiRecognizer(model, SR)
    r.SetWords(True)
    out = []
    for i in range(0, len(raw), 16000):
        if r.AcceptWaveform(raw[i:i + 16000]):
            out += json.loads(r.Result()).get("result", [])
    out += json.loads(r.FinalResult()).get("result", [])
    return [(w["word"], w["start"], w["end"]) for w in out if w["word"] != "[unk]"]


# ----------------------------------------------------------------------------------------------- matching
def align(lines, H):
    """Each line's span of heard words, in order: (total score, [(a, b)]), the best fit of every line at once.
    A span's score is how well its words match the line's (a weighted longest common run, the order kept), less
    EXTRA for each heard word in it that matches nothing. Heard words in no span cost nothing (other takes, noise)."""
    N, NEG = len(H), float("-inf")
    F = [0.0] * (N + 1)  # best total of the lines so far, all ending at or before each heard word
    steps = []
    for L in lines:
        n, maxlen = len(L["toks"]), 2 * len(L["toks"]) + 4
        sim = [[like(t, h[0]) for h in H] for t in L["toks"]]
        G, start = [NEG] * (N + 1), [0] * (N + 1)
        for a in range(N):
            if F[a] == NEG:
                continue
            col = [0.0] * (n + 1)
            for b in range(a + 1, min(N, a + maxlen) + 1):
                new = [0.0] * (n + 1)
                for t in range(1, n + 1):
                    w, v = sim[t - 1][b - 1], max(col[t], new[t - 1])
                    new[t] = max(v, col[t - 1] + w + EXTRA) if w > 0 else v
                col = new
                c = F[a] + col[n] - EXTRA * (b - a) + EPS * a
                if c > G[b]:
                    G[b], start[b] = c, a
        F2, end = [NEG] * (N + 1), [0] * (N + 1)
        for b in range(1, N + 1):
            if G[b] > NEG and G[b] >= F2[b - 1]:
                F2[b], end[b] = G[b], b
            else:
                F2[b], end[b] = F2[b - 1], end[b - 1]
        steps.append((start, end, sim))
        F = F2
    if F[N] == NEG:
        return NEG, None, None
    spans, sims, j = [], [], N
    for start, end, sim in reversed(steps):
        b = end[j]
        a = start[b]
        spans.append((a, b))
        sims.append(sim)
        j = a
    return F[N], spans[::-1], sims[::-1]


def pairs_of(sim, a, b):
    """{line word index: heard word index} for the span a:b (the same weighted run as align, traced back)."""
    n, m = len(sim), b - a
    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    for t in range(1, n + 1):
        for k in range(1, m + 1):
            w, v = sim[t - 1][a + k - 1], max(D[t - 1][k], D[t][k - 1])
            D[t][k] = max(v, D[t - 1][k - 1] + w + EXTRA) if w > 0 else v
    out, t, k = {}, n, m
    while t > 0 and k > 0:
        w = sim[t - 1][a + k - 1]
        if w > 0 and abs(D[t][k] - (D[t - 1][k - 1] + w + EXTRA)) < 1e-9:
            out[t - 1] = a + k - 1
            t, k = t - 1, k - 1
        elif D[t][k] == D[t - 1][k]:
            t -= 1
        else:
            k -= 1
    return out


def grammar_of(lines):
    return sorted({t for L in lines for t in L["toks"]}) + ["[unk]"]


def best_hearing(raw, lines, models):
    """Every model, with the lines' words as its only vocabulary and without: the hearing that fits best."""
    best = None
    for model in models:
        for gram in (grammar_of(lines), None):
            H = heard(raw, model, gram)
            if len(H) < len(lines):
                continue
            score, spans, sims = align(lines, H)
            if spans and (best is None or score > best[0]):
                best = (score, H, spans, sims)
    return best


# ----------------------------------------------------------------------------------------------- the script
def write_script(group=None):
    lines = load_lines([group] if group else None)
    secs = sum(0.9 + len(L["text"]) * 0.058 + 2 for L in lines)
    path = SCRIPT_TXT if not group else SCRIPT_TXT.replace(".txt", "_%s.txt" % group.upper())
    took = ("%d seconds" % (round(secs / 10) * 10)) if secs < 60 else \
        ("%d minute%s" % (round(secs / 60), "" if round(secs / 60) <= 1 else "s"))
    out = [
        "CANNON QUEST: THE VOICE SCRIPT" + (": %s ONLY" % group.upper() if group else ""),
        "%d lines, about %s to read" % (len(lines), took),
        "",
        "Every line in the game is said in one real person's voice: yours, or a teammate's. No AI voice.",
    ]
    if group:
        out += [
            "These are only the %s's lines: record them now, and the rest of the game later (docs/VO_RECORD.txt)." % group,
            "The same person reads both, so the game keeps one voice.",
        ]
    out += [
        "",
        "HOW TO RECORD",
        "- One person reads all the lines, in their own natural voice.",
        "- A quiet room with soft things in it (curtains, a bed, a sofa). Not a bathroom or an empty room:",
        "  they echo. Fan and AC off, door shut, phone on silent.",
        "- Use the phone's voice recorder (Voice Memos on iPhone, Recorder on Android).",
        "  Hold it about a hand-span (15-20 cm) from your mouth, a little below it, and keep it still.",
        "- Read the lines below in this order, in one go. Wait about 2 seconds after each line.",
        "- Stumbled? Pause, then say the WHOLE line again. The last take of a line is the one used.",
        "- Say x as the letter: \"ex\".",
        "- Talk to the player like a friend, not like reading. Smile on the happy lines: it can be heard.",
        "- Send the file as it is (AirDrop, Google Drive, or WhatsApp as a DOCUMENT).",
        "  Not as a WhatsApp voice note: that squeezes the sound.",
        "- Then put it in the game folder, in recordings/, and say which file it is.",
        "",
        "THE LINES",
        "",
    ]
    for i, L in enumerate(lines, 1):
        out.append("%2d. %s" % (i, L["text"]))
        nums = ["say %s as \"%s\"" % (w.strip(".,!?;:"), " ".join(said(w))) for w in L["words"] if re.search(r"\d", w)]
        note = "; ".join(x for x in [L["when"], MOOD_SAY.get(L["mood"])] + nums if x)
        if note:
            out.append("    (%s)" % note)
        out.append("")
    if group:
        out += ["(Then: ~/.cache/crown-quest/venv/bin/python tools/vo_split.py recordings/<file> %s, and ./build.sh.)" % group, ""]
    out.append("(Made by: python3 tools/vo_split.py --script%s, from tools/vo_lines.json and locales/locales.json.)"
               % (" " + group if group else ""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("Wrote %s (%d lines)" % (rel(path), len(lines)))


# ----------------------------------------------------------------------------------------------- cutting
def word_times(L, pairs, H, start, onset):
    """When each word of the caption starts, in s from the clip's start (a word the recogniser missed: between
    its neighbours; before the first word it heard, back towards where the voice starts, onset)."""
    if L["owner"] is None:
        return None
    n = len(L["words"])
    t = [None] * n
    for ti, hi in sorted(pairs.items()):
        w = L["owner"][ti]
        if t[w] is None:
            t[w] = H[hi][1]
    known = [i for i in range(n) if t[i] is not None]
    if not known:
        return None
    for i in range(n):
        if t[i] is not None:
            continue
        lo = max((k for k in known if k < i), default=None)
        hi = min((k for k in known if k > i), default=None)
        if lo is None:
            t[i] = max(onset, t[hi] - 0.22 * (hi - i))
        elif hi is None:
            t[i] = t[lo] + 0.25 * (i - lo)
        else:
            t[i] = t[lo] + (t[hi] - t[lo]) * (i - lo) / (hi - lo)
    out, last = [], 0.0
    for v in t:
        last = max(last, round(max(0.0, v - start), 2))
        out.append(last)
    return out


def rel(path):
    p = os.path.abspath(path)
    return os.path.relpath(p, ROOT) if p.startswith(ROOT + os.sep) else os.path.basename(p)


def main(args):
    if "--script" in args:
        rest = [a for a in args if a != "--script"]
        write_script(rest[0] if rest else None)
        return
    check, denoise = "--check" in args, "--denoise" in args
    out_dir = VO_DIR
    if "--out" in args:
        i = args.index("--out")
        out_dir = os.path.abspath(args[i + 1])
        args = args[:i] + args[i + 2:]
    args = [a for a in args if a not in ("--check", "--denoise")]
    if not args:
        sys.exit(__doc__)
    src, keys = args[0], args[1:]
    if not os.path.isfile(src):
        sys.exit("No such recording: " + src)
    try:
        import vosk
        vosk.SetLogLevel(-1)
        models = [vosk.Model(m) for m in MODELS]
    except ImportError:
        sys.exit("Vosk is not in this Python: run it with ~/.cache/crown-quest/venv/bin/python")
    if not models:
        sys.exit("No Vosk model found in ~/.cache/crown-quest/vosk/ or ~/.cache/vosk/")

    lines = load_lines(keys or None)
    raw = decode(src)
    dur = len(raw) / 2 / SR
    db, clipped = levels(raw)
    floor = sorted(db)[len(db) // 10] if db else -90
    thr = floor + 12
    print("%s: %.1f s, room noise %.0f dBFS%s" % (rel(src), dur, floor, "  (noisy: try --denoise, or a quieter room)" if floor > -45 else ""))
    if clipped > 50:
        print("!! %d samples are at full level: the recording is distorted in places (phone too close, or too loud)" % clipped)

    got = best_hearing(raw, lines, models)
    if not got:
        sys.exit("The recogniser heard too little: is this the right recording, with these lines?")
    _, H, spans, sims = got

    ok, cuts = True, []
    for L, (a, b), sim in zip(lines, spans, sims):
        pairs = pairs_of(sim, a, b)
        n, hit = len(L["toks"]), len(pairs)
        good = hit >= max(1, math.ceil(0.5 * n))
        ok = ok and good
        hs = sorted(pairs.values())
        if not hs:
            print("!! %-14s not found  %s" % (L["key"], L["text"]))
            continue
        fm, lm = hs[0], hs[-1]
        t0, t1 = H[fm][1], H[lm][2]
        lo = (H[fm - 1][2] + t0) / 2 if fm > 0 else 0.0
        hi = (t1 + H[lm + 1][1]) / 2 if lm + 1 < len(H) else dur
        k = int(t0 / HOP)  # the voice's own onset and trail, past where the recogniser put the words
        while k > int(lo / HOP) and k - 1 < len(db) and db[k - 1] > thr:
            k -= 1
        s_on = k * HOP
        k = int(t1 / HOP)
        while k < min(len(db), int(hi / HOP)) and db[k] > thr:
            k += 1
        s_off = k * HOP
        s = max(lo, min(t0 - PRE, s_on - 0.1))
        e = min(hi, max(t1 + POST, s_off + 0.15))
        cuts.append((L, s, e, pairs, max(s, s_on)))
        print("%s%-14s heard %d/%d  %6.2f-%6.2f s  %s" % ("" if good else "!! ", L["key"], hit, n, s, e, L["text"]))
    used = {i for _, _, _, p, _ in cuts for i in range(min(p.values()), max(p.values()) + 1)} if cuts else set()
    left = [H[i][0] for i in range(len(H)) if i not in used]
    if left:
        print("not used (other takes, or words that are in no line): %s" % " ".join(left))
    if not ok:
        sys.exit("Not cut: a line was heard poorly (marked !!). Check the recording, and that it reads these lines in this order.")
    if check:
        print("Every line found (--check: nothing cut).")
        return

    loud = lufs(src)
    gain = TARGET - loud if loud is not None else 0.0
    print("loudness %.1f LUFS: %+.1f dB to %.0f LUFS" % (loud if loud is not None else float("nan"), gain, TARGET))
    if gain > 18:
        print("!! a very quiet recording: hold the phone closer next time (the room's hiss is raised as much)")
    os.makedirs(out_dir, exist_ok=True)
    takes = json.load(open(TAKES, encoding="utf-8")) if os.path.exists(TAKES) else {}
    today = datetime.date.today().isoformat()
    for L, s, e, pairs, on in cuts:
        d = e - s
        af = ["highpass=f=80"] + (["afftdn=nr=10:nf=-50"] if denoise else []) + [
            "volume=%.2fdB" % gain, "alimiter=limit=0.891:level=false",
            "afade=t=in:d=0.03", "afade=t=out:st=%.3f:d=0.08" % max(0.0, d - 0.08)]
        dst = os.path.join(out_dir, L["key"] + ".webm")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "%.3f" % s, "-to", "%.3f" % e, "-i", src, "-ac", "1",
                        "-af", ",".join(af), "-c:a", "libopus", "-b:a", "32k", "-application", "audio", dst], check=True)
        # heard again from the clip itself: its whole line is in it
        back = heard(decode(dst), models[0], grammar_of([L]))
        bs = [[like(t, h[0]) for h in back] for t in L["toks"]]
        again = len(pairs_of(bs, 0, len(back))) if back else 0
        flag = "" if again >= math.ceil(0.6 * len(L["toks"])) else "!! "
        print("%s%s.webm  %.2f s  heard again %d/%d" % (flag, L["key"], d, again, len(L["toks"])))
        takes[L["key"]] = {"recording": rel(src), "from": round(s, 3), "to": round(e, 3),
                           "heard": " ".join(H[i][0] for i in sorted(pairs.values())),
                           "words": word_times(L, pairs, H, s, on), "cut": today}
    if os.path.abspath(out_dir) != os.path.abspath(VO_DIR):
        with open(os.path.join(out_dir, "vo_takes.json"), "w", encoding="utf-8") as f:
            json.dump({k: takes[k] for k in takes if k in {c[0]["key"] for c in cuts}}, f, indent=1, ensure_ascii=False)
        print("\n%d clips in %s, with their vo_takes.json (--out: not in tools/vo_takes.json, so the game won't list them)" % (len(cuts), out_dir))
        return
    takes = {k: takes[k] for k in sorted(takes, key=lambda k: (k.startswith("_"), k))}
    takes["_about"] = ("Where each voice clip in assets/VO/en/ came from: written by tools/vo_split.py as it cuts a person's "
                       "recording. 'words': when each word of the caption starts, in s from the clip's start. build.sh "
                       "lists only the clips that are here.")
    with open(TAKES, "w", encoding="utf-8") as f:
        json.dump(takes, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("\n%d clips in assets/VO/en/, written down in tools/vo_takes.json. Now run ./build.sh" % len(cuts))


if __name__ == "__main__":
    main(sys.argv[1:])
