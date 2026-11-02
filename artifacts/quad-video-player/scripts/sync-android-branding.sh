#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON="$APP_DIR/assets/images/goon-quest-icon.png"
RES="$APP_DIR/android/app/src/main/res"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick is required to sync the Android launcher and splash branding." >&2
  exit 1
fi
if [[ ! -f "$ICON" || ! -d "$RES" ]]; then
  echo "Goon Quest icon or generated Android resources are missing." >&2
  exit 1
fi

while IFS=' ' read -r density icon_size foreground_size splash_canvas splash_icon; do
  [[ -n "$density" ]] || continue
  icon_dir="$RES/mipmap-$density"
  splash_dir="$RES/drawable-$density"
  [[ -d "$icon_dir" && -d "$splash_dir" ]] || {
    echo "Expected Android resource directory for $density is missing." >&2
    exit 1
  }

  for name in ic_launcher.webp ic_launcher_round.webp; do
    magick "$ICON" -filter point -resize "${icon_size}x${icon_size}" \
      -strip -define webp:lossless=true "$icon_dir/$name"
  done
  magick "$ICON" -filter point -resize "${foreground_size}x${foreground_size}" \
    -strip -define webp:lossless=true "$icon_dir/ic_launcher_foreground.webp"

  magick "$ICON" -filter point -resize "${splash_icon}x${splash_icon}" \
    -background none -gravity center -extent "${splash_canvas}x${splash_canvas}" \
    -strip "$splash_dir/splashscreen_logo.png"
done <<'SIZES'
mdpi 48 108 288 160
hdpi 72 162 432 240
xhdpi 96 216 576 320
xxhdpi 144 324 864 480
xxxhdpi 192 432 1152 640
SIZES

echo "Synced Goon Quest Android launcher and splash assets."
