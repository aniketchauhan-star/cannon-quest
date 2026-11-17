# Voice-over

These seven lines are the onboarding voice-over from the Cannon Quest deck (slides 2, 3, 5, 9, 10, 11 and 13).
They were made with the open-source neural voice model **Kokoro-82M** (Apache 2.0), using the voice `af_heart`.
Each file was trimmed, level-matched and checked with speech-to-text to confirm the words are heard correctly.

| File | Line | When it plays |
|---|---|---|
| `free-x.mp3` | Let's free x! | Round 1, spotlight on the caged x |
| `tap-op.mp3` | Tap an operation to load the cannon. | Round 1, spotlight on the −5 ball |
| `tap-fire-1.mp3` | Tap Fire to launch your operation. | Round 1, spotlight on FIRE |
| `order.mp3` | Load the operations into the cannon in the order you want to apply them. | Round 2, spotlight on the two sockets |
| `left-right.mp3` | The cannon fires from left to right. | Round 2, spotlight on the two sockets |
| `next-op.mp3` | Now load your next operation. | Round 2, after the first ball is loaded |
| `tap-fire-n.mp3` | Tap Fire to launch your operations. | Round 2, spotlight on FIRE |

**To use a real voice actor instead:** record the same lines, save them as `.mp3` files with exactly these names (replacing these ones), and run `./build.sh`.
If a file is deleted, the game falls back to the browser's built-in voice for that line.
