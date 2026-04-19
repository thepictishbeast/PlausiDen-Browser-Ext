/**
 * Shared self-check types and pure helpers.
 *
 * Lives in `shared/` (not `background/`) so the popup can consume the
 * traffic-light mapping without pulling the service-worker's storage /
 * logging deps into its bundle. The background module `self-check.ts`
 * re-exports these; the popup imports directly.
 */

export type SelfCheckStatus =
    | "ok"              // probe succeeded end-to-end
    | "blocked"         // addUrl threw — policy interference
    | "silent_block"    // addUrl succeeded but getVisits returned empty
    | "cleanup_failed"  // probe succeeded but deleteUrl failed (stale entry left)
    | "pending"         // never run
    | "stale";          // last run > STALE_AFTER_MS ago

export interface SelfCheckState {
    status: SelfCheckStatus;
    /** Unix ms of the last completed probe. 0 if never. */
    lastRunAt: number;
    /** ms the probe took. 0 if not applicable. */
    lastDurationMs: number;
    /** Short diagnostic string for the popup / devtools. May be empty. */
    note: string;
    /** Lifetime count of probes attempted (all statuses). 0 if never run.
     *  Added 2026-04-18. Older persisted states default to 0 on read. */
    probesRun?: number;
    /** Lifetime count of probes that ended in "ok". Users / future
     *  dashboards can compute success ratio = probesSucceeded / probesRun.
     *  Added 2026-04-18. */
    probesSucceeded?: number;
}

/** Success ratio as a percentage 0-100, or null if no probes have
 *  run. Pure helper — safe to call from any context. */
export function selfCheckSuccessPct(state: SelfCheckState): number | null {
    const run = state.probesRun ?? 0;
    if (run === 0) return null;
    const ok = state.probesSucceeded ?? 0;
    return Math.round((ok / run) * 100);
}

/** Map a self-check status to a traffic-light color. Pure function —
 *  safe to call from popup, options, or background without side-effects. */
export function statusToTrafficLight(
    status: SelfCheckStatus,
): "ok" | "warn" | "err" {
    switch (status) {
        case "ok":
            return "ok";
        case "pending":
        case "stale":
        case "cleanup_failed":
            return "warn";
        case "blocked":
        case "silent_block":
            return "err";
    }
}

/** Human-readable label for the status; used in popup / options tooltips. */
export function statusLabelFor(status: SelfCheckStatus): string {
    switch (status) {
        case "ok":
            return "Protection active";
        case "pending":
            return "Starting up…";
        case "stale":
            return "Waiting for next self-check";
        case "cleanup_failed":
            return "Self-check cleanup failed";
        case "blocked":
            return "Interference detected";
        case "silent_block":
            return "Silent interference";
    }
}
