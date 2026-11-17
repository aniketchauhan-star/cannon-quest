# Cannon Quest

A 2D algebra game built from your art. Load operation balls into the cannon, fire, and free **x** from its cage.
It is based on the *Cannon Quest* deck, the POD A stand-up brief (16 Nov 2026), and the mockups and asset sheets you supplied.

## Play
- Double-click **`index.html`** in Chrome, Edge or Safari. It works offline, apart from the Google font on first load.
- Keep the `assets/` folder next to `index.html`.
- Works best in landscape. On a phone held upright, a "turn your device" hint appears; tap "Play anyway" to dismiss it.

**Controls**
- Tap a ball to load it into the cannon. Tap a loaded ball to send it back.
- Tap **FIRE** to fire.
- The **Pause** button freezes the game and turns into ▶. Tap it again to continue. The speaker button mutes all sound.
- Keyboard: `1`–`8` load a ball, `Backspace` removes the last one, `Enter` fires, `P` pauses, `M` mutes.

## What's in the game
- **Start screen:** built from your thumbnail art and the Play button you supplied, in a clean, uncluttered layout.
  - The logo and the caged x sit at the top, the cannon at the bottom left, and the Play button in the centre.
  - Soft sun rays turn behind the Play button. The logo bounces in and the cage swings in.
  - The cannon fires the 8 balls into two tidy arcs, then fires a small shot every few seconds.
  - The caged x keeps rattling and the Play button pulses gently.
  - Pressing Play bursts the start screen away. The cloud then floats down, the cannon pops up and the tray slides in.
- **Six rounds from the deck.** Every operation is applied to both whole sides, with exact fractions and negatives. Any route that isolates x is accepted.
- **Freeing x:** the cage bursts open and the cloud shows the value of x (for example **x = 2**) for a moment. Then x hops, disappears in a puff of sparkles, the cloud clears, and the next cloud arrives.
- **Not freeing x:** the cage rattles and the cloud floats away. There is no "wrong" label and no retry, and the game moves to the next round.
- **Grounded scene:** the cannon and the ball tray cast soft shadows on the plaza, balls sit down into their cups, and a loaded ball fills its cannon socket with the gold ring over its edge.
- **First-time spotlight tutorial:** everything is blurred and dimmed except the one thing being explained, with a gold ring and a tapping hand.
  - Round 1: the caged x ("Let's free x!"), then the glowing −5 ball (only that ball can be tapped), then FIRE.
  - Round 2: the two sockets with their 1 and 2 markers while the firing order is explained, then FIRE once both are loaded.
  - A hint appears after 7 seconds of inactivity.
- **Voice-over:** all seven deck lines are real voice files in `assets/vo/` (see the README there), with captions.

## Files
| Path | What it is |
|---|---|
| `index.html` | The game, built from `src/` by `./build.sh` |
| `assets/img/` | Sprites cut from your sheets `1.png`–`4.png` and `thumbnail .png` (start screen, files named `t_*`), your `play button.png`, and the background from `5.png`. All were upscaled 2× (EDSR super-resolution) so they stay sharp on retina screens |
| `assets/sfx/` | Recorded sound effects (CC0) |
| `assets/music/` | Background music: "Chill Wave", a teen-style chill electronic track |
| `assets/vo/` | The seven voice-over lines (see the README there to swap in a voice actor) |

## Editing
After changing anything in `src/`, run `./build.sh`.
| What to change | Where |
|---|---|
| Equations, ball choices, socket counts | `ROUNDS` in `src/10_core.js` |
| Positions and sizes of the cloud, cannon, tray and holes | top of `src/30_stage.js` (art-space is 1672 × 941, the same as the mockup) |
| Start-screen layout and timing | `TL` at the top of `src/35_title.js` |
| A sprite | Replace the file in `assets/img/` and keep the name |

The cannon art comes in 1- and 2-socket versions, so rounds can use up to 2 sockets. If you supply 3- and 4-socket cannon art, the deck's bonus banks can be added back.

See `CREDITS.md` for the audio licences.
