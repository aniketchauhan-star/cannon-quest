# Cannon Quest

A 2D algebra game built from your art. Load operation balls into the cannon, fire, and free **x** from its cage.
It is based on the *Cannon Quest* deck, the POD A stand-up brief (16 Nov 2026), and the mockups and asset sheets you supplied.

## Play
- Double-click **`index.html`** in Chrome, Edge or Safari. It works fully offline: the fonts (Poppins SemiBold, and Trig Text for the maths) are built into the page.
- Keep the `assets/`, `js/`, `libs/` and `locales/` folders next to `index.html`.
- Works best in landscape. On a phone held upright, a "turn your device" hint appears; tap "Play anyway" to dismiss it.

**Controls**
- Drag a ball into the cannon to load it: near the cannon the nearest empty socket glows and draws the ball in, and let go there, it drops in and fills the socket. Let go anywhere else and it flies back to the tray. On the two-socket cannon you can drop a ball straight into socket 1 or 2.
- Tapping still works too: tap a ball to load it. Tap a loaded ball to send it back, or drag it out.
- Tap **FIRE** to fire.
- **Skip** (top right) appears while the tutorial or a shot is playing. It ends the tutorial, or jumps the shot straight to its result.
- The **Pause** button freezes the game and turns into ▶. Tap it again to continue. The speaker button mutes all sound.
- Keyboard: `1`–`8` load a ball (also during the tutorial), `Backspace` removes the last one, `Enter` fires, `P` pauses, `M` mutes.

## What's in the game
- **Start screen:** your mockup `art/start_screen/start_mockup.png`, built from your sheet `art/start_screen/start_sheet.png`. Every piece sits where the mockup puts it, on the game's own deck background.
  - The CANNON QUEST plaque is at the top, the wooden cannon at the bottom left, and the golden cage at the bottom right with x inside it. The Play button sits in the middle; it is smaller than in the mockup (176 art px instead of 257), as you asked.
  - x is really inside the cage: the cage is two layers (its whole picture behind x, and only its front bars, top ring and base lip in front of x).
  - x wants out. In a loop of about 10 s it peeks through the bars, shoves the left bars, then the right bars, jumps and bonks the roof, then grabs the bars and rattles them, then rests and tries again. The cage answers every time: it tips onto its edge and wiggles back, hops and thuds down (with dust), or shakes.
  - The pieces come in one after another, each with its own real recorded sound (CC0, see `CREDITS.md`; `Title.IN` and `Title.cues` in `src/35_title.js`, `Sound.signLand` / `rollIn` / `cannonLand` / `cageLand` / `cork` in `src/20_audio.js`):
    - the CANNON QUEST sign drops from the sky with a swish and bounces into place with a wooden knock;
    - the cannon slides in from the left over the deck (a soft roll) and plants itself with a heavy thud and a puff of dust;
    - the golden cage falls with a swish and bounces on the deck: a metal clang on wood, then smaller clinks;
    - Play pops up (a cork pop), floats a little over its shadow and pulses a soft ripple. x starts struggling once everything is in (3 s).
  - A browser keeps a page silent until its first tap or key (its autoplay rule). So on a first visit opened straight from a link or from disk, the entrance may play without sound; from the first tap anywhere, x's struggle is heard (`Sound.listen`). An app's web view, or a browser that already trusts the site, plays the entrance with its sounds. The six entrance clips come with the page in their own small file (`js/sfx_title.js`, 35 KB), so they are ready when it plays.
  - Pressing Play fires the cannon, bursts the button, and sends the logo up, the cannon left and the cage right.
  - Under reduced motion everything is simply in place and x sits still.
  - To recut the pieces: `tools/cut_start_screen.py` (EDSR 2×; the cage and x 4×) prints each piece's box for `TL` in `src/35_title.js`.
- **Background:** your deck picture `art/background/new_background.png`, exactly as you made it: blue sky (its five painted clouds are left out: the only cloud in the game is the equation's), mountains, the forest with its big trees, the rope railing on wooden posts, and the wooden deck the cannon and the tray stand on. (`art/background/new_background_sheet.png` is the parts sheet you sent with it.)
  - It is cut into layers that move at different speeds as the camera moves and shakes (parallax): the sky drifts least, then the mountains, then the trees, and the deck moves with the cannon. With the camera at rest they stack back into your picture pixel for pixel. Each layer carries a little hidden picture under the edge of the layer in front, so no gap ever shows.
  - The scene is alive (`src/32_scenery.js`). It runs on transform and opacity only, mostly as CSS keyframes, so it stays smooth even when the game is busy. It freezes on pause, and under reduced motion it stands still (no birds, no falling leaves).
    - **Sun:** top right, with the sky brightening toward it, a soft bloom and two slowly counter-turning glare layers (`sun_glow` / `sun_rays`, drawn by `tools/make_sun.py`).
    - **Jungle:** low mist drifting between the trees, soft shafts of sunlight from the sun that slowly brighten and fade, sunlit specks floating up, and now and then a golden leaf tumbling down from the big trees. The pieces and their places are `MIST`, `SHAFTS` and `LEAF_FROM` at the top of `src/32_scenery.js`.
    - **Birds:** a few, not many. Every 9–18 s a flock of 1 to 3 small birds crosses the sky between the hills and the treetops (behind the big trees and the equation cloud), flapping a few beats, then gliding (`Birds`).
    - **Wind:** the two leafy plants behind the railing sway in the wind, a gust crossing from left to right.
  - To rebuild the layers: `tools/upscale2x.py` (EDSR) makes `art/background/new_background_2x.png`, then `tools/cut_deck_bg.py` cuts it into `assets/img/bg_*.webp` and prints each layer's box for the CSS. Each layer's parallax amount is in `PARALLAX` in `src/30_stage.js`.
- **Equation cloud:** smaller (about 80%) and high in the sky, well clear of the cannon.
- **Cannon blast:** as the ball sinks in, sparks of its colour are drawn into the barrel and a glow swells there. Then a white-hot flash and a starburst at the mouth, an orange fireball that cools to red, a shock ring in the air and another running out over the deck, falling embers, and thick grey smoke. The ball flies with a comet's tail of its own colour, and so do its two copies on their way to each side of the equation; each hit and landing gets a starburst, and the terms that cancel burst into golden sparkles. The smoke billows out, rolls sideways, then rises and drifts off on the breeze. The sound is real recordings only: a close gun crack, a recorded boom with its rumble, and a distant echo (see `CREDITS.md`). The ball's whoosh is a real swung metal tube.
  - Pressing Play bursts the start screen away. The cloud then floats down, the cannon pops up and the tray slides in.
- **Six rounds from the deck.** Every operation is applied to both whole sides, with exact fractions and negatives. Any route that isolates x is accepted.
- **Freeing x** (you asked on 23 Nov: "the cage is burst, like cage broken, and then x comes out… after 5 seconds the cloud is fade and burst", then "extreme… slow animation of cage crack and x come out from them, and cloudburst after x compose"). Each stage is its own slow beat (`Motion.BEAT`), about 12 s in all:
  - **Close-up:** the screen's edges darken, a low rumble starts, and the camera closes in on the cage (zoom 1.7–1.8, still centred on the cloud). The cage starts to glow.
  - **The cage cracks, slowly:** x pushes on its bars three times. Each push lands with a snap and a groan, chips of gold fly, and **glowing cracks** run out over the cage's gold from where x's hands are, with light leaking through them. A fan of golden light rays wakes behind the cage. After the third push the cracks race over the whole cage and it trembles.
  - **It bursts along its cracks:** a flash and a starburst, rings of light, sparks of gold, purple and white, and the cage's **shards** tumble away. Some come toward you and some fly away; they hang in the air (heavy air drag, no slow-motion), spin and fade. The cracks are exactly where it comes apart: one fracture pattern (`Fracture` in `src/30_stage.js`) gives both. Every shard is the cage's own picture (`assets/img/cage_empty.webp`, cut by `tools/cut_cage_break.py`).
  - **x comes out:** it rises out of the light (white-hot at first), hovers while sparkles circle it, then comes down where the cage stood with a ring of gold at its feet. **"= 2"** lights up with the fanfare, a starburst, and confetti from both sides of the cloud.
  - **x = 2** stays on the cloud for 5 seconds (`Motion.BEAT.HOLD`), with a soft halo of rays behind x and twinkles round it.
  - **Cloudburst:** the cloud draws in its breath. It squeezes and trembles, a warm light builds in its heart, sparks are pulled in, and "x = 2" is drawn into the light. Then it **bursts in place**: a flash, a starburst and two shock rings, its own puffs blasting outward (swelling, turning, melting into mist), white vapour, golden sparks and a short shower of glittering rain.
  - The next cloud **forms from its puffs** in the same spot: they drift in from round it, blurred, and come together sharp, and the equation pops in with a twinkle. A cloud never sails in or out sideways.
- **Not freeing x:** the cage rattles with sparks flying off its bars, then a gentler cloudburst (no shower). There is no "wrong" label and no retry, and the game moves to the next round.
- **End card:** confetti, and fireworks in the sky either side of the score cloud, one more for each x freed.
- **Grounded scene:** the cannon and the ball tray cast soft shadows on the deck, balls sit down into their cups, and a loaded ball fills its cannon socket edge to edge, centred, with no dark gap round it (you asked on 20 Nov: "fully absorb in circle, no negative space"). Its orb is 1.015 × the opening (`CANNON.seat`), so its edge tucks about a pixel under the gold ring's inner lip and nothing shows outside the ring. As it lands it swells a touch and settles (no squash, which would open a gap). The FIRE button fills the recess in the cannon's gold bezel exactly, centred on it (`CANNON.fire`, measured in the cannon art).
- **First-time spotlight tutorial:** only ONE, on the first screen (x + 5 = 7) and on no other screen. Everything is blurred and dimmed except what is being shown, with a gold ring:
  1. the equation on the cloud ("This is the equation.");
  2. the cannon ("This is the cannon.");
  3. the orbs in the tray, which glow one after another ("These are the orbs.");
  4. the −5 orb glows and a hand taps it ("Tap the −5 orb!"). The cannon's socket stays clear too. Only the −5 can be loaded (tapped, dragged, or by its key); any other orb gives a soft "nope". Once it is tapped it flies into the cannon;
  5. the FIRE button, with the loaded −5 beside it, and a hand taps FIRE ("Now tap FIRE!"). Only FIRE answers now (or Enter); the player taps it and the cannon fires the −5 at the cloud.
  - Nothing else is a tutorial: the two-socket rounds start straight away, with their 1 and 2 markers on the cannon.
  - It plays every time the game is opened (or reloaded), in its first game. Play again, in the same visit, goes straight into play. (It used to play only once per browser, which hid it after the first showing.)
  - A hint appears after 7 seconds of inactivity.
- **Voice-over:** one real person's voice through the whole game, with captions, in this order: a welcome as Play is tapped, the five tutorial lines (first game only), a short intro on each round without a tutorial ("Last one! Make it count!" on round 6), a reaction as the cage bursts open ("Boom! x is free!") or rattles ("Oh no! x is still stuck.", never "wrong"), and an end line that matches the score. Variants take turns, and a line waits for the one before it to finish. Skip silences a shot's line. The 20 lines are listed, with each one's mood, in `tools/vo_lines.json`.
  - **No AI voice, ever** (since 20 Nov 2026: "natural voiceovers, not AI generated"). Every clip is cut from a person reading the lines aloud. No TTS studio, no AI voice, and not the device's own voice: the game has no code that makes a voice.
  - To record: read `docs/VO_RECORD.txt` (the 20 lines in order, each with when it's said and how it should feel) into a phone in one go, and put the file in `recordings/` (kept out of git). `~/.cache/crown-quest/venv/bin/python tools/vo_split.py recordings/<file> --check` finds every line, and the same without `--check` cuts it into `assets/VO/en/<key>.webm`. Then run `./build.sh`. A stumble is fine: say the whole line again, and the last take is used. Another recording of a few lines: give their keys after the file, in the order they're read.
  - **Just the tutorial first:** `docs/VO_RECORD_TUTORIAL.txt` has only the welcome + the five tutorial lines (about 20 seconds). Record it, then `~/.cache/crown-quest/venv/bin/python tools/vo_split.py recordings/<file> tutorial` and `./build.sh`. Each tutorial step then waits for its line, with the caption word by word. The group is `groups.tutorial` in `tools/vo_lines.json`, and `python3 tools/vo_split.py --script tutorial` rewrites its script. Use the same voice as the rest of the game.
  - `tools/vo_split.py` writes each cut down in `tools/vo_takes.json` (which recording, where, the words heard, and when each word starts). `./build.sh` lists only those clips, so a clip that didn't come from a recording is never played. The word starts make the caption's words pop in exactly as they are said.
  - A line without a recorded clip has no voice, and so no caption either.
  - **Recorded (20 Nov 2026):** all 20 lines, from the user's recording `recordings/1.mp3` (40.9 s, one take, kept out of git). `tools/vo_split.py` heard every word of every line; the clips are 1.3–3.7 s each, about 230 KB in all.
- **Motion:** time-based and GSAP-driven (bundled in `libs/`, no CDN), moving only position, scale, rotation and fade. Each shot and its result play as one timeline that **Skip** jumps to the end. With the device's *reduce motion* setting on, everything appears in place at once: no shake, particles, idle loops or camera drift.
- **Camera and screen shake** (spec: `docs/GAME_PROMPT.md`):
  - **Each shot:** the camera leans in on the cannon as it squats, then the cannon fires. The screen shakes, kicks back and punches in, the cannon stretches and jiggles, and the tray balls hop.
  - **After the shot:** the camera follows the ball up to the cloud. The game freezes for 60 ms on impact and the cloud squashes, then the camera holds on the equation, zoomed in, while it's read.
  - **When x is freed:** the camera closes in on the cage (centred on the cloud) and creeps closer while it cracks. Each push jolts it a little, the burst shakes it hard, and it eases back to 1.2 while x lands. It returns to the base framing only after the cloud has burst, so the cloud never slides sideways on screen. (With *reduce motion* on, the camera cuts instead and goes no closer than 1.18.)
  - **While you choose balls,** the camera stays still. The background edge never shows on any screen shape.
- **Smoothness:**
  - Flying balls are drawn above the particles, so a ball's label stays readable through the blast.
  - Particles don't create new memory each frame.
  - Slower devices automatically get fewer particles and a simpler tutorial dim, changed only between shots.
- **Words by key:** every line of text and every voice clip is looked up by a key (`T('key')`), with the English in `locales/locales.json`. `index.html?lan=xx` picks a language once one is added.
- **Type and UI:** **Poppins SemiBold (600)** for words, and **Trig Text** (the user's font, 19 Nov) for the equation on the cloud and the numbers on the orbs, including their own ÷. No outlines on text. Skip and the socket markers (1, 2) share one look: a dark-glass chip with a thin gold edge. Play again sits under the score cloud.
  - **Caption (what the voice says):** your question template `art/ui/question_template.png` (an orange wooden frame with a dark-brown outline and a cream panel) on the left, halfway down, with big (36 px) dark-brown words on the cream so they always read. It is drawn in the template's own proportions, so its whole thick wooden frame and grain show: a 9-slice (`assets/img/question_board.webp`, cut by `tools/cut_question_board.py`) painted into a canvas in whole screen pixels by `Caption.paint` in `src/20_audio.js` (`BOARD` holds the slice lines), so the pieces meet with no seams. The corners stay as drawn and the frame stretches to the words. It hugs its words (as wide as its longest line, one or two lines, at most 560 wide so it stays clear of the cannon) and stays centred on its spot. It sits above the cannon smoke, so the words are never hidden. A one-letter word (x) never ends a line.
  - **It comes only with the voice, word by word.** The board stays hidden until a line's voice actually starts (its recorded clip plays). Then it rises in with the first word, and each word pops in as it is said. If no voice starts (sound off, no clip recorded yet, a clip that fails), no board shows. The board is sized for the whole line before its first word, so it never grows while the words come. The word clock (`Said` in `src/20_audio.js`) follows each word's start in the recording (`VO_WORDS`, heard by `tools/vo_split.py`), or spreads the words over the clip's length where it has none.
  - When a new line comes in, the old words fade out, the board glides to its new size and place, and the new words come as they are said (`Caption` in `src/20_audio.js`). Test robots (`navigator.webdriver`) make no sound, but the board still runs as if the lines were spoken.

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
| `js/sfx_title.js` | The start screen's six entrance sounds (`TITLE_SFX` in `build.sh`), embedded the same way. The page loads it with itself, so they are ready when the entrance plays |
| `js/sfx.js` | The other sound effects (`assets/sfx/*.webm`), embedded by `build.sh` so they also play from disk. The game fetches it once the start screen is up |
| (no loading screen) | Opening the link shows the start screen as soon as its own pictures are in (about 1.3 s on 4G; at once from disk). `src/00_head.html` preloads the scripts, the words and every start-screen picture first. The play scene's pictures (`data-src` in the markup, `Pics.GAME` in `src/40_game.js`) and `js/sfx.js` are fetched only once the start screen shows, so they never slow it. `Title.exit` waits for them if Play is tapped first |
| `locales/locales.json` | Every word the game shows or says, by key (English). `locales.js` is a generated copy for opening from disk |
| `js/i18n.js` | Looks words and voice clips up by key (`T('key')`, `I18n.voice('key')`) |
| `libs/gsap.min.js` | GSAP 3.15.0, the animation library, bundled locally |
| `assets/fonts/` | Poppins SemiBold (`poppins-600-latin*.woff2`) and Trig Text (`trigtext-regular.woff2`), both SIL OFL. `build.sh` embeds them into `index.html` (as `src/02_fonts.html`), because Chrome blocks font files on pages opened from disk |
| `assets/img/` | The sprites, cut from the sheets in `art/` and upscaled (EDSR super-resolution) so they stay sharp on retina screens. Start-screen sprites are named `t_*`; `bg_*.webp` are the background layers. All images are WebP |
| `assets/sfx/` | Recorded sound effects (CC0 / public domain), Opus `.webm` |
| `assets/music/` | Background music (`battle.webm`): "War on Water: Chapter 1" by yd, an orchestral naval-battle march (85 bpm), with real wind, shore waves, gulls and distant cannon fire mixed in by `tools/mix_bgm.py`. One seamless loop, all CC0 (Opus `.webm`) |
| `assets/VO/en/` | Voice clips, one per key (`<key>.webm`), cut from a real person's recording |

**Working files (the game doesn't need these to run)**
| Path | What it is |
|---|---|
| `src/` | The game's source code and page, in the order `build.sh` joins them |
| `build.sh` | Rebuilds `index.html` (with the font embedded at the `<!--FONTS-->` line of `src/00_head.html`), `js/script.js`, `js/sfx_title.js`, `js/sfx.js` and `locales/locales.js` from `src/` and `locales/locales.json` |
| `tools/` | `vo_split.py` (cuts a recording of the lines into the voice clips; `--script` writes `docs/VO_RECORD.txt`), `vo_data.mjs` (run by `build.sh`: which lines have a recorded clip), `gen_locales.mjs` (run by `build.sh`), `cut_single_cannon.py` (cuts the 1-socket cannon and its FIRE button), `cut_double_cannon.py` (cuts the 2-socket cannon and its FIRE button), `cut_ui_elements.py` (cuts the tray and balls), `cut_start_screen.py` (cuts the start screen), `hd_upscale.py` (makes the sprites HD), `cut_glints.py` (the start screen's gold glints), `cut_question_board.py` (the caption board), `upscale2x.py` + `cut_deck_bg.py` (the background layers), `mix_bgm.py` (the background music with its nature sounds and distant cannon fire) |
| `art/sprite_sheets/` | `single_cannon.png`: the 1-socket cannon with its FIRE pill (`tools/cut_single_cannon.py`). `double_cannon.png`: the 2-socket cannon with its own FIRE pill (`tools/cut_double_cannon.py`). `ui_elements.png`: the UI sheet the tray and balls are cut from (`tools/cut_ui_elements.py`; its wooden cannon was used until 23 Nov). `new.png`: the cloud, cage, x and buttons (`tools/cut_new_art.py`). `1.png`–`4.png`: older glossy sheets. `flat_sprites.png`: a flat-art sheet that was tried and dropped |
| `art/start_screen/` | `start_sheet.png` (the start-screen sheet: logo, cannon, Play button, cage, x; cut by `tools/cut_start_screen.py`) and `start_mockup.png` (the layout it follows). Older, no longer used: `thumbnail.png` and `play_button.png` |
| `art/background/` | `new_background.png` (the background, cut into layers by `tools/cut_deck_bg.py`), `new_background_2x.png` (it at 2×, EDSR) and `new_background_sheet.png` (its parts sheet). Older, no longer used: `background_layers.png` (the lake-and-plaza layer sheet) and `5.png` (the first one-piece background) |
| `docs/ASSET_PROMPTS.md` | The image prompts for the flat-art sprite sheet |
| `claude/skills/` | Your skills for game projects: localization, animation, translation, compression |

## Editing
After changing anything in `src/`, run `./build.sh`.
| What to change | Where |
|---|---|
| Any word on screen, or a voice line's text | `locales/locales.json` (then `./build.sh`) |
| Voice clips | A person records `docs/VO_RECORD.txt`, then `~/.cache/crown-quest/venv/bin/python tools/vo_split.py recordings/<file>`, then `./build.sh` (see Voice-over above). A voiced line's words changed: `python3 tools/vo_split.py --script` and record that line again. The voiced keys, each line's moment and mood are in `tools/vo_lines.json` |
| Animation timing (durations, easing, Skip, reduced motion) | `Motion` in `src/12_motion.js`; each shot's timeline is `addShot` in `src/40_game.js` |
| Camera framing for each shot (wind-up, follow, read) | `SHOT_CAM` above `addShot` in `src/40_game.js` |
| Shake strength, camera smoothing, zoom limits | `CAM` at the top of the camera rig in `src/30_stage.js`; each hit's numbers are in the `Stage.hit({…})` calls |
| Equations, ball choices, socket counts | `ROUNDS` in `src/10_core.js` |
| Positions and sizes of the cloud, cannon, tray and holes | top of `src/30_stage.js` (art-space is 1672 × 941, the same as the mockup) |
| Start-screen layout and timing | `TL` at the top of `src/35_title.js` |
| A sprite | Replace the file in `assets/img/` and keep the name |
| Background music | Download the six CC0 files listed at the top of `tools/mix_bgm.py` into one folder, then `PY tools/mix_bgm.py FOLDER` (NumPy, SciPy, ffmpeg) writes `assets/music/battle.webm`. The levels of the wind, waves, gulls and distant cannon shots, and where each shot falls (bar, beat), are in `main()` |
| Caption board | `python tools/cut_question_board.py` (Pillow + NumPy) recuts `art/ui/question_template.png` into `assets/img/question_board.webp` and prints the slice lines for `BOARD` in `src/20_audio.js` and the cream panel's inset for `#cap`'s padding in `src/00_head.html` |
| Cannons, FIRE button | `PY tools/cut_single_cannon.py art/sprite_sheets/single_cannon.png OUT` (cannon1, cannon1_front, fire) and `PY tools/cut_double_cannon.py art/sprite_sheets/double_cannon.png OUT` (cannon2, cannon2_front, fire2), then `cwebp -m 6 -q 90 -alpha_q 100` each PNG into `assets/img/`. Both cut onto one canvas with one mapping (1226×898, 0.84 px per art px), so a round's morph swaps only the top. Each prints its cannon's numbers for `CANNON` (holes, foot, fire) at the top of `src/30_stage.js`. The art is already ~3 px per game px, so they skip the HD step below. PY = a Python with SciPy and Pillow (`~/.cache/bj-voices/venv/bin/python` on this Mac) |
| Tray, balls | `python tools/cut_ui_elements.py art/sprite_sheets/ui_elements.png EDSR_x2.pb OUT` (a Python with OpenCV's `dnn_superres`, SciPy and Pillow), then `cwebp -m 6 -q 90 -alpha_q 100` each PNG into `assets/img/`. It prints the numbers for `RACK` at the top of `src/30_stage.js` |
| HD pictures (after any recut above, or of the start screen; not the cannons or FIRE) | `PY tools/hd_upscale.py OUT rack:3236 rack_front:rack ball_0:336 … ball_7:336 pause:264 play:264 sound:266 bg_plantL:286 bg_plantR:233 t_cannon:1314 t_cage:955 t_cage_front:t_cage t_x:487 t_logo:2452 playbtn:440`, then `cwebp -m 6 -q 90 -alpha_q 100` each PNG into `assets/img/`, then `tools/cut_glints.py` (the start screen's glints, from the HD cannon and cage). It upscales with Real-ESRGAN's illustration model (RealESRGAN_x4plus_anime_6B, on the Mac's GPU through PyTorch) to about 2.5 picture px per art px, so the sprites stay sharp on retina screens with the camera zoomed in. `name:width` upscales; `layer:name` cuts a front layer from its picture's HD version, so they line up exactly. Proportions never change, so nothing moves in the game. PY = a Python with torch, NumPy and Pillow (`~/.cache/bj-voices/venv/bin/python` on this Mac); weights in `~/.cache/esrgan-weights/`. Run it on the cut pictures once only (not on its own output). The background layers and the caption board are left as they are |

The cannon comes in 1- and 2-socket versions, both your own art (`art/sprite_sheets/single_cannon.png` and `double_cannon.png`, 23 Nov), so rounds can use up to 2 sockets. On the 2-socket cannon your gold arrow between the sockets shows the order, and the game's 1 and 2 markers sit on the gold side bands just above their rivets. FIRE uses each cannon's own yellow pill (`fire.webp` on the 1-socket cannon, `fire2.webp` on the 2-socket one), its word white with a thin brown edge as you drew it (grey when the button is off). If you supply 3- and 4-socket cannon art, the deck's bonus banks can be added back.

See `CREDITS.md` for the audio licences.
