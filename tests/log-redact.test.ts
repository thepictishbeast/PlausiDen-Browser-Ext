/**
 * Unit tests for src/shared/log.ts::redactSecrets.
 *
 * Redaction is defense-in-depth — callers shouldn't pass secrets to
 * the logger in the first place, but if one slips through, the
 * ring-buffer must not surface it. These tests pin the current
 * patterns. Every NEW redaction rule in redactSecrets() should add a
 * case here so a future simplification doesn't silently drop one.
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import { redactSecrets } from "../src/shared/log";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  \u2713 ${name}`);
    } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  \u2717 ${name}\n      ${msg}`);
    }
}

test("leaves innocent strings untouched", () => {
    assert.equal(redactSecrets(""), "");
    assert.equal(redactSecrets("normal log line"), "normal log line");
    assert.equal(redactSecrets("error: scheduler paused"), "error: scheduler paused");
});

test("redacts Bearer / Basic auth headers", () => {
    assert.match(
        redactSecrets("Authorization: Bearer abcdef1234567890abcdef"),
        /Bearer \[REDACTED\]/,
    );
    assert.match(
        redactSecrets("Basic dXNlcjpwYXNzd29yZDEyMzQ="),
        /Basic \[REDACTED\]/,
    );
    // Not a header — short token; should remain (pattern requires 8+ chars)
    assert.match(redactSecrets("Bearer abc"), /Bearer abc/);
});

test("redacts common API-key prefixes (sk-/pk-/rk-)", () => {
    assert.match(
        redactSecrets("sk-abcdefghijklmnop1234567890"),
        /\[REDACTED-KEY\]/,
    );
    assert.match(
        redactSecrets("pk-xxxxxxxxxxxxxxxxxxxx"),
        /\[REDACTED-KEY\]/,
    );
});

test("redacts GitHub personal access tokens (ghp_/gho_)", () => {
    assert.match(
        redactSecrets("ghp_aaaaaaaaaaaaaaaaaaaa"),
        /\[REDACTED-GH-TOKEN\]/,
    );
    assert.match(
        redactSecrets("gho_bbbbbbbbbbbbbbbbbbbb"),
        /\[REDACTED-GH-TOKEN\]/,
    );
});

test("redacts Slack webhook / bot tokens (xoxp-/xoxb-)", () => {
    assert.match(
        redactSecrets("xoxp-1234567890-0987654321-ABCDEFGH"),
        /\[REDACTED-SLACK\]/,
    );
    assert.match(
        redactSecrets("xoxb-aaaaaaaaaaaaaa-bbbbbbbbbbbbbb"),
        /\[REDACTED-SLACK\]/,
    );
});

test("redacts email addresses", () => {
    assert.equal(
        redactSecrets("Contact alice@example.com about this"),
        "Contact [email] about this",
    );
    // Keeps message structure
    assert.match(
        redactSecrets("user redcaptian1917@gmail.com"),
        /user \[email\]/,
    );
});

test("redacts POSIX user home paths", () => {
    assert.equal(
        redactSecrets("read /home/redcap/.config/something"),
        "read /home/[user]/.config/something",
    );
    assert.equal(
        redactSecrets("/Users/alice/Library/..."),
        "/Users/[user]/Library/...",
    );
});

test("redacts Windows user paths", () => {
    assert.match(
        redactSecrets("C:\\Users\\bob\\AppData"),
        /C:\\Users\\\[user\]\\AppData/,
    );
    assert.match(
        redactSecrets("c:/Users/carol/Documents"),
        /c:\/Users\/\[user\]\/Documents/,
    );
});

test("redacts query-string auth params (token/api_key/access_token/auth)", () => {
    assert.equal(
        redactSecrets("GET /api?token=abc123xyz"),
        "GET /api?token=[REDACTED]",
    );
    assert.equal(
        redactSecrets("https://example.com/?api_key=xxxx&other=value"),
        "https://example.com/?api_key=[REDACTED]&other=value",
    );
    assert.match(
        redactSecrets("?access_token=deadbeefdeadbeef"),
        /access_token=\[REDACTED\]/,
    );
});

test("redacts JWT tokens (three base64url segments joined by dots)", () => {
    // Canonical JWT shape: header.payload.signature, all base64url.
    const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0." +
        "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    assert.match(redactSecrets(`auth=${jwt}`), /\[REDACTED-JWT\]/);
    assert.doesNotMatch(redactSecrets(jwt), /eyJ/);

    // Near-miss: should NOT match SemVer-ish strings with dots
    assert.equal(redactSecrets("v1.2.3-beta"), "v1.2.3-beta");
    assert.equal(redactSecrets("build 0.21.5"), "build 0.21.5");
});

test("redacts long mixed-entropy base64-ish blobs (potential key material)", () => {
    // 48+ chars, mixed case + digits → flagged
    const blob = "A1Bc2D3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZabcdefghijk";
    assert.match(redactSecrets(blob), /\[REDACTED-BLOB\]/);

    // Plain-English long string (no mixed case or digits) should NOT flag
    const english = "thisisafortyeightcharstringofplainenglishwords";
    assert.equal(redactSecrets(english), english);
});

test("chained redactions do not collide", () => {
    const haystack =
        "User alice@example.com hit /api?token=abc123 from /home/alice";
    const out = redactSecrets(haystack);
    assert.match(out, /\[email\]/);
    assert.match(out, /token=\[REDACTED\]/);
    assert.match(out, /\/home\/\[user\]/);
    assert.doesNotMatch(out, /alice/);
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
