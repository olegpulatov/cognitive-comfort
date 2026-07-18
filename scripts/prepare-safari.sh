#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFARI_DIR="$SOURCE_DIR/safari"
BUILD_PROFILE="${BUILD_PROFILE:-public}"
APP_NAME="$(node "$SOURCE_DIR/scripts/profile-config.mjs" "$BUILD_PROFILE" distribution.safariAppName)"
BUNDLE_ID="$(node "$SOURCE_DIR/scripts/profile-config.mjs" "$BUILD_PROFILE" distribution.safariBundleId)"

cd "$SOURCE_DIR"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found; install full Xcode.app." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
BROWSER=chrome BUILD_PROFILE="$BUILD_PROFILE" pnpm exec wxt build -b chrome

if [[ ! -d .output/chrome-mv3 ]]; then
  echo "Chrome build not found at .output/chrome-mv3" >&2
  exit 1
fi

rm -rf "$SAFARI_DIR"
xcrun safari-web-extension-converter .output/chrome-mv3 \
  --project-location "$SAFARI_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --no-prompt \
  --no-open

bash "$SOURCE_DIR/scripts/generate-icons.sh"

PBXPROJ="$SAFARI_DIR/$APP_NAME/$APP_NAME.xcodeproj/project.pbxproj"
XCODEPROJ="$SAFARI_DIR/$APP_NAME/$APP_NAME.xcodeproj"
if [[ ! -d "$XCODEPROJ" || ! -f "$PBXPROJ" ]]; then
  echo "Safari converter did not create the expected Xcode project." >&2
  exit 1
fi

sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" "$PBXPROJ"
sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $VERSION;/g" "$PBXPROJ"
sed -i '' "s/MACOSX_DEPLOYMENT_TARGET = [^;]*;/MACOSX_DEPLOYMENT_TARGET = 12.3;/g" "$PBXPROJ"

MAIN_HTML="$SAFARI_DIR/$APP_NAME/Shared (App)/Resources/Base.lproj/Main.html"
if [[ -f "$MAIN_HTML" ]]; then
  cat > "$MAIN_HTML" <<'HTML'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="../Style.css">
    <script src="../Script.js" defer></script>
</head>
<body>
    <img src="../Icon.png" width="128" height="128" alt="Cognitive Comfort Icon">
    <p class="platform-mac state-on">Extension is enabled.</p>
    <p class="platform-mac state-off">Enable in Safari &gt; Settings &gt; Extensions</p>
    <p class="platform-mac state-unknown">Check Safari &gt; Settings &gt; Extensions</p>
    <button class="platform-mac open-preferences">Open Safari Settings…</button>
    <p class="platform-ios">Enable in Settings &gt; Safari &gt; Extensions</p>
</body>
</html>
HTML
fi

printf 'Prepared unsigned Safari Xcode project at %s\n' "$XCODEPROJ"
