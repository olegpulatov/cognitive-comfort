#!/usr/bin/env bash

set -euo pipefail

LEVEL="${1:-patch}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/.."

if [[ ! "$LEVEL" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

cd "$SOURCE_DIR"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Release tags must be created from main." >&2
  exit 1
fi


if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before tagging."
  exit 1
fi

OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$LEVEL" --no-git-tag-version >/dev/null
NEW_VERSION=$(node -p "require('./package.json').version")

git add package.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Released $OLD_VERSION -> $NEW_VERSION"
echo "Tag: v$NEW_VERSION"
