# PlausiDen Browser Extension

Tier 0 plausible deniability for your browser. Generates realistic browsing noise -- history entries, cookies, and search queries -- to make your actual browsing patterns harder to isolate through casual inspection.

Part of the [PlausiDen](https://github.com/thepictishbeast) (PLAUSIbly DENiable) ecosystem.

## What It Does

PlausiDen Browser Extension runs silently in the background, injecting plausible browsing history and cookies into your browser's local data stores at organic intervals. It models realistic human browsing patterns including:

- **Circadian rhythms** -- more activity during waking hours, quiet at night
- **Burst patterns** -- clusters of rapid page loads followed by natural pauses
- **Session modeling** -- search engine query, click through results, browse subpages
- **Referrer chains** -- realistic navigation flow between related pages
- **Domain-appropriate cookies** -- tracking cookies that match visited domains

## Installation

### Chrome / Chromium

1. Clone this repo and run `npm install && npm run build:chrome`
2. Open `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select `dist/chrome/`

### Firefox

1. Clone this repo and run `npm install && npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `dist/firefox/manifest.json`

## Permissions Explained

| Permission | Why |
|------------|-----|
| `history`  | Required to inject entries into browser history via `chrome.history.addUrl()` |
| `cookies`  | Required to set realistic tracking cookies via `chrome.cookies.set()` |
| `storage`  | Stores extension configuration and daily statistics locally |
| `alarms`   | Schedules organic-timed generation events via `chrome.alarms` |

**No network permissions are requested.** This extension never makes HTTP requests, never phones home, and never sends telemetry.

## Profiles

| Profile | Categories | Daily Entries | Active Hours |
|---------|-----------|---------------|-------------|
| Casual User | news, social, shopping, entertainment, weather | ~50 | 8am-11pm |
| Academic Researcher | academic, documentation, news, reference | ~80 | 7am-10pm |
| Journalist | news, government, legal, reference, social | ~100 | 6am-midnight |

## Limitations

**This is Tier 0 protection.** It is effective against casual browser history inspection but does not generate network traffic, cache entries, or other artifacts that a forensic analysis would expect to find alongside real browsing. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

For deeper protection:
- **Tier 2** -- [PlausiDen-Inject](https://github.com/thepictishbeast/PlausiDen-Inject): Direct database injection with artifact correlation
- **Tier 3** -- PlausiDenOS: Hurd-style translator interposition (planned)

## Development

```bash
npm install
npm run dev          # Watch mode, builds to dist/chrome/
npm run build        # Build both Chrome and Firefox
npm run lint         # ESLint
npm run typecheck    # TypeScript strict check
```

Or with [just](https://github.com/casey/just):

```bash
just              # lint + typecheck + build both
just dev          # watch mode
just build-chrome # Chrome only
```

## License

Business Source License 1.1 (BSL-1.1). See [LICENSE](LICENSE).

Change Date: 2030-04-04. After that date, Apache License 2.0.
