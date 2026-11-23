#!/usr/bin/env python3
"""Builds assets/music/battle.webm: the background music with real nature sounds mixed in (the user, 23 Nov:
"change the BG music… like cannon, some fighting sound, but not too loud… add natural SFX in music").

The music: "War on Water: Chapter 1" by yd (OpenGameArt, CC0): an orchestral march from a naval-battle game,
85 bpm, light bass. It is exactly 192 beats (48 bars) long, so the loop is those 135.53 s, with the reverb tail past
the last bar laid back over the first bar (no seam, no fade).

Mixed into it, all real recordings by Joseph SARDIN, BigSoundBank.com (CC0):
  wind  #904  "Forest: wind in the trees" (with its birds)       a soft bed, all the way
  waves #1446 "Small waves and beach 1"                            a soft bed, all the way
  gulls #2573 "Gulls on the harbor"                                four distant cries
  boom  #1023 "Explosion far away", #1806 "Explosion far away 2"   distant cannon fire, on the music's downbeats:
        slowed (a bigger gun), muffled and given an echo, as if a battle is going on far across the water
Every layer wraps round the loop's end, so the whole thing loops without a seam. The mix is set to -19 LUFS
(2 dB under the old track) and the game plays it at 20% (Music.level in src/20_audio.js).

Usage: python3 tools/mix_bgm.py SRC_DIR [OUT]   (needs numpy, scipy, ffmpeg)
SRC_DIR holds the downloads under these names:
  wowchapter1.ogg    https://opengameart.org/sites/default/files/wowchapter1.ogg
  forest_wind.wav    https://bigsoundbank.com/UPLOAD/bwf-en/0904.wav
  small_waves.flac   https://bigsoundbank.com/UPLOAD/flac/1446.flac
  gulls_harbor.flac  https://bigsoundbank.com/UPLOAD/flac/2573.flac
  far1.flac          https://bigsoundbank.com/UPLOAD/flac/1023.flac
  far2.flac          https://bigsoundbank.com/UPLOAD/flac/1806.flac
"""
import os, re, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 48000
BPM, PHASE, BEATS = 85.0, 0.014, 192            # the music's grid (measured): first downbeat at 14 ms
BEAT = 60.0 / BPM
N = int(round(BEATS * BEAT * SR))               # the loop: 135.53 s
TARGET_LUFS = -19.0
rng = np.random.default_rng(23)


def load(path, ss=0.0, t=None):
    """Any file as float32 stereo at 48 kHz (ffmpeg decodes)."""
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(ss)] + (['-t', str(t)] if t else []) + \
          ['-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return a.reshape(-1, 2).astype(np.float64)


def filt(x, kind, f, order=4):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x, axis=0)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def peak_rms(x, win=0.1):
    """The loudest 100 ms of a one-shot."""
    m = np.mean(x ** 2, axis=1); w = int(win * SR)
    return float(np.sqrt(np.max(np.convolve(m, np.ones(w) / w, 'same'))) + 1e-12)


def db(v):
    return 10 ** (v / 20)


def seamless(x, n, xf=4.0):
    """n samples of a bed that loops: its own next xf seconds crossfaded (equal power) over its start."""
    k = int(xf * SR); assert len(x) >= n + k
    out = x[:n].copy(); t = np.linspace(0, np.pi / 2, k)[:, None]
    out[:k] = x[:k] * np.sin(t) + x[n:n + k] * np.cos(t)
    return out


def fade(x, fin=0.2, fout=0.4):
    x = x.copy(); a, b = int(fin * SR), int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def pan(x, p):
    """Mono-sum then constant-power pan, p in -1..1."""
    m = x.mean(axis=1); a = (p + 1) * np.pi / 4
    return np.stack([m * np.cos(a), m * np.sin(a)], axis=1) * np.sqrt(2)


def reverb(x, secs=2.6, wet=0.45, pre=0.03, damp=3500):
    """A soft outdoor tail: decaying stereo noise, darker as it fades."""
    n = int(secs * SR); t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 6.9 / secs)[:, None]
    ir = filt(ir, 'low', damp, 2); ir[: int(pre * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2) / 2)
    y = np.stack([fftconvolve(x[:, c], ir[:, c]) for c in range(2)], axis=1)
    out = np.zeros_like(y); out[: len(x)] = x * (1 - wet) ** 0.5
    return out + y * wet ** 0.5 * 0.5


def add_wrapped(bed, clip, at):
    """Adds a one-shot at time `at` (s); whatever runs past the loop's end comes in again at its start."""
    i = int(round(at * SR)) % len(bed)
    while len(clip):
        k = min(len(clip), len(bed) - i); bed[i:i + k] += clip[:k]; clip = clip[k:]; i = 0


def bar(b, beat=0.0):
    return PHASE + (b * 4 + beat) * BEAT


def main(src, out):
    S = lambda f: os.path.join(src, f)
    # the music, its tail laid over its first bar
    m = filt(load(S('wowchapter1.ogg')), 'high', 40, 2)
    music = m[:N].copy(); tail = m[N:]; music[: len(tail)] += tail
    R = rms(music)
    # the beds: wind in the trees (its birds too; from 60 s: no mic knocks there), small waves on a shore
    wind = seamless(filt(filt(load(S('forest_wind.wav'), 60), 'high', 160), 'low', 7000, 2), N)
    waves = seamless(filt(load(S('small_waves.flac'), 20), 'high', 110), N)
    wind *= R * db(-18) / rms(wind)
    waves *= R * db(-14) / rms(waves)
    # gulls: two runs of cries from the harbour, its engine-ish low end cut away; far off (dull, a bit of space)
    gA = load(S('gulls_harbor.flac'), 74.3, 7.3); gB = load(S('gulls_harbor.flac'), 108.3, 5.4)
    gull = lambda g, p: reverb(pan(fade(filt(filt(g, 'high', 650), 'low', 5200, 2), 0.3, 0.6), p), 1.8, 0.35)
    gulls = [(15.0, gull(gA, 0.6)), (58.0, gull(gB, -0.55)), (99.5, gull(gA, -0.35)), (126.0, gull(gB, 0.5))]
    # distant cannon fire: slowed 20% (deeper, a bigger gun), muffled by distance, a long echo off the water
    def boom(path, p, slow=(5, 4)):
        x = load(S(path)); x = np.stack([resample_poly(x[:, c], *slow) for c in range(2)], axis=1)
        x = filt(filt(x, 'low', 900), 'high', 45, 2)
        return reverb(pan(fade(x, 0.0, 0.3), p), 3.2, 0.5, 0.06, 1800)
    far1, far2 = 'far1.flac', 'far2.flac'
    booms = [  # (where: bar, beat), clip, pan, dB
        ((2, 0), far1, -0.45, 0), ((9, 0), far2, 0.5, -2), ((9, 1.5), far2, 0.25, -5),
        ((17, 0), far1, 0.35, -1), ((25, 0), far2, -0.55, -2), ((25, 2), far1, -0.3, -4),
        ((33, 0), far2, 0.45, -2), ((40, 0), far1, -0.2, 0), ((41, 2), far2, 0.55, -5),
    ]
    mix = music + wind + waves
    for at, g in gulls:
        add_wrapped(mix, g * (R * db(-8) / peak_rms(g)), at)
    for (b, bt), f, p, d in booms:
        c = boom(f, p); add_wrapped(mix, c * (R * db(1 + d) / peak_rms(c)), bar(b, bt))
    mix = filt(mix, 'high', 55, 2)
    # one fixed gain to the target loudness (no dynamic leveller, so the loop's two ends match)
    with tempfile.TemporaryDirectory() as td:
        w = os.path.join(td, 'mix.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '2', '-i', '-', w],
                       input=mix.astype(np.float64).tobytes(), check=True)
        r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', w, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
        lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1]); tp = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)[-1])
        g = min(TARGET_LUFS - lufs, -1.5 - tp)
        print(f'mix {lufs:.1f} LUFS, true peak {tp:.1f} dBFS -> gain {g:+.1f} dB')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-af', f'volume={g:.2f}dB', '-c:a', 'libopus',
                        '-b:a', '80k', '-vbr', 'on', '-application', 'audio', out], check=True)
    print('wrote', out, f'({N / SR:.2f} s loop)')


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'assets', 'music', 'battle.webm'))
