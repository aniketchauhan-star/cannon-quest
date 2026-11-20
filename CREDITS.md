# Credits

## Art
All game art comes from the files you supplied, kept in `art/`: the sprite sheets (`art/sprite_sheets/`), the start-screen sheet and Play button (`art/start_screen/`), and the deck background picture with its parts sheet (`art/background/`).

## Music
**"Bravery Run"** by MintoDog, on OpenGameArt: [opengameart.org/content/bravery-run](https://opengameart.org/content/bravery-run).
Uplifting electric guitar and synth game music at 170 bpm, made to loop. Released as **CC0 (public domain)**. No credit is required; it is given here anyway.
Stored as `assets/music/braveryrun.webm` (Opus, 80 kbps): the whole 111.5 s loop (316 beats), with no fades, so it loops without a seam. It is turned down 4.7 dB to −14 LUFS, about as loud as the track before it.
It replaced "Blue Skies" by HoliznaCC0 (CC0 lo-fi) on 19 Nov 2026, when the user asked for gamified music for teens. That had replaced "Chill Wave" by Kevin MacLeod (CC BY 4.0) earlier the same day.

## Voice-over
Every line is said by a real person: one recording of `docs/VO_RECORD.txt`, cut into clips by `tools/vo_split.py` (`tools/vo_takes.json` records which recording each clip came from). No AI or synthetic voice is used, at the user's request of 20 Nov 2026. That includes the TTS studio, the device's own voice, and the earlier Kokoro clips (removed 18 Nov 2026).
Voice: *(the reader's name goes here once the lines are recorded)*.

## Sound effects
All sound effects are real recordings (no synthesized or AI-made sound), released as **CC0 or public domain**. No credit is required, but here are the sources:
- Kenney: *RPG Audio* and *Interface Sounds* ([kenney.nl](https://www.kenney.nl), via OpenGameArt)
- rubberduck: *100 CC0 SFX* and *100 CC0 SFX #2* (OpenGameArt)
- Joseph SARDIN, [BigSoundBank.com](https://bigsoundbank.com) (CC0)
- Fg2, Wikimedia Commons (public domain)

They are stored as Opus (`assets/sfx/*.webm`) to keep the game small.

| File | Used for | Source file |
|---|---|---|
| cannon, cannonb | Cannon blast: the boom and its rumble | [Explosions-LS100150.ogg](https://commons.wikimedia.org/wiki/File:Explosions-LS100150.ogg) and [Explosion-LS100155.ogg](https://commons.wikimedia.org/wiki/File:Explosion-LS100155.ogg), recorded by Fg2 at Nikko's Toshogu Spring Festival (public domain) |
| blast | Cannon blast: the close crack | BigSoundBank #1808, a farm bird-scare gun (CC0) |
| echo | Cannon blast: the echo off the lake | [BigSoundBank #1023](https://bigsoundbank.com/explosion-far-away-s1023.html), "Explosion far away" (CC0) |
| whoosh | The ball rushing out of the barrel | [BigSoundBank #1800](https://bigsoundbank.com/whoosh-7-s1800.html), a swung metal tube (CC0) |
| plop, pluck | Picking a ball | plop_02, pluck_002 |
| latch, woodhit | Ball seating in a socket | metalLatch, sfx100v2_wood_hit_01 |
| woodhit2, wooden | Balls settling, "socket full" knock | sfx100v2_wood_hit_02, wooden_02 |
| air, airmid, airlong | Whooshes (balls, shots, clouds) | sfx100v2_air_01–03 |
| glass1, glass2, bell, bellbig | Tokens landing, sparkles, Fire ready, success | glass_001/003, bell_02/03 |
| key, creak | Cage unlocking and door swinging open | key_open_01, creak1 |
| pot, metal2, metal3, tools | Cage rattling | metalPot2, sfx100v2_metal_02/03, tools_01 |
| spring, springlow | x jumping out, cloud wobble | spring_03, spring_01 |
| toggle, click, tick | Fire button and UI | toggle_002, click_002, tick_002 |
| cloth | x landing on the plaza | cloth2 |
| water | Lake-side ambience | sfx100v2_loop_water_01 |

## Libraries and fonts
- GSAP 3.15.0 by GreenSock, bundled locally in `libs/gsap.min.js` (free under the GSAP Standard License)
- Poppins SemiBold (600) by the Indian Type Foundry, SIL Open Font License 1.1 (`assets/fonts/OFL-Poppins.txt`). The game's typeface for everything but the maths; `build.sh` embeds `assets/fonts/poppins-600-*.woff2` into `index.html`
- Trig Text (Regular, 400), from Lilita One by Juan Montoreano, SIL Open Font License 1.1 (`assets/fonts/OFL-TrigText.txt`). Supplied by the user on 19 Nov 2026 for the equation on the cloud and the numbers on the orbs; `build.sh` embeds `assets/fonts/trigtext-regular.woff2` into `index.html`
