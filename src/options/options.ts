/**
 * PlausiDen Browser Extension - Options Page
 *
 * Configuration UI for profile selection, intensity, active hours,
 * category toggles, and cookie generation.
 */

import {
  ExtensionConfig,
  IntensityLevel,
  BrowsingCategory,
  INTENSITY_MULTIPLIERS,
} from "../shared/types";
import {
  SelfCheckState,
  statusToTrafficLight,
  statusLabelFor,
  selfCheckSuccessPct,
} from "../shared/self-check-types";
import { logWarn } from "../shared/log";
import { getProfile } from "../shared/profiles";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: BrowsingCategory[] = [
  "news", "social", "shopping", "entertainment", "weather",
  "academic", "documentation", "reference", "government", "legal",
  "finance", "health", "technology", "sports", "travel", "food",
];

const INTENSITY_LEVELS: IntensityLevel[] = ["low", "medium", "high", "max"];

const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
};

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
const profileDesc = document.getElementById("profile-desc") as HTMLDivElement;
const intensitySlider = document.getElementById("intensity-slider") as HTMLInputElement;
const intensityLabel = document.getElementById("intensity-label") as HTMLElement;
const dailyEstimate = document.getElementById("daily-estimate") as HTMLDivElement;
const hoursStart = document.getElementById("hours-start") as HTMLInputElement;
const hoursEnd = document.getElementById("hours-end") as HTMLInputElement;
const useProfileHours = document.getElementById("use-profile-hours") as HTMLInputElement;
const categoriesGrid = document.getElementById("categories-grid") as HTMLDivElement;
const generateCookies = document.getElementById("generate-cookies") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const saveStatus = document.getElementById("save-status") as HTMLSpanElement;

// Self-check card elements. Present only after options.html update;
// guard against null in case the user is running an older build cache.
const selfCheckLight     = document.getElementById("self-check-light");
const selfCheckStatusEl  = document.getElementById("self-check-status");
const selfCheckLastRun   = document.getElementById("self-check-last-run");
const selfCheckNoteEl    = document.getElementById("self-check-note");
const selfCheckBtn       = document.getElementById("self-check-btn") as HTMLButtonElement | null;

const incognitoBanner    = document.getElementById("incognito-banner");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendMessage(type: string, payload?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response: unknown) => {
      resolve(response);
    });
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Self-check card
// ---------------------------------------------------------------------------

function formatAgo(unixMs: number): string {
  if (unixMs === 0) return "never";
  const ageMs = Date.now() - unixMs;
  if (ageMs < 0) return "just now";
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.floor(hr / 24);
  return `${d} d ago`;
}

function renderSelfCheck(state: SelfCheckState | null): void {
  if (!selfCheckLight || !selfCheckStatusEl || !selfCheckLastRun || !selfCheckNoteEl) {
    return; // older build cache missing the card; silently skip
  }

  if (!state) {
    selfCheckLight.classList.remove("is-ok", "is-warn", "is-err");
    selfCheckStatusEl.textContent = "Unable to read self-check state";
    selfCheckLastRun.textContent = "";
    selfCheckNoteEl.textContent = "";
    selfCheckLight.setAttribute("aria-label", "Self-check unavailable");
    return;
  }

  const light = statusToTrafficLight(state.status);
  selfCheckLight.classList.remove("is-ok", "is-warn", "is-err");
  selfCheckLight.classList.add(`is-${light}`);

  const label = statusLabelFor(state.status);
  selfCheckStatusEl.textContent = label;
  selfCheckLight.setAttribute("aria-label", label);

  // Empty state: the probe scheduler is armed at install / on
  // service-worker wake-up, but the first fire is ~30 min after arm
  // (PROBE_INTERVAL_MS). "Never" alone reads as "broken"; the user
  // needs to know automatic probing is coming OR that they can fire
  // one on demand via the button below.
  // Empty state: the probe scheduler is armed at install / on
  // service-worker wake-up, but the first fire is ~30 min after arm
  // (PROBE_INTERVAL_MS). "Never" alone reads as "broken"; the user
  // needs to know automatic probing is coming OR that they can fire
  // one on demand via the button below.
  const pct = selfCheckSuccessPct(state);
  const lifetimeSuffix =
    state.probesRun && pct !== null
      ? ` \u00b7 ${pct}% ok over ${state.probesRun} probe${state.probesRun === 1 ? "" : "s"}`
      : "";
  const lastRunLine =
    state.lastRunAt === 0
      ? "No probe yet. The first probe runs automatically within 30 min, or click Check now."
      : `Last probe: ${formatAgo(state.lastRunAt)}${
          state.lastDurationMs > 0 ? ` \u00b7 ${state.lastDurationMs} ms` : ""
        }${lifetimeSuffix}`;
  selfCheckLastRun.textContent = lastRunLine;

  selfCheckNoteEl.textContent = state.note || "";
}

async function refreshSelfCheck(): Promise<void> {
  const s = (await sendMessage("GET_SELF_CHECK_STATE")) as SelfCheckState | null;
  renderSelfCheck(s);
}

// ---------------------------------------------------------------------------
// Incognito-access banner (task #51 / OPSEC §4.5)
// ---------------------------------------------------------------------------

function checkIncognitoAccess(): void {
  if (!incognitoBanner) return;
  // chrome.extension.isAllowedIncognitoAccess exists in MV3 with the
  // chrome.extension polyfill. The callback shape is (allowed: boolean).
  // Firefox implements the same API; if it's ever missing we default
  // to "banner hidden" so we don't show a false warning.
  const api = chrome?.extension?.isAllowedIncognitoAccess;
  if (typeof api !== "function") {
    // Not an error — older Chrome / a non-extension context. Log at
    // debug-ish info so devtools consumers can see the reason without
    // filling the bounded ring-buffer on every popup/options open.
    return;
  }
  try {
    api((allowed: boolean) => {
      // chrome.runtime.lastError is the standard callback-style error
      // channel. If the underlying permission request failed
      // (profile-level policy blocked us, service-worker not yet
      // ready, etc.), the callback fires with `allowed === undefined`
      // and lastError set.
      const err = chrome.runtime?.lastError;
      if (err) {
        // Record through the ring-buffer rather than silently skip —
        // a recurring warn here means the options page can't surface
        // the incognito state and the user's OPSEC posture may be
        // wrong. Short enough not to flood; logWarn already truncates.
        void logWarn(
          "options:incognito-check",
          `isAllowedIncognitoAccess callback error: ${err.message ?? String(err)}`,
        );
        return;
      }
      try {
        incognitoBanner.hidden = !allowed;
      } catch (e) {
        // Defensive: a DOM mutation on a detached element would throw
        // here. We want the log, but want to keep the page usable.
        void logWarn(
          "options:incognito-check",
          `banner mutation failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });
  } catch (e) {
    // Synchronous throw from `api()` itself — unexpected in practice;
    // signals an environment we didn't anticipate. Do NOT swallow.
    void logWarn(
      "options:incognito-check",
      `isAllowedIncognitoAccess threw synchronously: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function handleCheckNow(): Promise<void> {
  if (!selfCheckBtn) return;
  const prev = selfCheckBtn.textContent;
  // aria-busy signals to screen readers + assistive tech that the
  // button's associated region (the self-check card, which has
  // aria-live="polite") is updating — they should expect changes
  // shortly. Without it, some SR implementations announce stale
  // content before the probe resolves. disabled=true already
  // prevents duplicate-submit; aria-busy is purely informational.
  selfCheckBtn.disabled = true;
  selfCheckBtn.setAttribute("aria-busy", "true");
  selfCheckBtn.textContent = "Checking\u2026";
  try {
    // FORCE_SELF_CHECK runs the probe end-to-end and returns the new
    // SelfCheckState directly, so no second roundtrip is needed.
    const s = (await sendMessage("FORCE_SELF_CHECK")) as SelfCheckState | null;
    renderSelfCheck(s);
  } finally {
    selfCheckBtn.disabled = false;
    selfCheckBtn.removeAttribute("aria-busy");
    selfCheckBtn.textContent = prev ?? "Check now";
  }
}

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------

function renderCategories(enabledCategories: BrowsingCategory[] | null): void {
  categoriesGrid.innerHTML = "";
  const profileCats = getProfile(profileSelect.value).categories;
  const activeCats = enabledCategories ?? profileCats;

  for (const cat of ALL_CATEGORIES) {
    const item = document.createElement("label");
    item.className = "category-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cat;
    checkbox.checked = activeCats.includes(cat);
    checkbox.dataset.category = cat;

    const label = document.createTextNode(capitalize(cat));

    item.appendChild(checkbox);
    item.appendChild(label);
    categoriesGrid.appendChild(item);
  }
}

function updateProfileDescription(): void {
  const profile = getProfile(profileSelect.value);
  profileDesc.textContent = profile.description;
}

function updateIntensityLabel(): void {
  const idx = parseInt(intensitySlider.value, 10);
  const level = INTENSITY_LEVELS[idx];
  intensityLabel.textContent = INTENSITY_LABELS[level];
  updateDailyEstimate();
}

function updateDailyEstimate(): void {
  const profile = getProfile(profileSelect.value);
  const idx = parseInt(intensitySlider.value, 10);
  const level = INTENSITY_LEVELS[idx];
  const multiplier = INTENSITY_MULTIPLIERS[level];
  const estimate = Math.round(profile.avgDailyEntries * multiplier);
  dailyEstimate.textContent = `Estimated: ~${estimate} entries/day`;
}

function updateHoursFields(): void {
  const useDefaults = useProfileHours.checked;
  hoursStart.disabled = useDefaults;
  hoursEnd.disabled = useDefaults;

  if (useDefaults) {
    const profile = getProfile(profileSelect.value);
    hoursStart.value = profile.activeHours.start.toString();
    hoursEnd.value = profile.activeHours.end.toString();
  }
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<void> {
  // Guard against the "flash of defaults then save defaults" race:
  // until GET_CONFIG resolves, the HTML shows Casual + Medium placeholders,
  // and a fast-clicker could press Save and overwrite their real config
  // with those defaults. Disable Save + mark the form aria-busy while
  // we wait. Form inputs stay interactive (so the user sees the
  // placeholder values render in their real positions) but cannot be
  // committed until real config has loaded.
  saveBtn.disabled = true;
  saveBtn.setAttribute("aria-busy", "true");
  const prevSaveText = saveBtn.textContent;
  saveBtn.textContent = "Loading\u2026";

  try {
    const config = (await sendMessage("GET_CONFIG")) as ExtensionConfig;
    if (!config) return;

    // Profile
    profileSelect.value = config.activeProfile;
    updateProfileDescription();

    // Intensity
    const intensityIdx = INTENSITY_LEVELS.indexOf(config.intensity);
    intensitySlider.value = (intensityIdx >= 0 ? intensityIdx : 1).toString();
    updateIntensityLabel();

    // Active hours
    if (config.customActiveHours) {
      useProfileHours.checked = false;
      hoursStart.value = config.customActiveHours.start.toString();
      hoursEnd.value = config.customActiveHours.end.toString();
    } else {
      useProfileHours.checked = true;
    }
    updateHoursFields();

    // Categories
    renderCategories(config.customCategories);

    // Cookies
    generateCookies.checked = config.generateCookies;
  } finally {
    saveBtn.disabled = false;
    saveBtn.removeAttribute("aria-busy");
    saveBtn.textContent = prevSaveText ?? "Save Settings";
  }
}

async function saveSettings(): Promise<void> {
  const idx = parseInt(intensitySlider.value, 10);
  const intensity = INTENSITY_LEVELS[idx] ?? "medium";

  // Collect selected categories
  const categoryCheckboxes = categoriesGrid.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]'
  );
  const selectedCategories: BrowsingCategory[] = [];
  for (const cb of categoryCheckboxes) {
    if (cb.checked && cb.dataset.category) {
      selectedCategories.push(cb.dataset.category as BrowsingCategory);
    }
  }

  // If all are unchecked or same as profile default, use null
  const profile = getProfile(profileSelect.value);
  const profileCats = profile.categories;
  const catsMatch =
    selectedCategories.length === profileCats.length &&
    selectedCategories.every((c) => profileCats.includes(c));
  const customCategories = catsMatch ? null : selectedCategories.length > 0 ? selectedCategories : null;

  // Active hours
  const customActiveHours = useProfileHours.checked
    ? null
    : {
        start: parseInt(hoursStart.value, 10),
        end: parseInt(hoursEnd.value, 10),
      };

  const updates: Partial<ExtensionConfig> = {
    activeProfile: profileSelect.value,
    intensity,
    customActiveHours,
    customCategories,
    generateCookies: generateCookies.checked,
  };

  await sendMessage("UPDATE_CONFIG", updates as Record<string, unknown>);

  saveStatus.textContent = "Saved";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

profileSelect.addEventListener("change", () => {
  updateProfileDescription();
  updateDailyEstimate();
  if (useProfileHours.checked) {
    updateHoursFields();
  }
  renderCategories(null); // Reset to profile defaults on profile change
});

intensitySlider.addEventListener("input", () => {
  updateIntensityLabel();
});

useProfileHours.addEventListener("change", () => {
  updateHoursFields();
});

saveBtn.addEventListener("click", () => {
  saveSettings();
});

selfCheckBtn?.addEventListener("click", () => {
  handleCheckNow();
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

loadSettings();
refreshSelfCheck();
checkIncognitoAccess();
