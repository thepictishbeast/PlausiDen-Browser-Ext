# PlausiDen Browser Extension — Operational Security

This document describes what the extension protects against, what it
does NOT protect against, the operational considerations for each
feature, and the known failure modes. Read it before relying on the
extension for any threat model more demanding than bulk tracker
evasion.

The extension is **Tier 0** — the lowest-friction, highest-reach layer
of the PlausiDen Protection Suite. It trades deep system integration
for a 30-second install that runs on any browser, any OS, without
admin rights. For deeper protection, combine with Tier 2 (Desktop),
Tier 3 (PlausiDenOS), or Tier 4 (USB).

---

## 1. Who this guidance is for

- **People whose adversary scrolls their browser history** — abusive
  partners with shared devices, ex-partners with post-separation
  access, family members of control-freak parents.
- **People against data-broker resale** — users whose browsing is
  aggregated and sold by ad-tech firms and later bought by
  consumer-profiling companies, insurance underwriters, or political
  operatives.
- **Journalists and researchers** whose topics of interest would be
  evidence of their work product to anyone inspecting the machine.
- **Targeted-harassment avoidance** — users whose online interests
  are being mined to build a dossier for doxxing or SWATting.

This document is **not** written for users expecting Tier 3 active-
endpoint-compromise defense. Browser extensions cannot defeat
commercial mercenary spyware that owns the OS. Read Section 3.

---

## 2. Threat models covered

The extension is effective, in increasing order of adversary
capability:

1. **Casual inspection of browser history.** Someone with physical
   access opens Chrome's history panel or `about:history` and scrolls.
   The polluted entries are indistinguishable from real entries on
   their face — same domains, same titles, same visit times.
2. **`places.sqlite` / `history.db` forensic reads.** A basic forensic
   triage that copies the browser's SQLite store and opens it in a
   viewer finds the polluted rows interleaved with real ones. The
   referrer chains and cookie cross-references are internally
   consistent.
3. **Cookie-store inspection.** `chrome.cookies.set` calls attach
   cookies to the domains of the injected history entries. An examiner
   cross-referencing cookies-with-history-rows does not find orphans.
4. **Browser-sync consumers.** If the user has Chrome Sync or Firefox
   Sync enabled, the polluted history syncs out to the user's own
   cloud account — the pollution is consistent across devices. This
   cuts both ways: see Section 4.2.
5. **Bulk data-broker feeds.** Behavioral vectors sold by ad-tech
   vendors derived from browser telemetry, third-party cookies, and
   persistent tracking identifiers are polluted to the extent that
   the browser's own stores drive that data. See Section 5 for what
   this extension does NOT intercept.

The threshold it is designed to clear is "any single data point found
in browser history cannot be asserted as evidence of user intent,
because any single point could have come from the pollution engine."

---

## 3. Threat models NOT covered

Do not rely on the extension alone if any of the following describes
your adversary.

### 3.1 Active endpoint compromise by commercial spyware

Pegasus, Graphite, Predator, Reign, and related mercenary surveillance
tools compromise the operating system. They can:

- Read memory in real time as the user browses, bypassing all on-disk
  pollution.
- Screenshot the screen and exfiltrate the images.
- Record every keystroke and every URL typed into the address bar.
- Disable or uninstall the extension from system level.

Browser-level pollution does not address any of these. Users who
expect this adversary must use Tier 3 (PlausiDenOS with seL4 protection
domains) or accept that this tier is not sufficient.

### 3.2 Network-traffic analysis

The extension injects entries into the browser's history database. It
does **not** generate actual HTTP traffic. An adversary with access to:

- ISP flow logs
- Corporate / campus network proxies
- DNS query logs
- TLS SNI observation
- Upstream packet captures

sees only the user's **real** navigation. Polluted entries in history
do not appear on the wire. If your threat model includes network-
level observation, combine with a reputable VPN, Tor (where
appropriate), or accept the gap.

### 3.3 Browser cache / favicon / session forensics

`chrome.history.addUrl` writes to the history database only. It does
NOT populate:

- The disk cache (`~/.cache/google-chrome/Cache/`)
- The favicon database
- Session restore state
- WebSQL / IndexedDB backing a specific site
- Cross-origin fetch metadata

A sophisticated forensic examiner who cross-references history entries
against cache presence can identify the polluted entries as
"visited according to history but no cache footprint" → synthetic.
The degree of forensic sophistication required is not negligible but
is within reach of any competent DFIR practitioner.

Tier 2 (Desktop) extends pollution to the on-disk artifacts; Tier 3
(PlausiDenOS) extends it further to translator interposition over all
filesystem I/O.

### 3.4 Physical coercion

Software cannot protect a user who is compelled under physical threat
to unlock the device and navigate to specific content. PlausiDen as a
suite addresses this through deadman switches and duress passphrases
(`PlausiDen-Desktop`), not through the browser extension.

### 3.5 Legal process

The extension does not confer legal immunity. Jurisdictions vary on
whether anti-forensic tools are themselves grounds for charges or
adverse inference. Consult counsel in your jurisdiction. This
document is not legal advice.

### 3.6 Account-side records

Search engines, social platforms, and email providers log activity
server-side against the user's account. The extension does not touch
server-side records — those stay as the user's real activity.

---

## 4. Per-feature operational considerations

### 4.1 History injection (`chrome.history.addUrl`)

**What it does:** adds a row to the browser's history database. Same
as if the user had actually navigated to the URL and immediately
closed the tab.

**Operational considerations:**

- **Batch size.** The extension generates 1–3 sessions per alarm fire,
  each with 2–8 entries. Aggregate daily volume follows the profile
  setting (Casual ≈ 50, Researcher ≈ 80, Journalist ≈ 100).
- **Timing.** The scheduler applies circadian weighting, burst
  patterns, and ±30 % jitter. Do not manually force hundreds of
  entries via "Generate now" in rapid succession — the resulting
  timestamp cluster is distinguishable from organic browsing.
- **Topic mix.** Categories are keyed to the active profile. If the
  user normally browses, say, exclusively technical content, a Casual
  profile (news / shopping / entertainment) generates atypical
  history for them. Pick a profile whose category mix is plausible
  for the user.
- **Pause before high-stakes events.** If the user knows the device
  will be inspected at a known time (border crossing, meeting with
  hostile counsel, mandatory check-in), pausing generation N days
  in advance and relying on the existing mixed history is safer than
  actively generating close to the event.

### 4.2 Cookie injection (`chrome.cookies.set`)

**What it does:** sets cookies on the domains of recently injected
history entries. Common tracker names (`_ga`, `_fbp`, `CONSENT`) with
plausible-looking hex / GA-format values.

**Operational considerations:**

- **Expiration matches organic.** Cookie expirations span 1 hour to
  2 years with realistic distribution. No custom per-site policy is
  applied.
- **HttpOnly / Secure.** Cookies are set with `Secure: true` and
  `HttpOnly` for cookies where the common pattern is HttpOnly. SameSite
  defaults to `lax`.
- **Interaction with real cookies.** If the user is actually logged
  into, say, `reddit.com`, the extension does not set a colliding
  `reddit_session`. `chrome.cookies.set` overwrites the existing value
  if the name/domain/path collide — meaning the user's real session
  cookie could be destroyed if an injection targets the same cookie
  name. Toggle **Generate cookies** off in the options page if this
  risk matters for the user's workflow, or inspect the cookie store
  after enabling to confirm no live sessions were overwritten.

### 4.3 Scheduling

**What it does:** circadian + burst + jitter alarm timing via
`chrome.alarms`.

**Operational considerations:**

- **Active-hours defaults.** The default profile active hours
  (Casual: 08–23, Researcher: 07–22, Journalist: 06–24) may or may
  not match the user's real sleep pattern. If inspected, a user who
  sleeps at 22:00 local time but has polluted history from 02:00
  local time is anomalous. Override active hours in options.
- **MV3 1-minute floor.** Chrome MV3 service-worker alarms have a
  minimum 1-minute delay. Sub-minute burst patterns are capped at 1
  minute. For higher-realism burst fidelity, Tier 2 (Desktop) has
  sub-second scheduling.

### 4.4 Options / settings storage

**What it does:** stores the configuration in `chrome.storage.local`.

**Operational considerations:**

- **Storage is readable by other extensions** with the `storage`
  permission operating on the same extension ID — but this is only
  relevant if a second PlausiDen-impostor extension is installed.
  Users should install only from Chrome Web Store / Firefox Add-ons
  listings authored by the PlausiDen publisher.
- **Storage persists across browser restarts.** An examiner who
  mounts the browser profile directory can read `Local Extension
  Settings/<extension-id>/` and see the user's chosen profile,
  intensity, and generation statistics. The statistics reveal that
  the extension was installed and how long it has been running.
  Install-time disclosure is unavoidable for browser extensions.

### 4.5 Self-check probe (`src/background/self-check.ts`)

**What it does:** every 30 minutes (and on user demand via the
options page's "Check now" button) runs a synthetic
`chrome.history.addUrl` → `getVisits` → `deleteUrl` round-trip
under the reserved URL
`https://self-check.plausiden.invalid/probe#t=<ms>` and records
the outcome in `chrome.storage.local` (`plausiden_self_check` key).
The state drives the popup's traffic-light: `blocked` /
`silent_block` go red, stale / cleanup-failed go amber. The
alarm fires independently of `config.enabled` so interference
is surfaced even when the user has paused generation.

**Operational considerations:**

- **The probe URL uses the RFC 6761 reserved `.invalid` TLD**,
  guaranteed never to resolve. If the `deleteUrl` step fails
  (`cleanup_failed` status), the residual entry remains in the
  user's history as a host that obviously never existed — which
  makes it an install-time fingerprint for anyone examining the
  history. Mitigation: `cleanup_failed` triggers an amber traffic
  light + diagnostic note in the popup; users who see it repeatedly
  should re-enable cookie generation and / or reinstall.
- **The probe deliberately writes to history.** On a policy-managed
  browser where `chrome.history.addUrl` is blocked, the probe
  itself will fail and surface the block — that is by design. On a
  browser where the permission is present but the WRITE is silently
  filtered, the `getVisits` step returns empty and we report
  `silent_block`. Both states are user-visible.
- **The probe URL has no PII.** The fragment is a timestamp
  (`Date.now()` in ms) — useful for uniqueness across runs, not
  personally identifying. Even so, if a forensic examiner dumps
  the extension's IndexedDB + history DB together, they can
  correlate the fragment timestamp with the probe-record time in
  `plausiden_self_check` to confirm the extension was running at
  that instant. This reveals install + runtime fact, not content.
- **The probe does not disable in Incognito.** If the user
  installs the extension with Incognito access enabled, probes
  run in the Incognito profile too, which defeats the usual
  assumption that Incognito leaves no trace. Users in adversarial
  jurisdictions should NOT grant Incognito access — the options
  page surfaces this as a warning (task #51, pending).

---

## 5. Known failure modes

### 5.1 Browser policy interference

Enterprise-managed browsers (`chrome://policy`, Firefox Enterprise
Policies), Play-Protect-analogue browser extensions, and some corporate
endpoint agents can block `chrome.history.addUrl` or force-disable
extensions. Symptoms: extension runs but history never populates.
Mitigation: self-check monitor (see §4.5) surfaces a red traffic-light
state when interference is detected, and distinguishes hard blocks
(`blocked`) from silent filters (`silent_block`).

### 5.2 Storage quota exhaustion

`chrome.storage.local` has a 5 MB quota per extension in Chrome. The
extension stores aggregate stats only (small JSON), so this is not a
practical limit, but a pathological long-running install could in
principle approach it. The config schema is bounded.

### 5.3 Cookie overwrite

See Section 4.2. A real session cookie on a popular domain can be
overwritten by injection. Toggle **Generate cookies** off if working
sessions must be preserved.

### 5.4 Sync amplification

Chrome Sync / Firefox Sync ships the polluted history to every signed-
in device on the account. This is usually desired (device-wide
consistency) but means that an adversary with access to any signed-in
device, or to the sync server with valid credentials, sees the
polluted history too. If one device must retain the real history
(e.g. for the user's own records), do not sign that device into
sync with PlausiDen active.

### 5.5 Uninstall leaves residue

When the extension is uninstalled, the entries it injected **remain
in browser history**. The user has to clear them manually via
`chrome://history/` or `about:history` if they want them gone. This is
intentional — the pollution works because it persists as organic-
looking data, and any "cleanup on uninstall" would defeat that. But
it means users should understand that uninstalling does not roll back
pollution.

### 5.6 Browser updates disabling the `history` permission

Chrome and Firefox occasionally restrict extension APIs. If Chrome
ever deprecates `chrome.history.addUrl` or requires tighter
permissions, the extension's primary mechanism fails. The fallback
design (offscreen document with sandboxed iframes performing actual
navigations) is documented in `ARCHITECTURE.md` but not implemented.

---

## 6. Recommended reading

- **Amnesty MVT** — Mobile Verification Toolkit. If you suspect your
  device is already compromised by commercial spyware, start here:
  <https://mvt.re>.
- **EFF Surveillance Self-Defense** — threat-modeling primer:
  <https://ssd.eff.org>.
- **NIST SP 800-88 Rev. 1** — if you're thinking about decommissioning
  a device containing sensitive browsing history, read the media
  sanitization guide before destroying hardware.
- **Tails Project documentation** — for users who need amnesiac
  browsing in addition to pollution.
- **PlausiDen-Desktop OPSEC.md** — if you need Tier 2 protection
  covering on-disk artifacts, not just browser history.
- **PlausiDen Protection Suite — v1.2 Build Addendum** (in
  `PlausiDen Protection Suite/plausiden-build-addendum-v1.2.md`) for
  the architectural rationale of the tiered approach.

---

## 7. What this document does not do

- **This is not legal advice.** If you are facing, or believe you
  will face, legal process touching your browsing history, consult
  an attorney in your jurisdiction. Possession of anti-forensic
  tools has different legal posture in different countries; see
  `LEGAL.md` (when written — task #29 for Inject, not yet for this
  repo) for an overview.
- **This is not a manual for building or modifying the extension.**
  See `CONTRIBUTING.md` and `ARCHITECTURE.md` for that.
- **This document does not guarantee a specific outcome.** Software
  can raise the cost of adverse inference from browser history; it
  cannot prevent an adversary from drawing the inference anyway.
  Prosecutors, abusive partners, and forensic examiners are humans
  who reason under uncertainty; pollution introduces uncertainty but
  does not eliminate motivated interpretation.
- **This document does not cover the dual-use nature of the tool.**
  The same capability that helps a journalist in an authoritarian
  jurisdiction can frustrate a lawful forensic investigation in a
  democratic one. That tradeoff is acknowledged openly in the
  project's framing (v1.2 §D.1). It is the user's responsibility to
  deploy the tool ethically in their own context.
