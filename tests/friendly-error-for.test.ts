/**
 * Regression test for service-worker.ts::friendlyErrorFor.
 *
 * Pins two invariants:
 * (1) Every known message-type case returns a non-default string.
 *     If a case is silently dropped during refactoring, the fallback
 *     "Something went wrong" would leak through instead of the
 *     tailored copy — this test catches that.
 * (2) Every returned message follows the "what happened / what to try"
 *     structure (ends in a period, contains at least one concrete
 *     action verb like "Try", "Reopen", "Reload", "Check"). No
 *     "contact support," no stack-trace artifacts.
 *
 * Covers the 7 cases landed 2026-04-18 (GET_STATS, GET_CONFIG,
 * TOGGLE_ENABLED, UPDATE_CONFIG, GENERATE_NOW, GET_SELF_CHECK_STATE,
 * FORCE_SELF_CHECK) plus the default fallback.
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import { friendlyErrorFor } from "../src/shared/error-messages";

const KNOWN_TYPES = [
    "GET_STATS",
    "GET_CONFIG",
    "TOGGLE_ENABLED",
    "UPDATE_CONFIG",
    "GENERATE_NOW",
    "GET_SELF_CHECK_STATE",
    "FORCE_SELF_CHECK",
] as const;

const DEFAULT_MSG =
    "Something went wrong with that request. Try again; if it repeats, reload the extension.";

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

test("unknown message types fall through to default", () => {
    assert.equal(friendlyErrorFor(""), DEFAULT_MSG);
    assert.equal(friendlyErrorFor("WHAT_EVEN"), DEFAULT_MSG);
    assert.equal(friendlyErrorFor("get_stats"), DEFAULT_MSG); // case-sensitive
});

for (const type of KNOWN_TYPES) {
    test(`${type} returns a tailored (non-default) message`, () => {
        const msg = friendlyErrorFor(type);
        assert.notEqual(
            msg,
            DEFAULT_MSG,
            `${type} fell through to the default message — case missing?`,
        );
        assert.ok(msg.length > 0, "empty message");
    });
}

test("no message contains forbidden 'contact support' copy", () => {
    for (const type of KNOWN_TYPES) {
        const msg = friendlyErrorFor(type);
        assert.doesNotMatch(
            msg,
            /contact support|email us|call us/i,
            `${type} contains forbidden copy: ${msg}`,
        );
    }
});

test("no message contains stack-trace-like markers", () => {
    for (const type of KNOWN_TYPES) {
        const msg = friendlyErrorFor(type);
        assert.doesNotMatch(
            msg,
            /\bat \S+:\d+|TypeError|Error:|\bundefined is not/i,
            `${type} contains stack-trace artifact: ${msg}`,
        );
    }
});

test("every message ends with a period and has an action-verb", () => {
    // Action-verb check: at least one of Try, Reopen, Reload, Check,
    // or "try" / "check" / "reload" / "reopen" lowercase forms.
    const actionRe = /\b(Try|Reload|Reopen|Check|try|reload|reopen|check)\b/;
    for (const type of KNOWN_TYPES) {
        const msg = friendlyErrorFor(type);
        assert.ok(msg.endsWith(".") || msg.endsWith("."),
            `${type} message doesn't end in a period: ${msg}`);
        assert.match(msg, actionRe,
            `${type} message lacks a clear action verb: ${msg}`);
    }
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
