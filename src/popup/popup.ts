/**
 * PlausiDen Browser Extension - Popup UI
 *
 * Displays current status, stats, and provides controls
 * to toggle generation and trigger manual runs.
 */

import { ActivityStats } from "../shared/types";

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const statusBar = document.getElementById("status-bar") as HTMLDivElement;
const statusDot = document.getElementById("status-dot") as HTMLSpanElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const profileName = document.getElementById("profile-name") as HTMLSpanElement;
const entriesToday = document.getElementById("entries-today") as HTMLSpanElement;
const sessionsToday = document.getElementById("sessions-today") as HTMLSpanElement;
const totalEntries = document.getElementById("total-entries") as HTMLSpanElement;
const nextRun = document.getElementById("next-run") as HTMLSpanElement;
const toggleBtn = document.getElementById("toggle-btn") as HTMLButtonElement;
const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
const feedback = document.getElementById("feedback") as HTMLDivElement;
const optionsLink = document.getElementById("options-link") as HTMLAnchorElement;

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

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
}

function formatTimeUntil(timestamp: number | null): string {
  if (!timestamp) return "--";
  const diff = timestamp - Date.now();
  if (diff <= 0) return "soon";
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

function showFeedback(text: string): void {
  feedback.textContent = text;
  feedback.hidden = false;
  setTimeout(() => {
    feedback.hidden = true;
  }, 3000);
}

// ---------------------------------------------------------------------------
// UI update
// ---------------------------------------------------------------------------

function updateUI(stats: ActivityStats): void {
  // Status
  if (stats.isActive) {
    statusBar.className = "status-bar active";
    statusDot.className = "status-dot active";
    statusText.textContent = "Running";
    toggleBtn.textContent = "Pause";
    toggleBtn.classList.add("running");
    generateBtn.disabled = false;
  } else {
    statusBar.className = "status-bar paused";
    statusDot.className = "status-dot paused";
    statusText.textContent = "Paused";
    toggleBtn.textContent = "Enable";
    toggleBtn.classList.remove("running");
    generateBtn.disabled = true;
  }

  // Stats
  profileName.textContent = stats.activeProfileName;
  entriesToday.textContent = `${formatNumber(stats.entriesToday)} entries`;
  sessionsToday.textContent = `${formatNumber(stats.sessionsToday)} today`;
  totalEntries.textContent = `${formatNumber(stats.totalEntries)} entries`;
  nextRun.textContent = formatTimeUntil(stats.nextRunTime);
}

async function refreshStats(): Promise<void> {
  const stats = (await sendMessage("GET_STATS")) as ActivityStats;
  if (stats) {
    updateUI(stats);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

toggleBtn.addEventListener("click", async () => {
  toggleBtn.disabled = true;
  const result = (await sendMessage("TOGGLE_ENABLED")) as { enabled: boolean } | null;
  toggleBtn.disabled = false;

  if (result) {
    showFeedback(result.enabled ? "Generation enabled" : "Generation paused");
  }

  await refreshStats();
});

generateBtn.addEventListener("click", async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";

  const result = (await sendMessage("GENERATE_NOW")) as {
    entries: number;
    cookies: number;
    sessions: number;
  } | null;

  generateBtn.disabled = false;
  generateBtn.textContent = "Generate Now";

  if (result) {
    showFeedback(
      `Injected ${result.entries} entries, ${result.cookies} cookies`
    );
  }

  await refreshStats();
});

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

refreshStats();
