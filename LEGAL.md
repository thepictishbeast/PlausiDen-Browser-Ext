# Legal Considerations — PlausiDen Browser Extension

This document describes the **general legal landscape** around
installing and running the PlausiDen browser extension. It is not
legal advice. If your circumstances are stakes-bearing — you are
facing or expect legal process touching your device, you are in a
jurisdiction whose privacy-tool laws you do not know, you are an
employee whose employer has restricted policy — consult a licensed
attorney in your jurisdiction before deploying this or any
anti-forensic tool.

v1.2 §G.2 makes LEGAL.md required for `PlausiDen-Inject` and
`PlausiDen-USB`; this one is written for the browser extension
because the dual-use nature of any anti-forensic tool is
non-trivially different by jurisdiction, and users deserve an
honest overview rather than hedging marketing copy.

---

## 1. Scope of this document

This document summarizes the publicly-known legal posture of
installing a browser extension that writes entries to your own
browser's history database. It does **not**:

- constitute legal advice for any individual case;
- substitute for counsel in a jurisdiction you're unfamiliar with;
- promise a specific outcome in any proceeding;
- cover every jurisdiction (the world has ~200; we touch the
  largest populations).

The extension is **open source** and **client-side only**. It makes
no outbound network connections. The user's real browsing history
is not transmitted, collected, or analyzed by the extension or its
authors.

---

## 2. United States

### 2.1 Writing to your own device

Under 18 U.S.C. § 1030 (the Computer Fraud and Abuse Act), accessing
a "protected computer" without authorization or in excess of
authorized access is criminal. Installing an extension you author or
chose on a device you own is *authorized* access by definition — the
CFAA does not reach a user modifying data stored on their own device.

Courts have repeatedly held that a device owner may install any
software they wish on their own device. See *United States v. Drew*
(C.D. Cal. 2009) on the limits of "unauthorized access," and more
recently *Van Buren v. United States*, 593 U.S. ___ (2021) which
narrowed CFAA's "exceeds authorized access" clause further.

Running this extension on a device you do not own (employer device,
family member's device, institutionally-managed device) **may**
implicate different theories depending on the device owner's policies
and your access rights. Do not install this extension on a device you
do not own without the owner's informed consent.

### 2.2 Forensic reliability challenges

If browser history from your device is introduced as evidence in a
US proceeding, the reliability of that evidence can be challenged
under *Daubert v. Merrell Dow Pharmaceuticals*, 509 U.S. 579 (1993),
which requires the proponent to establish that the evidence
gathering technique produces reliable results.

An expert forensic examiner testifying that "this entry appears in
the history database, therefore the user visited this URL at this
time" asserts a fact that the PlausiDen extension demonstrably
falsifies: the entry can be present without the user ever having
navigated to it. Counsel may argue — and the judge may find — that
this technique no longer meets Daubert's reliability standard for
history-based inferences on devices where PlausiDen is installed.

This is a hand for the defense, not a shield. It may shift the
burden onto the prosecution to authenticate the entries through
means independent of the history database (network logs, DNS logs,
correlated cache data). It does not guarantee a specific outcome.

### 2.3 The Fourth Amendment

Browser history on your personal device is subject to *Riley v.
California*, 573 U.S. 373 (2014), which held that law enforcement
generally needs a warrant to search the contents of a cell phone
during an arrest. The same logic extends by analogy to personal
laptops and desktops (*Carpenter v. United States*, 585 U.S. 296
(2018) further extended privacy protection to digital records held
by third parties).

None of this prevents a lawful search with a valid warrant. The
extension does not provide Fourth Amendment immunity; it makes the
fruits of such a search less reliable.

### 2.4 The data-broker loophole & FISA § 702

The FISA Amendments Act of 2008, as reauthorized, creates a legal
pathway for bulk collection of data that has been commercially
purchased rather than collected via warrant. This "data-broker
loophole" is central to why PlausiDen exists: browser history
aggregated by ad-tech vendors and sold to commercial buyers (who
may include US federal agencies) is outside the warrant requirement
of §§ 2703 and 2705.

Running the extension pollutes the stream before it enters the
aggregation-and-sale pipeline. The legal status of the pollution
itself is not affected — it is the user modifying their own device
data — but the downstream reliability of the purchased stream is.

### 2.5 Employer / school / institutional context

If you are using a device provided by your employer or an academic
institution subject to an acceptable-use policy, installing any
browser extension — including this one — may violate that policy.
This is typically a **contractual** matter (grounds for termination
or suspension) rather than criminal. It can become criminal if the
employer is federal or state government and you exceed your
authorized access to government systems. Consult your employer's
policy and, if in doubt, counsel.

---

## 3. European Union

### 3.1 GDPR posture

Article 4(1) of the General Data Protection Regulation defines
"personal data" as information relating to an identified or
identifiable natural person. Synthetic browsing entries generated
by the extension do not relate to a real person — they are
fabricated URLs attached to the extension user's own history
database on their own device.

GDPR does not reach synthetic data about nobody. The user is not a
data controller or processor with respect to the synthetic entries
— there is no data subject for those entries. The user remains a
data subject for their own real browsing that was already captured
by websites and trackers before installation.

Polluting an ad-tech vendor's dataset with synthetic-looking real-
person-like entries could raise a question about the user's role in
the data pipeline. The extension does not emit personal data *about
other people*, which is the GDPR scope — it emits synthetic data
*about fabricated personas* that only appear in the aggregated feed
through downstream collectors' choice to collect.

### 3.2 ePrivacy Directive

The ePrivacy Directive (2002/58/EC) governs cookies and
tracking-related data. Generating cookies on your own device that
resemble tracking cookies — which the extension does — is a
modification of your own browser state and does not touch another
party's data subjects. The `Secure`, `HttpOnly`, and `SameSite`
attributes set on generated cookies comply with the directive's
cookie-set format requirements for the domains referenced.

### 3.3 EU Digital Markets Act & platform policy

Browser-extension distribution on the Chrome Web Store and Firefox
Add-ons is subject to those stores' developer policies. Those
policies can change. Distribution outside the stores (sideloaded
unpacked) is legally permitted but may trigger browser warning
prompts or be blocked by enterprise policy.

---

## 4. Authoritarian contexts

In jurisdictions that criminalize the use, possession, or
distribution of privacy tools — the list shifts, but has at various
times included Belarus, Iran, Russia, China, Saudi Arabia, Egypt,
Turkey, Pakistan, and UAE — the mere presence of an anti-forensic
tool on your device may be grounds for arrest, questioning, or
worse *regardless of whether you have used it for any specific
purpose*.

If you are in such a jurisdiction or traveling through one:

- **Do not install the extension casually.** Uninstalling before
  border crossings is insufficient — installed-and-removed traces
  are recoverable by forensic examiners.
- Prefer Tier 3 (PlausiDenOS) for these threat models. The browser
  extension is Tier 0 — minimum friction, maximum reach, minimum
  opsec. That tradeoff is wrong for high-risk jurisdictions.
- If you cannot avoid the jurisdiction and cannot use PlausiDenOS,
  consider using a Tails-style amnesiac live OS for the duration
  of the exposure, not a persistent browser extension.

The extension's authors cannot know your jurisdiction, your
exposure, or your threat model. The responsibility to assess local
law is yours.

---

## 5. Specific capability notes

### 5.1 "Writing to my own device's browser history"

The extension calls `chrome.history.addUrl()` and
`chrome.cookies.set()` — both first-party Web Extension APIs,
invoked with the user's standing authorization (granted at
install by the permission prompt). These calls modify the user's
own browser data stores. They do not:

- emit any network traffic;
- contact any remote server;
- export, collect, or transmit the user's real browsing;
- modify any data outside the browser's own profile directory;
- require elevated privileges or administrative access.

### 5.2 Notification-cache extraction (Prairie Land)

This extension does **not** generate fake notification entries —
that is the scope of `PlausiDen-Android` (Tier 1) and the
`engine-comms::notifications` module when it ships. The "Prairie
Land precedent" refers to *In re Prairie Land Cooperative* and
related cases where notification cache data was held admissible
without the conversation being contemporaneously observed. That is
a mobile-device concern; this browser extension does not address
it. See `PlausiDen-Android/LEGAL.md` when that file lands.

### 5.3 Sync services

If Chrome Sync or Firefox Sync is enabled, the polluted history
syncs to the user's account and to every other device signed into
that account. This is **the user modifying their own cloud data via
their own device** — which is generally permissible. It can become
problematic if the user's sync account is shared (e.g. family
accounts) and the co-account-holder was not informed that the
extension is polluting shared data.

---

## 6. Citations — primary sources

- 18 U.S.C. § 1030 (Computer Fraud and Abuse Act).
- 18 U.S.C. § 2703, § 2705 (Stored Communications Act).
- 50 U.S.C. § 1881a (FISA § 702).
- *Van Buren v. United States*, 593 U.S. ___ (2021).
- *Riley v. California*, 573 U.S. 373 (2014).
- *Carpenter v. United States*, 585 U.S. 296 (2018).
- *Daubert v. Merrell Dow Pharmaceuticals*, 509 U.S. 579 (1993).
- Regulation (EU) 2016/679 (General Data Protection Regulation),
  Articles 4, 6, 25.
- Directive 2002/58/EC (ePrivacy Directive), as amended by
  Directive 2009/136/EC.
- Regulation (EU) 2022/1925 (Digital Markets Act).

No case has, as of this writing, addressed the specific question of
anti-forensic pollution of a user's own device data stores as a
criminal or civil matter; the citations above are the closest
analogues. The legal landscape is expected to develop.

---

## 7. What this document does not cover

- Jurisdiction-specific **criminalization** of privacy tools
  beyond the note in §4. Check local law.
- **Professional licensing restrictions** (attorneys, doctors,
  accountants) that may impose duty-of-record obligations which
  conflict with pollution of browsing history used in billing or
  record-keeping.
- **Civil discovery** context — if you are a party to civil
  litigation, spoliation-of-evidence doctrine in your jurisdiction
  may impose obligations that predate or override your use of
  this extension. Consult your counsel.
- **Insurance** — some policies (cyber, professional liability)
  require preservation of browsing records for incident
  investigation. Check before installing.
- **Tax and regulatory records** (SEC, FINRA, HIPAA, etc.) — if
  you are in a regulated profession, your obligations may exceed
  personal-device norms. Regulators see polluted history as a
  retention failure, not a privacy win.

This document will be updated as case law develops. File issues or
pull requests with new citations.
