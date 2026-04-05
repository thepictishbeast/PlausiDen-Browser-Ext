#!/usr/bin/env bash
# Build the WASM engine (scaffold -- not yet functional)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WASM_DIR="$ROOT_DIR/wasm-engine"

echo "==> Building WASM engine..."
echo "    NOTE: This is a scaffold. The WASM engine is not yet functional."
echo "    The TypeScript stub generator is used in the meantime."

if ! command -v wasm-pack &> /dev/null; then
  echo "    wasm-pack not found. Install with: cargo install wasm-pack"
  echo "    Skipping WASM build."
  exit 0
fi

cd "$WASM_DIR"
wasm-pack build --target web --out-dir "$ROOT_DIR/dist/wasm"

echo "==> WASM build complete: dist/wasm/"
