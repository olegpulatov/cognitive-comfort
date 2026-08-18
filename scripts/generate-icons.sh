#!/usr/bin/env bash

# Regenerates every shipped raster icon from the authored vector masters in brand/icon/.
# Nothing here is a source file: edit the SVGs, then run this script.
#
#   brand/icon/icon.svg        browser toolbar + store icons (rounded ink-umber plate)
#   brand/icon/icon-macos.svg  Safari containing-app icons on Apple's 1024 grid
#   brand/icon/icon-mono.svg   single-colour variant, not shipped as a raster
#
# Requires rsvg-convert (librsvg). Install with: brew install librsvg

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_MASTER="${1:-$ROOT_DIR/brand/icon/icon.svg}"
APP_MASTER="${2:-$ROOT_DIR/brand/icon/icon-macos.svg}"

for master in "$WEB_MASTER" "$APP_MASTER"; do
  if [ ! -f "$master" ]; then
    echo "Vector master not found: $master" >&2
    exit 1
  fi
done

if ! command -v rsvg-convert &>/dev/null; then
  echo "rsvg-convert is required to render the vector masters (brew install librsvg)." >&2
  exit 1
fi

render() {
  local master="$1" size="$2" output="$3"

  mkdir -p "$(dirname "$output")"
  rsvg-convert --width "$size" --height "$size" --keep-aspect-ratio "$master" --output "$output"
}

# Browser extension icons and the 1024 store/press master.
for size in 16 32 48 96 128; do
  render "$WEB_MASTER" "$size" "$ROOT_DIR/public/icon-$size.png"
done
render "$WEB_MASTER" 1024 "$ROOT_DIR/brand/icon/icon-1024.png"

# Edge store logo.
render "$WEB_MASTER" 300 "$ROOT_DIR/brand/store/out/edge-store-logo-300.png"

# Safari/macOS containing-app icons.
SAFARI_APP_DIR="$ROOT_DIR/safari/Cognitive Comfort/Shared (App)"
if [ -d "$SAFARI_APP_DIR" ]; then
  render "$APP_MASTER" 128 "$SAFARI_APP_DIR/Resources/Icon.png"
  render "$APP_MASTER" 128 "$SAFARI_APP_DIR/Assets.xcassets/LargeIcon.imageset/icon-128.png"
  render "$APP_MASTER" 16 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png"
  render "$APP_MASTER" 32 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png"
  render "$APP_MASTER" 32 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png"
  render "$APP_MASTER" 64 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png"
  render "$APP_MASTER" 128 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png"
  render "$APP_MASTER" 256 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png"
  render "$APP_MASTER" 256 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png"
  render "$APP_MASTER" 512 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png"
  render "$APP_MASTER" 512 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png"
  render "$APP_MASTER" 1024 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png"
  render "$APP_MASTER" 1024 "$SAFARI_APP_DIR/Assets.xcassets/AppIcon.appiconset/universal-icon-1024@1x.png"
fi

echo "Rendered icons from $WEB_MASTER and $APP_MASTER"
