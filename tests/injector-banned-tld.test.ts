/**
 * Unit test for the inject-boundary filter added to injector.ts.
 *
 * The `bannedTldFor` helper is the pure-function half of the belt-
 * and-braces filter that refuses to call `chrome.history.addUrl()`
 * with a banned synthetic TLD. These cases cover common patterns +
 * edge cases we want pinned (path / query / port do NOT leak; host
 * suffix match IS a leak).
 *
 * Run: npm run test
 */
import assert from "node:assert/strict";
import { bannedTldFor } from "../src/background/injector";

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

test("returns null for legitimate TLDs", () => {
    assert.equal(bannedTldFor("https://example.com/"), null);
    assert.equal(bannedTldFor("https://news.bbc.co.uk/article"), null);
    assert.equal(bannedTldFor("https://testing-library.com/docs"), null);
    assert.equal(bannedTldFor("https://real-site.org:8443/invalid"), null);
});

test("flags .example / .test / .invalid / .localhost host suffixes", () => {
    assert.equal(bannedTldFor("https://foo.example/"), ".example");
    assert.equal(bannedTldFor("https://bar.test"), ".test");
    assert.equal(bannedTldFor("https://baz.invalid?q=1"), ".invalid");
    assert.equal(bannedTldFor("https://qux.localhost:8080/path"), ".localhost");
});

test("does NOT flag banned substrings in path / query / fragment", () => {
    assert.equal(bannedTldFor("https://real.com/test"), null);
    assert.equal(bannedTldFor("https://real.com/path?q=.invalid"), null);
    assert.equal(bannedTldFor("https://real.com/api#.localhost"), null);
    assert.equal(bannedTldFor("https://real.com/example-docs"), null);
});

test("returns null for malformed URLs", () => {
    assert.equal(bannedTldFor(""), null);
    assert.equal(bannedTldFor("not-a-url"), null);
    assert.equal(bannedTldFor("/relative/path"), null);
});

test("handles subdomains correctly", () => {
    assert.equal(bannedTldFor("https://a.b.c.example/"), ".example");
    assert.equal(bannedTldFor("https://my.real-example.com/"), null);
});

test("handles URL with port + query + fragment", () => {
    assert.equal(
        bannedTldFor("https://user.invalid:8080/api/v1?token=abc#frag"),
        ".invalid",
    );
});

console.log();
if (failed === 0) {
    console.log(`==> OK: ${passed} tests passed`);
    process.exit(0);
} else {
    console.error(`==> FAIL: ${failed} failed, ${passed} passed`);
    process.exit(1);
}
