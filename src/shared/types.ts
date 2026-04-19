/**
 * PlausiDen Browser Extension - Shared Type Definitions
 *
 * Core types used across the extension for browsing history generation,
 * scheduling, and configuration.
 */

/** A single generated browsing history entry */
export interface BrowsingEntry {
  /** The URL to inject into browser history */
  url: string;
  /** Page title for the history entry */
  title: string;
  /** Timestamp in milliseconds since epoch */
  timestamp: number;
  /** Optional referrer URL for the entry */
  referrer?: string;
  /** Simulated visit count for this URL */
  visitCount: number;
  /** Category this entry belongs to */
  category: BrowsingCategory;
}

/** Cookie to set alongside a browsing entry */
export interface GeneratedCookie {
  /** Cookie domain */
  domain: string;
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Cookie path */
  path: string;
  /** Expiration in seconds since epoch */
  expirationDate: number;
  /** Whether the cookie is secure */
  secure: boolean;
  /** Whether the cookie is HTTP-only */
  httpOnly: boolean;
  /** SameSite attribute */
  sameSite: "no_restriction" | "lax" | "strict";
}

/** A browsing session -- a cluster of related entries */
export interface BrowsingSession {
  /** Entries in this session */
  entries: BrowsingEntry[];
  /** Cookies generated for this session */
  cookies: GeneratedCookie[];
  /** Session start time */
  startTime: number;
  /** Session end time */
  endTime: number;
}

/** Browsing content categories */
export type BrowsingCategory =
  | "news"
  | "social"
  | "shopping"
  | "entertainment"
  | "weather"
  | "academic"
  | "documentation"
  | "reference"
  | "government"
  | "legal"
  | "finance"
  | "health"
  | "technology"
  | "sports"
  | "travel"
  | "food";

/** Intensity level for generation */
export type IntensityLevel = "low" | "medium" | "high" | "max";

/** Active hours configuration */
export interface ActiveHours {
  /** Start hour (0-23) */
  start: number;
  /** End hour (0-24, 24 means midnight) */
  end: number;
}

/** Browsing profile preset definition */
export interface BrowsingProfile {
  /** Display name */
  name: string;
  /** Description of this profile */
  description: string;
  /** Search engines this profile uses */
  searchEngines: string[];
  /** Content categories */
  categories: BrowsingCategory[];
  /** Average daily history entries to generate */
  avgDailyEntries: number;
  /** Hours during which generation is active */
  activeHours: ActiveHours;
}

/** Extension configuration stored in chrome.storage.local */
export interface ExtensionConfig {
  /** Whether generation is enabled */
  enabled: boolean;
  /** Selected profile preset key */
  activeProfile: string;
  /** Intensity multiplier */
  intensity: IntensityLevel;
  /** Custom active hours override (null = use profile default) */
  customActiveHours: ActiveHours | null;
  /** Custom daily entry count override (null = use profile default) */
  customDailyEntries: number | null;
  /** Categories to include (null = use profile default) */
  customCategories: BrowsingCategory[] | null;
  /** Whether to generate cookies alongside history */
  generateCookies: boolean;
  /** Timestamp of last generation run */
  lastRunTimestamp: number;
  /** Wall-clock duration of the last generation run, in ms. Zero if never run. */
  lastRunDurationMs: number;
  /** Number of history entries the last run attempted to inject. */
  lastRunAttempted: number;
  /** Number of history entries the last run actually succeeded in injecting. */
  lastRunSucceeded: number;
  /** Total entries generated since install */
  totalEntriesGenerated: number;
  /** Total sessions generated since install */
  totalSessionsGenerated: number;
}

/** Stats for the popup display */
export interface ActivityStats {
  /** Whether the extension is currently active */
  isActive: boolean;
  /** Entries generated today */
  entriesToday: number;
  /** Sessions generated today */
  sessionsToday: number;
  /** Total entries ever generated */
  totalEntries: number;
  /** Active profile name */
  activeProfileName: string;
  /** Next scheduled generation time */
  nextRunTime: number | null;
  /** Wall-clock ms the last generation run took. 0 if never run. */
  lastRunDurationMs: number;
  /** (attempted, succeeded) entry counts from the last run. */
  lastRunRatio: { attempted: number; succeeded: number };
}

/** Intensity multipliers for generation rates */
export const INTENSITY_MULTIPLIERS: Record<IntensityLevel, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.0,
  max: 4.0,
};

/** A message sent between the popup / options page and the background
 *  service-worker. The service-worker dispatches on `type`; `payload`
 *  carries type-specific data. */
export interface ExtMessage {
  /** One of GET_STATS | GET_CONFIG | TOGGLE_ENABLED | UPDATE_CONFIG | GENERATE_NOW */
  type: string;
  payload?: Record<string, unknown>;
}

/** Response the service-worker sends when a handler throws. The popup
 *  (and any other consumer) treats any response with `error: true` as
 *  a failure, surfaces `userMessage` to the user, and ignores `cause`
 *  unless writing diagnostics to devtools. */
export interface ExtErrorResponse {
  error: true;
  /** The message type that failed (e.g. "GET_STATS"). */
  messageType: string;
  /** User-facing copy: what happened and what to try. */
  userMessage: string;
  /** Short technical description, bounded to 200 chars. For devtools only. */
  cause: string;
}

/** Type guard — detects error responses from message handlers. */
export function isExtErrorResponse(r: unknown): r is ExtErrorResponse {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as { error?: unknown }).error === true &&
    typeof (r as { userMessage?: unknown }).userMessage === "string"
  );
}

/** Default extension configuration */
export const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: false,
  activeProfile: "casual",
  intensity: "medium",
  customActiveHours: null,
  customDailyEntries: null,
  customCategories: null,
  generateCookies: true,
  lastRunTimestamp: 0,
  lastRunDurationMs: 0,
  lastRunAttempted: 0,
  lastRunSucceeded: 0,
  totalEntriesGenerated: 0,
  totalSessionsGenerated: 0,
};
