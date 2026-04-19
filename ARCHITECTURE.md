# Architecture

## Overview

PlausiDen Browser Extension is a Manifest V3 browser extension that generates plausible browsing noise locally. It injects history entries and cookies into the browser's internal data stores without generating any network traffic.

## Component Map

```
src/
  background/
    service-worker.ts      -- MV3 entry point, event handlers, message routing
    scheduler.ts           -- Organic timing engine (circadian + burst + jitter)
    generator.ts           -- Stub data generator (TypeScript, shipping path)
    injector.ts            -- chrome.history / chrome.cookies API wrapper
  popup/
    popup.html/ts/css      -- Status display, 3-state traffic light, toggle,
                              live 5s refresh, ARIA role=status/aria-live,
                              error surfacing via showFeedback, welcome
                              empty-state for first run
  options/
    options.html/ts/css    -- Configuration UI (profile, intensity, categories)
  shared/
    types.ts               -- Type definitions, constants, defaults, message
                              protocol types (ExtMessage, ExtErrorResponse +
                              isExtErrorResponse type guard)
    profiles.ts            -- Browsing persona presets
    storage.ts             -- chrome.storage.local wrapper + recordGeneration
                              accepting RunMetrics (durationMs, attempted,
                              succeeded, sessions)
    config-validation.ts   -- sanitizeConfigUpdate() — whitelist validator
                              applied to UPDATE_CONFIG payloads before persist
    log.ts                 -- 50-entry ring-buffer logger with secret-pattern
                              redactor (redactSecrets) applied to every entry
    tokens.css             -- Design tokens (mirror of /design/tokens.css),
                              consumed by popup + options, supports
                              prefers-color-scheme + prefers-reduced-motion

wasm-engine/              -- Self-contained Rust WASM generator. Currently
                            uses synthetic .example TLDs (tracked in task
                            #11 as P0 — NOT on the shipping path yet).
                            See wasm-engine/src/{lib,generator,profile,rng}.rs.
manifests/                -- Browser-specific manifest.json files (Chrome MV3
                            + Firefox WebExt). Permission allowlist
                            {history, cookies, storage, alarms} enforced by
                            scripts/dev/check-manifest-permissions.sh.
scripts/                  -- Build (build-chrome.sh, build-firefox.sh,
                            build-wasm.sh) + dev tooling.
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

See `src/background/scheduler.ts::circadianWeight` for the exact term-by-term derivation and the meaning of each magic number.

## Observability and self-check

Every alarm fire records a `RunMetrics` packet via `storage.ts::recordGeneration`:

- `durationMs` — wall-clock time of the `chrome.history.addUrl` batch.
  Policy interference often manifests as sluggish calls *before* outright
  failures; tracking duration lets self-check spot it.
- `attempted` vs `succeeded` — if 0% < succeeded/attempted < 80%, the
  service worker logs an `inject` warn via `log.ts`. This is the class
  of signal a self-check monitor (task #33 when it lands) will act on
  to drop the popup traffic light from green to red.

The popup surfaces the last-run duration and success percentage as
`143ms · 98% landed`, distinguishing "never ran" (ratio.attempted = 0,
shown as `—`) from "ran but all failed" (0%) — the latter is actionable
for users, the former is merely "give it a minute."

## Message-protocol contract

Types live in `shared/types.ts`:

- `ExtMessage { type, payload? }` — every popup/options → service-worker
  message is shaped this way.
- `ExtErrorResponse { error: true, messageType, userMessage, cause }` —
  the service-worker wraps handler exceptions in this shape. `popup.ts`
  detects the envelope via `isExtErrorResponse()` and surfaces
  `userMessage` via `showFeedback(..., "err")`. `cause` stays in the
  response object for devtools but never reaches the visible UI — this
  prevents internal paths and stack traces from leaking.

User-facing error copy per message type lives in
`service-worker.ts::friendlyErrorFor()`. Format is "what happened /
what to try" — never "contact support," never a stack trace.

## Secret-hygiene in logs

`shared/log.ts::redactSecrets()` runs on every log message before it
lands in `chrome.storage.local`. It strips Bearer/Basic auth tokens,
OpenAI/GitHub/Slack key prefixes, email addresses, POSIX and Windows
user paths, query-string auth params, and long mixed-entropy base64
blobs. Defense-in-depth — callers should still avoid passing secrets
to the logger in the first place, but the redactor catches accidents.

## Out of Scope

Per v1.2 §G.3 of the Protection Suite build addendum. The extension
deliberately does NOT address the following, and will not:

- **Active endpoint compromise by commercial mercenary spyware**
  (Pegasus, Graphite, Predator, Reign). These tools compromise the
  operating system below the browser layer; they read memory in real
  time, screenshot the screen, and can uninstall the extension. Tier
  3 (PlausiDenOS, planned) addresses this via seL4-based protection
  domains. Tiers 0-2 (this extension, Desktop, Android) do NOT.
  Users facing this threat model should combine with MVT scanning
  (<https://mvt.re>) and seriously consider whether the targeted
  device can be trusted at all.
- **Physical coercion of the user.** No software can protect a user
  compelled under threat to unlock their device and navigate to
  specific content. Duress passphrases (engine-core::duress) and
  dead-man switches (engine-core::deadman) raise the cost of
  coercion but do not eliminate it.
- **Legal advice.** The project provides legal *leverage*
  (reliability challenges, Daubert arguments, reasonable-doubt
  surfaces). Turning that leverage into outcomes requires defense
  attorneys, judges, juries, and appellate courts — none of which
  this software can replace. See `LEGAL.md` for the overview and
  consult licensed counsel for specific cases.
- **Preventing being named a suspect, arrested, or prosecuted.**
  The extension degrades the reliability of forensic evidence. It
  does not protect against being targeted, investigated, or
  charged in the first place.
- **Network-traffic pattern analysis.** The extension writes to
  browser local stores only. It generates no network traffic; an
  adversary observing ISP flow logs, DNS queries, or TLS SNI sees
  only the user's real activity. Combine with Tor / a reputable
  VPN if the network layer is in-scope for your threat model.
- **Browser cache / favicon / session-restore cross-reference
  forensics.** `chrome.history.addUrl()` writes the history DB
  only; it does not populate the disk cache, favicon database,
  or session-restore state. A sophisticated forensic examiner
  cross-referencing cache against history can identify the
  polluted entries as "visited per history but absent from
  cache." Tier 2 (Desktop) extends pollution to the on-disk
  artifacts; Tier 3 extends it to translator-interposition over
  all filesystem I/O.

Users suspecting active compromise of their device should consult
Amnesty International's Mobile Verification Toolkit (MVT) before
relying on any PlausiDen tier: <https://mvt.re>.
