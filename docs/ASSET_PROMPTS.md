# Cannon Quest — flat 2D asset prompts

One prompt per game element. Each prompt is self-contained (the style is written into every one), so you can paste any of them on its own into ChatGPT / Gemini / Midjourney / Firefly / Ideogram.

## How to get a matching, sharp set

1. **Make the x character first (prompt 4).** When you like it, attach it as a style reference to every other prompt and add: *"Match the art style of the attached image."* (Midjourney: `--sref <image url>`.)
2. **To keep the same design as now,** also attach the current asset from `assets/img/` (file name is given under each prompt) and add: *"Redraw the attached image in this flat style. Keep its shape, proportions, colours and layout."*
3. **Export PNG, at least 2048 px on the long side,** with a transparent background if the tool allows it.
4. **Negative prompt** (for tools that have the box — Leonardo, Firefly, Stable Diffusion):
   `blur, glow, bloom, haze, gradient, 3D render, realistic, photo, glossy reflections, soft shadow, drop shadow, noise, grain, texture, text, letters, numbers, watermark, extra objects, cropped, jpeg artifacts`
5. **Midjourney:** add `--ar <ratio> --style raw` (ratio is listed under each prompt).

> **No text inside the art** (except the logo). The game draws ball numbers, the FIRE label and the tagline itself, so they stay sharp and can be translated.

---

## All elements in one sheet (single prompt)
Everything except the background and the logo · Ratio **3:2** · Works best in ChatGPT or Gemini (Midjourney tends to drop items from a long list)

> One sheet makes every element small. In the old 1536 × 1024 sheets a ball was only about 150 px wide, which is part of why the art went soft. Flat art enlarges far more cleanly than the old glowing art, but if one element still looks soft, regenerate just that element with its own prompt below.

```
Create a flat 2D game asset sheet for a teen maths game. Landscape 3:2, transparent background (if not possible: a plain solid medium grey #8C929C background). Draw every element separately with generous empty space around it: nothing touching or overlapping, no labels, no grid lines, and no text, letters or numbers anywhere apart from the X mascot itself.

Style for every element: clean modern flat 2D vector cartoon, bright and cool, not babyish. Solid flat colour fills, each surface with one simple flat highlight shape and one flat shade shape, crisp hard edges, even bold dark navy (#1B1F3B) outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. Shared palette: teal #1A9C9C, gold #FFC21A, white #EEF3F8, cyan lights #3FF0FF.

Arrange the sheet in five rows.

Top row, three cannons:
- A chunky cartoon cannon, straight front view, symmetrical: a short wide teal barrel cone narrowing upward with a thick gold muzzle ring and a small gold triangle emblem; a rounded teal body with a curved white face plate holding ONE perfectly round socket hole (flat dark charcoal #2A2A33 inside, thick gold ring of even width); round gold-and-teal wheels on the left and right; a flat white platform with a teal edge and two flat cyan light strips.
- The same cannon, wider, with TWO identical round socket holes side by side, their gold rings almost touching.
- The same cannon in a three-quarter side view, its barrel angled up to the right at about 40 degrees.

Second row:
- A big fluffy white cloud, about 2.5 times wider than tall, with a flat pale blue (#D6E9FA) shade along the bottom, a soft blue (#8DB8E8) outline and a large empty white middle.
- A small round golden birdcage, empty: a domed top with a round knob, a thick top ring, 7 straight vertical bars, a round base tray, and see-through gaps between the bars.
- A friendly mascot that is the letter X: a chunky rounded purple (#8B3FE0) X, big round white eyes with black pupils, raised eyebrows, a wide happy open smile with a pink tongue, and two white gloved fists at chest height.
- The same X mascot standing inside the same golden cage, gripping two front bars, with the bars in front of its body.

Third row, eight identical round balls: perfect circles, completely blank, each with a flat darker crescent shade at the bottom-right and a small flat white oval highlight at the top-left, in this order: magenta #E33BF8, hot pink #FB2C91, lime green #69E303, cyan #01E5F0, coral red #FD5C53, royal blue #3185FD, sunny yellow #FDC801, violet #A54AFB.

Fourth row, buttons and effects:
- A blank pill-shaped red (#F0453A) button, twice as wide as tall, with a flat lighter band across the top, a darker bottom lip and a thick light silver-blue (#DDE6F3) rim.
- Three matching square orange (#FF8A1A) buttons with rounded corners and a darker bottom lip, with white icons: pause (two bars), play (a right-pointing triangle), and a speaker with sound waves.
- A round red (#F5301E) Play button inside a thick gold ring, with a big white right-pointing triangle with rounded corners.
- A yellow (#FFD21F) four-pointed sparkle star with an orange (#F08A00) outline.
- Three short yellow action rays fanning out to the right (one tilted up, one level, one tilted down), with an orange outline.

Bottom row:
- A long, low ball tray across the full width of the sheet, about 7.5 times wider than tall, seen slightly from above: a white rounded frame, a pale lavender-blue (#AFC0E6) floor, 8 identical shallow oval cups in an evenly spaced row, teal end caps, and one flat cyan light strip at the bottom centre.

Make the sheet as large and sharp as possible.
```

---

## 1. Background
Replaces `bg.jpg` · Ratio **16:9**

```
A wide outdoor background for a 2D game, landscape. Top half: clear bright sky blue (#3EB8F5), in two or three flat bands, with 4-5 small simple white cartoon clouds near the top-left and top-right corners; the centre of the sky stays empty. Middle: a row of soft blue-green hills, then a band of round green cartoon trees, then a calm turquoise (#22C3EE) lake across the full width with a few flat white ripple marks; grey rounded rocks and broad green leaves at the left and right ends of the lake. Bottom third: a wide sandy beige (#E8C98F) plaza of large rounded paving stones with thin darker seams, framed by bright green grass, with tropical leaves and a few small white daisies in the bottom-left and bottom-right corners. The centre of the sky and the centre of the plaza stay clear for game objects. Style: flat 2D vector illustration, solid flat colour fills with simple flat shade shapes, crisp hard edges, no gradients, no blur, no haze, no glow, no texture, no noise, not 3D. No characters, no text. Sharp, high resolution, at least 3000 px wide.
```

## 2. Equation cloud
Replaces `cloud.png` (also used for the small sky clouds) · Ratio **5:2** (wide)

```
A big fluffy cartoon cloud, wide and low, about 2.5 times wider than tall, with a gently flat bottom edge and 6-8 rounded puffs around the top and sides. Pure white (#FFFFFF) body, one flat pale blue (#D6E9FA) shade band along the bottom and between the puffs, and an even soft blue (#8DB8E8) outline. The middle of the cloud is a large clean empty white area, because an equation is written on it. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Plain solid sky blue (#3EB8F5) background with nothing else on it. No text, letters or numbers. Sharp, high resolution, at least 2048 px wide.
```

## 3. Golden cage (empty)
Replaces `cage.png` · Ratio **7:10** (portrait)

```
A small round golden birdcage, straight front view: a domed top with a round gold ball knob, curved dome ribs, a thick gold top ring, 7 straight evenly spaced vertical gold bars, and a thick round gold base tray. The cage is empty and the gaps between the bars are see-through. Gold (#FFC21A) with flat light-gold (#FFE27A) highlight strips on the left of each bar and ring, flat deep-gold (#E39A0E) shade on the right, and an even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 2048 px.
```

## 4. x character
Replaces `xchar.png` · Ratio **1:1** · *Make this one first*

```
A friendly cartoon mascot that is the letter X, for a maths game: a chunky letter X with soft rounded ends, purple (#8B3FE0) with a flat lighter purple (#B07CF5) highlight on the upper strokes and a flat darker purple (#6A28B8) shade on the lower strokes. A face where the strokes cross: big round white eyes with black pupils and a small white shine dot, short raised eyebrows, and a wide happy open smile with a pink tongue. Two white cartoon gloved hands at chest height, fists closed as if gripping bars, with short black arms. Confident and cheerful, cool rather than babyish. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One character only, centred, front view, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No extra text. Sharp, high resolution, at least 2048 px.
```

## 5. x inside the cage
Replaces `cage_x.png` (shown on the cloud) · Ratio **3:4** · *Attach results of prompts 3 and 4 as references*

```
The purple cartoon letter-X mascot standing inside a small round golden birdcage, straight front view. The X (purple #8B3FE0, big white eyes, happy open smile with pink tongue, white gloved hands) fills most of the cage; its two gloved hands grip two of the front bars, and the front bars pass in front of its body. The cage: domed top with a round gold ball knob, thick gold top ring, 7 straight vertical gold (#FFC21A) bars, thick round gold base tray, flat light-gold highlights and deep-gold (#E39A0E) shades. Even dark navy (#1B1F3B) outline on everything. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text. Sharp, high resolution, at least 2048 px.
```

## 6. Cannon — 1 socket
Replaces `cannon1.png` · Ratio **5:4**

```
A chunky cartoon cannon seen straight from the front, symmetrical, standing on a low platform. Top: a short wide teal (#1A9C9C) barrel cone that narrows upward, with a thick gold (#FFC21A) ring at the muzzle and a small gold triangle emblem on the cone. Below it: a rounded teal body with a curved white (#EEF3F8) face plate. In the centre of the face plate: ONE perfectly round socket hole, filled flat dark charcoal (#2A2A33), framed by a thick gold ring of even width. Two short teal and gold dash marks on the face plate on each side of the hole. A round gold-and-teal wheel on the left and right sides. Base: a flat white platform with a teal lower edge and two cyan (#3FF0FF) light strips drawn as flat solid shapes. Flat lighter-teal highlight on the upper left of the body, flat darker-teal (#11706F) shade on the lower right. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 2048 px.
```

## 7. Cannon — 2 sockets
Replaces `cannon2.png` · Ratio **3:2** · *Attach the result of prompt 6 as a reference*

```
A chunky cartoon cannon seen straight from the front, symmetrical, wider than tall, standing on a low platform. Top: a short wide teal (#1A9C9C) barrel cone that narrows upward, with a thick gold (#FFC21A) ring at the muzzle and a small gold triangle emblem. Below it: a wide rounded teal body with a curved white (#EEF3F8) face plate. In the face plate: TWO identical, perfectly round socket holes side by side, each filled flat dark charcoal (#2A2A33) and framed by its own thick gold ring of even width; the two rings almost touch in the middle. Short teal and gold dash marks on the face plate outside each hole. A round gold-and-teal wheel on the left and right sides. Base: a flat white platform with a teal lower edge and two cyan (#3FF0FF) light strips drawn as flat solid shapes. Flat lighter-teal highlight on the upper left, flat darker-teal (#11706F) shade on the lower right. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 2048 px.
```

## 8–15. Operation balls (8 colours, all blank)
Replace `ball_0.png` … `ball_7.png` · Ratio **1:1** · *Tip: make one, then attach it and ask for the same ball in the next colour, so all 8 match*

**8. Magenta** → `ball_0.png` (+5)
```
A single round cartoon ball, a perfect circle, straight front view. Solid magenta (#E33BF8) fill, one flat darker magenta (#A312C0) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**9. Hot pink** → `ball_1.png` (−5)
```
A single round cartoon ball, a perfect circle, straight front view. Solid hot pink (#FB2C91) fill, one flat darker pink (#D0106D) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**10. Lime green** → `ball_2.png` (×5)
```
A single round cartoon ball, a perfect circle, straight front view. Solid lime green (#69E303) fill, one flat darker green (#2F8A00) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**11. Cyan** → `ball_3.png` (÷5)
```
A single round cartoon ball, a perfect circle, straight front view. Solid bright cyan (#01E5F0) fill, one flat darker cyan (#0089A6) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**12. Coral red** → `ball_4.png` (+3)
```
A single round cartoon ball, a perfect circle, straight front view. Solid coral red (#FD5C53) fill, one flat darker red (#D8352B) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**13. Royal blue** → `ball_5.png` (−3)
```
A single round cartoon ball, a perfect circle, straight front view. Solid royal blue (#3185FD) fill, one flat darker blue (#1D5FD1) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**14. Sunny yellow** → `ball_6.png` (+2)
```
A single round cartoon ball, a perfect circle, straight front view. Solid sunny yellow (#FDC801) fill, one flat darker golden-orange (#C27F00) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

**15. Violet** → `ball_7.png` (−2)
```
A single round cartoon ball, a perfect circle, straight front view. Solid violet (#A54AFB) fill, one flat darker violet (#7A22D6) crescent shade along the bottom-right edge, and one small flat white oval highlight at the top-left. Even dark navy (#1B1F3B) outline. Completely blank: no symbols, no numbers. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). Sharp, high resolution, at least 1024 px.
```

## 16. Ball tray (8 cups)
Replaces `rack.png` · Ratio **about 7.5:1** — no tool makes this directly; generate at the widest ratio offered (21:9 or 4:1) and the tray will be cropped out

```
A long, low horizontal ball tray, seen from the front and slightly above, filling the full width of the image. A white (#EEF3F8) rounded-rectangle frame with a pale lavender-blue (#AFC0E6) inner floor. Inside, 8 identical shallow oval cups in a single evenly spaced row, each a flat slightly darker blue (#8FA5D6) oval with a thin lighter inner rim. Teal (#1A9C9C) rounded end caps at the bottom-left and bottom-right corners, and one cyan (#3FF0FF) light strip, drawn as a flat solid shape, at the bottom centre. The tray is about 7.5 times wider than tall. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 3000 px wide.
```

## 17. FIRE button (blank)
Replaces `fire.png` · Ratio **2:1**

```
A big pill-shaped game button, about 2.1 times wider than tall, straight front view. A bright red (#F0453A) rounded pill face with a flat lighter red (#FF7A6B) highlight band across its top third and a flat darker red (#C42A22) lip along the bottom edge so it looks pressable, framed by a thick light silver-blue (#DDE6F3) rim. Even dark navy (#1B1F3B) outline. The face is completely empty, with no text and no icon. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 2048 px wide.
```

## 18. Pause button
Replaces `pause.png` · Ratio **1:1**

```
A square game UI button with well-rounded corners, straight front view. Bright orange (#FF8A1A) face with a flat lighter orange (#FFB054) highlight across the top third and a flat darker orange (#D9620A) lip along the bottom edge. In the centre, a white pause icon: two thick vertical white bars with rounded ends. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 19. Resume (play) button
Replaces `play.png` (shown while paused) · Ratio **1:1** · *Attach the result of prompt 18 as a reference*

```
A square game UI button with well-rounded corners, straight front view. Bright orange (#FF8A1A) face with a flat lighter orange (#FFB054) highlight across the top third and a flat darker orange (#D9620A) lip along the bottom edge. In the centre, a white play icon: a solid white triangle with rounded corners pointing right. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 20. Sound on button
Replaces `sound.png` · Ratio **1:1** · *Attach the result of prompt 18 as a reference*

```
A square game UI button with well-rounded corners, straight front view. Bright orange (#FF8A1A) face with a flat lighter orange (#FFB054) highlight across the top third and a flat darker orange (#D9620A) lip along the bottom edge. In the centre, a white speaker icon with two curved white sound waves to its right. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 21. Sound off button (optional, new)
New file `sound_off.png` — would replace the red slash the game draws today · Ratio **1:1**

```
A square game UI button with well-rounded corners, straight front view. Bright orange (#FF8A1A) face with a flat lighter orange (#FFB054) highlight across the top third and a flat darker orange (#D9620A) lip along the bottom edge. In the centre, a white speaker icon with a small bold white X to its right (sound muted). Even dark navy (#1B1F3B) outline. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 22. Start-screen Play button
Replaces `playbtn.png` · Ratio **1:1**

```
A large round game Play button, straight front view. A red (#F5301E) circular face with a flat lighter red (#FF6A4D) crescent highlight at the top-left and two small flat white highlight dots, inside a thick gold (#FFC21A) outer ring with a flat deep-gold (#E39A0E) inner edge. In the centre, a big solid white triangle with rounded corners pointing right, with a small flat light-red shade under it. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game UI button, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 23. Game logo
Replaces `t_logo.png` · Ratio **16:9** · *Text is hard for image tools: ChatGPT and Ideogram spell best. Check the spelling before using it.*

```
A game title logo with the exact words "CANNON QUEST" on two lines: "CANNON" on top, "QUEST" below. Chunky, rounded, bold letters in sunny yellow (#FFC814), each with a flat orange (#F08A00) shade on its lower part, a thick dark navy (#1B1F3B) outline, and one white sticker border around the whole word group. Green (#3DBA3A) leaves peek out from behind the left and right sides of the words. Under the title, a red (#E8263A) ribbon banner with folded ends, left completely empty because the tagline is added in the game. Straight front view, centred. Style: flat 2D vector game logo, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. Plain solid sky blue (#3EB8F5) background with nothing else on it. No other text besides "CANNON QUEST". Sharp, high resolution, at least 2048 px wide.
```

## 24. Start-screen cannon (side view)
Replaces `t_cannon.png` · Ratio **1:1** · *Attach the result of prompt 6 as a reference*

```
A chunky cartoon cannon in a three-quarter side view, its barrel angled up to the right at about 40 degrees, standing on a low platform. A teal (#1A9C9C) barrel with a thick gold (#FFC21A) ring at the muzzle and two curved white stripes. A rounded teal body with a white (#EEF3F8) face plate holding one perfectly round socket hole, filled flat dark charcoal (#2A2A33) and framed by a thick gold ring. A round gold-and-teal wheel on the near side. Base: a flat white platform with a teal lower edge and two cyan (#3FF0FF) light strips drawn as flat solid shapes. Flat lighter-teal highlights on top, flat darker-teal (#11706F) shade underneath. Even dark navy (#1B1F3B) outline. Style: flat 2D vector game asset, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 2048 px.
```

## 25. Sparkle star
Replaces `t_spark.png` · Ratio **1:1**

```
A single four-pointed cartoon sparkle star with gently curved inward sides and sharp points. Bright yellow (#FFD21F) with a small flat white diamond highlight in the centre and a flat golden (#F5A800) shade on the lower-right half. Even orange (#F08A00) outline. Style: flat 2D vector game effect, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One object only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px.
```

## 26. Shake lines (beside the cage)
Replaces `t_lines.png` · Ratio **2:3** (portrait)

```
Three short, chunky cartoon action rays, the kind drawn beside something that is shaking or surprised. Each ray is a long rounded triangle, narrow at the left and wider at the right. They fan out to the right: the top ray tilts up, the middle ray is level, the bottom ray tilts down, with small even gaps between them. Bright yellow (#FFD21F) with a flat white highlight stripe along the top edge of each ray. Even orange (#F08A00) outline. Style: flat 2D vector game effect, clean modern cartoon look for a teen maths game. Solid flat colour fills, crisp hard edges, even bold outline. No gradients, no glow, no blur, no bloom, no soft or drop shadows, no texture, no noise, not 3D. One group only, centred, with even empty space around it. Transparent background (if not possible: plain solid #FFFFFF background with nothing else on it). No text, letters or numbers. Sharp, high resolution, at least 1024 px tall.
```

---

## No prompt needed for these
| File | Why |
|---|---|
| `cannon1_front.png`, `cannon2_front.png` | Only the gold socket rings, cut from the new cannon art so they line up exactly |
| `rack_front.png` | Only the tray's front lip, cut from the new tray art |
| `t_ball_0` … `t_ball_7`, `t_fire.png`, `t_cage.png` | The start screen reuses the new balls, FIRE button and caged x |
| Tutorial hand, spotlight ring | Already drawn in code (vector), so they are already sharp |

## When the art is ready
Put the PNGs in a folder such as `new art/`, named like the files above. Then they will be:
- trimmed and resized to the current layout (art-space 1672 × 941), so nothing moves on screen;
- re-fitted for the cannon sockets, so loaded balls still tuck under the gold rings;
- given game-drawn labels: ball numbers (already done today), the FIRE text and the ribbon tagline.
