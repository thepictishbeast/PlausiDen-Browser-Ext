/**
 * PlausiDen Browser Extension - History & Cookie Injector
 *
 * Injects generated browsing artifacts into the browser's internal
 * data stores using the WebExtension APIs.
 *
 * IMPORTANT LIMITATIONS:
 * -----------------------------------------------------------------------
 * chrome.history.addUrl() ONLY adds entries to the browser's internal
 * history database. It does NOT:
 *
 * - Generate any HTTP network traffic
 * - Trigger DNS lookups
 * - Create DOM rendering or page load events
 * - Populate the browser cache (disk or memory)
 * - Generate network-level artifacts (pcap, proxy logs, ISP logs)
 * - Create favicon database entries
 * - Trigger content scripts or page-level JavaScript
 * - Populate the "Visited" CSS pseudo-class for link styling
 * - Generate Web Vitals or performance timing entries
 *
 * This means Tier 0 protection is effective against:
 * - Casual inspection of browser history UI
 * - history.db / places.sqlite forensic reads
 * - Cookie store inspection
 * - Browser sync services (if enabled, history syncs to cloud)
 *
 * It is NOT effective against:
 * - Network traffic analysis (ISP, firewall, proxy logs)
 * - DNS query logs
 * - Browser cache forensics
 * - Memory forensics during active browsing
 * - Sophisticated browser forensic tools that cross-reference
 *   history entries against cache/favicon/session data
 *
 * For deeper protection, use PlausiDen-Inject (Tier 2) or the
 * eventual PlausiDenOS translator interposition (Tier 3).
 * -----------------------------------------------------------------------
 */

import { BrowsingSession } from "../shared/types";
import { logWarn } from "../shared/log";

/** RFC 6761 reserved / synthetic TLDs. A URL under any of these is
 *  a PERFECT fingerprint in a real user's history — no legitimate
 *  site resolves there, so their presence identifies the user as a
 *  PlausiDen installer. We enforce this at the inject boundary as
 *  a defense-in-depth layer: the generator and wasm-engine both
 *  have tests asserting the invariant, and this filter makes the
 *  guarantee hold even if a future generator change regresses.
 *
 *  SECURITY: matched against the HOST portion only — `.test` in
 *  path segments is not a leak. Substring matching would false-
 *  positive on legitimate hosts like `testing-library.com`.
 *
 *  Keep in sync with tests/generator-no-synthetic-tld.test.ts and
 *  the Rust proptest in wasm-engine/tests/property.rs. */
const BANNED_TLDS: readonly string[] = [
  ".example",   // LEAK-JUSTIFIED: banned-TLD filter list, not a URL
  ".test",      // LEAK-JUSTIFIED: banned-TLD filter list, not a URL
  ".invalid",   // LEAK-JUSTIFIED: banned-TLD filter list, not a URL
  ".localhost", // LEAK-JUSTIFIED: banned-TLD filter list, not a URL
];

/** Return the offending TLD if `url`'s host ends with one of the
 *  banned suffixes, else null. Exported for unit tests. */
export function bannedTldFor(url: string): string | null {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return null;
  const afterScheme = url.slice(schemeIdx + 3);
  const hostEnd = afterScheme.search(/[\/:?#]/);
  const host = hostEnd < 0 ? afterScheme : afterScheme.slice(0, hostEnd);
  for (const tld of BANNED_TLDS) {
    if (host.endsWith(tld)) return tld;
  }
  return null;
}

/**
 * Inject a complete browsing session into browser history and cookies.
 *
 * @param session - Generated browsing session to inject
 * @param injectCookies - Whether to also inject cookies (from config)
 * @returns Number of entries successfully injected
 */
export async function injectSession(
  session: BrowsingSession,
  injectCookies: boolean
): Promise<{ injectedEntries: number; injectedCookies: number }> {
  let injectedEntries = 0;
  let injectedCookies = 0;

  // Inject history entries
  for (const entry of session.entries) {
    // SECURITY: reject banned synthetic TLDs at the inject boundary.
    // This is the last line of defense between a (hypothetical buggy)
    // generator and the browser's real history store. If this check
    // ever fires, it's a P0 bug in the generator — logged to the
    // bounded ring-buffer so the popup / self-check can surface it.
    const banned = bannedTldFor(entry.url);
    if (banned !== null) {
      await logWarn(
        "inject",
        `DROPPED entry — banned TLD "${banned}" in host; generator regression suspected`,
      );
      continue;
    }
    try {
      await chrome.history.addUrl({
        url: entry.url,
      });

      // If we can also set the visit time, do so via the visits API.
      // Note: chrome.history.addUrl sets the visit time to "now" by
      // default. We rely on our scheduler running at organic times
      // so the timestamps are naturally correct.
      injectedEntries++;
    } catch (_e) {
      // Silently skip entries that fail (e.g., invalid URLs)
    }
  }

  // Inject cookies if enabled
  if (injectCookies) {
    for (const cookie of session.cookies) {
      try {
        await chrome.cookies.set({
          url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          expirationDate: cookie.expirationDate,
        });
        injectedCookies++;
      } catch (_e) {
        // Silently skip cookies that fail (e.g., blocked domains)
      }
    }
  }

  return { injectedEntries, injectedCookies };
}

/**
 * Inject multiple sessions.
 */
export async function injectSessions(
  sessions: BrowsingSession[],
  injectCookies: boolean
): Promise<{ totalEntries: number; totalCookies: number }> {
  let totalEntries = 0;
  let totalCookies = 0;

  for (const session of sessions) {
    const result = await injectSession(session, injectCookies);
    totalEntries += result.injectedEntries;
    totalCookies += result.injectedCookies;
  }

  return { totalEntries, totalCookies };
}
