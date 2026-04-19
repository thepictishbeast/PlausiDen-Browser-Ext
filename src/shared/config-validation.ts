/**
 * PlausiDen Browser Extension — Config update sanitizer.
 *
 * Why: the UPDATE_CONFIG message handler accepts a payload from whichever
 * chrome-runtime sender is connected. The popup is the normal sender, but
 * a compromised page or a rogue extension with overlapping privileges could
 * in principle send a crafted message. Spreading an unvalidated object
 * directly into persisted config opens a path to (a) store garbage that
 * breaks the generator, (b) silently flip `enabled` via a typo
 * (`eneabled: true`) and leave the user thinking they're paused,
 * (c) write fields the caller should never be allowed to set (the
 * generation counters).
 *
 * SECURITY: input validation at the public API surface. See AVP-2 Tier 1
 * (type tightening, boundary sweep) and audit `leak` / `broken` rules.
 *
 * Fields allowed in an UPDATE_CONFIG payload:
 *   enabled, activeProfile, intensity, generateCookies,
 *   customActiveHours, customDailyEntries, customCategories
 *
 * Fields NOT allowed (only internal code may write these):
 *   lastRunTimestamp, totalEntriesGenerated, totalSessionsGenerated
 *
 * Unknown keys are silently dropped. Malformed values for known keys are
 * also dropped (not persisted), so a single bad field never blocks a
 * batch of good fields.
 */

import {
    ExtensionConfig,
    IntensityLevel,
    BrowsingCategory,
    ActiveHours,
    DEFAULT_CONFIG,
} from "./types";
import { getProfileKeys } from "./profiles";

const VALID_INTENSITIES: IntensityLevel[] = ["low", "medium", "high", "max"];

const VALID_CATEGORIES: readonly BrowsingCategory[] = [
    "news", "social", "shopping", "entertainment", "weather",
    "academic", "documentation", "reference", "government", "legal",
    "finance", "health", "technology", "sports", "travel", "food",
] as const;

/** Maximum value we'll accept for custom daily entries. A real user
 *  browsing ~50-200 URLs/day; anything above 10k is either absurd or an
 *  attack. Clamps here before persistence. */
const MAX_CUSTOM_DAILY_ENTRIES = 10_000;

/** Upper cap on the lifetime counters (totalEntriesGenerated /
 *  totalSessionsGenerated). At the high end of profile intensities a user
 *  might accumulate ~200/day × 365 × 30 years ≈ 2.2M entries — so 1 billion
 *  is comfortable headroom while still rejecting MAX_SAFE_INTEGER-class
 *  garbage that a corrupted storage record could plant. */
const MAX_LIFETIME_COUNTER = 1_000_000_000;

/** Validate and coerce a raw payload into a safe Partial<ExtensionConfig>.
 *
 *  Always returns a fresh object — never reuses the caller's input. Missing
 *  or malformed fields are silently dropped (do not throw — a crafted
 *  payload must not be able to crash the service worker). */
export function sanitizeConfigUpdate(raw: unknown): Partial<ExtensionConfig> {
    const out: Partial<ExtensionConfig> = {};

    if (raw === null || typeof raw !== "object") return out;
    const obj = raw as Record<string, unknown>;

    if (typeof obj.enabled === "boolean") {
        out.enabled = obj.enabled;
    }

    if (typeof obj.activeProfile === "string" &&
        getProfileKeys().includes(obj.activeProfile)) {
        out.activeProfile = obj.activeProfile;
    }

    if (typeof obj.intensity === "string" &&
        (VALID_INTENSITIES as string[]).includes(obj.intensity)) {
        out.intensity = obj.intensity as IntensityLevel;
    }

    if (typeof obj.generateCookies === "boolean") {
        out.generateCookies = obj.generateCookies;
    }

    // customActiveHours: null (use profile default) or {start:0..23, end:1..24, start<end}.
    if (obj.customActiveHours === null) {
        out.customActiveHours = null;
    } else if (typeof obj.customActiveHours === "object" && obj.customActiveHours !== null) {
        const h = obj.customActiveHours as Record<string, unknown>;
        if (typeof h.start === "number" && typeof h.end === "number" &&
            Number.isFinite(h.start) && Number.isFinite(h.end) &&
            h.start >= 0 && h.start <= 23 &&
            h.end >= 1 && h.end <= 24 &&
            h.start < h.end) {
            const validated: ActiveHours = { start: h.start, end: h.end };
            out.customActiveHours = validated;
        }
    }

    // customDailyEntries: null (use profile default) or a non-negative integer
    // within MAX_CUSTOM_DAILY_ENTRIES.
    if (obj.customDailyEntries === null) {
        out.customDailyEntries = null;
    } else if (typeof obj.customDailyEntries === "number" &&
               Number.isFinite(obj.customDailyEntries) &&
               Number.isInteger(obj.customDailyEntries) &&
               obj.customDailyEntries >= 0 &&
               obj.customDailyEntries <= MAX_CUSTOM_DAILY_ENTRIES) {
        out.customDailyEntries = obj.customDailyEntries;
    }

    // customCategories: null (use profile default) or a non-empty array of known categories.
    // Unknown categories are filtered out; if the filtered array is empty we reject the
    // whole field rather than silently emptying it.
    if (obj.customCategories === null) {
        out.customCategories = null;
    } else if (Array.isArray(obj.customCategories)) {
        const filtered = obj.customCategories.filter(
            (c: unknown): c is BrowsingCategory =>
                typeof c === "string" && (VALID_CATEGORIES as readonly string[]).includes(c),
        );
        if (filtered.length > 0 && filtered.length <= VALID_CATEGORIES.length) {
            out.customCategories = filtered;
        }
    }

    // Generation counters and lastRunTimestamp are deliberately NOT copied
    // from the payload — those are written by the generator pipeline only.
    // A crafted payload trying to reset totals or backdate lastRunTimestamp
    // is silently ignored.

    return out;
}

/** Validate a value read back from storage into a complete ExtensionConfig.
 *
 *  Unlike sanitizeConfigUpdate (used for untrusted runtime messages), this
 *  runs on the config we ourselves persisted — it still validates every
 *  field in case storage was corrupted, manually edited, or migrated from
 *  an incompatible schema version. Missing or malformed fields fall back
 *  to DEFAULT_CONFIG rather than being dropped.
 *
 *  Generation counters ARE copied through here (unlike sanitizeConfigUpdate)
 *  because they are legitimately written by the service-worker pipeline
 *  via recordGeneration — they belong on the persisted side.
 *
 *  SECURITY: bounded deserialization at the storage boundary. If a future
 *  schema bump or a compromised extension environment plants garbage in
 *  chrome.storage.local, this stops that garbage from turning into type-
 *  unsafe ExtensionConfig flowing into the generator, scheduler, or popup.
 */
export function sanitizeStoredConfig(raw: unknown): ExtensionConfig {
    // Start with the update-sanitizer path for the user-settable fields…
    const fromUser = sanitizeConfigUpdate(raw);

    // …then add the pipeline-only fields with bounds.
    const out: ExtensionConfig = { ...DEFAULT_CONFIG, ...fromUser };

    if (raw === null || typeof raw !== "object") return out;
    const obj = raw as Record<string, unknown>;

    if (typeof obj.lastRunTimestamp === "number" &&
        Number.isFinite(obj.lastRunTimestamp) &&
        obj.lastRunTimestamp >= 0) {
        out.lastRunTimestamp = obj.lastRunTimestamp;
    }
    if (typeof obj.lastRunDurationMs === "number" &&
        Number.isFinite(obj.lastRunDurationMs) &&
        obj.lastRunDurationMs >= 0 &&
        obj.lastRunDurationMs < 24 * 60 * 60 * 1000) {  // sanity cap: 24h
        out.lastRunDurationMs = obj.lastRunDurationMs;
    }
    if (typeof obj.lastRunAttempted === "number" &&
        Number.isFinite(obj.lastRunAttempted) &&
        Number.isInteger(obj.lastRunAttempted) &&
        obj.lastRunAttempted >= 0 &&
        obj.lastRunAttempted <= 10_000_000) {
        out.lastRunAttempted = obj.lastRunAttempted;
    }
    if (typeof obj.lastRunSucceeded === "number" &&
        Number.isFinite(obj.lastRunSucceeded) &&
        Number.isInteger(obj.lastRunSucceeded) &&
        obj.lastRunSucceeded >= 0 &&
        obj.lastRunSucceeded <= 10_000_000) {
        out.lastRunSucceeded = obj.lastRunSucceeded;
    }
    if (typeof obj.totalEntriesGenerated === "number" &&
        Number.isFinite(obj.totalEntriesGenerated) &&
        Number.isInteger(obj.totalEntriesGenerated) &&
        obj.totalEntriesGenerated >= 0 &&
        obj.totalEntriesGenerated <= MAX_LIFETIME_COUNTER) {
        out.totalEntriesGenerated = obj.totalEntriesGenerated;
    }
    if (typeof obj.totalSessionsGenerated === "number" &&
        Number.isFinite(obj.totalSessionsGenerated) &&
        Number.isInteger(obj.totalSessionsGenerated) &&
        obj.totalSessionsGenerated >= 0 &&
        obj.totalSessionsGenerated <= MAX_LIFETIME_COUNTER) {
        out.totalSessionsGenerated = obj.totalSessionsGenerated;
    }

    // Cross-field invariant: succeeded cannot exceed attempted. Corrupt if so —
    // reset the pair to zero rather than show misleading ratios.
    if (out.lastRunSucceeded > out.lastRunAttempted) {
        out.lastRunAttempted = 0;
        out.lastRunSucceeded = 0;
    }

    return out;
}
