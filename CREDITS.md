# Credits

## Art
All game art comes from the files you supplied, kept in `art/`: the sprite sheets (`art/sprite_sheets/`), the start-screen sheet and Play button (`art/start_screen/`), and the background layer sheet and mockup (`art/background/`).

## Music
**"Blue Skies"** by HoliznaCC0, from the *Happy Lo-Fi (Lofi Collection)* on OpenGameArt:
[opengameart.org/content/happy-lo-fi-lofi-collection](https://opengameart.org/content/happy-lo-fi-lofi-collection).
Released as **CC0 (public domain)**: "This music is public domain CC0, so use it how you want!" No credit is required; it is given here anyway.
Stored as `assets/music/blueskies.webm` (Opus, 64 kbps). It is trimmed at 172.3 s, before the track's silent tail, with a 0.4 s fade-in and a 2.5 s fade-out so the loop has no gap. Its loudness is matched to the previous track (−12.5 LUFS).
It replaced "Chill Wave" by Kevin MacLeod (CC BY 4.0) on 19 Nov 2026, at the user's request for a copyright-free track.

## Voice-over
Every line is made in Aamir's TTS studio **Ai Wala Human By Aamir**, in one man's voice (since 18 Nov 2026, at the user's request; by default **Male Child (Energetic)**, which is Gemini voice Puck, an adult man's upbeat voice), with `tools/vo_studio.mjs`. Until the studio's clips are in `assets/VO/en/`, the lines are read by the device's own voice (a man's where the device has one). The earlier Kokoro clips were removed on 18 Nov 2026: the project's rules allow only the studio's voice.

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
- Poppins SemiBold (600) by the Indian Type Foundry, SIL Open Font License 1.1 (`assets/fonts/OFL-Poppins.txt`). The game's only typeface; `build.sh` embeds `assets/fonts/poppins-600-*.woff2` into `index.html`
