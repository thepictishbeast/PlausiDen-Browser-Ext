/**
 * Unit tests for src/shared/profiles.ts + shape invariants from
 * src/shared/types.ts.
 *
 * Profiles are the user-facing personas (Casual, Researcher, Journalist)
 * that drive generation. Shape regressions — a missing field, an
 * empty category set, activeHours pointing backwards — would
 * silently degrade noise quality. These tests pin the contract.
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import { PROFILES, getProfile, getProfileKeys } from "../src/shared/profiles";
import type { BrowsingCategory, BrowsingProfile } from "../src/shared/types";
import { INTENSITY_MULTIPLIERS, DEFAULT_CONFIG } from "../src/shared/types";

const VALID_CATEGORIES: ReadonlySet<BrowsingCategory> = new Set([
    "news", "social", "shopping", "entertainment", "weather",
    "academic", "documentation", "reference", "government", "legal",
    "finance", "health", "technology", "sports", "travel", "food",
]);

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
// Presence + shape
// ---------------------------------------------------------------------------

test("three canonical profiles are present", () => {
    for (const key of ["casual", "researcher", "journalist"]) {
        assert.ok(PROFILES[key], `PROFILES missing ${key}`);
    }
});

test("getProfileKeys returns every declared key", () => {
    const keys = getProfileKeys();
    assert.equal(keys.length, Object.keys(PROFILES).length);
    for (const k of Object.keys(PROFILES)) {
        assert.ok(keys.includes(k), `getProfileKeys missing ${k}`);
    }
});

test("getProfile resolves each known key", () => {
    for (const k of getProfileKeys()) {
        const p = getProfile(k);
        assert.ok(p.name, `profile ${k} has no name`);
    }
});

test("getProfile falls back to casual on unknown key", () => {
    assert.equal(getProfile("does-not-exist"), PROFILES.casual);
    assert.equal(getProfile(""), PROFILES.casual);
});

// ---------------------------------------------------------------------------
// Per-profile invariants
// ---------------------------------------------------------------------------

function profileInvariants(key: string, p: BrowsingProfile): void {
    assert.ok(p.name.length > 0, `${key}: empty name`);
    assert.ok(p.description.length > 0, `${key}: empty description`);

    assert.ok(p.searchEngines.length > 0, `${key}: empty searchEngines`);
    for (const s of p.searchEngines) {
        assert.ok(s.length > 0, `${key}: empty searchEngine entry`);
        // Search engines must be real domains, not synthetic TLDs.
        assert.doesNotMatch(s, /\.(example|test|invalid|localhost)$/,
            `${key}: searchEngine ${s} uses synthetic TLD`);
    }

    assert.ok(p.categories.length > 0, `${key}: empty categories`);
    for (const c of p.categories) {
        assert.ok(VALID_CATEGORIES.has(c),
            `${key}: unknown category ${c}`);
    }
    // No duplicates
    assert.equal(new Set(p.categories).size, p.categories.length,
        `${key}: categories has duplicates`);

    assert.ok(p.avgDailyEntries > 0 && p.avgDailyEntries <= 500,
        `${key}: avgDailyEntries ${p.avgDailyEntries} outside sane range`);

    // activeHours: start < end, both in [0, 24]
    assert.ok(p.activeHours.start >= 0 && p.activeHours.start <= 23,
        `${key}: activeHours.start ${p.activeHours.start} out of range`);
    assert.ok(p.activeHours.end >= 1 && p.activeHours.end <= 24,
        `${key}: activeHours.end ${p.activeHours.end} out of range`);
    assert.ok(p.activeHours.start < p.activeHours.end,
        `${key}: activeHours ${p.activeHours.start}-${p.activeHours.end} is empty / reversed`);
}

for (const key of ["casual", "researcher", "journalist"]) {
    test(`${key} profile satisfies shape invariants`, () => {
        profileInvariants(key, PROFILES[key]);
    });
}

test("every declared profile satisfies shape invariants", () => {
    for (const [key, p] of Object.entries(PROFILES)) {
        profileInvariants(key, p);
    }
});

// ---------------------------------------------------------------------------
// Cross-profile sanity
// ---------------------------------------------------------------------------

test("profile names are distinct", () => {
    const names = Object.values(PROFILES).map(p => p.name);
    assert.equal(new Set(names).size, names.length, "duplicate profile name");
});

test("description length is bounded (UI affordance)", () => {
    // The options page shows descriptions inline; very long strings
    // would break the layout. 200 chars is generous headroom.
    for (const [key, p] of Object.entries(PROFILES)) {
        assert.ok(p.description.length <= 200,
            `${key}: description too long (${p.description.length} chars)`);
    }
});

// ---------------------------------------------------------------------------
// types.ts shape invariants
// ---------------------------------------------------------------------------

test("INTENSITY_MULTIPLIERS keys match IntensityLevel union", () => {
    const expected = ["low", "medium", "high", "max"] as const;
    const got = Object.keys(INTENSITY_MULTIPLIERS).sort();
    assert.deepEqual(got, [...expected].sort());
});

test("INTENSITY_MULTIPLIERS are monotonically increasing", () => {
    const order = ["low", "medium", "high", "max"] as const;
    for (let i = 1; i < order.length; i++) {
        const prev = INTENSITY_MULTIPLIERS[order[i - 1]];
        const cur = INTENSITY_MULTIPLIERS[order[i]];
        assert.ok(cur > prev,
            `intensity ${order[i]} (${cur}) is not greater than ${order[i-1]} (${prev})`);
    }
});

test("DEFAULT_CONFIG uses a known profile + intensity", () => {
    assert.ok(PROFILES[DEFAULT_CONFIG.activeProfile],
        `DEFAULT_CONFIG.activeProfile ${DEFAULT_CONFIG.activeProfile} is not a declared profile`);
    assert.ok(INTENSITY_MULTIPLIERS[DEFAULT_CONFIG.intensity] !== undefined,
        `DEFAULT_CONFIG.intensity ${DEFAULT_CONFIG.intensity} is not a known intensity level`);
});

test("DEFAULT_CONFIG counter fields start at zero", () => {
    assert.equal(DEFAULT_CONFIG.totalEntriesGenerated, 0);
    assert.equal(DEFAULT_CONFIG.totalSessionsGenerated, 0);
    assert.equal(DEFAULT_CONFIG.lastRunTimestamp, 0);
    assert.equal(DEFAULT_CONFIG.lastRunAttempted, 0);
    assert.equal(DEFAULT_CONFIG.lastRunSucceeded, 0);
    assert.equal(DEFAULT_CONFIG.lastRunDurationMs, 0);
});

test("DEFAULT_CONFIG disables generation on fresh install", () => {
    // Sanity: a fresh-install user must explicitly opt in. Shipping
    // a default of enabled=true would mean every user starts polluting
    // without consent. Never change this without an onboarding flow.
    assert.equal(DEFAULT_CONFIG.enabled, false);
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
