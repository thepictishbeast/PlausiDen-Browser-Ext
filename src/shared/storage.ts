/**
 * PlausiDen Browser Extension - Storage Layer
 *
 * Wraps chrome.storage.local with typed accessors for extension
 * configuration and activity statistics.
 */

import { ExtensionConfig, DEFAULT_CONFIG, ActivityStats } from "./types";
import { getProfile } from "./profiles";
import { sanitizeStoredConfig } from "./config-validation";

const STORAGE_KEY_CONFIG = "plausiden_config";
const STORAGE_KEY_DAILY_STATS = "plausiden_daily_stats";

interface DailyStats {
  date: string;
  entriesGenerated: number;
  sessionsGenerated: number;
}

/** Load the extension configuration from storage.
 *
 *  Why sanitizeStoredConfig: chrome.storage.local can be corrupted by
 *  manual edits, extension-update schema drift, or (in theory) a
 *  compromised environment. Casting `as Partial<ExtensionConfig>` just
 *  tells the TypeScript compiler to trust us; it does nothing at runtime.
 *  The sanitizer validates every field and falls back to defaults on any
 *  malformed or out-of-range value, so downstream code gets a type-safe
 *  config even when storage has been tampered with.
 */
export async function loadConfig(): Promise<ExtensionConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY_CONFIG, (result: Record<string, unknown>) => {
      const stored = result[STORAGE_KEY_CONFIG];
      if (stored === undefined || stored === null) {
        resolve({ ...DEFAULT_CONFIG });
        return;
      }
      resolve(sanitizeStoredConfig(stored));
    });
  });
}

/** Save the extension configuration to storage */
export async function saveConfig(config: ExtensionConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_CONFIG]: config }, () => {
      resolve();
    });
  });
}

/** Get today's date string in YYYY-MM-DD format */
function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Load daily stats for today */
async function loadDailyStats(): Promise<DailyStats> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY_DAILY_STATS, (result: Record<string, unknown>) => {
      const stored = result[STORAGE_KEY_DAILY_STATS] as DailyStats | undefined;
      const today = getTodayKey();
      if (stored && stored.date === today) {
        resolve(stored);
      } else {
        resolve({ date: today, entriesGenerated: 0, sessionsGenerated: 0 });
      }
    });
  });
}

/** Save daily stats */
async function saveDailyStats(stats: DailyStats): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_DAILY_STATS]: stats }, () => {
      resolve();
    });
  });
}

/** Metrics captured from a single generation run, passed to recordGeneration
 *  so the run-level observability data lands in storage in one transaction. */
export interface RunMetrics {
  /** Wall-clock duration of the run, in ms. */
  durationMs: number;
  /** Entries the run attempted to inject. */
  attempted: number;
  /** Entries that actually landed (chrome.history.addUrl succeeded). */
  succeeded: number;
  /** Sessions generated. */
  sessions: number;
}

/** Record that entries were generated */
export async function recordGeneration(
  entryCount: number,
  sessionCount: number,
  metrics?: RunMetrics,
): Promise<void> {
  // Update daily stats
  const daily = await loadDailyStats();
  daily.entriesGenerated += entryCount;
  daily.sessionsGenerated += sessionCount;
  await saveDailyStats(daily);

  // Update lifetime stats + last-run observability in config
  const config = await loadConfig();
  config.totalEntriesGenerated += entryCount;
  config.totalSessionsGenerated += sessionCount;
  config.lastRunTimestamp = Date.now();
  if (metrics) {
    config.lastRunDurationMs = metrics.durationMs;
    config.lastRunAttempted = metrics.attempted;
    config.lastRunSucceeded = metrics.succeeded;
  }
  await saveConfig(config);
}

/** Get activity stats for popup display */
export async function getActivityStats(): Promise<ActivityStats> {
  const config = await loadConfig();
  const daily = await loadDailyStats();
  const profile = getProfile(config.activeProfile);

  // Get next alarm time
  let nextRunTime: number | null = null;
  try {
    const alarm = await chrome.alarms.get("plausiden-generate");
    if (alarm) {
      nextRunTime = alarm.scheduledTime;
    }
  } catch (_e) {
    // Alarms API might not be available in all contexts
  }

  return {
    isActive: config.enabled,
    entriesToday: daily.entriesGenerated,
    sessionsToday: daily.sessionsGenerated,
    totalEntries: config.totalEntriesGenerated,
    activeProfileName: profile.name,
    nextRunTime,
    lastRunDurationMs: config.lastRunDurationMs,
    lastRunRatio: {
      attempted: config.lastRunAttempted,
      succeeded: config.lastRunSucceeded,
    },
  };
}
