# Cannon Quest: design review of 23 Nov 2026 (@Karan): what changed

Status of each point in the review, in its own order. "Done" items are in the build on `main`.

## Top five fixes
| # | Review | Status |
|---|---|---|
| 1 | Re-stage the instruction panel and the equation cloud | **Done**, then the caption moved back (the user, 25 Nov 2026: "the question template… like before, in the left corner"): it is the wooden board on the left, halfway down, again, with no tail. The cloud bobs and drifts, has a warm rim light on its sun side and a soft haze at its base. |
| 2 | Keep the caged X visible on deck as the cannon's target | **Done.** x cries in its cage on the right of the deck, with an "x" tag. When the equation is solved, a bolt of light flies from the x on the cloud to the cage, and the cage cracks open on the deck. |
| 3 | A retry or a worked solution after a wrong answer | **Done, both.** First miss: the equation rewinds, the orbs come back, and the orb that undoes the outermost step glows (its "Try again!" panel was taken out again: the user, 25 Nov 2026, "remove the try again screen panel"). Second miss: the game loads and fires the right orbs itself, step by step. |
| 4 | Correct-answer sequence under 8 s | **Done.** One-step answer: 7.9 s from FIRE to the next equation (measured), 5.7 s if the celebration is tapped away. A tap anywhere skips it. |
| 5 | Progress indicator and a proper results screen | **Done**, then the dots removed (the user, 25 Nov 2026: no progress dots in the game). Results card with 1–3 stars, the freed count, each missed equation with its solution, and labelled Play again and Home buttons. **The card was then removed** (the user, 25 Nov 2026: "no need of this amazing panel"): the end screen is now the title "Quest complete!" at the top, x dancing in the middle in front of its broken cage, and Play again + Home under it, Play again only once x has danced a while (the user, 25 Nov 2026). |

## Title screen
| Review | Status |
|---|---|
| Play button undersized, on the rope line | **Done, partly by size.** Now 1.25× (220 px), moved onto the deck off the rope, with a breathing glow and pulse. Not 1.5×: the designer had earlier asked for a small Play button. |
| The caged X has no personality | **Done.** The title cage now holds x's crying art, the same as in the game. |
| The scene is static | **Already moving:** sun rays, mist, light shafts, falling leaves and swaying plants. x crying and Play's glow add more. **Not done:** a cannon wobble on hover, because the designer asked that the cannon and cage stand still once they land. |
| No sound toggle | **Done.** The sound button is on the start screen. |
| Logo drop-in | **Already in:** the logo drops from the sky and bounces into place. |

## Gameplay screen
| Review | Status |
|---|---|
| Instruction panel → speech bubble from X | **Undone** (25 Nov 2026): the user wanted the board back on the left, halfway down, as before. The results card moved to the middle, under the cloud (x 500), so the end line wraps beside it (the card is gone since 25 Nov). Since 26 Nov the end screen has no board at all: its line is only said (the user: "yh text box ki need ni hai… sirf VO mei hona chahie"). |
| Equation cloud: motion, rim light, haze | **Done.** |
| Equation readability (x/3, +20%) | **Done.** The equation is 20% bigger, and x is the letter x, so a fraction no longer shrinks an icon. |
| Cage on the deck, contact shadows | **Done.** The cage has its own contact shadow; the cannon and tray already had them. |
| Cannon front-on vs tray in perspective | **Needs art.** See the ChatGPT prompt below. |
| Colour by operation | **Done.** + orange, − cyan, × green, ÷ violet. Every label is at least 4.9:1 against its orb (WCAG AA is 4.5:1). Blue and purple orbs stayed under 4.5:1 with any ink, so they are not used. |
| Gaps in the tray | **Done.** A faint ghost of the orb stays in its cup. |
| Cyan slot under the tray | **Removed** from the tray art. |
| Make tap-to-unload discoverable | **Changed (25 Nov).** The × on a loaded orb was removed at the user's request. Unloading is no longer needed to change your mind: with the cannon full, a tapped orb replaces the one loaded last, which flies back to the tray. |
| Label chambers 1 and 2 | **Done** in the first two-socket round only. The chips go when it fires, as the designer had removed permanent markers. |
| FIRE tapped early | **Done.** It shakes, the sockets pulse, and a hint says "Load 2 orbs first!" (or "1 more"). |

## HUD
| Review | Status |
|---|---|
| A real pause overlay | **Removed** (the designer, 25 Nov: "no need of this panel"). Pause freezes the game with no panel, and its button turns into a play button. |
| Skip flicker | **Done.** Skip stays in one place, top right, and only fades. |
| Progress indicator | Removed by the user (25 Nov 2026). |

## Core loop
| Review | Status |
|---|---|
| Too slow on success, tap to skip | **Done** (see Top five #4). |
| Camera zoom cuts the tray | **Done.** Shot push-ins are gentler, so the orbs stay on screen. |
| No retry after a wrong answer | **Done** (see Top five #3). |
| Intermediate steps not simplified | **Done.** "3(x + 2) − 6 = 15" → "3x + 6 − 6 = 15" → "3x = 15". |
| Results screen is thin | **Done** (results card, replaced on 25 Nov 2026 at the user's request by a title + x dancing by its broken cage). The tray and the cannon leave, and FIRE goes. |
| No difficulty curve or levels | **Done.** The rounds go easy to hard: one step, two steps, challenge, and stars score the run. The level banner was removed again (the user, 25 Nov 2026: "no need of this type of things in game"). |

## Audio, accessibility, learning
| Review | Status |
|---|---|
| Portrait "Play anyway" | **Not done.** The scene keeps its landscape layout, scaled down. A usable portrait version needs its own layout (tray in two rows, cage beside the cannon); a portrait mockup from the designer would be the place to start. |
| Touch targets ≥ 44 px | **Checked.** Orbs are 49 px on a 667×375 phone. Their tap areas, and FIRE's, reach past the art, so FIRE is about 51 px tall. |
| Separate music and voice toggles | **Removed** with the pause panel (25 Nov). The speaker button mutes everything at once. |
| Hints after a miss | **Done** (the retry's glowing orb). |
| Closer distractors in later rounds | **Kept.** Later trays already pair close moves: ÷7 with −7, ÷3 with −3, −6 with ÷3 (and −6 then ÷3 is a valid path). |
| "x" label on the cage | **Done.** An "x" tag on the deck cage, and x is written as x in the equation. |

## Still to do outside the code
- **Voice:** two new lines need recording in the same voice. The script is `docs/VO_RECORD_REVIEW.txt`. Until they are recorded, the retry shows no words (its "Try again!" panel was taken out, 25 Nov 2026) and the shown way only its "Watch how!" banner.
- **Art (optional):** a tray redrawn in the cannon's front-on viewing angle, and a sad x without its cage if x's struggle loop should come back on the title. The ChatGPT prompts are at the end of `docs/ASSET_PROMPTS.md`.
