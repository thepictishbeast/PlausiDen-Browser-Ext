/**
 * PlausiDen Browser Extension — Self-Check monitor.
 *
 * Purpose (v1.1 §10.1): periodically verify that the extension's own
 * primitives are functional. If a browser policy, antivirus, or
 * managed-device controller blocks `chrome.history.addUrl()` or
 * `chrome.cookies.set()`, the extension still "runs" but silently
 * writes nothing. Users who don't notice are left believing they're
 * protected when they aren't. Self-check catches that by doing a
 * dry-run probe and storing the result for the popup to surface as a
 * red traffic-light state.
 *
 * Status as of 2026-04-17 (task #33 scaffold tick): module defined
 * with runProbe + readState + PROBE_INTERVAL_MS. The alarm that fires
 * runProbe at PROBE_INTERVAL_MS cadence, the service-worker wiring,
 * and the popup consumption all land in a follow-on tick.
 *
 * PROBE DESIGN:
 *   1. Generate a synthetic URL guaranteed not to collide with
 *      organic browsing (under a reserved subdomain of a domain we
 *      don't inject into — here we use `self-check.plausiden.invalid`
 *      which is NEVER a real URL per RFC 6761). Timestamp in the
 *      fragment so we can distinguish probes across runs.
 *
 *      NOTE the `.invalid` TLD here is acceptable ONLY because:
 *      (a) the probe URL is immediately deleted after the check and
 *          never persists into the real history consumers see;
 *      (b) `.invalid` is RFC 6761 reserved — guaranteed not to be a
 *          real browsing leak if the delete somehow fails;
 *      (c) the audit-runner's synthetic-TLD rule excludes the
 *          self-check module by path (future audit-rule refinement
 *          task, not blocking).
 *
 *   2. chrome.history.addUrl(probeUrl) — expected to succeed.
 *   3. chrome.history.getVisits({url: probeUrl}) — expect 1+ entry.
 *   4. chrome.history.deleteUrl({url: probeUrl}) — clean up.
 *   5. Record the probe's success, latency, and any errors encountered
 *      into chrome.storage.local via log.ts + a dedicated
 *      SELF_CHECK_STATE key.
 *
 * INTERPRETATION:
 *   - addUrl throws → interference (browser policy blocked write).
 *   - addUrl succeeds but getVisits returns nothing → silent block
 *     (policy accepts the call but doesn't persist it).
 *   - Normal success → self-check `ok`.
 *   - Probe interval missed (no run in > 2x expected) → `stale`.
 */

import { logError, logWarn, logInfo } from "../shared/log";
import type { SelfCheckState } from "../shared/self-check-types";
export type { SelfCheckState, SelfCheckStatus } from "../shared/self-check-types";
export { statusToTrafficLight, statusLabelFor } from "../shared/self-check-types";

/** How often to run a probe. 30 min default; adjust via options page. */
export const PROBE_INTERVAL_MS = 30 * 60 * 1000;
/** If the last probe is older than this, we treat state as stale. */
export const STALE_AFTER_MS = PROBE_INTERVAL_MS * 2.5;

const STORAGE_KEY = "plausiden_self_check";
/** Reserved RFC-6761 TLD; never a real URL. */
const PROBE_HOST = "self-check.plausiden.invalid"; // LEAK-JUSTIFIED: RFC 6761 reserved TLD; probe URL added + immediately deleteUrl'd in a bounded round-trip (see §4.5 OPSEC.md)

const INITIAL_STATE: SelfCheckState = {
    status: "pending",
    lastRunAt: 0,
    lastDurationMs: 0,
    note: "",
};

// ---- State persistence -----------------------------------------------------

export async function readState(): Promise<SelfCheckState> {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
        return { ...INITIAL_STATE };
    }
    return new Promise((resolve) => {
        chrome.storage.local.get(STORAGE_KEY, (result: Record<string, unknown>) => {
            const stored = result[STORAGE_KEY] as SelfCheckState | undefined;
            if (!stored) {
                resolve({ ...INITIAL_STATE });
                return;
            }
            // Downgrade to "stale" if the persisted state is old, without
            // mutating the stored record — UI can decide to re-probe.
            const age = Date.now() - (stored.lastRunAt || 0);
            if (stored.lastRunAt > 0 && age > STALE_AFTER_MS) {
                resolve({ ...stored, status: "stale" });
                return;
            }
            resolve(stored);
        });
    });
}

async function writeState(s: SelfCheckState): Promise<void> {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: s }, () => resolve());
    });
}

// ---- The probe -------------------------------------------------------------

function buildProbeUrl(): string {
    // Fragment-encoded timestamp so each probe is unique; host is the
    // RFC-6761 reserved .invalid TLD that will never resolve.
    return `https://${PROBE_HOST}/probe#t=${Date.now()}`;
}

/** Merge lifetime counters from the previous persisted state onto a
 *  freshly-computed per-run state. Centralizing this keeps every
 *  return path in runProbe consistent — forgetting to bump in a new
 *  branch would silently flatten the ratio. */
function withCounters(
    base: SelfCheckState,
    didSucceed: boolean,
    prev: SelfCheckState,
): SelfCheckState {
    return {
        ...base,
        probesRun: (prev.probesRun ?? 0) + 1,
        probesSucceeded: (prev.probesSucceeded ?? 0) + (didSucceed ? 1 : 0),
    };
}

/**
 * Run one self-check probe. Writes state and returns it. Non-throwing —
 * any error is captured into the state's status + note fields.
 */
export async function runProbe(): Promise<SelfCheckState> {
    const started = Date.now();
    const probeUrl = buildProbeUrl();
    // Snapshot the previous state so we can carry the lifetime counters
    // forward. A read+bump+write race is tolerable here: probes fire on
    // a 30-min cadence + user-triggered from the options page, so the
    // worst case is one undercounted probe when the user clicks "Check
    // now" while the alarm also fires. Not worth adding a lock.
    const prev = await readState();

    try {
        // 1. Inject
        try {
            await chrome.history.addUrl({ url: probeUrl });
        } catch (e) {
            const s = withCounters({
                status: "blocked",
                lastRunAt: Date.now(),
                lastDurationMs: Date.now() - started,
                note: "chrome.history.addUrl threw — browser policy likely blocking writes",
            }, false, prev);
            await writeState(s);
            await logError("self-check", e);
            return s;
        }

        // 2. Read back
        let visits: chrome.history.VisitItem[] = [];
        try {
            visits = await chrome.history.getVisits({ url: probeUrl });
        } catch (e) {
            const s = withCounters({
                status: "blocked",
                lastRunAt: Date.now(),
                lastDurationMs: Date.now() - started,
                note: "getVisits failed — history read blocked",
            }, false, prev);
            await writeState(s);
            await logError("self-check", e);
            return s;
        }

        if (visits.length === 0) {
            // addUrl accepted the call but the entry never landed — the
            // textbook silent-block signature.
            const s = withCounters({
                status: "silent_block",
                lastRunAt: Date.now(),
                lastDurationMs: Date.now() - started,
                note: "addUrl accepted but getVisits returned empty — silent filter",
            }, false, prev);
            await writeState(s);
            await logWarn("self-check", s.note);
            return s;
        }

        // 3. Clean up — never leave the probe URL behind
        try {
            await chrome.history.deleteUrl({ url: probeUrl });
        } catch (e) {
            // cleanup_failed counts as "not ok" — the forensic fingerprint
            // outcome (stale probe URL left behind) is a failure mode,
            // even though addUrl/getVisits worked.
            const s = withCounters({
                status: "cleanup_failed",
                lastRunAt: Date.now(),
                lastDurationMs: Date.now() - started,
                note: "probe succeeded but deleteUrl failed — stale probe entry left in history",
            }, false, prev);
            await writeState(s);
            await logWarn("self-check", s.note);
            await logError("self-check-cleanup", e);
            return s;
        }

        // Happy path
        const s = withCounters({
            status: "ok",
            lastRunAt: Date.now(),
            lastDurationMs: Date.now() - started,
            note: "",
        }, true, prev);
        await writeState(s);
        await logInfo("self-check", `ok (${s.lastDurationMs}ms)`);
        return s;
    } catch (e) {
        // Catch-all: something unexpected. Record as blocked conservatively.
        const s = withCounters({
            status: "blocked",
            lastRunAt: Date.now(),
            lastDurationMs: Date.now() - started,
            note: "unexpected exception during probe",
        }, false, prev);
        await writeState(s);
        await logError("self-check-unexpected", e);
        return s;
    }
}

