# Anchor — Progress Log

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Phase 0: Foundations — DONE (confirmed 2026-11-15)

### Goal

A repo that builds, an empty MV3 extension that loads in Chromium, and a fixture harness that
runs over hand-written before/after page pairs. No capture and no real matching yet.

### Done when (from README)

- [x] `npm run build` succeeds for all workspaces.
- [x] The built extension loads in Chromium (verified by Playwright; manual check by owner pending).
- [x] `npm test` runs the fixture harness over every pair and passes.

### Layout

```
/                       root: npm workspaces, shared tooling config
├─ packages/matcher/    pure TS library (no DOM, no chrome.*): types + stub match()
├─ extension/           MV3 extension (WXT): background, content script, popup, e2e/
├─ fixtures/pairs/      NNN-name/{before.html, after.html, pair.json}
├─ tools/harness/       loads pairs, guards against leaks, extracts candidates, runs matcher, reports
├─ PROGRESS.md, DECISIONS.md, README.md
```

### Tasks

- [x] **0.1 Repo basics:** git, `.gitignore`, `.editorconfig`, `.gitattributes` (LF), `.nvmrc` (24),
      npm workspaces, strict `tsconfig.base.json`.
- [x] **0.2 Lint + format:** ESLint 10 + typescript-eslint strict + Prettier. A purity rule blocks
      `window`/`document`/`chrome`/`fetch` etc. in `packages/matcher/src`.
- [x] **0.3 Matcher skeleton:** types (`ElementFingerprint`, `CandidateDescriptor`, `MatchResult`
      with per-signal scores) and a stub `match()` that always returns "low", which maps to Ask.
- [x] **0.4 Extension skeleton:** WXT, permissions `storage` only, content script on localhost only;
      it sets `data-anchor-loaded` as a test hook. Static popup.
- [x] **0.5 Fixture format:** `pair.json` validated by zod (see D-009). Example:

```json
{
  "id": "001-moved",
  "change": ["moved"],
  "description": "Track order moves from the header into a new left sidebar.",
  "targets": [{ "label": "Track order", "before": "#track-order", "after": "aside #track-order" }]
}
```

- [x] **0.6 Six synthetic pairs** (fictional "Maple Market"): 001-moved, 002-renamed,
      003-restyled (button → link, new classes), 004-nested (inside a collapsed account menu,
      reworded), 005-removed (expected: no match), 006-decoy (renamed to "Orders" nav link; a
      look-alike "Track a return" button sits in the old spot). Each pair also has an unchanged
      "Search" control target.
- [x] **0.7 Harness:** `npm run harness` prints a per-target table. Outcomes are correct,
      correct-abstain, abstain or wrong (D-010).
- [x] **0.8 E2E smoke:** Playwright checks that the extension's service worker registers, the
      manifest is MV3 with `["storage"]`, the content script injects on a fixture page without
      changing it, and the popup renders.
- [x] **0.9 Scripts:** `build`, `typecheck`, `test`, `test:e2e`, `harness`, `lint`, `format`,
      `format:check`, `check`.
- [x] **0.10 DECISIONS.md:** D-001…D-014.
- [x] **0.11 Wrap-up:** see below.

### Results (2026-11-14)

- `npm test`: matcher 2/2, harness 28/28.
- `npm run test:e2e`: 4/4 (headless Chromium, ~5 s).
- `npm run harness` (stub matcher): 12 targets → 1 correct-abstain, 11 abstain, **0 wrong**.
- `npm run lint`, `npm run typecheck`, `npm run build`: clean.

### How to try

1. `npm install`, then `npx playwright install chromium` (once).
2. `npm run check` runs format, lint, typecheck, unit tests and build. `npm run test:e2e` runs the
   browser tests.
3. `npm run harness` prints the fixture report.
4. Manual: `npm run build`, open `chrome://extensions`, turn on Developer mode, click "Load
   unpacked" and pick `extension/.output/chrome-mv3`. Click the toolbar icon to see the popup.

### Known issues

- Moderate `npm audit` advisory (minimatch inside typescript-eslint, dev-only). See D-004.
- The harness extractor is a minimal stand-in. jsdom gives no positions (D-005). The real extractor
  is built in Phase 1.
- The `chrome` global is typed by hand in one e2e test. Fine for now; revisit if more tests need it.

---

## Phase 1: Capture — PLAN (awaiting approval)

### Goal

The helper can mark the elements a person uses ("things I use") on a page. Anchor stores a
complete, privacy-scrubbed fingerprint for each one, on the device, per site. As an opt-in extra,
Anchor can also remember elements the user clicks repeatedly. No matching or overlays on live pages
yet (Phase 3).

### Done when (from README, made testable)

- [ ] On a fixture page, marking a button stores a complete fingerprint (every required field filled
      in, positions not zero, personal data scrubbed).
- [ ] The fingerprint survives a browser restart. An e2e test closes Chromium, relaunches it with the
      same profile directory, and reads the fingerprint back.
- [ ] Picking never activates the element. The real click handler doesn't fire and no navigation
      happens (rule 1).

### Layout changes

```
packages/extractor/     NEW. DOM -> CandidateDescriptor / fingerprint fields. Standard DOM APIs
                        only, so it runs in jsdom (tests, harness) and in the content script.
                        Replaces tools/harness/src/extract.ts.
packages/matcher/       types refined (fingerprint v1 schema, see 1.2)
extension/
  entrypoints/background.ts     storage owner: the single writer for fingerprints (1.4)
  entrypoints/content.ts        auto-remember listener (opt-in; localhost-only for now)
  entrypoints/picker.content.ts pick mode, injected on demand (1.5)
  entrypoints/popup/            "Remember a button on this page", list for this site, settings
  src/storage/                  typed store + zod schemas + migrations
  src/privacy/                  scrubbing rules
  e2e/                          pick, persistence-across-restart, no-activation tests
```

### Tasks

Each task ends with: run `npm run check` + e2e, then a short summary.

- [ ] **1.1 Extractor package.** Move the harness extractor into `packages/extractor`, then extend
      it:
  - Real layout through `getBoundingClientRect()`. The rect is stored relative to the document (so
    scrolling doesn't change it), along with the viewport size. Both are skipped when layout
    reports zero (jsdom).
  - Visibility check: `display:none`, `visibility:hidden`, zero size and `hidden` ancestors are
    flagged. A closed `<details>` menu counts as "hidden".
  - Accessible name, following a simple version of the ARIA name rules: `aria-labelledby` →
    `aria-label` → `alt`/`title` → text.
  - Keeps the guarantee that `data-anchor*` attributes are always dropped.

  Harness switches to this package; existing 28 tests must stay green.

- [ ] **1.2 Fingerprint v1 schema.** Refine README §6:
  - add `schemaVersion: 1`, `capturedBy: "pick" | "auto"`, `createdAt`, `viewport: {w, h}`,
    `accessibleName`, `tag`
  - `pageKind` = URL path pattern with ids replaced by `*`, query and hash dropped, e.g.
    `/orders/123/track` → `/orders/*/track`
  - `visualHash` stays optional and unused (parked)

  zod schema lives next to the types; TS types are inferred from it. Old shapes go through a
  `migrate()` hook, even though only v1 exists so far.

- [ ] **1.3 Privacy scrubbing** (approved in Phase 0). These rules apply to `text`, `neighbors`,
      `accessibleName` and attribute values before anything is stored:
  - money (`$12.99`, `1.234,50 €`) → `<money>`
  - runs of 4+ digits (order, card and phone numbers) → `<num>`
  - emails → `<email>`
  - query strings and hashes are removed from `href`; numeric or id-like path segments → `*`
  - greetings that commonly carry names ("Hello, Margaret", "Hi Sam", "Welcome back, …") have the
    name part replaced with `<name>`
  - neighbor strings are capped at 40 characters, with at most 6 neighbors
  - input `value`s and anything inside `input[type=password]` are never read

  Each rule gets its own unit test. A fuzz-style test feeds in realistic account-page snippets and
  asserts that no digits-of-interest or emails remain. Limit to be honest about: names that don't
  follow a greeting can't be detected without AI, so the mitigation is keeping neighbor text short
  and taken only from nearby controls and headings.

- [ ] **1.4 Local storage.** `chrome.storage.local`, one key per site:
      `anchor:site:<origin>` → `{ schemaVersion, fingerprints[] }`. Settings live under
      `anchor:settings`. The background service worker is the only writer, and content scripts and the
      popup send it messages. That avoids two tabs overwriting each other, since `chrome.storage` has no
      transactions. Everything read from storage is validated with zod, and invalid entries are
      quarantined rather than crashing. Operations: add, rename label, delete, list by site.

- [ ] **1.5 Pick mode.**
  - **Start:** the popup button "Remember a button on this page" injects the picker into the active
    tab (`activeTab` + `scripting`, see decision P1-A).
  - **Hover / focus:** the element under the pointer or keyboard focus gets an outline. The overlay
    is drawn in a shadow DOM so the site's CSS can't break it and it can't break the site.
  - **Choose:** click or Enter. The event is caught in the capture phase with `preventDefault` +
    `stopPropagation` + `stopImmediatePropagation`, so the page never sees it (rule 1).
  - **Name it:** a small, large-text dialog asks "What do you call this?", prefilled with the
    element's visible name. It has Save and Cancel. Esc leaves pick mode at any time.
  - **Accessibility:** announcements go through an `aria-live` region. Focus returns to where it
    was. The page's own focus order isn't altered (rule 6).
  - **Scope:** only interactive elements can be picked. Clicking a non-interactive element walks up
    to the nearest interactive ancestor. Password fields are refused.

- [ ] **1.6 Popup.** Plain TS + HTML; the UI framework is still deferred (D-007).
  - "Remember a button on this page"
  - a list of remembered buttons for the current site, each with rename and remove
  - the auto-remember toggle (off by default)

  Large text and plain language.

- [ ] **1.7 Auto-remember (opt-in, off by default).** The content script counts clicks on
      interactive elements, keyed by a scrubbed descriptor hash. After 3 clicks on 3 different days
      within 30 days (decision P1-B), the element is stored as `capturedBy: "auto"` with status
      `suggested`. Suggestions show in the popup list marked "Suggested", and the helper can keep or
      remove them. The counters themselves are scrubbed and expire after 30 days. In Phase 1 this
      only runs where the content script runs (localhost/fixtures, per D-008); real sites follow
      the Phase 3 permission model.

- [ ] **1.8 E2E tests.**
  - pick → save → fingerprint in storage with all fields
  - picking doesn't fire the element's handler or navigate
  - Esc cancels and nothing is stored
  - restart: close context, relaunch with the same `userDataDir`, fingerprint still there
  - auto-remember stays silent when off, and creates a suggestion after the threshold when on (with
    a fake clock)

- [ ] **1.9 DECISIONS.md + wrap-up.** Log P1-A…P1-C and the other choices; end-of-phase report;
      Phase 2 plan.

### Decisions needing your call (my recommendation first)

| #    | Question                         | Recommendation                                                                                                                                                                                          | Alternatives                                                                    |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P1-A | How does pick mode reach a page? | `activeTab` + `scripting`: Anchor gets access to one tab only when the helper clicks the popup. There's no install-time warning about "read all your data". Works on any site.                          | Broad host permissions now (scary install prompt, against least-privilege)      |
| P1-B | When does auto-remember kick in? | 3 clicks on 3 different days within 30 days, saved as a **suggestion** the helper confirms                                                                                                              | Save silently after N clicks; or drop auto-remember until Phase 5 (helper view) |
| P1-C | Who can pick?                    | Helper and user both, through the same popup button. No roles until Phase 5                                                                                                                             | Helper-only behind a simple toggle                                              |
| P1-D | Real sites in Phase 3            | Proposed for later: the helper adds a site → Anchor asks for permission on that one site only (`optional_host_permissions`) → the content script is registered just for it. Fits "a few sites" (D-012). | `<all_urls>`                                                                    |

### Tests added this phase

- extractor: accessible name, visibility, `data-anchor*` dropped, rect handling with and without
  layout
- fingerprint schema + `pageKind` pattern + `migrate()`
- privacy: one test per rule + realistic account-page snippets
- storage: add/rename/delete/list, quarantine of invalid data, single-writer behavior when two tabs
  write at once
- e2e: listed in 1.8
- harness: the existing 28 stay green on the new extractor

### Risks

- **Pick-mode event capture:** some sites act on `pointerdown`/`mousedown`, not `click`. The picker
  must swallow the whole pointer sequence, not just `click`. Fixtures will include a `mousedown`
  handler to prove it.
- **Shadow DOM / iframes:** elements inside closed shadow roots or cross-origin iframes can't be
  picked. They'll be refused with a clear message, and support is parked for later.
- **Scrubbing is heuristic:** it will miss some personal data, so the limits are documented above.
  Data stays on the device regardless (rule 4).
- **MV3 service worker sleeps:** messages to the background can arrive while it's waking up. The
  store re-reads from `chrome.storage` on each operation; no in-memory caching.
- **Restart test on Windows:** profile directory locks can make relaunch flaky. Use a fresh temp
  dir per test and a short wait after close.

---

## Ideas parking lot

- Scrub personal data (names, order numbers, balances) from `neighbors`/`text` before storing
  fingerprints. **Approved for Phase 1.**
- Restore via a synthetic `.click()` produces `isTrusted=false`, and some sites ignore it.
  Investigate before Phase 4.
- Ask-mode copy: "I've let your helper know" isn't true until the helper can actually be reached.
  Default to honest wording ("Your helper will see this next time they check") until then.
- Choose the "few sites" (D-012) before Phase 2. They need to be public, change often, and be used by
  older adults (e.g. a pharmacy, a utility bill portal, a large store).
- Fixture cleanup script for Wayback Machine pages, and a decision on where real-site HTML lives
  (copyright, public repo).
- Free CI with GitHub Actions running `npm run check` + e2e.
- A Playwright-based extractor run so the benchmark can score `position` (D-005).
- Flag sensitive actions (pay/submit/delete/send) at capture time so Phase 4 can refuse Restore
  for them.
- Picking inside shadow DOM and same-origin iframes.
- Visual hash (`visualHash`) from a screenshot crop, for heavy redesigns.

---

## Log

- 2026-11-14: Read the brief. Drafted the Phase 0 plan.
- 2026-11-14: Owner answered the open questions (git remote, WXT, synthetic-only fixtures, decoy
  pair, privacy scrubbing in Phase 1, few sites first). Implemented Phase 0. All checks green.
- 2026-11-15: Phase 0 confirmed by owner. Drafted Phase 1 plan. Waiting for approval.
