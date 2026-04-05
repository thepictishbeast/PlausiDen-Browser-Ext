/**
 * PlausiDen Browser Extension - Organic Scheduler
 *
 * Implements non-periodic scheduling that mimics real human browsing
 * patterns. Uses chrome.alarms API with variable delays shaped by:
 *
 * - Circadian rhythm: more active during configured waking hours
 * - Burst patterns: clusters of rapid browsing followed by gaps
 * - Session modeling: multiple related visits, then pauses
 * - Random jitter on all timings to avoid detectably regular patterns
 */

import { ExtensionConfig, INTENSITY_MULTIPLIERS, ActiveHours } from "../shared/types";
import { loadConfig } from "../shared/storage";
import { getProfile } from "../shared/profiles";

const ALARM_NAME = "plausiden-generate";

/** Minimum delay between alarms in minutes */
const MIN_DELAY_MINUTES = 1;
/** Maximum delay between alarms in minutes */
const MAX_DELAY_MINUTES = 120;

// ---------------------------------------------------------------------------
// Circadian rhythm modeling
// ---------------------------------------------------------------------------

/**
 * Compute an activity weight for the current hour based on a circadian
 * model. Returns a value between 0.0 (sleep, no activity) and 1.0
 * (peak waking hours).
 *
 * The curve models:
 * - Ramp-up after wake time
 * - Peak mid-morning and early afternoon
 * - Slight dip around lunch
 * - Gradual decline toward sleep time
 * - Near-zero during sleep hours (but not exactly zero -- night owls)
 */
function circadianWeight(hour: number, activeHours: ActiveHours): number {
  const { start, end } = activeHours;
  const duration = end - start;

  if (duration <= 0) return 0.1;

  // Normalize hour to position within active window (0.0 - 1.0)
  let normalizedPos: number;
  if (hour < start) {
    // Before wake time -- very low activity (insomnia / early check)
    return 0.02 + Math.random() * 0.03;
  } else if (hour >= end) {
    // After sleep time -- very low activity
    return 0.02 + Math.random() * 0.03;
  } else {
    normalizedPos = (hour - start) / duration;
  }

  // Shape the curve: rise, peak, slight lunch dip, second peak, decline
  // Using a combination of sine curves
  const morningRise = Math.sin(normalizedPos * Math.PI);
  const lunchDip = 1.0 - 0.2 * Math.exp(-Math.pow((normalizedPos - 0.45) * 6, 2));
  const eveningDecline = normalizedPos < 0.8 ? 1.0 : 1.0 - (normalizedPos - 0.8) * 2.5;

  const weight = morningRise * lunchDip * Math.max(0.1, eveningDecline);

  // Clamp to [0.05, 1.0] -- never truly zero during waking hours
  return Math.max(0.05, Math.min(1.0, weight));
}

// ---------------------------------------------------------------------------
// Burst pattern state
// ---------------------------------------------------------------------------

/**
 * Burst state is tracked in-memory (lost on service worker restart,
 * which is fine -- it just means a new burst pattern starts).
 */
let burstState = {
  /** Whether we are currently in a burst */
  inBurst: false,
  /** How many rapid fires remaining in this burst */
  remaining: 0,
};

/**
 * Decide if we should enter/continue a burst pattern.
 *
 * Bursts represent a user rapidly clicking through several pages --
 * think scrolling through search results or reading a news feed.
 * About 20% of the time, we initiate a burst of 3-8 rapid events.
 */
function updateBurstState(): void {
  if (burstState.inBurst && burstState.remaining > 0) {
    burstState.remaining--;
    if (burstState.remaining === 0) {
      burstState.inBurst = false;
    }
    return;
  }

  // 20% chance to start a new burst
  if (Math.random() < 0.2) {
    burstState.inBurst = true;
    burstState.remaining = Math.floor(Math.random() * 6) + 3; // 3-8
  }
}

// ---------------------------------------------------------------------------
// Delay calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the next alarm delay in minutes.
 *
 * Factors:
 * 1. Base delay from intensity setting
 * 2. Circadian weighting (longer delays during sleep hours)
 * 3. Burst pattern (very short delays during bursts)
 * 4. Random jitter (+/- 30%)
 */
function calculateNextDelay(config: ExtensionConfig): number {
  const profile = getProfile(config.activeProfile);
  const multiplier = INTENSITY_MULTIPLIERS[config.intensity];
  const activeHours = config.customActiveHours ?? profile.activeHours;
  const dailyTarget = (config.customDailyEntries ?? profile.avgDailyEntries) * multiplier;

  // How many minutes of active time per day
  const activeMinutes = (activeHours.end - activeHours.start) * 60;

  // Average sessions per active minute (each session ~4 entries)
  const avgEntriesPerSession = 4;
  const sessionsNeeded = dailyTarget / avgEntriesPerSession;
  const baseDelayMinutes = activeMinutes / sessionsNeeded;

  // Current circadian weight
  const currentHour = new Date().getHours() + new Date().getMinutes() / 60;
  const circWeight = circadianWeight(currentHour, activeHours);

  // Update burst state
  updateBurstState();

  let delay: number;

  if (burstState.inBurst) {
    // During bursts: 1-3 minutes between events
    delay = MIN_DELAY_MINUTES + Math.random() * 2;
  } else {
    // Normal: base delay inversely scaled by circadian weight
    // Low circadian weight = longer delay (less active time of day)
    delay = baseDelayMinutes / Math.max(0.05, circWeight);
  }

  // Apply jitter: +/- 30%
  const jitter = 0.7 + Math.random() * 0.6;
  delay *= jitter;

  // Clamp to bounds
  delay = Math.max(MIN_DELAY_MINUTES, Math.min(MAX_DELAY_MINUTES, delay));

  return delay;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule the next generation alarm. Clears any existing alarm
 * and sets a new one with an organically calculated delay.
 */
export async function scheduleNext(): Promise<void> {
  const config = await loadConfig();

  if (!config.enabled) {
    // Clear any existing alarm when disabled
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  const delayMinutes = calculateNextDelay(config);

  // chrome.alarms requires at least 1 minute for MV3 service workers.
  // For sub-minute delays in bursts, we use the minimum of 1 minute.
  const safeDelay = Math.max(1, delayMinutes);

  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: safeDelay });
}

/**
 * Start the scheduler -- called on extension install/enable.
 * Schedules the first alarm with a short initial delay.
 */
export async function startScheduler(): Promise<void> {
  // First run: 1-3 minute delay
  const initialDelay = 1 + Math.random() * 2;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: initialDelay });
}

/**
 * Stop the scheduler -- clears all alarms.
 */
export async function stopScheduler(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  burstState = { inBurst: false, remaining: 0 };
}

/**
 * Check if the alarm is ours.
 */
export function isOurAlarm(alarm: chrome.alarms.Alarm): boolean {
  return alarm.name === ALARM_NAME;
}
