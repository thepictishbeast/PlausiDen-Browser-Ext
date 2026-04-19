#!/usr/bin/env bash
# check-manifest-parity.sh — verify Chrome MV3 + Firefox WebExtension manifests
# agree on every user-visible/privilege-affecting field.
#
# Why: Chrome and Firefox manifests have different required shapes
# (background.service_worker vs background.scripts, browser_specific_settings),
# but the privilege surface (permissions / host_permissions) and user-facing
# strings (name, description, version) MUST agree byte-for-byte. A silent drift
# would ship a version of the extension with a broader permission set on one
# browser — exactly the kind of thing CI should catch.
#
# Usage:   ./scripts/check-manifest-parity.sh
# Exit:    0 if all parity checks pass; 1 on any mismatch.
#
# Runs jq locally — no network, no state mutation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CHROME_MANIFEST="$ROOT_DIR/manifests/chrome/manifest.json"
FIREFOX_MANIFEST="$ROOT_DIR/manifests/firefox/manifest.json"

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required; install with 'apt install jq' or 'brew install jq'." >&2
    exit 2
fi

for f in "$CHROME_MANIFEST" "$FIREFOX_MANIFEST"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: manifest not found: $f" >&2
        exit 2
    fi
    if ! jq -e . "$f" >/dev/null 2>&1; then
        echo "ERROR: manifest is not valid JSON: $f" >&2
        exit 2
    fi
done

fails=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; fails=$((fails + 1)); }

# --- Scalar field parity ----------------------------------------------------
check_scalar() {
    local field="$1"
    local c f
    c=$(jq -r --arg k "$field" '.[$k] // ""' "$CHROME_MANIFEST")
    f=$(jq -r --arg k "$field" '.[$k] // ""' "$FIREFOX_MANIFEST")
    if [[ "$c" == "$f" && -n "$c" ]]; then
        pass "$field matches: $c"
    else
        fail "$field mismatch — chrome='$c' firefox='$f'"
    fi
}

# --- Array field parity (order-insensitive) --------------------------------
# Uses `sort | unique` so ["a","b"] and ["b","a"] are considered equivalent.
check_array() {
    local field="$1"
    local c f
    c=$(jq -cS --arg k "$field" '(.[$k] // []) | sort | unique' "$CHROME_MANIFEST")
    f=$(jq -cS --arg k "$field" '(.[$k] // []) | sort | unique' "$FIREFOX_MANIFEST")
    if [[ "$c" == "$f" ]]; then
        pass "$field matches: $c"
    else
        fail "$field mismatch — chrome=$c firefox=$f"
    fi
}

# --- Nested path parity ----------------------------------------------------
check_path() {
    local label="$1"; local path="$2"
    local c f
    c=$(jq -rc "$path // \"\"" "$CHROME_MANIFEST")
    f=$(jq -rc "$path // \"\"" "$FIREFOX_MANIFEST")
    if [[ "$c" == "$f" && -n "$c" ]]; then
        pass "$label matches: $c"
    else
        fail "$label mismatch — chrome='$c' firefox='$f'"
    fi
}

echo "==> Manifest parity check"
echo
echo "User-visible strings:"
check_scalar "name"
check_scalar "description"
check_scalar "version"

echo
echo "Schema / privilege fields:"
check_scalar "manifest_version"
check_array  "permissions"
check_array  "host_permissions"
check_array  "optional_permissions"
check_array  "optional_host_permissions"
check_array  "content_scripts"

echo
echo "Entry points (must match exactly):"
check_path "action.default_popup"   ".action.default_popup"
check_path "options_page"           ".options_page"

echo

if (( fails == 0 )); then
    echo "==> OK — Chrome + Firefox manifests agree on every parity-critical field."
    exit 0
else
    echo "==> FAIL — $fails parity mismatch(es)."
    echo "    Fix by editing manifests/chrome/manifest.json + manifests/firefox/manifest.json together."
    exit 1
fi
