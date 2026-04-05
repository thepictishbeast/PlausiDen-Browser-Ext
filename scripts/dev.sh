#!/usr/bin/env bash
# Development mode -- watches for changes and rebuilds Chrome extension
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist/chrome"

echo "==> PlausiDen dev mode (Chrome, watch)"
echo "    Load dist/chrome/ as unpacked extension in chrome://extensions"
echo "    Press Ctrl+C to stop."

# Initial build of static assets
mkdir -p "$DIST_DIR/background" "$DIST_DIR/popup" "$DIST_DIR/options"
cp "$ROOT_DIR/manifests/chrome/manifest.json" "$DIST_DIR/manifest.json"
cp "$ROOT_DIR/src/popup/popup.html" "$DIST_DIR/popup/popup.html"
cp "$ROOT_DIR/src/popup/popup.css" "$DIST_DIR/popup/popup.css"
cp "$ROOT_DIR/src/options/options.html" "$DIST_DIR/options/options.html"
cp "$ROOT_DIR/src/options/options.css" "$DIST_DIR/options/options.css"

# Watch and rebuild TypeScript
npx esbuild \
  "$ROOT_DIR/src/background/service-worker.ts" \
  --bundle \
  --outfile="$DIST_DIR/background/service-worker.js" \
  --format=esm \
  --target=es2020 \
  --sourcemap \
  --watch &

npx esbuild \
  "$ROOT_DIR/src/popup/popup.ts" \
  --bundle \
  --outfile="$DIST_DIR/popup/popup.js" \
  --format=iife \
  --target=es2020 \
  --sourcemap \
  --watch &

npx esbuild \
  "$ROOT_DIR/src/options/options.ts" \
  --bundle \
  --outfile="$DIST_DIR/options/options.js" \
  --format=iife \
  --target=es2020 \
  --sourcemap \
  --watch &

# Wait for all background processes
wait
