# Changelog

All notable changes to `plausiden-browser-ext` are documented in this
file. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the project adheres to [Semantic Versioning](https://semver.org/)
once it reaches 1.0.

The Browser Extension is Tier 0 of the PlausiDen Protection Suite —
history + cookie pollution inside the browser's own stores, no network
required.

## [Unreleased]

### Added — autonomous-loop cycle, 2026-04-18
- **Self-check probe wired end-to-end (task #33).**
  `src/background/self-check.ts` runs a throwaway `addUrl` →
  `getVisits` → `deleteUrl` round-trip under the RFC-6761 reserved
  `self-check.plausiden.invalid` host, writes a 6-state result
  (`ok | blocked | silent_block | cleanup_failed | pending | stale`)
  to `chrome.storage.local`, and logs via the bounded ring-buffer.
  Service-worker arms `plausiden-self-check` alarm at 30 min cadence
  (independent of `config.enabled` — interference must surface even
  when paused). Two new message types: `GET_SELF_CHECK_STATE` (used
  by popup) and `FORCE_SELF_CHECK` (for the options page's future
  "Check now" button).
- **Popup traffic-light consumes self-check.** `src/popup/popup.ts`
  `deriveTrafficState()` now weighs the probe's status: `blocked`
  and `silent_block` escalate to red (`err`), `pending`/`stale`/
  `cleanup_failed` downgrade to amber (`warn`). Status text
  differentiates "Interference detected" (hard block) from
  "Silent interference" (accepted but not persisted). The probe's
  diagnostic note surfaces via `title` + `aria-label` on the dot.
- **Shared self-check types.** `src/shared/self-check-types.ts`
  hoists `SelfCheckState`, `SelfCheckStatus`, pure
  `statusToTrafficLight()` + `statusLabelFor()` out of the
  background bundle so the popup can consume them without pulling
  the service-worker's storage / logging deps. Keeps popup bundle
  at 3.7 kB.
- **Sanitizer: lifetime-counter cap.** `sanitizeStoredConfig()` now
  rejects `totalEntriesGenerated` / `totalSessionsGenerated` values
  above `MAX_LIFETIME_COUNTER = 1e9` (previously unbounded; a
  corrupted storage record could plant `MAX_SAFE_INTEGER`-class
  garbage that would render the popup's counters nonsensical).
- **Manifest-parity validator.**
  `scripts/check-manifest-parity.sh` asserts Chrome MV3 +
  Firefox WebExtension manifests agree byte-for-byte on every
  privilege-affecting and user-visible field
  (name, version, description, `manifest_version`, `permissions`,
  `host_permissions`, `optional_*`, `content_scripts`,
  `action.default_popup`, `options_page`). 11 checks, all green
  on current state. Exit code signals CI.

### Added — autonomous-loop cycle, 2026-04-17
- **Config-update sanitizer.** `src/shared/config-validation.ts`
  — whitelist-style `sanitizeConfigUpdate()` drops unknown fields
  and range-checks known ones before `UPDATE_CONFIG` payloads touch
  storage. Paired with `sanitizeStoredConfig()` for defense-in-depth
  on the load path.
- **Bounded ring-buffer logger.** `src/shared/log.ts` — 50-entry
  ring in `chrome.storage.local`, 400-char per entry,
  best-effort console fallback. Wired into the service-worker
  alarm handler (replaces silent `catch (_e) {}`). Surfaces
  partial-injection warnings automatically when success ratio
  drops below 80 %.
- **Secret redactor.** `redactSecrets()` applied to every log entry
  before persistence. Strips Bearer/Basic tokens, OpenAI/GitHub/
  Slack key prefixes, email addresses, POSIX + Windows user
  paths, query-string auth params, and long mixed-entropy base64
  blobs.
- **Observability metrics.** `lastRunDurationMs`,
  `lastRunAttempted`, `lastRunSucceeded` added to
  `ExtensionConfig`. Service-worker times the inject call;
  `recordGeneration()` accepts a `RunMetrics` packet. Popup
  surfaces the data as "143ms · 98% landed" so self-check and
  users can spot browser-policy interference.
- **Popup: welcome / first-run empty state.** Blue-tinted card with
  headline + plain-English explanation, shown only when
  `totalEntries === 0 && !isActive`. Auto-hides on first run.
- **Popup: loading skeletons.** `.skeleton` shimmer class
  (honors `prefers-reduced-motion`) seeded into profile +
  entries-today rows' default markup; replaces the bare `—` during
  the ~50-100 ms before first GET_STATS resolves.
- **Popup: auto first-run generation.** On the first-ever Enable
  (`totalEntries === 0`), the popup fires one `GENERATE_NOW`
  immediately so the user sees a visible result instead of waiting
  ~1-3 min for the first scheduled alarm. Subsequent enables skip.
- **Popup: error surfacing.** Service-worker wraps handler
  exceptions in `ExtErrorResponse { error, messageType,
  userMessage, cause }`. Popup detects via `isExtErrorResponse()`
  and renders `userMessage` via `showFeedback(..., "err")`
  (longer dismiss, error-red token). Per-message-type friendly
  copy in `friendlyErrorFor()` (what happened / what to try).
- **Popup: ARIA improvements.** `aria-atomic="true"` on status-bar
  so screen readers announce full state on change, `<main>`
  landmark promotion.
- **Design component.** `design/components/traffic-light.{css,md}`
  — reusable 3-state (+info) indicator with sizes sm/md/lg,
  optional pulse, color-mix halos, full spec doc.
- **Style guide.** `design/style-guide.html` renders every token
  and the TrafficLight component in one browsable page.
- **Iconset spec.** `design/iconset.md` — clinical lock+noise-halo
  direction, required sizes per target, resvg rasterization
  pipeline, a11y notes.
- **Strings module.** `src/shared/strings.ts` — centralized
  user-visible strings with `statusLabelFor()` helper; primes
  future `chrome.i18n.getMessage()` swap.
- **Examples directory.** `examples/default-config.json` +
  `examples/journalist-custom-config.json` + README documenting
  message-payload table.
- **Legal overview.** `LEGAL.md` — US (CFAA, Daubert reliability
  challenges, Riley/Carpenter 4th Amendment, FISA-702 data-broker
  loophole, employer/school context), EU (GDPR, ePrivacy, DMA),
  authoritarian jurisdictions, primary-source citations.
- **OPSEC.md.** 7-section per-repo operational-security doc.
- **CONTRIBUTING.md.** Contributor guide with toolchain (Node
  22.22.2 pinned via `.nvmrc` + `.node-version`), code standards
  (no-network, min-perms, tokens, a11y), test matrix, commit
  prefixes, reviewer checklist, security reporting, dark-mode
  testing via DevTools Rendering panel.
- **Reproducibility.** `.nvmrc` and `.node-version` pinning
  Node `22.22.2`.
- **Manifest permission allowlist.**
  `scripts/dev/check-manifest-permissions.sh` enforces
  `{history, cookies, storage, alarms}` allowlist + denies
  `host_permissions` / `webRequest` / `tabs` / `activeTab` /
  `declarativeNetRequest`. Paired with a regression test in
  `scripts/dev/tests/test-manifest-check.sh` that injects
  violations and asserts the checker fails.
- **Tighter TypeScript.** `tsconfig.json` now sets
  `noUnusedLocals` + `noUnusedParameters`; dead `PROFILES`
  import and dead `currentConfig` variable in `options.ts`
  removed. `lib` includes `DOM.Iterable` so NodeList iteration
  typechecks cleanly.
- **wasm-engine fix (P0).** All 8 flavour vocabs' synthetic
  `.example` hosts replaced with real domains (reuters.com,
  arxiv.org, ign.com, allrecipes.com, etc.). Inverted
  regression test asserts no `.example` / `.invalid` / `.test` /
  `.localhost` in output across 128 (flavour × intensity ×
  seed) combos. `leak` audit now clean on Browser-Ext.
- **wasm-engine perf.** Slug hoisted out of entry loop; new
  `slugify()` single-pass helper (4 allocs → 1). Latency
  ceiling test asserts `generate_batch(100 sessions) < 200 ms`.
- **wasm-engine input bound.** `MAX_PROFILE_JSON_LEN = 4096`;
  `generate_batch` returns an error JSON (not a panic) for
  oversized input. 2 new tests pin the bound.
- **wasm-engine tests.** 37 lib tests + 5 integration
  (`tests/public_api.rs`) + 2 proptest properties
  (`tests/property.rs`, ≥256 cases each) covering
  no-synthetic-TLD and well-formed-JSON invariants.
- **Options page tokenized.** `options.css` fully consumes
  `tokens.css` (was 20+ hard-coded hex values); `options.html`
  loads tokens alongside. Automatic dark mode.

### Added — prior cycle
- **Design tokens.** `src/shared/tokens.css` — shared foundation for
  the extension UI. Color palette (light + dark, honoring
  `prefers-color-scheme`), 4/8 px spacing grid, minor-third type scale,
  radius, elevation, motion with `prefers-reduced-motion`, and a
  `.pd-focusable` focus-ring utility. Mirrored under the `PlausiDen`
  top-level in `design/tokens.css`.
- **Popup: three-state traffic light.** Replaces the prior binary
  active/paused dot. States: `ok` (green — generation active, last run
  fresh), `warn` (amber — paused, starting, or last run > 4 h ago),
  `err` (red — reserved for explicit interference signal wired by the
  self-check monitor, task #33). ARIA `role="status"` with `aria-live`
  so screen readers announce changes.
- **Popup: live refresh loop.** While the popup is open, stats refresh
  every 5 s so the user sees actual progress without reopening.
- **Popup: accessibility.** `aria-pressed` on the Enable/Pause toggle,
  keyboard focus rings (`.pd-focusable`), `aria-label` on Generate now.

### Changed
- **Popup styling** rewritten to consume design tokens. No raw `#hex`
  values anywhere in `popup.css`; all color / spacing / typography
  reads from `tokens.css` custom properties. Dark-mode support is
  automatic via the `@media (prefers-color-scheme: dark)` block in
  `tokens.css`.
- **Build pipeline** (`scripts/build-chrome.sh`, `scripts/build-firefox.sh`)
  now copies `src/shared/tokens.css` into both `dist/chrome/popup/` and
  `dist/chrome/options/` (and the Firefox equivalents) so the popup
  and options pages have the token file available at runtime. The
  `.zip` / `.xpi` archives include it.
- **Popup HTML** switched the stat rows from `<div class="stat-row">`
  to semantic `<dl><dt><dd>` so screen readers traverse them as a
  definition list.

### Security / leak-audit findings
- The repo's `wasm-engine/` Rust crate (a self-contained WASM-bound
  alternative generator) currently ships 30+ hosts under the `.example`
  TLD. `.example` in a user's browsing history is a **perfect
  fingerprint** that defeats plausible deniability. The in-production
  TypeScript stub generator (`src/background/generator.ts`) is **not**
  affected — it ships real domains (`reuters.com`, `apnews.com`,
  `amazon.com`, etc.).
  - Status: TypeScript stub is the shipping path for v0.1.
  - Tracked: task **#11** (wasm-engine `.example` fix, P0 before any
    WASM path is rolled out).
  - Regression gate: audit runner now detects this pattern
    (`scripts/audit/run.sh leak`).

### Infrastructure (PlausiDen-wide, documented here for extension context)
- Project-root test isolation framework written under
  `scripts/sandbox/` with three tiers: bubblewrap (T1 process
  sandbox), isolated browser profiles (T2), QEMU/libvirt VM (T3).
  Documented in `TESTING.md` at project root.
- Audit framework under `scripts/audit/run.sh` — ten named audits
  including `leak` (now catches synthetic-TLD fingerprints),
  `broken`, `tests`, `ugly`, `ux`, `impact`. Documented in `AUDITS.md`.
- Priority ranking in `PRIORITIES.md` — Tier 0 (this extension) is
  rank 1 by reachable user count (≈5 B web users).

## [0.1.0] — 2026-04-04

### Added
- Initial extension scaffold for Chrome (MV3) and Firefox.
- TypeScript stub data generator with 16 content categories and
  real-domain vocab (`src/background/generator.ts`).
- Circadian + burst scheduler (`src/background/scheduler.ts`) with
  variable delays.
- History + cookie injector using `chrome.history.addUrl` and
  `chrome.cookies.set` (`src/background/injector.ts`).
- Three built-in profiles: Casual User, Academic Researcher,
  Journalist / Investigator.
- Popup UI with status, stats, enable/pause, generate-now.
- Options page scaffold.
- Minimum MV3 permissions: `history`, `cookies`, `storage`, `alarms`.
  No `host_permissions`, no `webRequest`, no network access.
- `wasm-engine/` Rust crate scaffold — a deterministic PCG-based
  session generator targeting `wasm32-unknown-unknown`. Not yet
  integrated; TypeScript stub is the shipping path. Integration
  tracked as task #11 (leak fix) + future M1b.3 + M1b.4 steps.
