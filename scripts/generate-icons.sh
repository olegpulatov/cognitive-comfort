#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_IMAGE="${1:-$SOURCE_DIR/icon_large.png}"

if [ ! -f "$SOURCE_IMAGE" ]; then
  echo "Source image not found: $SOURCE_IMAGE" >&2
  exit 1
fi

resize_png() {
  local size="$1"
  local output="$2"

  mkdir -p "$(dirname "$output")"
  sips -z "$size" "$size" "$SOURCE_IMAGE" --out "$output" >/dev/null
}

require_magick() {
  if ! command -v magick &>/dev/null; then
    echo "ImageMagick ('magick') is required to generate Apple app icons from transparent artwork." >&2
    exit 1
  fi
}

compose_apple_icon() {
  local size="$1"
  local output="$2"

  mkdir -p "$(dirname "$output")"
  local tmp_square
  tmp_square="$(mktemp /tmp/apple-icon-square-XXXXXX.png)"

  local bounds
  bounds="$(magick "$SOURCE_IMAGE" -alpha extract -threshold 20% -format '%@' info:)"

  local width height x y
  width="${bounds%%x*}"
  local rest="${bounds#*x}"
  height="${rest%%+*}"
  rest="${rest#*+}"
  x="${rest%%+*}"
  y="${rest#*+}"

  local cx cy side crop_x crop_y max_x max_y
  cx=$(( x + width / 2 ))
  cy=$(( y + height / 2 ))
  side=$(( (width > height ? width : height) * 128 / 100 ))
  crop_x=$(( cx - side / 2 ))
  crop_y=$(( cy - side / 2 ))
  max_x=$(( 1024 - side ))
  max_y=$(( 1024 - side ))

  if (( crop_x < 0 )); then crop_x=0; fi
  if (( crop_y < 0 )); then crop_y=0; fi
  if (( crop_x > max_x )); then crop_x=max_x; fi
  if (( crop_y > max_y )); then crop_y=max_y; fi

  magick "$SOURCE_IMAGE" \
    -crop "${side}x${side}+${crop_x}+${crop_y}" \
    +repage \
    -resize "${size}x${size}" \
    "$tmp_square"

  magick \
    -size "${size}x${size}" xc:none \
    "$tmp_square" \
    -gravity center \
    -compose over -composite \
    "$output"

  rm -f "$tmp_square"
}

# Browser extension icons (keep transparency)
resize_png 16 "$SOURCE_DIR/public/icon-16.png"
resize_png 32 "$SOURCE_DIR/public/icon-32.png"
resize_png 48 "$SOURCE_DIR/public/icon-48.png"
resize_png 96 "$SOURCE_DIR/public/icon-96.png"
resize_png 128 "$SOURCE_DIR/public/icon-128.png"

# Safari/macOS app icons
SAFARI_APP_DIR="$SOURCE_DIR/safari/Cognitive Comfort/Shared (App)"
if [ -d "$SAFARI_APP_DIR" ]; then
  require_magick

  compose_apple_icon 128 "$SAFARI_APP_DIR/Resources/Icon.png"
  compose_apple_icon 128 "$SAFARI_APP_DIR/Assets.xcassets/LargeIcon.imageset/icon-128.png"

  compose_apple_icon 16 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png"
  compose_apple_icon 32 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png"
  compose_apple_icon 32 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png"
  compose_apple_icon 64 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png"
  compose_apple_icon 128 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png"
  compose_apple_icon 256 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png"
  compose_apple_icon 256 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png"
  compose_apple_icon 512 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png"
  compose_apple_icon 512 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png"
  compose_apple_icon 1024 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png"
  compose_apple_icon 1024 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/universal-icon-1024@1x.png"
fi

echo "Generated icons from $SOURCE_IMAGE"
