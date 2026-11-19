# Cannon Quest

A 2D algebra game built from your art. Load operation balls into the cannon, fire, and free **x** from its cage.
It is based on the *Cannon Quest* deck, the POD A stand-up brief (16 Nov 2026), and the mockups and asset sheets you supplied.

## Play
- Double-click **`index.html`** in Chrome, Edge or Safari. It works fully offline: the font (Poppins SemiBold) is built into the page.
- Keep the `assets/`, `js/`, `libs/` and `locales/` folders next to `index.html`.
- Works best in landscape. On a phone held upright, a "turn your device" hint appears; tap "Play anyway" to dismiss it.

**Controls**
- Tap a ball to load it into the cannon. Tap a loaded ball to send it back.
- Tap **FIRE** to fire.
- **Skip** (top right) appears while the tutorial or a shot is playing. It ends the tutorial, or jumps the shot straight to its result.
- The **Pause** button freezes the game and turns into ▶. Tap it again to continue. The speaker button mutes all sound.
- Keyboard: `1`–`8` load a ball, `Backspace` removes the last one, `Enter` fires, `P` pauses, `M` mutes.

## What's in the game
- **Start screen:** your mockup `art/start_screen/start_mockup.png`, built from your sheet `art/start_screen/start_sheet.png`. Every piece sits where the mockup puts it, on the game's own deck background.
  - The CANNON QUEST plaque is at the top, the wooden cannon at the bottom left, and the golden cage at the bottom right with x inside it. The Play button sits in the middle; it is smaller than in the mockup (176 art px instead of 257), as you asked.
  - x is really inside the cage: the cage is two layers (its whole picture behind x, and only its front bars, top ring and base lip in front of x).
  - x wants out. In a loop of about 10 s it peeks through the bars, shoves the left bars, then the right bars, jumps and bonks the roof, then grabs the bars and rattles them, then rests and tries again. The cage answers every time: it tips onto its edge and wiggles back, hops and thuds down (with dust), or shakes.
  - The logo bounces in, the cannon slides in, and the cage drops onto the deck. Play pops in, floats a little over its shadow and pulses a soft ripple.
  - Pressing Play fires the cannon, bursts the button, and sends the logo up, the cannon left and the cage right.
  - Under reduced motion everything is simply in place and x sits still.
  - To recut the pieces: `tools/cut_start_screen.py` (EDSR 2×; the cage and x 4×) prints each piece's box for `TL` in `src/35_title.js`.
- **Background:** your deck picture `art/background/new_background.png`, exactly as you made it: blue sky with five clouds, mountains, the forest with its big trees, the rope railing on wooden posts, and the wooden deck the cannon and the tray stand on. (`art/background/new_background_sheet.png` is the parts sheet you sent with it.)
  - It is cut into layers that move at different speeds as the camera moves and shakes (parallax): the sky drifts least, then the mountains, then the trees, and the deck moves with the cannon. With the camera at rest they stack back into your picture pixel for pixel. Each layer carries a little hidden picture under the edge of the layer in front, so no gap ever shows.
  - The scene is alive (`src/32_scenery.js`): the two leafy plants behind the railing sway in the wind, and the five clouds drift slowly to and fro. It runs as CSS keyframes, so it stays smooth even when the game is busy. It freezes on pause and stands still, exactly as painted, under reduced motion.
  - To rebuild the layers: `tools/upscale2x.py` (EDSR) makes `art/background/new_background_2x.png`, then `tools/cut_deck_bg.py` cuts it into `assets/img/bg_*.webp` and prints each layer's box for the CSS. Each layer's parallax amount is in `PARALLAX` in `src/30_stage.js`.
- **Equation cloud:** smaller (about 80%) and high in the sky, well clear of the cannon.
- **Cannon blast:** a white-hot flash, then an orange fireball that cools to red, a shock ring, falling embers, and thick grey smoke. The smoke billows out, rolls sideways, then rises and drifts off on the breeze. The sound is real recordings only: a close gun crack, a recorded boom with its rumble, and a distant echo (see `CREDITS.md`). The ball's whoosh is a real swung metal tube.
  - Pressing Play bursts the start screen away. The cloud then floats down, the cannon pops up and the tray slides in.
- **Six rounds from the deck.** Every operation is applied to both whole sides, with exact fractions and negatives. Any route that isolates x is accepted.
- **Freeing x:** the cage bursts open and the cloud shows the value of x (for example **x = 2**) for a moment. Then x hops, disappears in a puff of sparkles, the cloud clears, and the next cloud arrives.
- **Not freeing x:** the cage rattles and the cloud floats away. There is no "wrong" label and no retry, and the game moves to the next round.
- **Grounded scene:** the cannon and the ball tray cast soft shadows on the deck, balls sit down into their cups, and a loaded ball sits wholly inside its cannon socket, centred, with a thin dark rim and a soft shade all round (the gold ring never covers it: `CANNON.seat`). The FIRE button fills the recess in the cannon's gold bezel exactly, centred on it (`CANNON.fire`, measured in the cannon art).
- **First-time spotlight tutorial:** everything is blurred and dimmed except the one thing being explained, with a gold ring and a tapping hand.
  - Round 1: the caged x ("Let's free x!"), then the glowing −5 ball (only that ball can be tapped), then FIRE.
  - Round 2: the two sockets with their 1 and 2 markers while the firing order is explained, then FIRE once both are loaded.
  - A hint appears after 7 seconds of inactivity.
- **Voice-over:** one man's voice through the whole game, with captions, in this order: a welcome as Play is tapped, the seven deck tutorial lines, a short intro on each round without a tutorial ("Last one! Make it count!" on round 6), a reaction as the cage bursts open ("Boom! x is free!") or rattles ("Oh no! x is still stuck.", never "wrong"), and an end line that matches the score. Variants take turns, and a line waits for the one before it to finish. Skip silences a shot's line. The 21 lines are listed, with each one's mood, in `tools/vo_lines.json`.
  - The clips are made in Aamir's TTS studio, in one man's voice (the user's choice of 18 Nov 2026; `"voice"` in `tools/vo_lines.json`).
  - Until the clips are in `assets/VO/en/`, the device's own voice reads the lines. It uses a man's voice, the most natural one the device has (Edge's "Natural" voices first, then Google's, then the system's), with each line's mood setting its pace and pitch.
- **Motion:** time-based and GSAP-driven (bundled in `libs/`, no CDN), moving only position, scale, rotation and fade. Each shot and its result play as one timeline that **Skip** jumps to the end. With the device's *reduce motion* setting on, everything appears in place at once: no shake, particles, idle loops or camera drift.
- **Camera and screen shake** (spec: `docs/GAME_PROMPT.md`):
  - **Each shot:** the camera leans in on the cannon as it squats, then the cannon fires. The screen shakes, kicks back and punches in, the cannon stretches and jiggles, and the tray balls hop.
  - **After the shot:** the camera follows the ball up to the cloud. The game freezes for 60 ms on impact and the cloud squashes, then the camera holds on the equation, zoomed in, while it's read.
  - **When x is freed:** the camera pushes in on the cage. When it bursts, the game freezes for a moment, then plays in slow motion.
  - **While you choose balls,** the camera stays still. The background edge never shows on any screen shape.
- **Smoothness:**
  - Flying balls are drawn above the particles, so a ball's label stays readable through the blast.
  - Particles don't create new memory each frame.
  - Slower devices automatically get fewer particles and a simpler tutorial dim, changed only between shots.
- **Words by key:** every line of text and every voice clip is looked up by a key (`T('key')`), with the English in `locales/locales.json`. `index.html?lan=xx` picks a language once one is added.
- **Type and UI:** one typeface at one weight, **Poppins SemiBold (600)**, with no outlines on text. The caption, Skip and the socket markers (1, 2) share one look: a dark-glass chip with a thin gold edge. The caption hugs its line. When a new line comes in, the old words fade out, the card glides to its new size, and the new words fade in (`Caption` in `src/20_audio.js`). Play again sits under the score cloud.

## Files
```
cannon quest/
├── index.html            ← open this to play
├── js/  libs/  locales/  ← the game's code, GSAP and words (index.html needs these)
├── assets/               ← sprites, sound effects, music and voice clips the game loads
├── src/                  ← the game's source; ./build.sh turns it into index.html + js/script.js
├── tools/                ← scripts: voice clips, background, words
├── art/                  ← the art you supplied (the game doesn't load it; sprites are cut from it)
├── docs/                 ← notes, such as the prompts for new art
├── claude/skills/        ← your skills (localization, animation, compression…)
├── build.sh  README.md  CREDITS.md  CLAUDE.md
```

**The game (keep these next to `index.html`)**
| Path | What it is |
|---|---|
| `index.html`, `js/script.js` | The game, built from `src/` by `./build.sh` |
| `js/sfx.js` | The sound effects (`assets/sfx/*.webm`), embedded by `build.sh` so they also play from disk. The game fetches it once the start screen is up |
| (no loading screen) | Opening the link shows the start screen as soon as its own pictures are in (about 1.3 s on 4G; at once from disk). `src/00_head.html` preloads the scripts, the words and every start-screen picture first. The play scene's pictures (`data-src` in the markup, `Pics.GAME` in `src/40_game.js`) and `js/sfx.js` are fetched only once the start screen shows, so they never slow it. `Title.exit` waits for them if Play is tapped first |
| `locales/locales.json` | Every word the game shows or says, by key (English). `locales.js` is a generated copy for opening from disk |
| `js/i18n.js` | Looks words and voice clips up by key (`T('key')`, `I18n.voice('key')`) |
| `libs/gsap.min.js` | GSAP 3.15.0, the animation library, bundled locally |
| `assets/fonts/` | Poppins SemiBold (`poppins-600-latin*.woff2`, SIL OFL). `build.sh` embeds it into `index.html` (as `src/02_fonts.html`), because Chrome blocks font files on pages opened from disk |
| `assets/img/` | The sprites, cut from the sheets in `art/` and upscaled (EDSR super-resolution) so they stay sharp on retina screens. Start-screen sprites are named `t_*`; `bg_*.webp` are the background layers. All images are WebP |
| `assets/sfx/` | Recorded sound effects (CC0 / public domain), Opus `.webm` |
| `assets/music/` | Background music: "Bravery Run" by MintoDog, upbeat electric guitar + synth game music (170 bpm) that loops without a seam, CC0 public domain (Opus `.webm`) |
| `assets/VO/en/` | Voice clips, one per key (`<key>.webm`), from Aamir's studio |

**Working files (the game doesn't need these to run)**
| Path | What it is |
|---|---|
| `src/` | The game's source code and page, in the order `build.sh` joins them |
| `build.sh` | Rebuilds `index.html` (with the font embedded at the `<!--FONTS-->` line of `src/00_head.html`), `js/script.js`, `js/sfx.js` and `locales/locales.js` from `src/` and `locales/locales.json` |
| `tools/` | `vo_studio.mjs` (makes the clips in the studio), `vo_build.sh` (turns them into `.webm`), `gen_locales.mjs` (run by `build.sh`), `cut_ui_elements.py` (cuts the cannon, FIRE, tray and balls), `cut_start_screen.py` (cuts the start screen), `upscale2x.py` + `cut_deck_bg.py` (the background layers) |
| `art/sprite_sheets/` | `ui_elements.png`: the UI sheet the cannon, FIRE button, tray and balls are cut from (`tools/cut_ui_elements.py`). `new.png`: the cloud, cage, x and buttons (`tools/cut_new_art.py`). `1.png`–`4.png`: older glossy sheets. `flat_sprites.png`: a flat-art sheet that was tried and dropped |
| `art/start_screen/` | `start_sheet.png` (the start-screen sheet: logo, cannon, Play button, cage, x; cut by `tools/cut_start_screen.py`) and `start_mockup.png` (the layout it follows). Older, no longer used: `thumbnail.png` and `play_button.png` |
| `art/background/` | `new_background.png` (the background, cut into layers by `tools/cut_deck_bg.py`), `new_background_2x.png` (it at 2×, EDSR) and `new_background_sheet.png` (its parts sheet). Older, no longer used: `background_layers.png` (the lake-and-plaza layer sheet) and `5.png` (the first one-piece background) |
| `docs/ASSET_PROMPTS.md` | The image prompts for the flat-art sprite sheet |
| `claude/skills/` | Your skills for game projects: localization, animation, translation, compression |

## Editing
After changing anything in `src/`, run `./build.sh`.
| What to change | Where |
|---|---|
| Any word on screen, or a voice line's text | `locales/locales.json` (then `./build.sh`) |
| Voice clips | `node tools/vo_studio.mjs --audition` (4 sample lines in each of the studio's 3 men's voices, to choose one), then `node tools/vo_studio.mjs` (all lines without a clip), then `sh tools/vo_build.sh`, then `./build.sh`. The voiced keys, the voice and each line's mood are in `tools/vo_lines.json` |
| Animation timing (durations, easing, Skip, reduced motion) | `Motion` in `src/12_motion.js`; each shot's timeline is `addShot` in `src/40_game.js` |
| Camera framing for each shot (wind-up, follow, read) | `SHOT_CAM` above `addShot` in `src/40_game.js` |
| Shake strength, camera smoothing, zoom limits | `CAM` at the top of the camera rig in `src/30_stage.js`; each hit's numbers are in the `Stage.hit({…})` calls |
| Equations, ball choices, socket counts | `ROUNDS` in `src/10_core.js` |
| Positions and sizes of the cloud, cannon, tray and holes | top of `src/30_stage.js` (art-space is 1672 × 941, the same as the mockup) |
| Start-screen layout and timing | `TL` at the top of `src/35_title.js` |
| A sprite | Replace the file in `assets/img/` and keep the name |
| Cannon, FIRE button, tray, balls | `python tools/cut_ui_elements.py art/sprite_sheets/ui_elements.png EDSR_x2.pb OUT` (a Python with OpenCV's `dnn_superres`, SciPy and Pillow), then `cwebp -m 6 -q 90 -alpha_q 100` each PNG into `assets/img/`. It prints the numbers for `CANNON` and `RACK` at the top of `src/30_stage.js` |

The cannon comes in 1- and 2-socket versions (the sheet has only 1-socket cannons, so `tools/cut_ui_elements.py` builds the 2-socket one from the same wooden cannon), so rounds can use up to 2 sockets. If you supply 3- and 4-socket cannon art, the deck's bonus banks can be added back.

See `CREDITS.md` for the audio licences.
