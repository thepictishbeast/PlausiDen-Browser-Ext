/**
 * PlausiDen Browser Extension — Centralized user-visible strings.
 *
 * Why this file: ahead of eventual chrome.i18n.getMessage() integration,
 * collect every user-facing English string in one place. Makes it
 * trivial later to generate _locales/en/messages.json and swap the
 * lookups. Also pins a single-source-of-truth for UX copy so A/B
 * tweaks land in one commit, not three.
 *
 * Guidelines:
 *   - Plain language. No security jargon outside where technical users
 *     expect it (Settings, Developer info).
 *   - Error copy pattern: what happened / why / what now.
 *   - No em dashes in button labels (too visually heavy). Use en dashes
 *     or colons in body copy where dashes are needed.
 *   - Never say "contact support."
 */

export const STRINGS = {
    // ---- Traffic-light status labels ----
    statusOk:        "Protection active",
    statusStarting:  "Starting up\u2026",        // ellipsis
    statusPaused:    "Paused",
    statusInterference: "Interference detected",

    // ---- Button labels ----
    btnEnable:   "Enable",
    btnPause:    "Pause",
    btnGenerate: "Generate now",
    btnGenerating: "Generating\u2026",
    btnSettings: "Settings",

    // ---- Feedback copy ----
    feedbackEnabled:  "Generation enabled",
    feedbackPaused:   "Generation paused",

    // ---- Empty-state / welcome ----
    welcomeHeadline: "Ready to start polluting your browsing history.",
    welcomeBody:
        "PlausiDen generates realistic synthetic browsing entries so the " +
        "data found in your history can\u2019t be read as a record of what " +
        "you actually did. Click Enable below to begin \u2014 the first " +
        "batch lands in a minute or two.",

    // ---- Stats row labels ----
    labelProfile:  "Profile",
    labelToday:    "Today",
    labelSessions: "Sessions",
    labelAllTime:  "All time",
    labelNextRun:  "Next run",
    labelLastRun:  "Last run",

    // ---- Error copy (mirrors friendlyErrorFor in service-worker.ts)
    // Keep the service-worker copy in sync with these — or better, have
    // the service-worker import STRINGS. That refactor is follow-on. ----
    errorGetStats:       "Couldn\u2019t read activity stats. Try closing and reopening the popup.",
    errorGetConfig:      "Couldn\u2019t load settings. Your settings are safe \u2014 try reopening the popup.",
    errorToggleEnabled:  "Couldn\u2019t toggle protection. Try again in a moment; if it keeps failing, reload the extension from chrome://extensions.",
    errorUpdateConfig:   "Couldn\u2019t save that change. The previous settings are still active.",
    errorGenerateNow:    "Couldn\u2019t generate a batch right now. This can happen if the browser is blocking history writes \u2014 check your browser\u2019s policy or extension settings.",
    errorUnknown:        "Something went wrong with that request. Try again; if it repeats, reload the extension.",
} as const;

/** Status-label helper — converts (state, isActive) to the right string. */
export function statusLabelFor(state: "ok" | "warn" | "err", isActive: boolean): string {
    if (state === "ok") return STRINGS.statusOk;
    if (state === "err") return STRINGS.statusInterference;
    return isActive ? STRINGS.statusStarting : STRINGS.statusPaused;
}
