/**
 * PlausiDen Browser Extension - Browsing Profile Presets
 *
 * Each profile defines a plausible browsing persona with realistic
 * search engine preferences, content categories, activity levels,
 * and circadian rhythms.
 */

import { BrowsingProfile } from "./types";

/** Available browsing profile presets */
export const PROFILES: Record<string, BrowsingProfile> = {
  casual: {
    name: "Casual User",
    description: "General browsing -- news, social, shopping, entertainment",
    searchEngines: ["google.com", "bing.com"],
    categories: ["news", "social", "shopping", "entertainment", "weather"],
    avgDailyEntries: 50,
    activeHours: { start: 8, end: 23 },
  },
  researcher: {
    name: "Academic Researcher",
    description: "Academic searches, journal sites, documentation",
    searchEngines: ["scholar.google.com", "google.com"],
    categories: ["academic", "documentation", "news", "reference"],
    avgDailyEntries: 80,
    activeHours: { start: 7, end: 22 },
  },
  journalist: {
    name: "Journalist / Investigator",
    description: "News sources, government sites, document searches",
    searchEngines: ["google.com", "duckduckgo.com"],
    categories: ["news", "government", "legal", "reference", "social"],
    avgDailyEntries: 100,
    activeHours: { start: 6, end: 24 },
  },
};

/** Get a profile by key, falling back to casual */
export function getProfile(key: string): BrowsingProfile {
  return PROFILES[key] ?? PROFILES["casual"];
}

/** Get all available profile keys */
export function getProfileKeys(): string[] {
  return Object.keys(PROFILES);
}
