# Contributing to `plausiden-browser-ext`

This is Tier 0 of the PlausiDen Protection Suite — lowest-friction,
highest-reach. Every change is measured against two questions:

1. Does it reduce the per-user effort to get protection running?
2. Does it keep the extension's privacy surface honest — no network
   calls, no telemetry, minimum permissions?

If the answer to either is no, the change needs a compelling reason.

---

## Toolchain

- **Node.js** pinned at `22.22.2` via `.nvmrc` (nvm) and `.node-version`
  (asdf, fnm, volta). Run `nvm use` or equivalent before working in
  this repo. `package.json` declares `engines.node: ">=18"` as the
  minimum working version, but CI and releases build on `22.22.2`.
- **TypeScript** pinned via `devDependencies` in `package.json`; run
  `npm ci` (not `npm install`) to install the exact `package-lock.json`
  resolution.
- **Build** runs via `esbuild` and does not require a separate
  TypeScript compile step; the `typecheck` script invokes `tsc
  --noEmit` purely for type validation.

## Repo layout

```
manifests/
├── chrome/manifest.json      MV3
└── firefox/manifest.json     WebExtension (MV3 with gecko settings)
src/
├── background/
│   ├── service-worker.ts     MV3 background entrypoint
│   ├── scheduler.ts          Circadian + burst + jitter
│   ├── generator.ts          TypeScript stub — real domain vocab
│   └── injector.ts           chrome.history.addUrl + chrome.cookies.set
├── popup/                    Status + stats + toggle
├── options/                  Profile / intensity / cookies toggle
└── shared/
    ├── types.ts              Cross-module types + DEFAULT_CONFIG
    ├── profiles.ts           Built-in profiles
    ├── storage.ts            chrome.storage.local wrapper
    └── tokens.css            Design tokens (mirror of /design/tokens.css)
wasm-engine/                  Self-contained WASM generator (Rust)
scripts/                      Build scripts (bash; called via npm run)
```

---

## Code standards

- **TypeScript strict.** No `any`. No `// @ts-ignore`. Run
  `npm run typecheck` before every push.
- **No network calls.** The extension does not make HTTP requests.
  Any `fetch` / `XMLHttpRequest` / `WebSocket` call added anywhere in
  the codebase is a review blocker. The `leak` audit enforces this.
- **Minimum permissions.** The manifest permission set is
  `{history, cookies, storage, alarms}`. Any addition requires:
  1. A justification in the PR description: what new capability, why
     it is strictly necessary, what threat surface it opens.
  2. An update to `scripts/dev/check-manifest-permissions.sh` to
     extend the allowlist.
  3. An update to `OPSEC.md` Section 4 (per-feature ops) explaining
     the new capability's operational considerations.
- **Design tokens, not raw hex.** Any new CSS consumes
  `src/shared/tokens.css` custom properties
  (`var(--pd-color-fg)`, `var(--pd-space-3)`). Raw `#hex` values
  outside `tokens.css` are a review blocker.
- **Accessibility.** Every interactive control has `aria-*` as needed,
  visible focus ring (`.pd-focusable`), keyboard-reachable via Tab.
  Run a screen-reader pass before merging UI changes.
- **No emoji.** Consistent with project-wide framing (v1.2 §D.1).
- **No ad-hoc `console.log` in production paths.** Service-worker
  logs are observable via `chrome://extensions → service worker →
  Inspect`; they are debugging output only. Strip before merge.

---

## Inline annotations (AVP-2)

Mirrors the table canonicalized in `PlausiDen-Engine/CONTRIBUTING.md`.
We use a small grep-friendly annotation vocabulary so CI and human
reviewers can audit assumptions without reading every commit. Use the
exact tags below; `grep -rn 'TAG:'` for each should return every
instance.

| Tag                 | When to use                                                                                                                                                                    |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `BUG ASSUMPTION:`   | Every exported function. One line describing what could go wrong in this code path.                                                                                            |
| `SECURITY:`         | Threat mitigated by this code + how. Use near input sanitizers, permission-gating, URL allowlists, error-redaction.                                                            |
| `REGRESSION-GUARD:` | Code that exists only to prevent a past bug from returning. Reference the test that would fail without it.                                                                     |
| `SHIP-DECISION:`    | Dated annotation listing accepted residual risks and the human (or Claude session) who signed off. Required before any Chrome Web Store / AMO upload.                          |
| `AVP-PASS-N:`       | `<date> finding and resolution` — records that a specific AVP-2 pass found and closed an issue. Drop into the body of whichever function was touched.                           |
| `UX-DEBT:`          | Manual verification still required; note the risk if shipped without. Useful when a UI change cannot be fully covered by type-checker or unit test.                            |
| `CROSSFIX:`         | `<source-repo> <description>` — when a fix from a sibling repo is ported here. The source repo's commit SHA belongs in the message, not the code.                              |
| `DEBUG-REMOVE:`     | Line must be stripped before release. Strip before `npm run build`.                                                                                                            |

Example of a well-annotated runtime-message sanitizer (adapted from
`src/shared/config-validation.ts`):

```ts
/** Validate and coerce a raw payload into a safe Partial<ExtensionConfig>.
 *
 * BUG ASSUMPTION: runtime-message payloads are untrusted; a crafted
 * UPDATE_CONFIG from a compromised page could carry arbitrary fields.
 *
 * SECURITY: whitelist-style — every known field is type-checked and
 * range-checked; unknown keys are silently dropped. A single bad field
 * never blocks a batch of good fields.
 *
 * REGRESSION-GUARD: covered by tests in
 * `tests/config-validation.spec.ts` (when the TS test runner lands
 * per task #19); never skip the bounds check even if the field looks
 * "obviously safe" — that's how the lifetime-counter gap got in.
 */
export function sanitizeConfigUpdate(raw: unknown): Partial<ExtensionConfig> {
    // …
}
```

`SAFETY:` (used for Rust `unsafe` blocks) and `FOSS-ABSORBED:` (used
when vendoring a crate) do not apply to this TypeScript repo today.
If the WASM bridge under `wasm-engine/` ever absorbs a crate, use
those tags per the Engine convention.

---

## Tests

Before merging any change, run:

```sh
npm run typecheck      # tsc --noEmit — strict TS
npm run lint           # eslint
npm run build          # chrome + firefox both must produce dist/
cd wasm-engine && cargo test    # wasm-engine unit + integration tests
../scripts/audit/run.sh all "$(pwd)"   # full audit pass
../scripts/dev/check-manifest-permissions.sh    # permission allowlist
```

PR CI (see `.github/workflows/`) runs the same set. A PR that fails any
of these is not merged.

When adding a feature:

- **Every public API gets a test.** TS unit tests (vitest) for TS
  surface; Rust `#[test]` for wasm-engine surface; a headless-browser
  test (puppeteer/playwright) for anything that touches the browser
  APIs.
- **Every bug fix gets a regression test.** The test fails without
  the fix and passes with it. Commit the test and fix in the same
  change.

---

## Commit messages

Follow conventional-commit-adjacent prefixes, lowercase:

- `feat: …` — user-visible new capability
- `fix: …` — bug fix; include regression test
- `docs: …` — documentation only
- `refactor: …` — internal only, no behavior change
- `test: …` — test-only change
- `build: …` — build scripts, packaging
- `chore: …` — housekeeping
- `security: …` — security posture change (use sparingly; most
  security work fits under feat/fix)

Keep the subject under 72 characters. Use the body to explain *why*,
not *what*.

---

## Dark mode — how to test

All styling consumes tokens from `tokens.css`, which switches palette
under `@media (prefers-color-scheme: dark)`. To force-test dark mode
when your OS is set to light:

1. Open the popup inside the sandboxed Chrome profile:
   ```sh
   EXTENSION_PATH=dist/chrome \
     ../../scripts/sandbox/browser-profile-chrome.sh
   ```
2. Open DevTools (Cmd/Ctrl-Shift-I), open the Rendering panel (three
   dots → More tools → Rendering).
3. Set "Emulate CSS media feature prefers-color-scheme" to `dark`.
4. Reload the popup. The palette should invert without any hex
   values changing — if a component stays light-mode-only, it is
   using raw `#hex` somewhere; grep for it and replace with a token.

Repeat for `prefers-reduced-motion: reduce` to verify the
traffic-light pulse and skeleton shimmer both pause.

## Review checklist (for reviewers)

- [ ] `leak` audit still green
- [ ] `broken` audit still green
- [ ] `tests` audit: new public code has new tests
- [ ] Manifest permission allowlist unchanged OR justification in PR
- [ ] Design tokens used, no raw `#hex`
- [ ] ARIA / keyboard accessibility intact
- [ ] No `console.log` in shipped paths
- [ ] CHANGELOG.md "Unreleased" updated
- [ ] OPSEC.md updated if feature surface changed
- [ ] No new dependencies (or explicit justification in PR)

---

## Reporting security issues

Do NOT file a public GitHub issue for security-sensitive findings.
Email the maintainer (see `SECURITY.md` when it exists) or, if that
is not yet set up, open a draft security advisory on GitHub which is
private until published.

Examples of security-sensitive findings:

- Any way to exfiltrate data from the extension.
- Any path that makes a network call.
- Any permission escalation.
- Any injection or XSS in the popup / options HTML.
- A forensic distinguisher that reliably separates polluted entries
  from organic ones better than the distinguisher AUC ≤ 0.55 target.

---

## Scope of this repo

Only Tier 0 (browser extension). Other tiers have their own repos:

- Tier 1 Android → `PlausiDen-Android`
- Tier 2 Desktop → `PlausiDen-Desktop`
- Tier 3 OS → `PlausiDen-OS-for-Mobile`
- Tier 4 USB → `PlausiDen-USB`
- Shared engine → `PlausiDen-Engine`

Features that belong in the engine or in a different tier should be
proposed there. This repo owns the browser surface and the
WASM-bindgen bridge, nothing more.
