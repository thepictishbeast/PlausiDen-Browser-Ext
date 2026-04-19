/**
 * PlausiDen Browser Extension — Popup UI
 *
 * Surfaces current protection status as a traffic-light indicator plus
 * activity stats. Three-state indicator per v1.1 §10.1:
 *   - ok   (green): generation enabled, alarm scheduled, last run recent
 *   - warn (amber): paused, or last run > 4h ago, or scheduled delay unusual
 *   - err  (red):   ≥20% of the last batch's addUrl calls failed (interference)
 *
 * Refreshes every 5 s while the popup is open so the user sees live state.
 */

import { ActivityStats, isExtErrorResponse } from "../shared/types";
import {
    SelfCheckState,
    statusToTrafficLight,
    selfCheckSuccessPct,
} from "../shared/self-check-types";

// ---- DOM handles ----------------------------------------------------------
const statusBar     = document.getElementById("status-bar")     as HTMLDivElement;
const trafficLight  = document.getElementById("traffic-light")  as HTMLSpanElement;
const statusText    = document.getElementById("status-text")    as HTMLSpanElement;
const profileName   = document.getElementById("profile-name")   as HTMLElement;
const entriesToday  = document.getElementById("entries-today")  as HTMLElement;
const sessionsToday = document.getElementById("sessions-today") as HTMLElement;
const totalEntries  = document.getElementById("total-entries")  as HTMLElement;
const nextRun       = document.getElementById("next-run")       as HTMLElement;
const lastRunInfo   = document.getElementById("last-run-info")  as HTMLElement;
const toggleBtn     = document.getElementById("toggle-btn")     as HTMLButtonElement;
const generateBtn   = document.getElementById("generate-btn")   as HTMLButtonElement;
const feedback      = document.getElementById("feedback")       as HTMLDivElement;
const optionsLink   = document.getElementById("options-link")   as HTMLAnchorElement;
const welcome       = document.getElementById("welcome")        as HTMLDivElement;

const REFRESH_INTERVAL_MS = 5000;
const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // 4h
/** How long the "click again to confirm" window stays open before
 *  reverting to the normal Pause label. Short enough that an accidental
 *  first click doesn't linger as a primed trigger; long enough that a
 *  deliberate second click is comfortable. */
const PAUSE_CONFIRM_WINDOW_MS = 4000;

// Primed-to-confirm state for the Pause button. Reset by a second click
// (which performs the pause) or by the timeout (which reverts the
// label). Enable never requires confirmation — resuming protection is
// always safe.
let pauseConfirmTimer: number | null = null;

type TrafficState = "ok" | "warn" | "err";

// ---- Helpers --------------------------------------------------------------

function sendMessage(type: string, payload?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (response: unknown) => {
            if (isExtErrorResponse(response)) {
                // Why: silently dropping errors means users can't tell when
                // something's wrong. Show the user-facing copy; the technical
                // cause stays in the response object for devtools only.
                showFeedback(response.userMessage, "err");
                resolve(null);
                return;
            }
            resolve(response);
        });
    });
}

function formatNumber(n: number): string {
    if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 1_000)  return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
}

function formatTimeUntil(timestamp: number | null): string {
    if (!timestamp) return "—";
    const diff = timestamp - Date.now();
    if (diff <= 0) return "now";
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatLastRun(
    durationMs: number,
    ratio: { attempted: number; succeeded: number },
): string {
    // Why: zero attempted means the scheduler hasn't fired yet — different
    // from "ran but all failed" (attempted > 0, succeeded = 0). The ratio
    // is how self-check will distinguish them.
    if (ratio.attempted === 0) return "—";
    const dur =
        durationMs < 1000
            ? `${durationMs}ms`
            : `${(durationMs / 1000).toFixed(1)}s`;
    const pct = Math.round((ratio.succeeded / ratio.attempted) * 100);
    return `${dur} · ${pct}% landed`;
}

function showFeedback(text: string, tone: "ok" | "err" = "ok"): void {
    feedback.textContent = text;
    feedback.classList.remove("feedback--err");
    if (tone === "err") {
        feedback.classList.add("feedback--err");
    }
    feedback.hidden = false;
    // Errors stay longer — users need time to read and act.
    const dismissAfter = tone === "err" ? 6000 : 3000;
    setTimeout(() => { feedback.hidden = true; }, dismissAfter);
}

// ---- Traffic-light state derivation ---------------------------------------

// Precedence: an active interference signal from the self-check probe
// outranks liveness heuristics. "Paused" outranks "interference" — if the
// user explicitly paused, the red light would be misleading. Self-check
// can still surface its note via the status text.
function deriveTrafficState(
    stats: ActivityStats,
    lastRunTimestamp: number | null,
    selfCheck: SelfCheckState | null,
): TrafficState {
    if (!stats.isActive) return "warn";

    if (selfCheck) {
        const light = statusToTrafficLight(selfCheck.status);
        if (light === "err") return "err";
        // `warn` from self-check only overrides a would-be `ok`: if the
        // normal heuristics already say warn, no change; if they say ok
        // but the probe says warn (pending / stale / cleanup_failed),
        // downgrade to warn.
        if (light === "warn") {
            // Fall through — the remaining logic decides ok vs warn.
        }
    }

    if (lastRunTimestamp === null || lastRunTimestamp === 0) {
        return "warn";
    }
    const age = Date.now() - lastRunTimestamp;
    if (age > STALE_AFTER_MS) return "warn";

    if (selfCheck && statusToTrafficLight(selfCheck.status) === "warn") {
        return "warn";
    }
    return "ok";
}

function statusLabel(
    state: TrafficState,
    isActive: boolean,
    selfCheck: SelfCheckState | null,
): string {
    if (state === "err") {
        // Prefer the self-check's specific reason so the user knows
        // whether it's an outright block or a silent filter.
        if (selfCheck?.status === "blocked") return "Interference detected";
        if (selfCheck?.status === "silent_block") return "Silent interference";
        return "Interference detected";
    }
    if (state === "ok") return "Protection active";
    return isActive ? "Starting up…" : "Paused";
}

// ---- UI update ------------------------------------------------------------

function updateUI(
    stats: ActivityStats,
    lastRunTimestamp: number | null,
    selfCheck: SelfCheckState | null,
): void {
    const state = deriveTrafficState(stats, lastRunTimestamp, selfCheck);

    statusBar.classList.remove("is-ok", "is-warn", "is-err");
    statusBar.classList.add(`is-${state}`);
    trafficLight.setAttribute("data-state", state);
    statusText.textContent = statusLabel(state, stats.isActive, selfCheck);

    // Compose the tooltip: self-check note (if any) + lifetime success
    // ratio once we have enough probes to mean anything. A single
    // sample doesn't prove reliability, so gate on probesRun >= 3 —
    // the first few probes on a fresh install skew the ratio and
    // "100% over 1 probe" is misleading.
    const pct = selfCheck ? selfCheckSuccessPct(selfCheck) : null;
    const ratioSuffix =
        pct !== null && (selfCheck?.probesRun ?? 0) >= 3
            ? ` \u00b7 ${pct}% ok over ${selfCheck!.probesRun} probes`
            : "";
    const tooltipParts = [selfCheck?.note, ratioSuffix.trim().replace(/^· /, "")]
        .filter((p): p is string => Boolean(p && p.length > 0));
    const tooltip = tooltipParts.join(" \u00b7 ");

    if (tooltip) {
        trafficLight.setAttribute("title", tooltip);
        trafficLight.setAttribute(
            "aria-label",
            `${statusText.textContent ?? ""}: ${tooltip}`,
        );
    } else {
        trafficLight.removeAttribute("title");
        trafficLight.setAttribute("aria-label", statusText.textContent ?? "");
    }

    if (stats.isActive) {
        toggleBtn.textContent = "Pause";
        toggleBtn.classList.add("is-running");
        toggleBtn.setAttribute("aria-pressed", "true");
        generateBtn.disabled = false;
    } else {
        toggleBtn.textContent = "Enable";
        toggleBtn.classList.remove("is-running");
        toggleBtn.setAttribute("aria-pressed", "false");
        generateBtn.disabled = true;
    }

    profileName.textContent   = stats.activeProfileName;
    entriesToday.textContent  = `${formatNumber(stats.entriesToday)}`;
    sessionsToday.textContent = `${formatNumber(stats.sessionsToday)}`;
    totalEntries.textContent  = `${formatNumber(stats.totalEntries)}`;
    nextRun.textContent       = formatTimeUntil(stats.nextRunTime);
    lastRunInfo.textContent   = formatLastRun(stats.lastRunDurationMs, stats.lastRunRatio);

    // Empty-state: first install, never ran, not enabled yet. Show the
    // welcome banner so the stats row of zeros doesn't read like "broken."
    // Hides automatically on the first generation.
    const isFirstRun = stats.totalEntries === 0 && !stats.isActive;
    welcome.hidden = !isFirstRun;
}

async function refreshStats(): Promise<void> {
    // All three queries are independent. Batching keeps the popup's
    // first-paint tight on a cold service-worker wake-up.
    const [stats, config, selfCheck] = await Promise.all([
        sendMessage("GET_STATS") as Promise<ActivityStats | null>,
        sendMessage("GET_CONFIG") as Promise<{ lastRunTimestamp: number } | null>,
        sendMessage("GET_SELF_CHECK_STATE") as Promise<SelfCheckState | null>,
    ]);
    if (stats) updateUI(stats, config?.lastRunTimestamp ?? null, selfCheck ?? null);
}

// ---- Event listeners ------------------------------------------------------

function clearPauseConfirm(): void {
    if (pauseConfirmTimer !== null) {
        window.clearTimeout(pauseConfirmTimer);
        pauseConfirmTimer = null;
    }
    toggleBtn.classList.remove("is-confirming");
}

/** First-click-to-confirm path when pausing. Second click within the
 *  confirm window actually fires the toggle. Enable skips this. */
function primePauseConfirm(): void {
    toggleBtn.textContent = "Click again to pause";
    toggleBtn.classList.add("is-confirming");
    toggleBtn.setAttribute("aria-label", "Click again within 4 seconds to confirm pause");
    pauseConfirmTimer = window.setTimeout(() => {
        clearPauseConfirm();
        toggleBtn.textContent = "Pause";
        toggleBtn.removeAttribute("aria-label");
    }, PAUSE_CONFIRM_WINDOW_MS);
}

toggleBtn.addEventListener("click", async () => {
    // Two-click confirm when pausing — an accidental click on the Pause
    // button of an actively-running extension silently leaves the user
    // unprotected for up to 30 min until they notice. Enable has no
    // such risk; resume-protection is always safe.
    const isPrimed = pauseConfirmTimer !== null;
    const isCurrentlyRunning = toggleBtn.classList.contains("is-running");
    if (isCurrentlyRunning && !isPrimed) {
        primePauseConfirm();
        return;
    }
    clearPauseConfirm();

    toggleBtn.disabled = true;
    const result = (await sendMessage("TOGGLE_ENABLED")) as { enabled: boolean } | null;

    if (result) {
        showFeedback(result.enabled ? "Generation enabled" : "Generation paused");

        // Why: the alarm scheduler uses variable delays (1-3 min first run,
        // circadian thereafter). That's correct for organic timing, but a
        // first-time user who just flipped Enable needs to SEE something
        // happen or they'll assume it's broken. On the first-ever enable
        // (totalEntries === 0), fire one GENERATE_NOW immediately so the
        // stat counter lands a visible number before the user closes the
        // popup. Subsequent enables skip this — the engine is already
        // calibrated to their pattern.
        if (result.enabled) {
            const stats = (await sendMessage("GET_STATS")) as ActivityStats | null;
            if (stats && stats.totalEntries === 0) {
                const gen = (await sendMessage("GENERATE_NOW")) as {
                    entries: number;
                    cookies: number;
                } | null;
                if (gen) {
                    showFeedback(
                        `Welcome — first batch in: ${gen.entries} entries, ${gen.cookies} cookies.`,
                    );
                }
            }
        }
    }
    toggleBtn.disabled = false;
    await refreshStats();
});

generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    const previousLabel = generateBtn.textContent;
    generateBtn.textContent = "Generating…";

    const result = (await sendMessage("GENERATE_NOW")) as {
        entries: number;
        cookies: number;
        sessions: number;
    } | null;

    generateBtn.disabled = false;
    generateBtn.textContent = previousLabel ?? "Generate now";

    if (result) {
        showFeedback(`Injected ${result.entries} entries, ${result.cookies} cookies`);
    }
    await refreshStats();
});

optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});

// ---- Live refresh loop ----------------------------------------------------

refreshStats();
setInterval(() => { refreshStats().catch(() => { /* popup closing */ }); }, REFRESH_INTERVAL_MS);
