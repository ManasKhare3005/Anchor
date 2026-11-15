# Anchor — Progress Log

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Phase 0: Foundations — DONE (awaiting confirmation)

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

---

## Log

- 2026-11-14: Read the brief. Drafted the Phase 0 plan.
- 2026-11-14: Owner answered the open questions (git remote, WXT, synthetic-only fixtures, decoy
  pair, privacy scrubbing in Phase 1, few sites first). Implemented Phase 0. All checks green.
