# Cannon Quest: full game prompt

You are a senior HTML5 game developer and game-feel designer. You are working in the **Cannon Quest** folder: a finished, playable 2D algebra game built from the designer's own art. Your job is to make it the best version of itself. That means **cinematic camera framing**, a **punchy screen shake ("wiggle") every time the cannon fires**, and motion that is **perfectly smooth with zero lag**, even on a low-end Android tablet.

This prompt describes the **whole game**, so you understand every part of it. Items marked **[NEW]** are what you add or change. Everything else already works: keep it exactly as described, and don't redesign it.

---

## 1. Ground rules (non-negotiable)

1. **Text by key.** Follow `claude/skills/localization_skill.md`. Every visible word and every voice clip is looked up by key: `T('key')` / `I18n.voice('key')`. English lives only in `locales/locales.json`. Never hard-code a string in HTML/JS, not even for a new feature.
2. **Animation rules.** Follow `claude/skills/animation_skill.md`:
   - GSAP is bundled locally (`libs/gsap.min.js`, 3.15.0); no CDN.
   - Animate only `transform` and `opacity`, time-based (delta time), never `setInterval`.
   - Ease-out to enter, ease-in to leave, `back.out`/elastic for playful pops.
   - Each concept sequence (a round's shots + outcome) is **one GSAP timeline** with a **Skip** button that jumps it to the end silently.
   - Honour `prefers-reduced-motion`, and kill timelines on teardown.
3. **Voice-over.** Make every clip only with Aamir's TTS studio ("Ai Wala Human By Aamir", MP3, language Hindi for English lines) via `tools/vo_studio.mjs`. Use **one man's voice** for every line: the user asked for it on 2026-11-18. It is set as `"voice"` in `tools/vo_lines.json`, by default Male Child (Energetic), which is Gemini voice Puck, an adult man's upbeat voice. `--audition` makes samples of the studio's three men's voices.
   - The voice runs through the whole game: welcome, tutorial, round intros, a reaction to each outcome (never "wrong"), and the end line. Each line's mood is in `tools/vo_lines.json`.
   - If the studio fails (currently: "Exceeded monthly Gemini API spending cap"), stop and report it. The device's voice (a man's where available, coloured by the line's mood) reads the line until the studio works.
   - **Never call the ElevenLabs API** unless the user has typed exactly: "Yes I confirm use elevenlabs API".
4. **Art.** Use only the designer's art (Section 3). Don't generate, redraw or restyle sprites, and don't switch to a flat style. If an asset is missing, ask.
5. **Build.** Source is in `src/`. After any change, run `./build.sh`, which writes `index.html`, `js/script.js` and `locales/locales.js`. The game must still open by double-clicking `index.html` (offline, `file://`).
6. **Verify visually.** Take headless screenshots (Playwright) of the title, aim, mid-flight, impact, freed and end states before you report. Report honestly what you checked and what you didn't.

---

## 2. The game in one paragraph

A purple **x** is locked in a golden cage on a cloud, inside an equation such as **x + 5 = 7**. Below sits a wooden **cannon** with leaves and 1 or 2 gold **sockets**. In front of it is a **tray of 8 coloured operation balls** (+5, −5, ×5, ÷5 …).
- The player taps balls to load them into the sockets, then taps **FIRE**.
- Each ball flies up into the cloud and splits into **two identical terms that land on both sides** of the equation (x + 5 **− 5** = 7 **− 5**). The terms that cancel vanish, and the equation simplifies (x = 2).
- If x ends up alone, the cage bursts open and x is free. If not, the cage rattles and the cloud floats away.
- There is no "wrong" label and no retry: every round advances.
- Six rounds, then an end card: "You freed N out of 6!".

**Learning goal:** whatever you do to one side of an equation, you do to the whole of both sides. Undo operations in reverse order to isolate x.

**Audience and tone:** students aged about 11–15 (Indian ed-tech). The look is bright, glossy and saturated. The feel is energetic and premium, and **teen, not kiddish**.

---

## 3. Assets (already in the repo: use these, don't replace them)

| Path | What |
|---|---|
| `assets/img/bg.jpg` | Lake-side plaza background with painted clouds (2× upscale of `art/background/5.png`). One flat layer. |
| `assets/img/cloud.png` | The equation cloud |
| `assets/img/cage_x.png`, `cage.png`, `xchar.png` | x in its cage, the empty cage, and the free x character |
| `assets/img/cannon1.webp`, `cannon2.webp` (+ `_front`) | 1-socket and 2-socket wooden cannons, cut from `art/sprite_sheets/ui_elements.png` by `tools/cut_ui_elements.py` (the 2-socket one is built from the 1-socket art). Only these two exist, so rounds use at most 2 sockets. |
| `assets/img/fire.webp` | The red FIRE pill, blank: the game writes the word (`btnFire`) on it |
| `assets/img/ball_0..7.png` | Ball bodies: magenta, pink, green, cyan, coral, blue, yellow, purple. The game draws the labels. |
| `assets/img/rack.webp`, `rack_front.webp` | The wooden ball tray (metal corners, rope ends, cyan light), its plain middle stretched to hold 8 balls; the front lip is drawn over the balls |
| `assets/img/pause.png`, `play.png`, `sound.png` | HUD buttons (orange rounded squares) |
| `assets/img/t_*.png`, `playbtn.png` | Start screen: logo "Cannon Quest / Solve & Fire!", caged x, cannon, balls with painted labels, sparkles, round red Play button |
| `assets/sfx/*.mp3` | Recorded CC0 effects (boom, shot, thunder, plop, latch, glass, bell, key, creak, spring, metal, air…; see `CREDITS.md`) |
| `assets/music/chillwave.mp3` | "Chill Wave" (Kevin MacLeod, CC BY 4.0). The credit stays on the title screen. |
| `assets/VO/en/<key>.mp3/.webm` | Voice clips from the studio, one per key |
| `art/` | The designer's source sheets (not loaded by the game) |

All sprites are 2× (EDSR) so they stay sharp on retina. Keep them crisp: no CSS upscaling beyond 1×, and no blurry filters on sprites.

---

## 4. Layout (fixed art-space 1672 × 941, letter-boxed to the screen; landscape)

The stage is a fixed 1672 × 941 "art-space" scaled to fit the screen. The background over-scans so its edges never show. All numbers below are art-space pixels.

| Element | Position |
|---|---|
| Equation cloud | box left 398, top 12, 860 × 352 (centre ≈ 828, 190), gentle bob ±5 px |
| Equation text | inside the cloud, dark navy, Fredoka/Lilita One, tokens: the cage, numbers, operators, fractions, parentheses |
| Cannon | centre x 836, base bottom y 762, height 360. Muzzle ≈ (836, 416). FIRE pill on the front, below the socket. |
| Tray | left 166, top 780, width 1340, 8 spots 141 apart; ball diameter 122 |
| HUD | Pause + Sound top-left (orange); Skip pill top-right (navy with gold ring), shown only during a tutorial or a shot |
| Captions | navy rounded card, left side (left 58, top 420), for voice lines |
| Start screen | logo (836, 176) w 580; caged x (1238, 170) w 168; cannon bottom-left (290, 668) w 410; Play (836, 548) w **168** (keep it modest) |

Grounded look: the cannon and tray cast soft contact shadows on the plaza, and balls sit down into their cups.

---

## 5. Maths engine and the round bank

- **Exact maths.** Fractions with a gcd-reduced numerator and denominator, plus negatives. Never use floats for displayed values.
- **A side is an "onion" of layers around x.** For example, 2(3x+1)+4 = [×3, +1, ×2, +4]. Every shot is applied to the whole of both sides:
  - A + or − on top of a + merges into it (and vanishes at 0).
  - × or ÷ distributes over an outer +/− and merges with an outer ×/÷ (and vanishes at 1).
- **x is free when the left side has no layers left.** Any valid route that isolates x counts, not only the textbook one.
- ×0 and ÷0 are never offered.

| # | Equation | Sockets | Balls (tray order) | One answer |
|---|---|---|---|---|
| 1 | x + 5 = 7 | 1 | +5 −5 ×5 ÷5 +3 −3 +2 −2 | −5 → x = 2 (guided: −5 glows) |
| 2 | 2x + 3 = 11 | 2 | +3 −3 ×2 ÷2 +2 −2 ×3 ÷3 | −3, ÷2 → x = 4 |
| 3 | 3x = 18 | 1 | +3 −3 ×3 ÷3 +5 −5 +2 −2 | ÷3 → x = 6 |
| 4 | x/3 + 2 = 6 | 2 | −2 ×3 −6 ÷3 +2 +6 −3 ×2 | −2, ×3 → x = 12 |
| 5 | 2x + 7 = 1 | 2 | −7 ÷2 +7 ×2 −2 +2 −6 ÷7 | −7, ÷2 → x = −3 |
| 6 | 3(x + 2) = 21 | 2 | ÷3 −2 ×3 +2 −3 ÷2 −6 +6 | ÷3, −2 → x = 5 |

The bank lives in `ROUNDS` (`src/10_core.js`). The next part of the course reuses this exact design with **new equations only**, so keep the bank data-driven.

---

## 6. Game flow

### 6.1 Loading
- Show a "Loading Cannon Quest…" card while all images are fetched **and decoded** (`img.decode()`), the fonts are loaded, and the SFX are fetched.
- Audio decodes into AudioBuffers on the first tap.
- Never start the title screen with half-loaded art.

### 6.2 Start screen
- The logo bounces in and the caged x swings in on its hook.
- The cannon fires the 8 balls into two tidy arcs, one each side, then fires a small shot every few seconds.
- Soft sun rays turn slowly behind the Play button, and the Play button pulses gently. The caged x rattles now and then. The music credit sits small at the bottom right.
- The camera drifts slowly (Section 7).
- Keep it uncluttered.

### 6.3 Pressing Play
- **[NEW] Zoom-through transition:**
  1. The camera punches toward the Play button (zoom 1.0 → 1.15, 0.3 s, ease-in) with a white flash, and the title elements burst away.
  2. The play scene starts at zoom 1.12 and eases out to the base framing over 0.9 s (`power3.out`).
  3. Meanwhile the scene builds in: the cloud floats down (ease-out back), the tray slides up, and the cannon pops up with a clunk, dust and a small shake.
- Music starts, plus the quiet lake ambience.
- Then the HUD fades in.

### 6.4 A round (the player's turn)
1. **New round.**
   - The cloud enters from the right (0.8 s, ease-out back) with the new equation.
   - If the socket count changes, the cannon morphs between 1 and 2 sockets (smoke puff, dust, clunk).
   - If the ball set changes, the old balls shrink away and the new ones drop into the cups with an elastic bounce and a staggered pop (0.065 s apart).
2. **Aim.** The camera is completely still while the player can act, so tap targets never move.
3. **Tap a ball.**
   - The ball hops on an arc into the next free socket (0.55 s). It seats with a clunk, a burst in its colour, a gold ring and a tiny shake.
   - Tap a loaded ball to send it back. Later balls slide left to fill the gap.
   - If all sockets are full, tapping another ball gives a "nope" knock and the sockets pulse.
4. **FIRE.**
   - FIRE stays grey (desaturated layer) until every socket is filled. Then it lights up with a "ready" bell and a gentle pulse.
   - Tapping FIRE early: the sockets pulse, plus a nope sound and **[NEW]** a quick side-to-side FIRE wiggle (±6 px, 3 cycles, 0.25 s).
5. **Fire.** Input locks, Skip appears, and the shot timeline plays (6.5).
6. **Idle hint.** After 7 s without input, the tray balls do a glow wave. If all sockets are full, FIRE does a hint pulse instead.

### 6.5 The shot sequence (one GSAP timeline per round, all shots + outcome)

The whole sequence is computed **before anything moves**: the equation after every shot is known in advance, and positions are measured once when their step begins. Times are relative to the FIRE tap. Repeat steps 0.15–4.74 for each loaded socket, left to right.

| t (s) | What happens | [NEW] Camera | [NEW] Shake / feel |
|---|---|---|---|
| 0.00 | FIRE presses (squash to 0.92, 120 ms), toggle sound | still | — |
| 0.15 | The socket glows gold, tick | — | — |
| 0.45–0.73 | The ball hops from its socket down into the barrel | **Wind-up:** zoom 1.00 → 1.06, focus (836, 470) → (836, 540), `power2.out`, 0.3 s | Cannon **anticipation**: squash scaleY 0.93 / scaleX 1.04, `power2.in`; rising charge whoosh |
| **0.75** | **FIRE!** Layered boom (boom + shot + thunder + low 78→34 Hz thump), muzzle flash, smoke, gold sparks, dust from both feet | **Recoil kick:** the camera springs 16 px down and back. **Zoom punch** +0.035, springs back in about 0.18 s. | **Trauma +0.55** (Section 8). Cannon **stretch** (scaleY 1.12 / scaleX 0.94) for 60 ms, then a springy jiggle back to rest (about 0.45 s). Tray balls **ripple-hop** 3–5 px, outward from the centre, staggered 0.025 s. 25 ms haptic on supported phones. |
| 0.75–1.27 | The ball flies on an arc to the cloud (828, 250), spinning 540°, shrinking slightly for depth, with a colour + white trail. Whistle. | **Follow:** starts 0.05 s after the kick; focus y 540 → 300 with look-ahead toward the ball, zoom 1.06 → 1.10, `power2.inOut` | — |
| **1.27** | **IMPACT** on the cloud: a colour + white burst and a ring. The equation shows the impact layout "x + 5 □ = 7 □", and two identical small balls split off. | **Zoom punch** +0.02 | **Hit-stop 60 ms** (everything holds), then **trauma +0.30** and a kick 8 px up. Cloud **squash** (1.05 / 0.95), springing back. |
| 1.33–1.88 | The two balls arc to both sides of the "=" | hold on the equation | — |
| 1.88 | The terms pop into place (`back.out`), with two glass dings | — | trauma +0.06 |
| 1.88–3.03 | **Reading beat** (1.15 s): "x + 5 − 5 = 7 − 5" | slow push-in, zoom 1.10 → 1.12 | none (reading time) |
| 3.03 | The cancelling pair (+5 −5) sparkles away | — | — |
| 3.49 | The simplified equation glides into place (FLIP, tokens keep their identity): "x = 2" | Ease back over 0.8 s, `power2.inOut`: to the wind-up framing if another ball is loaded, otherwise hold for the outcome | — |
| 4.74 | End of the shot (reading beat 1.25 s) | — | — |

**Readability rule [NEW]:** the ball and its label must be readable for the whole flight.
- Keep the muzzle flash short (≤ 90 ms) and small: today a big white flash, ring and smoke cover the ball as it leaves the muzzle.
- Draw the flash and smoke behind the flying ball.

### 6.6 Outcomes (both advance; no "wrong", no retry)

**x is free** (any loaded balls left after x is free fizzle away):

| t | What happens | Camera / feel |
|---|---|---|
| +0.00 | The cage glows white/purple, ding | **Push in to the cage:** focus on the cage, zoom 1.18, 0.6 s `power3.out` |
| +0.85 | Key unlock click | — |
| +1.25 | **The cage bursts open:** the free x appears and "= 2" turns gold. Creak, spring, fanfare, screen flash, gold + purple bursts, ring, confetti. | **Hit-stop 80 ms**, then **slow-mo 0.45×** easing back to 1× over 0.35 s. Trauma +0.35, zoom punch +0.03. |
| +1.25–3.15 | **Hold "x = 2"** on the cloud (1.9 s reading beat) | settle to zoom 1.15 |
| +3.15 | x does a happy hop (0.45 s), spins and shrinks (0.32 s), and vanishes in a poof of sparkles | — |
| +3.92 | The cloud clears (puffs, scales up 22 %, fades, 0.7 s) | Back to base framing, 0.8 s `power2.inOut` |
| +4.9 | Next round | the camera leads the incoming cloud: focus x 896 → 836, 0.8 s |

**x stays caged:**
- At +0.45: the cage rattles (metal SFX), and the cloud wobbles (rotation ±3.2°, decaying, 0.9 s).
- **[NEW]** A horizontal-only "no" shake (trauma 0.4, x axis only).
- At +1.35: the cloud floats away to the left (0.7 s, ease-in), and the camera eases back to base.
- The next cloud arrives from the right.

### 6.7 End screen
- The cloud shows "You freed N out of 6!", with a fanfare and confetti (more confetti for a higher score).
- The camera is at zoom 1.05 on the cloud.
- A round orange **Play again** button restarts the whole session cleanly: kill the timelines, clear flying elements, and reset the camera, cloud and sockets.

### 6.8 First-time spotlight tutorials (first session only)
**Spotlight:** everything except the target is dimmed and blurred, with a gold ring and a tapping hand. On guided steps only the highlighted target accepts taps; anything else gives a nope and a nudge. Skip ends the tutorial.

| Round | Spotlight on | Voice line key (caption + VO) |
|---|---|---|
| 1 | the caged x | `tutFreeX`: "Let's free x!" |
| 1 | the glowing −5 ball (only it is tappable) | `tutTapOp`: "Tap an operation to load the cannon." |
| 1 | FIRE | `tutTapFireOne`: "Tap Fire to launch your operation." |
| 2 | the two sockets with their 1 / 2 markers | `tutOrder`: "Load the operations into the cannon in the order you want to apply them." |
| 2 | the sockets (pulse) | `tutLeftRight`: "The cannon fires from left to right." |
| 2 | after the first ball is loaded | `tutNextOp`: "Now load your next operation." |
| 2 | FIRE (a soft spotlight that lifts if a ball is unloaded) | `tutTapFireMany`: "Tap Fire to launch your operations." |

### 6.9 HUD and controls
- **Pause** freezes everything: the GSAP global timeline, music, SFX and VO. Its icon swaps to ▶; tap again to continue. There is **no pause popup**. The game auto-pauses when the tab is hidden.
- **Sound** mutes everything (a red slash over the icon).
- **Skip** appears during a tutorial or a shot and jumps to the end: silent, with no particles, and the camera snaps to its final framing.
- **Keyboard:** `1`–`8` load a ball, `Backspace` unloads the last one, `Enter`/`Space`/`F` fire, `P`/`Esc` pause, `M` mute.
- **Portrait phones** see a "Turn your device sideways" card with a "Play anyway" button.
- Tap targets are at least 44 CSS px.

---

## 7. [NEW] Camera director

**Goal:** a camera that feels directed, like a good mobile game. It moves with intent on every beat, is never jerky, and never shows the edge of the background.

### 7.1 Rig
- The camera state is `{ fx, fy, zoom }`: the art-space point at the screen centre, and the zoom.
  - World transform = `translate(CX − fx·z + shakeX, CY − fy·z + shakeY) scale(z) rotate(shakeRot)`, written **once per frame** as one `transform` (use `translate3d` to stay on the GPU).
  - `CX = 836` and `CY = 470.5` are the centre of the art-space.
- **Three parts, added together each frame:**
  1. **Director target.** The shot list (7.2) tweens a *target* camera with GSAP inside the round timeline, so Skip and pause just work.
  2. **Smoothing.** The real camera follows the target with a critically damped spring (half-life about 70 ms). Interrupted or overlapping moves blend with continuous velocity and never pop. On Skip or restart, snap (camera = target).
  3. **Additive offsets:** shake noise, the recoil/impact spring kick, and the zoom punch (Section 8). They never touch the target.
- **Clamp after adding everything,** so the visible rect stays inside the background. Over-scan the background enough to cover the maximum shake offset and rotation at the highest zoom.
- **Zoom stays between 1.00 and 1.20.** Below 1.00 the background edges would show; above 1.20 the art softens.
- **What moves:**
  - The HUD, Skip, captions and the spotlight overlay **never move or shake**.
  - Particles live in world space, so they move with the camera.
  - No parallax on grounded objects (cannon, tray): it would slide them off their shadows.

### 7.2 Shot list

| Moment | Focus (fx, fy) | Zoom | Move |
|---|---|---|---|
| Title idle | drifts ±28, ±10 around centre | 1.03–1.07 | slow sine drift (0.17–0.31 Hz) |
| Play pressed | toward the Play button | 1.15 | 0.3 s ease-in, flash, then the scene build-in from 1.12 → base |
| **Base / aim** | (836, 470) | 1.00 | **locked still** while input is on |
| Wind-up | (836, 540) | 1.06 | 0.3 s `power2.out` |
| Fire | — | +0.035 punch | spring kick 16 px down |
| Follow the ball | y 540 → 300, leading the ball | 1.06 → 1.10 | 0.5 s `power2.inOut` |
| Impact + read | equation centre (≈ 828, 230) | 1.10 → 1.12 | hold with a slow push-in |
| Next shot | back to wind-up | 1.06 | 0.5 s `power2.inOut` |
| Freed | the cage / x | 1.18 → 1.15 | 0.6 s `power3.out` |
| Stuck | the cloud | 1.08 | hold, x-axis shake |
| Back to base | (836, 470) | 1.00 | 0.8 s `power2.inOut` |
| Next cloud | x 896 → 836 | 1.00 | 0.8 s `power3.out` (lead the cloud in) |
| End card | the cloud | 1.05 | 0.8 s ease-out |

### 7.3 Camera rules
- Every move eases. There are no linear camera moves and no hard cuts, except the reduced-motion fallback.
- Don't start a camera move during a tap window, or a target would slide under the player's finger.
- The equation must be **fully on screen** at every zoom used. Check 16:9, 4:3 (iPad) and 19.5:9 (phones).
- Text must stay crisp when zoomed.
  - Render the equation at 2× and scale it down, or let the browser re-rasterise once the camera settles.
  - Don't leave `will-change` on the world permanently: Chrome then rasterises it at one scale, and zoomed text goes soft.

---

## 8. [NEW] Screen shake and impact feel ("wiggle")

### 8.1 Shake algorithm (trauma model)
- **Trauma** is a value from 0 to 1. Events add to it (capped at 1), and it decays linearly at 1.6 per second.
- **Shake amount = trauma²,** so small hits are subtle and big hits are punchy.
- **The offsets come from smooth noise,** not `Math.random()` per frame (jittery) and not sine sums (they look mechanical):
  - `shakeX = 22 px · trauma² · noise(t·24 + seedX)`
  - `shakeY = 22 px · trauma² · noise(t·24 + seedY)`
  - `shakeRot = 1.2° · trauma² · noise(t·18 + seedR)`
  - Use 1D simplex or value noise in the range −1…1.
- **The kick is separate from the noise:** a damped spring offset (frequency about 9 Hz, damping ratio about 0.35) is given an impulse in a direction. It overshoots once or twice and settles. This is what makes the recoil feel physical and smooth.
- **Zoom punch:** the same spring idea on zoom (an additive impulse that returns to 0 in about 0.18 s).
- **Hit-stop:** for N ms, the game time scale drops to about 0.02, then returns. Music, VO and SFX are never slowed.
- **Slow-mo:** the game time scale tweens down, then eases back to 1.
- **All of these are time-based,** so they look the same at 60 Hz and 120 Hz.
- **Under Skip, they don't run;** under reduced motion, none of them run at all.

### 8.2 Event table

| Event | Trauma | Kick | Zoom punch | Hit-stop / slow-mo |
|---|---|---|---|---|
| Cannon pops up (game start) | 0.12 | 6 px down | — | — |
| Ball seats in a socket | 0.08 | 3 px down | — | — |
| **Cannon fires** | **0.55** | **16 px down** | **+0.035** | — |
| Ball hits the cloud | 0.30 | 8 px up | +0.02 | 60 ms |
| Terms land on both sides | — | 2.5 px down | — | — |
| Cage bursts (x free) | 0.35 | — | +0.03 | 80 ms, then 0.45× for 0.35 s |
| Cage rattles (x stuck) | 0.4, x axis only | — | — | — |

Because the shake amount is trauma², a trauma under about 0.3 is barely visible (0.18 moves the screen under 1 px). Use a small kick instead for light touches.
| Cannon morphs 1 ↔ 2 sockets | 0.10 | 4 px down | — | — |

### 8.3 Secondary motion (the "juice" that sells each hit)
- **Cannon.**
  - Anticipation squash before firing, a stretch at the shot, then a spring jiggle back to rest.
  - The base slides 10 px down for the recoil and returns. Its shadow and light strips move with it, so it stays planted.
- **Tray.** The balls ripple-hop in their cups on each shot, outward from the centre.
- **Cloud.** It squashes and stretches on impact, and wobbles when x stays caged.
- **FIRE plate.** It squashes when pressed, pulses when ready, and wiggles when tapped too early.
- **Particles:**
  - Muzzle sparks (gold).
  - Smoke rising and growing.
  - Sand dust kicked sideways from both cannon feet.
  - Colour bursts and rings on impacts.
  - Confetti when x is free.
- **Haptics.** `navigator.vibrate(25)` on fire and `vibrate([15, 30, 15])` when the cage bursts, where supported. Skip it when muted or under reduced motion.

---

## 9. [NEW] Perfectly smooth, no lag

### 9.1 Targets
- A locked **60 fps** on a low-end Android tablet (about 3 GB RAM) with Chrome DevTools at **4× CPU slowdown**. Smooth on 120 Hz iPad/iPhone.
- **No frame over 33 ms during a shot,** and no long task over 50 ms after loading.
- **Frame budget:** about 4 ms script, 0 forced layouts, composite-only animation.
- **Memory stays flat** across 3 full sessions (Play again × 3): no growing DOM, listeners or timelines.

### 9.2 Rendering rules
1. **One loop.** `gsap.ticker` (rAF underneath) drives everything. Clamp delta time to 50 ms, and keep `gsap.ticker.lagSmoothing(500, 33)`.
2. **Read, then write.** Never read layout (`getBoundingClientRect`, `offsetWidth`) inside the frame loop. Measure once when a step begins, and cache sizes on resize.
3. **Only `transform` and `opacity` change per frame.** Skip a style write when its value hasn't changed.
4. **Nothing expensive on anything that moves,** or on anything inside the moving world: no `filter` (drop-shadow, blur, brightness), `box-shadow`, `backdrop-filter` or `mix-blend-mode`.
   - Replace glows with pre-rendered glow PNG layers whose **opacity** animates.
   - Bake the contact shadows into alpha PNGs: no `mix-blend-mode: multiply` and no CSS blur.
5. **Spotlight.** Don't use a live `backdrop-filter` over a moving scene. Freeze the camera while the spotlight is up, and use a pre-blurred snapshot layer or a dim layer that cross-fades. Use the real blur only on the high tier.
6. **Layers.**
   - The background, world, flying balls, cloud and cannon each get a composited layer while they move.
   - Add `will-change` only during motion, and remove it afterwards (animation-skill rule 7).
   - Stay under about 20 promoted layers on mobile.
7. **Particles.**
   - One canvas with DPR capped at 2 (1.5 on the low tier).
   - A **preallocated object pool** with swap-remove. No `array.filter()` or new objects per frame.
   - Pre-rendered dot/sparkle sprites, no `shadowBlur`.
   - Cap: 500 (high tier) / 250 (low tier).
8. **Flying balls.** Pool and reuse their DOM nodes (4 is enough). Don't create and remove nodes per shot.
9. **Assets.**
   - Decode every image before the title shows.
   - Ship sprites as WebP (keep PNG fallbacks only if needed), sized at 2× their largest display size.
   - Decode SFX into AudioBuffers once. Prefetch the next VO clip.
10. **No per-frame allocation in hot paths.** No closures, template strings or objects created inside particle and camera updates.
11. **Equation updates.**
    - Build the next equation's DOM off-screen, measure it once, then FLIP-animate the transforms. Keep token identity via `data-key`.
    - Don't change its HTML during a camera move.

### 9.3 Known issues in the current build (fix these)
- **Shake** uses sums of sines (`Stage.update` in `src/30_stage.js`), which reads as a mechanical buzz. Replace it with noise plus a spring kick (8.1).
- **The camera** only uses zoom 1.05 / pan −70 on fire and has no follow. Implement the shot list (7.2) with spring smoothing (7.1).
- **The muzzle flash, ring and smoke hide the ball** at launch. Shrink them, shorten them and layer them behind the ball (6.5, readability rule).
- **Costly CSS** in the moving world:
  - `mix-blend-mode: multiply` plus `filter: blur()` ground shadows (`.gsh`).
  - `drop-shadow` filters on the cage, the free x and the guide balls.
  - `backdrop-filter` on the spotlight.

  Replace them as 9.2 describes.
- **`FX.update`** allocates a new array every frame (`this.parts.filter`). Use a pooled swap-remove instead.
- **`#world`** has `will-change: transform` permanently, so zoomed equation text can look soft. See 7.3.

### 9.4 Adaptive quality
- Track a rolling average of frame time.
- If it stays above 20 ms for 1 s, step down one tier:
  - halve the particles
  - drop smoke and confetti counts
  - turn off rotational shake
  - use a dim-only spotlight
- Only change tiers between shots, never mid-shot.
- Start on the low tier when `navigator.hardwareConcurrency <= 4` or `deviceMemory <= 3`.

---

## 10. Audio
- **Web Audio graph:** SFX bus + music bus + VO, with the master on a mute toggle. Keep the existing sample mapping (see `CREDITS.md` and `Sound` in `src/20_audio.js`). Every sample gets a little pitch and volume variation, so repeats never sound identical.
- **Cannon blast:** boom + shot + thunder tail + a synthesised 78 → 34 Hz sub thump, with a short reverb. **[NEW]** Add a rising "charge" whoosh during the wind-up, and lowpass the music for 0.4 s on each blast so the boom hits harder.
- **Music:** "Chill Wave" (teen chill electronic), looping, ducked to about 35 % under VO. Lake-water ambience at a very low level.
- **Hit-stop and slow-mo** never change audio pitch or speed.
- Audio unlocks on the first gesture (Play).

---

## 11. Accessibility and motion settings
- **`prefers-reduced-motion`:**
  - Everything lands in place at once, but reading pauses stay.
  - No shake, kick, zoom punch, hit-stop, slow-mo, particles, idle loops or camera drift.
  - Camera moves become cuts, or 150 ms fades.
- **Captions** for every voice line, shown while it plays.
- Colour is never the only cue: every ball has its label.
- Contrast: dark navy text on white cloud; white text on navy pills.

---

## 12. Don'ts (the designer already rejected these)
- No rainbow on success. x never walks down to the plaza: it shows "x = 2" on the cloud, then poofs.
- No progress badge ("1/6" pill). No pause popup with Resume / How to play / Restart / Music.
- No extra drifting clouds: only the painted ones in `bg.jpg` plus the equation cloud. Don't strip the painted ones either.
- No flat or redrawn art, and no new background composed from layers. Use the glossy art as it is.
- No big or cluttered start screen: Play stays about 168 art px, with two tidy ball arcs.
- No kiddish music (no ukulele or whistle tracks). No synthetic-sounding SFX where a recorded one exists.
- No "Wrong!" label, no retry, no hints that give away the answer (except the round 1 guide glow).
- No shake on the HUD, and no camera motion while the player is choosing balls.
- No CDN scripts. The game must work offline.

---

## 13. Definition of done (check every item, and report evidence)
1. All six rounds play start to end; both outcomes advance; Play again restarts cleanly three times in a row.
2. Every route that isolates x is accepted, with exact fractions and negatives shown correctly (for example, round 5 → x = −3).
3. Each shot shows: wind-up → fire with a visible screen wiggle and recoil → the camera follows the ball → impact hit-stop → the equation framed big for reading → a smooth ease back.
4. The ball and its label are readable through the whole flight (screenshot at about 0.1 s after fire).
5. The background edge never shows at any zoom, shake or aspect ratio (16:9, 4:3, 19.5:9).
6. Skip at any moment ends the shot silently, with the camera snapped, no leftover particles and no stuck flying balls.
7. Pause at any moment freezes everything, including shake, hit-stop and slow-mo, and resumes exactly.
8. Reduced motion: no shake or camera motion, and the game is still fully playable.
9. Performance: a Chrome Performance trace of one 2-ball shot at 4× CPU slowdown shows a steady 60 fps, no frame over 33 ms and no long task over 50 ms. Attach the numbers.
10. No hard-coded strings (search the source for quoted English outside `locales.json`). Each new string has a key.
11. No console errors or warnings during a full session.
12. Screenshots of: title, aim, wind-up, mid-flight, impact, reading beat, freed (x = …), stuck, end card.

---

## 14. Where things live (existing repo)

| What | Where |
|---|---|
| Rounds, maths engine, equation → HTML | `src/10_core.js` |
| Motion timings, `Motion`, `drive`, `tween`, Skip | `src/12_motion.js` |
| Sound + music | `js/sfx.js` (built from `assets/sfx/`), `src/15_vodata.js`, `src/20_audio.js` |
| Stage, camera, particles, cloud, cannon, tray, equation UI, spotlight | `src/30_stage.js` |
| Start screen (`TL` layout table) | `src/35_title.js` |
| Game flow, shot timeline (`roundTimeline` / `addShot` / `addFreed` / `addStuck`), input, loop, boot | `src/40_game.js` |
| Page + CSS | `src/00_head.html`, `src/99_tail.html` |
| Words | `locales/locales.json` |
| Test hooks | `window.__cqBooted`, `window.__cq` (G, Clock, Stage, Cloud, Spot…). Wait on `__cq.Clock.t`, not wall time. `window.__cqSpeed` speeds the game up for tests. |

Make the changes in small, reviewable steps. The suggested order:
1. Camera rig + shake.
2. Shot-list choreography.
3. Secondary motion.
4. Performance fixes + adaptive quality.
5. The Play transition.

After each step, run `./build.sh`, take screenshots and check the frame times.
