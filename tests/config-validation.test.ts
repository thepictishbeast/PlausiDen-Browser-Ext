/**
 * Standalone unit tests for src/shared/config-validation.ts.
 *
 * Runs without a Jest/Vitest runner — the project hasn't adopted one
 * yet (tracked as task #19). Run with:
 *
 *     npx tsx tests/config-validation.test.ts
 *
 * Exit 0 = all pass; exit 1 = any failure (also prints which assertion).
 * Uses node's built-in assert so no dev-dependency growth.
 */
import assert from "node:assert/strict";
import {
    sanitizeConfigUpdate,
    sanitizeStoredConfig,
} from "../src/shared/config-validation";
import { DEFAULT_CONFIG } from "../src/shared/types";

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

// ---------------------------------------------------------------------------
// sanitizeConfigUpdate: whitelist + range-check of untrusted payloads.
// ---------------------------------------------------------------------------

test("rejects non-object raw → empty Partial", () => {
    assert.deepEqual(sanitizeConfigUpdate(null), {});
    assert.deepEqual(sanitizeConfigUpdate("nope"), {});
    assert.deepEqual(sanitizeConfigUpdate(42), {});
    assert.deepEqual(sanitizeConfigUpdate(undefined), {});
});

test("accepts boolean enabled", () => {
    assert.deepEqual(sanitizeConfigUpdate({ enabled: true }), { enabled: true });
    assert.deepEqual(sanitizeConfigUpdate({ enabled: false }), { enabled: false });
});

test("rejects non-boolean enabled", () => {
    assert.deepEqual(sanitizeConfigUpdate({ enabled: "yes" }), {});
    assert.deepEqual(sanitizeConfigUpdate({ enabled: 1 }), {});
});

test("accepts known intensity levels only", () => {
    assert.deepEqual(sanitizeConfigUpdate({ intensity: "low" }), { intensity: "low" });
    assert.deepEqual(sanitizeConfigUpdate({ intensity: "max" }), { intensity: "max" });
    assert.deepEqual(sanitizeConfigUpdate({ intensity: "turbo" }), {});
    assert.deepEqual(sanitizeConfigUpdate({ intensity: 99 }), {});
});

test("rejects customDailyEntries above MAX_CUSTOM_DAILY_ENTRIES (10k)", () => {
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: 500 }), { customDailyEntries: 500 });
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: 10_000 }), { customDailyEntries: 10_000 });
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: 10_001 }), {});
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: Number.MAX_SAFE_INTEGER }), {});
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: -1 }), {});
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: Infinity }), {});
    assert.deepEqual(sanitizeConfigUpdate({ customDailyEntries: NaN }), {});
});

test("customActiveHours: null accepted, bad shapes dropped", () => {
    assert.deepEqual(sanitizeConfigUpdate({ customActiveHours: null }), { customActiveHours: null });
    assert.deepEqual(
        sanitizeConfigUpdate({ customActiveHours: { start: 8, end: 22 } }),
        { customActiveHours: { start: 8, end: 22 } },
    );
    // start >= end → rejected
    assert.deepEqual(sanitizeConfigUpdate({ customActiveHours: { start: 22, end: 8 } }), {});
    // out-of-range
    assert.deepEqual(sanitizeConfigUpdate({ customActiveHours: { start: -1, end: 10 } }), {});
    assert.deepEqual(sanitizeConfigUpdate({ customActiveHours: { start: 0, end: 25 } }), {});
    // Missing fields
    assert.deepEqual(sanitizeConfigUpdate({ customActiveHours: { start: 8 } }), {});
});

test("customCategories: unknowns filtered; empty → null (rejected)", () => {
    assert.deepEqual(sanitizeConfigUpdate({ customCategories: null }), { customCategories: null });
    assert.deepEqual(
        sanitizeConfigUpdate({ customCategories: ["news", "bogus", "social"] }),
        { customCategories: ["news", "social"] },
    );
    // All-bogus filters to empty, which is rejected (would otherwise silently empty).
    assert.deepEqual(sanitizeConfigUpdate({ customCategories: ["bogus1", "bogus2"] }), {});
});

test("pipeline-only fields are NOT writable from UPDATE_CONFIG", () => {
    // A crafted payload trying to reset counters / backdate must be dropped.
    const out = sanitizeConfigUpdate({
        totalEntriesGenerated: 0,
        totalSessionsGenerated: 0,
        lastRunTimestamp: 0,
        lastRunAttempted: 0,
        lastRunSucceeded: 0,
        enabled: true,  // sanity: the good field still lands
    });
    assert.deepEqual(out, { enabled: true });
});

test("unknown keys silently dropped", () => {
    assert.deepEqual(
        sanitizeConfigUpdate({ enabled: true, __proto__: { polluted: true }, random: "garbage" }),
        { enabled: true },
    );
});

// ---------------------------------------------------------------------------
// sanitizeStoredConfig: load-path bound-checking.
// Covers the MAX_LIFETIME_COUNTER cap added 2026-04-18 (formerly unbounded).
// ---------------------------------------------------------------------------

test("storage sanitizer caps lifetime counters at 1e9", () => {
    const garbage = { totalEntriesGenerated: Number.MAX_SAFE_INTEGER, totalSessionsGenerated: 1e12 };
    const out = sanitizeStoredConfig(garbage);
    // Both were above 1e9 → dropped → fall back to DEFAULT_CONFIG's 0.
    assert.equal(out.totalEntriesGenerated, DEFAULT_CONFIG.totalEntriesGenerated);
    assert.equal(out.totalSessionsGenerated, DEFAULT_CONFIG.totalSessionsGenerated);
});

test("storage sanitizer accepts realistic counter values", () => {
    const good = { totalEntriesGenerated: 5_000, totalSessionsGenerated: 250 };
    const out = sanitizeStoredConfig(good);
    assert.equal(out.totalEntriesGenerated, 5_000);
    assert.equal(out.totalSessionsGenerated, 250);
});

test("storage sanitizer resets succeeded-exceeds-attempted invariant", () => {
    const corrupt = { lastRunAttempted: 10, lastRunSucceeded: 100 };
    const out = sanitizeStoredConfig(corrupt);
    // Invariant violated → pair reset to (0, 0) rather than show a bogus ratio.
    assert.equal(out.lastRunAttempted, 0);
    assert.equal(out.lastRunSucceeded, 0);
});

test("storage sanitizer: garbage in → DEFAULT_CONFIG", () => {
    assert.deepEqual(sanitizeStoredConfig(null), { ...DEFAULT_CONFIG });
    assert.deepEqual(sanitizeStoredConfig("nope"), { ...DEFAULT_CONFIG });
    assert.deepEqual(sanitizeStoredConfig(42), { ...DEFAULT_CONFIG });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
