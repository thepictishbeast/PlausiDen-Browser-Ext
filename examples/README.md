# Examples

Illustrative payloads and configurations for the PlausiDen browser
extension. None of these files are consumed at runtime — they exist as
documentation-by-example.

---

## Configurations

### `default-config.json`

The shape of `ExtensionConfig` as freshly installed. Mirrors
`DEFAULT_CONFIG` in `src/shared/types.ts`. Use this as a starting point
when writing tests that need a baseline config object.

Key points:

- `enabled: false` — the extension never starts generating without the
  user pressing the Enable toggle. Installing silent defaults would
  violate the "no silent failures / no surprises" UX rule.
- `activeProfile: "casual"` — the Casual persona is the default because
  its category mix (news, social, shopping, entertainment, weather)
  maps onto the largest user population.
- `intensity: "medium"` — one above the minimum so there's activity to
  see if you enable it and watch, but not so aggressive that it's
  surprising.
- `generateCookies: true` — without cookies, history entries look
  orphaned under forensic cross-reference (a visited domain with no
  cookie is a red flag). Default on.
- Counters all zero — updated only by `storage.ts::recordGeneration`.

### `journalist-custom-config.json`

A user who has customized every major setting: journalist profile,
high intensity, wider active hours, custom category subset, custom
daily entry target. The illustrative counters show what a
steady-state install's storage looks like after a few weeks of use
(~23k entries, ~4k sessions, ~143 ms per run with 100% landing).

Useful as a test fixture and as a worked example of the options
page's surface area.

---

## Message payloads (indicative)

The popup and options pages send messages shaped like `ExtMessage`
from `src/shared/types.ts`. The service-worker's handler table:

| `type`            | `payload` shape                                          | Response                                               |
|-------------------|----------------------------------------------------------|--------------------------------------------------------|
| `GET_STATS`       | _(none)_                                                 | `ActivityStats`                                        |
| `GET_CONFIG`      | _(none)_                                                 | `ExtensionConfig`                                      |
| `TOGGLE_ENABLED`  | _(none)_                                                 | `{ enabled: boolean }`                                 |
| `UPDATE_CONFIG`   | `Partial<ExtensionConfig>` — sanitized before persisting | updated `ExtensionConfig`                              |
| `GENERATE_NOW`    | _(none)_                                                 | `{ entries, cookies, sessions }` — counts from this run |

Any handler error is wrapped in `ExtErrorResponse`:

```json
{
  "error": true,
  "messageType": "UPDATE_CONFIG",
  "userMessage": "Couldn't save that change. The previous settings are still active.",
  "cause": "chrome.storage.local.set rejected: quota exceeded (bounded to 200 chars)"
}
```

The popup renders `userMessage`; the `cause` is devtools-only.

---

## Adding a new example

1. Put the file here under `examples/`.
2. Reference it in this README.
3. If the file needs to stay valid JSON (no comments), put
   explanatory metadata in a sibling `*.md` rather than inventing a
   `_comment` field that downstream consumers might trip on.
   (The JSON examples above use `_comment` / `_note_*` keys because
   they are explicitly illustrative and consumers are expected to
   ignore underscore-prefixed keys.)
