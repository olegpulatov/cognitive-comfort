#!/usr/bin/env bash
# Compresses the few store assets the README embeds into committed WebP files.
# brand/store/out/ stays generated and untracked; brand/store/readme/ is tracked
# because GitHub has to fetch those images from the repository itself.
# Regenerate after `just store-assets`; never hand-edit the output.
# Requires cwebp (brew install webp / apt install webp).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/brand/store/out"
dst="$root/brand/store/readme"

command -v cwebp >/dev/null || { echo "cwebp not found" >&2; exit 1; }

rm -rf "$dst"
mkdir -p "$dst"

convert() {
  local name="$1" out="$2" quality="$3"
  [ -f "$src/$name" ] || { echo "missing $src/$name — run 'just store-assets' first" >&2; exit 1; }
  cwebp -quiet -q "$quality" -m 6 "$src/$name" -o "$dst/$out"
  printf '%8s  %s\n' "$(du -h "$dst/$out" | cut -f1)" "brand/store/readme/$out"
}

convert github-social-1280x640.png     header.webp   82
convert shot-1-quiet-page-1280x800.png quiet.webp    80
convert shot-2-reveal-1280x800.png     reveal.webp   80
convert shot-4-options-1280x800.png    rules.webp    80
