#!/usr/bin/env bash
# Build the Chrome extension (Manifest V3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist/chrome"

echo "==> Building PlausiDen for Chrome..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/background" "$DIST_DIR/popup" "$DIST_DIR/options"

# Bundle TypeScript with esbuild
npx esbuild \
  "$ROOT_DIR/src/background/service-worker.ts" \
  --bundle \
  --outfile="$DIST_DIR/background/service-worker.js" \
  --format=esm \
  --target=es2020 \
  --minify

npx esbuild \
  "$ROOT_DIR/src/popup/popup.ts" \
  --bundle \
  --outfile="$DIST_DIR/popup/popup.js" \
  --format=iife \
  --target=es2020 \
  --minify

npx esbuild \
  "$ROOT_DIR/src/options/options.ts" \
  --bundle \
  --outfile="$DIST_DIR/options/options.js" \
  --format=iife \
  --target=es2020 \
  --minify

# Copy static assets
cp "$ROOT_DIR/manifests/chrome/manifest.json" "$DIST_DIR/manifest.json"
cp "$ROOT_DIR/src/popup/popup.html" "$DIST_DIR/popup/popup.html"
cp "$ROOT_DIR/src/popup/popup.css" "$DIST_DIR/popup/popup.css"
cp "$ROOT_DIR/src/options/options.html" "$DIST_DIR/options/options.html"
cp "$ROOT_DIR/src/options/options.css" "$DIST_DIR/options/options.css"

# Create zip for Chrome Web Store
cd "$DIST_DIR"
zip -r "$ROOT_DIR/dist/plausiden-chrome.zip" . -x "*.DS_Store"

echo "==> Chrome build complete: dist/chrome/"
echo "==> Chrome zip: dist/plausiden-chrome.zip"
