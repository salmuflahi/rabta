#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEMO="$ROOT/site/public/assets/demos"
MICRO="$DEMO/micro"
SOCIAL="$ROOT/marketing-videos/social"
CARDS="$ROOT/apps/desktop/capture/cards"

mkdir -p "$MICRO" "$SOCIAL"

encode_loop() {
  local source="$1" start="$2" duration="$3" output="$4" crop="$5"
  ffmpeg -y -loglevel error -ss "$start" -t "$duration" -i "$source" \
    -an -vf "$crop,fps=30,format=yuv420p" \
    -c:v libx264 -preset slow -crf 18 -movflags +faststart "$output"
}

# Small, silent, self-contained proof moments for feature cards and scroll reveals.
encode_loop "$DEMO/honest-return-desktop.m4v" 0.00 2.80 "$MICRO/resume-click.mp4" "scale=960:540"
encode_loop "$DEMO/hero-return-desktop.m4v" 0.75 2.50 "$MICRO/save-state.mp4" "scale=960:540"
encode_loop "$DEMO/hero-return-desktop.m4v" 1.65 2.70 "$MICRO/task-switch.mp4" "scale=960:540"
encode_loop "$DEMO/honest-return-desktop.m4v" 1.20 2.80 "$MICRO/partial-result.mp4" "scale=960:540"
encode_loop "$DEMO/honest-return-desktop.m4v" 1.35 2.60 "$MICRO/editor-restored.mp4" "crop=760:285:520:205,scale=960:360,pad=960:540:0:90:color=#111515"
encode_loop "$DEMO/honest-return-desktop.m4v" 1.35 2.60 "$MICRO/tabs-deferred.mp4" "crop=760:285:520:205,scale=960:360,pad=960:540:0:90:color=#111515"
encode_loop "$DEMO/honest-return-desktop.m4v" 1.35 2.60 "$MICRO/branch-restored.mp4" "crop=760:285:520:205,scale=960:360,pad=960:540:0:90:color=#111515"
encode_loop "$DEMO/hero-return-desktop.m4v" 0.90 2.70 "$MICRO/capsule-context.mp4" "crop=1040:610:160:70,scale=920:540,pad=960:540:20:0:color=#111515"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Renders the 1080x1920 card at its true size.
#
# Do not use `qlmanage` here. It emits a SQUARE thumbnail, so a 1080x1920 card
# is scaled to width and then cropped at 1920px tall — silently discarding the
# bottom 44%, which is where the tagline and the rabta.build URL live. Every
# social video built before 2026-08-11 shipped with no call to action because
# of this.
render_card() {
  local name="$1"
  local png="$CARDS/${name}.svg.png"
  rm -f "$png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --screenshot="$png" --window-size=1080,1920 \
    "file://$CARDS/${name}.svg" >/dev/null 2>&1
  local dims
  dims="$(sips -g pixelWidth -g pixelHeight "$png" 2>/dev/null | awk '/pixel/{printf "%s", $2"x"} END{print ""}')"
  if [ "$dims" != "1080x1920x" ]; then
    echo "FAIL: ${name} card rendered as ${dims%x}, expected 1080x1920" >&2
    exit 1
  fi
}

social_base() {
  local source="$1" duration="$2" output="$3" card="$4"
  render_card "$card"
  ffmpeg -y -loglevel error -stream_loop -1 -i "$source" -loop 1 -i "$CARDS/${card}.svg.png" -t "$duration" -an \
    -filter_complex "[1:v]scale=1080:1920[card];[0:v]crop=960:720:160:0,scale=980:735,setsar=1[app];[card][app]overlay=50:500:shortest=1" \
    -r 30 -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart "$output"
}

social_base "$DEMO/hero-return-desktop.m4v" 15 "$SOCIAL/problem-return.mp4" "problem-return"

social_base "$DEMO/hero-return-desktop.m4v" 10 "$SOCIAL/pure-proof.mp4" "pure-proof"

social_base "$DEMO/honest-return-desktop.m4v" 15 "$SOCIAL/trust-local-first.mp4" "trust-local-first"

printf 'Built 8 website loops and 3 social videos.\n'
