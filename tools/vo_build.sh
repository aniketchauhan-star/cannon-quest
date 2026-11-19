#!/bin/sh
# The studio's clips → the game's: tools/studio_out/<key>.mp3 (made by tools/vo_studio.mjs in Aamir's
# studio, Female Teacher (Standard)) → assets/VO/en/<key>.webm, Opus in WebM, 24 kbps mono, speech
# mode (the localization skill's path). Then run ./build.sh, which lists the clips for the game.
cd "$(dirname "$0")/.." || exit 1
command -v ffmpeg >/dev/null || { echo "ffmpeg is needed (brew install ffmpeg)"; exit 1; }
mkdir -p assets/VO/en
n=0
for f in tools/studio_out/*.mp3; do
  [ -e "$f" ] || continue
  k=$(basename "$f" .mp3)
  ffmpeg -loglevel error -y -i "$f" -ac 1 -c:a libopus -b:a 24k -application voip "assets/VO/en/$k.webm" && n=$((n + 1)) && echo "assets/VO/en/$k.webm"
done
echo "$n clip(s) made. Now run ./build.sh"
