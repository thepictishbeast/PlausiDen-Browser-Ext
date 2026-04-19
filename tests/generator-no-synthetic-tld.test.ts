/**
 * Property-style test (task #20): the shipping TypeScript generator
 * must NEVER emit a URL under an RFC 6761 reserved / synthetic TLD.
 *
 * Synthetic TLDs we refuse to ever ship:
 *   .example, .test, .invalid, .localhost
 *
 * Why: any of these in real user browsing history is a perfect
 * fingerprint — no legitimate site resolves there, so their
 * presence in `places.sqlite` / Chrome History identifies the
 * user as a PlausiDen installer (or someone running the same
 * generator). That defeats the Tier 0 plausible-deniability goal.
 *
 * This is NOT a classical property test (no fast-check in the dep
 * tree) — instead we sweep the full parameter space deterministically:
 * every profile × every intensity × 200 fresh batches = 2,400
 * generateBatch() calls, hashing every URL. If any hit a banned
 * TLD the test fails with the offending URL.
 *
 * Note on coverage: generator.ts uses Math.random() internally so we
 * cannot reseed for reproducibility — but 2,400 batches × avg ~15
 * entries = ~36k URLs per run gives strong practical coverage.
 * The wasm-engine Rust proptest covers the deterministic path with
 * ≥256 cases × 128 seeds (tracked in its own test file).
 *
 * Run with: npm run test
 */

import assert from "node:assert/strict";
import { generateBatch } from "../src/background/generator";
import { getProfile, getProfileKeys } from "../src/shared/profiles";
import type { IntensityLevel } from "../src/shared/types";

const BANNED_TLDS = [".example", ".test", ".invalid", ".localhost"];
const INTENSITIES: IntensityLevel[] = ["low", "medium", "high", "max"];
const BATCHES_PER_COMBO = 200;

function hasBannedTld(url: string): string | null {
    for (const tld of BANNED_TLDS) {
        // Match `<host>.example/`, `<host>.example:`, `<host>.example?`,
        // or `<host>.example` at end of URL. Do NOT substring-match the
        // path or query (e.g. "example.org/test" has .test in the path
        // but isn't a banned TLD).
        //
        // Structure of a normalized URL:
        //   scheme://host[:port]/path?query#fragment
        // The host component ends at the first `/`, `:`, `?`, `#`, or
        // end-of-string after `scheme://`.
        const idx = url.indexOf("://");
        if (idx < 0) continue;
        const afterScheme = url.slice(idx + 3);
        const hostEnd = afterScheme.search(/[\/:?#]/);
        const host = hostEnd < 0 ? afterScheme : afterScheme.slice(0, hostEnd);
        if (host.endsWith(tld)) return `host "${host}" ends with banned TLD "${tld}"`;
    }
    return null;
}

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

test("hasBannedTld correctly flags banned hosts", () => {
    assert.equal(hasBannedTld("https://example.com/"), null);  // .com, not .example
    assert.notEqual(hasBannedTld("https://foo.example/"), null);
    assert.notEqual(hasBannedTld("https://foo.example:8080/x"), null);
    assert.notEqual(hasBannedTld("https://bar.invalid?q=1"), null);
    assert.notEqual(hasBannedTld("https://baz.test#frag"), null);
    assert.notEqual(hasBannedTld("https://qux.localhost/path"), null);
    assert.equal(hasBannedTld("https://site.com/test"), null);  // .test in path
    assert.equal(hasBannedTld("https://site.com/invalid"), null);
    assert.equal(hasBannedTld("https://real-example-host.com/"), null);
});

for (const profileKey of getProfileKeys()) {
    for (const intensity of INTENSITIES) {
        test(`${profileKey} × ${intensity}: ${BATCHES_PER_COMBO} batches, no synthetic TLD in any URL`, () => {
            const profile = getProfile(profileKey);
            let totalUrls = 0;
            for (let i = 0; i < BATCHES_PER_COMBO; i++) {
                const now = Date.now() - i * 3_600_000;   // vary the base ts
                const sessions = generateBatch(profile, intensity, now);
                for (const session of sessions) {
                    for (const entry of session.entries) {
                        const finding = hasBannedTld(entry.url);
                        if (finding !== null) {
                            throw new Error(
                                `batch=${i}, profile=${profileKey}, intensity=${intensity}: ${finding}\nURL=${entry.url}`,
                            );
                        }
                        totalUrls++;
                    }
                }
            }
            // Sanity: make sure we actually exercised the generator.
            assert.ok(totalUrls > 0, "expected > 0 URLs exercised");
        });
    }
}

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
