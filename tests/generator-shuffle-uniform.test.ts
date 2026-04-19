/**
 * Distribution test for generator.ts::pickRandomN.
 *
 * Proves empirically that the Fisher-Yates implementation is
 * uniformly distributed. The previous `sort(() => Math.random() -
 * 0.5)` version had measurable bias — this test would have caught it
 * with the tolerance below. If someone regresses the shuffle back to
 * a comparator-based approach, the uniformity assertion fails.
 *
 * Methodology:
 *   1. For each N in {1, 2, 4, 8}: run pickRandomN(source, N) many
 *      times against a fixed 16-element source, counting how often
 *      each source element ends up in the result.
 *   2. Each element should appear in the result roughly N/16 of
 *      trials. We assert each count stays within ±20% of expected.
 *      (20% is loose enough that transient noise from Math.random()
 *      doesn't produce flaky failures at 10k trials; tight enough
 *      that the old `sort`-based bias would blow through.)
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import { pickRandomN } from "../src/background/generator";

const SOURCE_LEN = 16;
const TRIALS = 10_000;
const TOLERANCE = 0.2;

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

function distribution(n: number): number[] {
    const source = Array.from({ length: SOURCE_LEN }, (_, i) => i);
    const counts = new Array<number>(SOURCE_LEN).fill(0);
    for (let t = 0; t < TRIALS; t++) {
        const picked = pickRandomN(source, n);
        for (const v of picked) counts[v]++;
    }
    return counts;
}

function assertUniform(n: number, counts: number[]): void {
    const expected = (TRIALS * n) / SOURCE_LEN;
    const lo = expected * (1 - TOLERANCE);
    const hi = expected * (1 + TOLERANCE);
    for (let i = 0; i < counts.length; i++) {
        assert.ok(
            counts[i] >= lo && counts[i] <= hi,
            `bucket ${i} count ${counts[i]} outside [${lo}, ${hi}] for n=${n}. ` +
                `Distribution is biased — shuffle regressed.`,
        );
    }
}

test("edge cases: n=0 returns empty, n>len returns full shuffle", () => {
    const source = [1, 2, 3];
    assert.deepEqual(pickRandomN(source, 0), []);
    assert.deepEqual(pickRandomN(source, -1), []);
    const all = pickRandomN(source, 99);
    assert.equal(all.length, source.length);
    assert.deepEqual(all.slice().sort(), [1, 2, 3]);
});

test("never repeats an element within a single pick", () => {
    const source = Array.from({ length: 10 }, (_, i) => i);
    for (let t = 0; t < 1000; t++) {
        const picked = pickRandomN(source, 5);
        const uniq = new Set(picked);
        assert.equal(
            uniq.size,
            picked.length,
            `duplicate element within pick: ${JSON.stringify(picked)}`,
        );
    }
});

for (const n of [1, 2, 4, 8]) {
    test(`n=${n}: each source element appears ~${((n / SOURCE_LEN) * 100).toFixed(1)}% of ${TRIALS} trials (±${TOLERANCE * 100}%)`, () => {
        const counts = distribution(n);
        assertUniform(n, counts);
    });
}

test("does not mutate the input array", () => {
    const source = [1, 2, 3, 4, 5];
    const before = source.slice();
    for (let t = 0; t < 500; t++) pickRandomN(source, 3);
    assert.deepEqual(source, before);
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
