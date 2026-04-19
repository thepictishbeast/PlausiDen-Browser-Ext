/**
 * PlausiDen Browser Extension — Bounded ring-buffer logger.
 *
 * Why: `catch (_e) {}` silent-swallows are cheap but cost us every time
 * something breaks — we have no way to surface it to self-check or to
 * the user. `console.*` is visible in chrome://extensions → service
 * worker → Inspect, but service workers can be evicted at any time and
 * the console cleared when they wake back up. A persisted ring buffer
 * in chrome.storage.local gives us a durable 50-entry trail that
 * survives service-worker restarts and is queryable by the popup, the
 * options page, and eventually the self-check monitor (task #33).
 *
 * Design:
 *  - 50-entry cap. Each entry ≤ 400 chars (bounded input). 50 * 400 =
 *    20 KB worst-case well under the 5 MB chrome.storage.local quota.
 *  - Oldest entries drop off the front when full.
 *  - Levels: error | warn | info. No debug — this isn't a trace buffer.
 *  - Best-effort: if chrome.storage.local is unavailable we fall through
 *    to console.warn so the entry isn't lost entirely.
 *  - No remote reporting. Logs never leave the user's machine.
 */

const LOG_KEY = "plausiden_log";
const MAX_ENTRIES = 50;
const MAX_MESSAGE_LEN = 400;

export type LogLevel = "error" | "warn" | "info";

export interface LogEntry {
    /** Unix ms at which the event was recorded. */
    at: number;
    level: LogLevel;
    /** Short category — usually a message type or subsystem ("alarm", "inject", "storage"). */
    source: string;
    /** Human message, bounded to MAX_MESSAGE_LEN chars. */
    message: string;
}

/** Strip patterns that commonly leak through error messages. Conservative
 *  defense-in-depth — most Chrome API errors are generic, but if a caller
 *  ever accidentally logs a URL-with-token, a path containing the user's
 *  name, or a base64 blob that could be key material, the redactor catches
 *  it before it lands in chrome.storage.
 *
 *  Patterns, in order:
 *   1. Bearer / Basic auth tokens after "Authorization:".
 *   2. OpenAI-style `sk-…`, GitHub `ghp_…` / `gho_…`, Slack `xox[pbar]-…`.
 *   3. Email addresses (privacy; users may paste addresses into configs).
 *   4. POSIX home paths (strip the username component).
 *   5. Windows user paths (same).
 *   6. Long base64-ish blobs (possible key material) of 48+ chars.
 *   7. Query-string auth params: `?token=…`, `&api_key=…`, etc.
 *
 *  Returns the redacted string. Input is not mutated.
 *
 *  SECURITY: redaction is best-effort; never rely on it as the *only*
 *  defense against logging secrets. Callers should not pass secret-bearing
 *  data to the logger in the first place.
 */
export function redactSecrets(input: string): string {
    let s = input;
    // Authorization headers
    s = s.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_.-]{8,}\b/g, "$1 [REDACTED]");
    // Common API-key prefixes
    s = s.replace(/\b(sk|pk|rk)-[A-Za-z0-9_\-]{16,}\b/g, "[REDACTED-KEY]");
    s = s.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED-GH-TOKEN]");
    s = s.replace(/\bgho_[A-Za-z0-9]{20,}\b/g, "[REDACTED-GH-TOKEN]");
    s = s.replace(/\bxox[pbar]-[A-Za-z0-9-]{20,}\b/g, "[REDACTED-SLACK]");
    // Email addresses
    s = s.replace(
        /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
        "[email]",
    );
    // POSIX home paths — keep the /home/ prefix, strip username
    s = s.replace(/\/home\/[^/\s]+/g, "/home/[user]");
    s = s.replace(/\/Users\/[^/\s]+/g, "/Users/[user]");
    // Windows user paths (both slash styles)
    s = s.replace(/(C:\\Users\\)[^\\/\s]+/gi, "$1[user]");
    s = s.replace(/(C:\/Users\/)[^\\/\s]+/gi, "$1[user]");
    // Query-string auth params
    s = s.replace(
        /([?&](?:token|api[_-]?key|apikey|access[_-]?token|auth)=)[^&\s#]+/gi,
        "$1[REDACTED]",
    );
    // JWT (three base64url-encoded segments joined by `.`). Match before
    // the generic blob rule so we produce the more specific
    // [REDACTED-JWT] label. RFC 7519 doesn't mandate minimum lengths,
    // but real-world JWTs have at least ~10 chars per segment; we
    // require 16+ on the header and 16+ on the payload to avoid
    // false-positives on version-like strings ("1.2.3-beta").
    s = s.replace(
        /\beyJ[A-Za-z0-9_\-]{14,}\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{10,}\b/g,
        "[REDACTED-JWT]",
    );
    // Long base64-ish blobs (potential key material) — require mixed case or digits
    // so we don't flag long plain-English strings
    s = s.replace(
        /\b(?=[A-Za-z0-9+/=]*[0-9])(?=[A-Za-z0-9+/=]*[A-Z])(?=[A-Za-z0-9+/=]*[a-z])[A-Za-z0-9+/=]{48,}\b/g,
        "[REDACTED-BLOB]",
    );
    return s;
}

function boundMessage(raw: unknown): string {
    const s =
        raw instanceof Error
            ? raw.message
            : typeof raw === "string"
                ? raw
                : JSON.stringify(raw);
    const redacted = redactSecrets(s);
    return redacted.length > MAX_MESSAGE_LEN
        ? redacted.slice(0, MAX_MESSAGE_LEN - 1) + "\u2026"
        : redacted;
}

async function append(entry: LogEntry): Promise<void> {
    // Best-effort: if chrome.storage is unavailable, log to console.
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
        // eslint-disable-next-line no-console
        console.warn(`[plausiden:${entry.level}:${entry.source}]`, entry.message);
        return;
    }
    return new Promise((resolve) => {
        chrome.storage.local.get(LOG_KEY, (result: Record<string, unknown>) => {
            const existing = (result[LOG_KEY] as LogEntry[] | undefined) ?? [];
            existing.push(entry);
            // Cap at MAX_ENTRIES — drop oldest first.
            while (existing.length > MAX_ENTRIES) {
                existing.shift();
            }
            chrome.storage.local.set({ [LOG_KEY]: existing }, () => resolve());
        });
    });
}

/** Record an error event. Non-throwing — logger failures must never
 *  surface to a caller that's already handling an error. */
export async function logError(source: string, err: unknown): Promise<void> {
    try {
        await append({
            at: Date.now(),
            level: "error",
            source,
            message: boundMessage(err),
        });
    } catch {
        /* swallow — a failing logger must not crash callers */
    }
}

/** Record a non-fatal degraded-state event (slow run, partial injection, etc.). */
export async function logWarn(source: string, message: string): Promise<void> {
    try {
        await append({
            at: Date.now(),
            level: "warn",
            source,
            message: boundMessage(message),
        });
    } catch { /* swallow */ }
}

/** Record an informational event. Use sparingly — the ring is 50 entries. */
export async function logInfo(source: string, message: string): Promise<void> {
    try {
        await append({
            at: Date.now(),
            level: "info",
            source,
            message: boundMessage(message),
        });
    } catch { /* swallow */ }
}

/** Read recent log entries. Newest last. Empty array if unavailable. */
export async function readLog(): Promise<LogEntry[]> {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) return [];
    return new Promise((resolve) => {
        chrome.storage.local.get(LOG_KEY, (result: Record<string, unknown>) => {
            resolve((result[LOG_KEY] as LogEntry[] | undefined) ?? []);
        });
    });
}

/** Clear the log ring. Intended for options-page "clear log" action. */
export async function clearLog(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
    return new Promise((resolve) => {
        chrome.storage.local.remove(LOG_KEY, () => resolve());
    });
}
