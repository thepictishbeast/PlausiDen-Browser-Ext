/**
 * PlausiDen Browser Extension - Service Worker Entry Point
 *
 * Manifest V3 background service worker. Handles:
 * - Extension install/update: set default configuration
 * - Alarm events: generate and inject browsing artifacts
 * - Message events: communication with popup and options pages
 */

import { DEFAULT_CONFIG, ExtMessage } from "../shared/types";
import { loadConfig, saveConfig, recordGeneration, getActivityStats } from "../shared/storage";
import { getProfile } from "../shared/profiles";
import { sanitizeConfigUpdate } from "../shared/config-validation";
import { logError, logWarn } from "../shared/log";
import { runProbe, readState as readSelfCheckState, PROBE_INTERVAL_MS } from "./self-check";
import { friendlyErrorFor } from "../shared/error-messages";
import { startScheduler, stopScheduler, scheduleNext, isOurAlarm } from "./scheduler";
import { generateBatch, countSessionArtifacts } from "./generator";
import { injectSessions } from "./injector";

// Self-check alarm — fires runProbe at PROBE_INTERVAL_MS cadence so the
// popup's traffic light can surface browser-policy interference.
const SELF_CHECK_ALARM = "plausiden-self-check";

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
  // Ensure self-check alarm is armed regardless of install/update — it
  // runs independently of config.enabled because even in a paused state
  // we want to detect browser-policy interference.
  await armSelfCheckAlarm();
});

async function armSelfCheckAlarm(): Promise<void> {
  // chrome.alarms.create with periodInMinutes starts now + period. Use
  // PROBE_INTERVAL_MS/60000 to match the shared constant.
  const existing = await chrome.alarms.get(SELF_CHECK_ALARM);
  if (existing) return;
  chrome.alarms.create(SELF_CHECK_ALARM, {
    delayInMinutes: PROBE_INTERVAL_MS / 60_000,
    periodInMinutes: PROBE_INTERVAL_MS / 60_000,
  });
}

// ---------------------------------------------------------------------------
// Alarm handler -- the main generation loop
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Self-check alarm runs independently of config.enabled — we probe
  // the browser API regardless of whether generation is active, so the
  // popup's traffic light can show "interference detected" even when
  // paused.
  if (alarm.name === SELF_CHECK_ALARM) {
    await runProbe();
    return;
  }

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
    const attempted = sessions.reduce((s, sess) => s + sess.entries.length, 0);

    // Inject into browser, timing the wall-clock so self-check can surface
    // unusually slow runs (browser policy interference often manifests as
    // sluggish addUrl calls before outright failures).
    const runStart = Date.now();
    const { totalEntries } = await injectSessions(
      sessions,
      config.generateCookies
    );
    const durationMs = Date.now() - runStart;

    // Record stats + observability metrics. We record even on 0-entry runs
    // so the dashboard can distinguish "hasn't run" from "ran but all
    // injections failed" (signal of browser-policy interference).
    await recordGeneration(totalEntries, sessions.length, {
      durationMs,
      attempted,
      succeeded: totalEntries,
      sessions: sessions.length,
    });
  } catch (e) {
    // Must not break the scheduler — but also must not lose the error.
    // logError writes to a ring buffer in chrome.storage; self-check
    // (task #33) and the popup (future tick) can surface it.
    await logError("alarm", e);
  }

  // Also flag partial injection as a warn — some entries didn't land even
  // though the call didn't throw. Often a sign of browser-policy interference.
  try {
    const config2 = await loadConfig();
    if (config2.lastRunAttempted > 0 &&
        config2.lastRunSucceeded < config2.lastRunAttempted * 0.8) {
      await logWarn(
        "inject",
        `partial injection: ${config2.lastRunSucceeded}/${config2.lastRunAttempted} entries landed`,
      );
    }
  } catch { /* swallow */ }

  // Schedule the next run with organic timing
  await scheduleNext();
});

// ---------------------------------------------------------------------------
// Message handler -- popup and options page communication
// ---------------------------------------------------------------------------

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
      .catch((err: unknown) => {
        // Why: the popup needs to explain what failed, why, and what the
        // user can try. "Internal error" gives none of that. We surface
        // the message type so the popup can say "couldn't refresh stats"
        // vs "couldn't apply settings", and include a short cause string
        // where safe. Full error objects are NOT serialized — they can
        // leak internal paths or stack frames.
        const cause = err instanceof Error ? err.message : String(err ?? "unknown");
        sendResponse({
          error: true,
          messageType: message?.type ?? "(no type)",
          userMessage: friendlyErrorFor(message?.type ?? ""),
          cause: cause.slice(0, 200),  // bound to prevent log-flooding
        });
      });
    return true;
  }
);

// friendlyErrorFor moved to src/shared/error-messages.ts so tests can
// import it without evaluating this module's top-level listeners.

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
      // SECURITY: runtime message payloads are untrusted. Sanitize before
      // merging into persisted config. Unknown / malformed fields are
      // silently dropped so a single bad field never blocks the batch.
      const sanitized = sanitizeConfigUpdate(message.payload);
      const config = await loadConfig();
      const updated = { ...config, ...sanitized };
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

    case "GET_SELF_CHECK_STATE":
      // Return the current self-check state so the popup's traffic
      // light can reflect it.
      return readSelfCheckState();

    case "FORCE_SELF_CHECK":
      // Manual probe — used by the options page's "Check now" button.
      return runProbe();

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
