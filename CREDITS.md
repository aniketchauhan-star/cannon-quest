# Credits

## Art
All game art comes from the files you supplied, kept in `art/`: the sprite sheets (`art/sprite_sheets/`), the start-screen sheet and Play button (`art/start_screen/`), and the deck background picture with its parts sheet (`art/background/`).

## Music
**"War on Water: Chapter 1"** by yd, from "War on Water: Tracks" on OpenGameArt: [opengameart.org/content/war-on-water-tracks](https://opengameart.org/content/war-on-water-tracks).
An orchestral march with marching drums from a naval-battle game, 85 bpm, with light bass. Released as **CC0 (public domain)**. No credit is required; it is given here anyway.
Mixed into it are real recordings of nature and distant cannon fire, all by Joseph SARDIN, [BigSoundBank.com](https://bigsoundbank.com) (**CC0**):
- [#904](https://bigsoundbank.com/forest-wind-in-the-trees-s0904.html) "Forest: wind in the trees" (with its birds): a soft bed all the way through
- [#1446](https://bigsoundbank.com/small-waves-and-beach-1-s1446.html) "Small waves and beach 1": a soft bed all the way through
- [#2573](https://bigsoundbank.com/gulls-on-the-harbor-s2573.html) "Gulls on the harbor": four distant gull cries
- [#1023](https://bigsoundbank.com/explosion-far-away-s1023.html) "Explosion far away" and [#1806](https://bigsoundbank.com/explosion-far-away-2-s1806.html) "Explosion far away 2": distant cannon fire, nine shots on the music's downbeats, slowed 20% (a bigger gun), muffled and given a long echo, as if a battle is going on far across the water

`tools/mix_bgm.py` builds `assets/music/battle.webm` (Opus, 80 kbps): a 135.5 s seamless loop, exactly the track's 48 bars, with the reverb tail past its last bar laid over its first. It is set to −19 LUFS, 2 dB quieter than the track before it, and the game plays it at 20%.
It replaced "New Shoes" by HoliznaCC0 (CC0, a light happy lo-fi tune) on 23 Nov 2026, when the user asked for music "like cannon, some fighting sound, but not too loud", with natural sound effects in it. Before that came "Bravery Run" by MintoDog (CC0, 170 bpm electric guitar and synth; dropped as too heavy), "Blue Skies" by HoliznaCC0 and "Chill Wave" by Kevin MacLeod (CC BY 4.0).

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
| echo | Cannon blast: the echo off the lake; slowed right down, the rumble as the cage starts to crack; the fireworks' bursts | [BigSoundBank #1023](https://bigsoundbank.com/explosion-far-away-s1023.html), "Explosion far away" (CC0) |
| whoosh | The ball rushing out of the barrel; the fireworks' rockets | [BigSoundBank #1800](https://bigsoundbank.com/whoosh-7-s1800.html), a swung metal tube (CC0) |
| plop, pluck | Picking a ball | plop_02, pluck_002 |
| latch, woodhit | Ball seating in a socket | metalLatch, sfx100v2_wood_hit_01 |
| woodhit2, wooden | Balls settling, "socket full" knock | sfx100v2_wood_hit_02, wooden_02 |
| air, airmid, airlong | Whooshes (balls, shots, clouds) and the cloud bursting | sfx100v2_air_01–03 |
| glass1, glass2, bell, bellbig | Tokens landing, sparkles, Fire ready, success | glass_001/003, bell_02/03 |
| key, creak | The cage cracking with each push of x (the snap) and its bars groaning, its lock snapping as it bursts | key_open_01, creak1 |
| pot, metal2, metal3, tools | Cage rattling, and the broken cage's bars clattering | metalPot2, sfx100v2_metal_02/03, tools_01 |
| spring, springlow | x jumping out, cloud wobble | spring_03, spring_01 |
| toggle, click, tick | Fire button and UI | toggle_002, click_002, tick_002 |
| cloth | The cloud bursting (a soft flap) | cloth2 |
| water | Lake-side ambience | sfx100v2_loop_water_01 |
| swish | Start screen: the sign and the cage falling; in play, x rising out of the broken cage | [BigSoundBank #1799](https://bigsoundbank.com/whoosh-6-s1799.html), "Whoosh 6", a wooden sheet swung through the air (CC0) |
| knock | Start screen: the CANNON QUEST sign landing; in play, pitched up, the crack of each push on the cage | [BigSoundBank #1588](https://bigsoundbank.com/gavel-1-blow-s1588.html), "Gavel 1 blow", a wooden gavel (CC0) |
| thud | Start screen: the cannon planting itself, the sign's and the cage's weight; in play, the body of the cage's burst and of the cloudburst | [BigSoundBank #1841](https://bigsoundbank.com/jumping-on-wooden-pontoon-1-s1841.html), "Jumping on wooden pontoon 1" (CC0) |
| clang | Start screen: the golden cage landing on the deck; in play, the cage breaking | [BigSoundBank #234](https://bigsoundbank.com/iron-bar-falling-1-s0234.html), "Iron bar falling 1" (CC0) |
| roll | Start screen: the cannon sliding in (low-passed); in play, slowed right down, under the rumble before the cage cracks | [BigSoundBank #1316](https://bigsoundbank.com/devil-handling-1-s1316.html), "Devil handling 1", a hand truck rolling (CC0) |
| cork | Start screen: the Play button popping up; the fireworks' bursts | [BigSoundBank #648](https://bigsoundbank.com/champagne-cork-2-s0648.html), "Champagne cork 2" (CC0) |

## Libraries and fonts
- GSAP 3.15.0 by GreenSock, bundled locally in `libs/gsap.min.js` (free under the GSAP Standard License)
- Poppins SemiBold (600) by the Indian Type Foundry, SIL Open Font License 1.1 (`assets/fonts/OFL-Poppins.txt`). The game's typeface for everything but the maths; `build.sh` embeds `assets/fonts/poppins-600-*.woff2` into `index.html`
- Trig Text (Regular, 400), from Lilita One by Juan Montoreano, SIL Open Font License 1.1 (`assets/fonts/OFL-TrigText.txt`). Supplied by the user on 19 Nov 2026 for the equation on the cloud and the numbers on the orbs; `build.sh` embeds `assets/fonts/trigtext-regular.woff2` into `index.html`
