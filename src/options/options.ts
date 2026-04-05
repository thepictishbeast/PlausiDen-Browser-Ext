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
import { PROFILES, getProfile } from "../shared/profiles";

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentConfig: ExtensionConfig | null = null;

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
  const config = (await sendMessage("GET_CONFIG")) as ExtensionConfig;
  if (!config) return;
  currentConfig = config;

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

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

loadSettings();
