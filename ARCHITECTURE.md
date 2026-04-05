# Architecture

## Overview

PlausiDen Browser Extension is a Manifest V3 browser extension that generates plausible browsing noise locally. It injects history entries and cookies into the browser's internal data stores without generating any network traffic.

## Component Map

```
src/
  background/
    service-worker.ts   -- MV3 entry point, event handlers, message routing
    scheduler.ts        -- Organic timing engine (circadian + burst + jitter)
    generator.ts        -- Stub data generator (TypeScript, pre-WASM)
    injector.ts         -- chrome.history / chrome.cookies API wrapper
  popup/
    popup.html/ts/css   -- Status display and toggle controls
  options/
    options.html/ts/css -- Configuration UI (profile, intensity, categories)
  shared/
    types.ts            -- Type definitions, constants, defaults
    profiles.ts         -- Browsing persona presets
    storage.ts          -- chrome.storage.local wrapper

wasm-engine/            -- Scaffold for Rust WASM engine (todo!())
manifests/              -- Browser-specific manifest.json files
scripts/                -- Build and development shell scripts
```

## Data Flow

```
Scheduler (alarm fires)
  -> Generator (creates BrowsingSession[])
    -> Injector (chrome.history.addUrl + chrome.cookies.set)
      -> Storage (records stats)
        -> Scheduler (schedules next alarm with organic delay)
```

## CRITICAL: chrome.history.addUrl Limitation

`chrome.history.addUrl()` adds an entry to the browser's internal history database (`History` on Chrome, `places.sqlite` on Firefox). **It does NOT generate any other artifacts.**

What it creates:
- Entry in the history database (URL, title, visit time, visit count)
- Entry visible in browser's history UI (Ctrl+H)
- Data that syncs via browser sync services (if enabled)

What it does NOT create:
- HTTP network traffic (no DNS, no TCP, no TLS)
- Browser cache entries (disk or memory)
- Favicon database entries
- Session/tab restore data
- Web Vitals / performance timing data
- `:visited` CSS pseudo-class state
- Content script execution or DOM events
- Proxy/firewall/ISP logs
- Memory artifacts during browsing

### Forensic Implications

A sophisticated forensic examiner can detect Tier 0 entries by cross-referencing:
- History entries with no corresponding cache files
- History entries with no favicon data
- History entries with no corresponding DNS cache entries
- Cookie timestamps that don't correlate with network connection logs
- Uniform `visitCount` patterns vs. real browsing variance

This is why Tier 0 is positioned as the lowest protection tier. It protects against casual inspection (e.g., someone looking over your shoulder at browser history, a partner checking your browsing, or simple automated history scans) but not against dedicated forensic analysis.

## Manifest V3 Considerations

### Service Worker Lifecycle

MV3 service workers are ephemeral -- the browser can suspend them when idle and restart them on events. This affects our design:

- **Burst state is in-memory**: Lost on service worker restart. This is acceptable -- it simply means a new burst pattern begins, which is itself organic.
- **Alarms persist across restarts**: `chrome.alarms` survives service worker suspension. Our startup code checks for an existing alarm and only creates a new one if none exists.
- **Storage is persistent**: `chrome.storage.local` persists across all lifecycles.

### MV3 Deprecation Risk

Google has signaled long-term commitment to MV3, but the landscape is uncertain:
- Firefox supports MV3 with MV2 compatibility shims
- Safari supports a subset of MV3
- Some MV3 APIs (like `chrome.alarms` minimum 1-minute delay) limit our burst resolution

### Offscreen Document Fallback Path

If future MV3 restrictions limit service worker capabilities, an offscreen document can serve as an alternative background execution context:

```typescript
// Future: create offscreen document for longer-running tasks
chrome.offscreen.createDocument({
  url: "offscreen.html",
  reasons: ["WORKERS"],
  justification: "Background noise generation scheduling"
});
```

This path is documented but not implemented -- current APIs are sufficient.

## WASM Engine Integration Path

The `wasm-engine/` directory contains a scaffold for the Rust WASM build of `plausiden-engine`. When ready:

1. Build with `wasm-pack build --target web`
2. Import the WASM module in `service-worker.ts`
3. Replace `generateBatch()` calls with WASM `generate_batch()`
4. The TypeScript generator remains as a fallback if WASM fails to load

The WASM engine will provide:
- Larger URL corpus with dynamic path generation
- Markov chain-based title generation
- Statistical modeling of real browsing distributions
- Consistent cross-platform output (same engine as CLI tools)

## Scheduler Algorithm

The scheduler avoids regular intervals (which are trivially detectable) by combining:

1. **Base delay**: Derived from target daily entries / active hours
2. **Circadian weight**: Sine-curve approximation of human activity patterns with lunch dip and evening decline
3. **Burst detection**: 20% probability of entering a rapid-fire burst (3-8 events at 1-3 minute intervals)
4. **Jitter**: +/- 30% random variation on all delays
5. **Clamping**: Final delay clamped to [1, 120] minutes

The result is an event distribution that looks organic when plotted over time -- not perfectly random (humans aren't random) but also not periodic.
