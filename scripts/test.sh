#!/usr/bin/env bash
# Run all standalone unit tests under tests/*.test.ts via npx tsx.
#
# The project has not yet adopted a full test runner (Jest/Vitest) —
# tracked as task #19. Until then, tests are plain TS files that exit 0
# on success, 1 on any failure, using node:assert. This script runs
# every file matching `tests/*.test.ts` in alpha order and exits
# non-zero on the first failure.
#
# Usage:   npm run test   (or ./scripts/test.sh directly)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$ROOT_DIR/tests"

if [[ ! -d "$TESTS_DIR" ]]; then
    echo "==> No tests/ directory — nothing to run." >&2
    exit 0
fi

shopt -s nullglob
files=("$TESTS_DIR"/*.test.ts)
shopt -u nullglob

if (( ${#files[@]} == 0 )); then
    echo "==> No tests/*.test.ts files found." >&2
    exit 0
fi

fails=0
for f in "${files[@]}"; do
    echo "==> Running $(basename "$f")"
    if ! (cd "$ROOT_DIR" && npx tsx "$f"); then
        fails=$((fails + 1))
        echo "    FAIL: $(basename "$f")" >&2
    fi
    echo
done

if (( fails == 0 )); then
    echo "==> OK — all ${#files[@]} test file(s) passed"
    exit 0
else
    echo "==> FAIL — $fails / ${#files[@]} test file(s) failed" >&2
    exit 1
fi
