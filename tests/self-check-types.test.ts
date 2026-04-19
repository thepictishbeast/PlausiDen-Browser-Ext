/**
 * Unit tests for src/shared/self-check-types.ts pure helpers.
 * Focus: statusToTrafficLight mapping + selfCheckSuccessPct edge cases.
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import {
    SelfCheckState,
    selfCheckSuccessPct,
    statusLabelFor,
    statusToTrafficLight,
} from "../src/shared/self-check-types";

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

const base: SelfCheckState = {
    status: "ok",
    lastRunAt: 0,
    lastDurationMs: 0,
    note: "",
};

test("statusToTrafficLight covers every SelfCheckStatus", () => {
    assert.equal(statusToTrafficLight("ok"), "ok");
    assert.equal(statusToTrafficLight("pending"), "warn");
    assert.equal(statusToTrafficLight("stale"), "warn");
    assert.equal(statusToTrafficLight("cleanup_failed"), "warn");
    assert.equal(statusToTrafficLight("blocked"), "err");
    assert.equal(statusToTrafficLight("silent_block"), "err");
});

test("statusLabelFor returns non-empty human-readable string per status", () => {
    for (const st of ["ok", "blocked", "silent_block", "cleanup_failed", "pending", "stale"] as const) {
        const label = statusLabelFor(st);
        assert.ok(typeof label === "string" && label.length > 0,
            `label for ${st} should be a non-empty string, got ${JSON.stringify(label)}`);
    }
});

test("selfCheckSuccessPct returns null when no probes have run", () => {
    assert.equal(selfCheckSuccessPct({ ...base }), null);
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 0, probesSucceeded: 0 }), null);
});

test("selfCheckSuccessPct computes percent on full+partial success", () => {
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 1, probesSucceeded: 1 }), 100);
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 4, probesSucceeded: 1 }), 25);
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 10, probesSucceeded: 7 }), 70);
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 3, probesSucceeded: 0 }), 0);
});

test("selfCheckSuccessPct rounds to nearest integer", () => {
    // 2/7 = 28.57%, rounds to 29.
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 7, probesSucceeded: 2 }), 29);
    // 1/3 = 33.33%, rounds to 33.
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 3, probesSucceeded: 1 }), 33);
});

test("selfCheckSuccessPct tolerates absent probesSucceeded (legacy state)", () => {
    // State written before counters existed — probesRun set but probesSucceeded undefined.
    assert.equal(selfCheckSuccessPct({ ...base, probesRun: 5 }), 0);
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
