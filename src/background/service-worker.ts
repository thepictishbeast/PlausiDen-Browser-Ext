/**
 * PlausiDen Browser Extension - Service Worker Entry Point
 *
 * Manifest V3 background service worker. Handles:
 * - Extension install/update: set default configuration
 * - Alarm events: generate and inject browsing artifacts
 * - Message events: communication with popup and options pages
 */

import { DEFAULT_CONFIG } from "../shared/types";
import { loadConfig, saveConfig, recordGeneration, getActivityStats } from "../shared/storage";
import { getProfile } from "../shared/profiles";
import { startScheduler, stopScheduler, scheduleNext, isOurAlarm } from "./scheduler";
import { generateBatch, countSessionArtifacts } from "./generator";
import { injectSessions } from "./injector";

// ---------------------------------------------------------------------------
// Install / Update
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Set default config on fresh install
    await saveConfig({ ...DEFAULT_CONFIG });
  } else if (details.reason === "update") {
    // On update, loadConfig handles schema migration via merge with defaults
    await loadConfig();
  }
});

// ---------------------------------------------------------------------------
// Alarm handler -- the main generation loop
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!isOurAlarm(alarm)) return;

  const config = await loadConfig();

  if (!config.enabled) {
    await stopScheduler();
    return;
  }

  try {
    // Generate a batch of browsing sessions
    const profile = getProfile(config.activeProfile);
    const now = Date.now();
    const sessions = generateBatch(profile, config.intensity, now);

    // Inject into browser
    const { totalEntries } = await injectSessions(
      sessions,
      config.generateCookies
    );

    // Record stats
    if (totalEntries > 0) {
      await recordGeneration(totalEntries, sessions.length);
    }
  } catch (_e) {
    // Silently handle errors -- do not break the scheduler
  }

  // Schedule the next run with organic timing
  await scheduleNext();
});

// ---------------------------------------------------------------------------
// Message handler -- popup and options page communication
// ---------------------------------------------------------------------------

interface ExtMessage {
  type: string;
  payload?: Record<string, unknown>;
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    // All message handlers are async, so we return true to keep the
    // message channel open and call sendResponse when ready.
    handleMessage(message)
      .then(sendResponse)
      .catch(() => sendResponse({ error: "Internal error" }));
    return true;
  }
);

async function handleMessage(
  message: ExtMessage
): Promise<unknown> {
  switch (message.type) {
    case "GET_STATS":
      return getActivityStats();

    case "GET_CONFIG":
      return loadConfig();

    case "TOGGLE_ENABLED": {
      const config = await loadConfig();
      config.enabled = !config.enabled;
      await saveConfig(config);

      if (config.enabled) {
        await startScheduler();
      } else {
        await stopScheduler();
      }

      return { enabled: config.enabled };
    }

    case "UPDATE_CONFIG": {
      const updates = message.payload ?? {};
      const config = await loadConfig();
      const updated = { ...config, ...updates };
      await saveConfig(updated);

      // Restart scheduler if enabled to pick up new timing parameters
      if (updated.enabled) {
        await scheduleNext();
      }

      return updated;
    }

    case "GENERATE_NOW": {
      // Manual trigger from popup -- generate one batch immediately
      const config = await loadConfig();
      const profile = getProfile(config.activeProfile);
      const sessions = generateBatch(profile, config.intensity, Date.now());
      const { totalEntries } = await injectSessions(
        sessions,
        config.generateCookies
      );
      const artifacts = countSessionArtifacts(sessions);

      if (totalEntries > 0) {
        await recordGeneration(totalEntries, sessions.length);
      }

      return {
        entries: artifacts.entries,
        cookies: artifacts.cookies,
        sessions: sessions.length,
      };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ---------------------------------------------------------------------------
// Service worker startup
// ---------------------------------------------------------------------------

// On service worker wake-up (MV3 can suspend/resume), check if we
// should be running and re-arm the scheduler if needed.
(async () => {
  const config = await loadConfig();
  if (config.enabled) {
    // Check if alarm already exists
    const existing = await chrome.alarms.get("plausiden-generate");
    if (!existing) {
      await startScheduler();
    }
  }
})();
