# Anchor — Decisions

Each entry: the decision, why, and the alternatives considered. Newest last. Change a decision by

> **2026-11-18:** `CLAUDE.md` (v2) is now the source of truth. Short decisions are logged in
> `docs/PROGRESS.md`; this file keeps the longer records. Entries marked _Superseded_ no longer apply.
> adding a new entry that supersedes the old one; don't rewrite history.

---

## D-001 — npm workspaces for the monorepo

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** One root `package.json` with npm workspaces: `packages/*`, `extension`, `tools/*`.
- **Why:** npm ships with Node, so there's nothing extra to install. The repo is small and a few
  workspaces are enough.
- **Alternatives:** pnpm (faster, stricter about dependencies, but not installed here); yarn.
- **Gotcha:** with npm 11, the first `npm i -w <new-workspace> <pkg>` after creating a workspace only
  links the workspace and silently skips saving the package. Run it a second time. Seen twice.

## D-002 — WXT to build the extension

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** Build the MV3 extension with WXT 0.21 (which uses Vite 8 underneath).
- **Why:** MV3 content scripts can't be ES modules, so they need a classic/IIFE bundle while the
  popup and service worker don't. WXT handles these multiple entry points, generates the manifest from
  code, and can target Firefox later (README "Later / open").
- **Alternatives:** CRXJS Vite plugin (maintenance has been patchy); hand-rolled Vite multi-config
  (more glue code to maintain).
- **Risk:** WXT is pre-1.0 and changes fast. All versions are pinned exactly.

## D-003 — Matcher works on plain data, not a live DOM (_Superseded by D-015_)

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** `@anchor/matcher` takes an `ElementFingerprint` plus `CandidateDescriptor[]` (plain
  objects) and returns scored candidates. A separate **extractor** turns a DOM into descriptors.
- **Why:** This keeps the matcher truly pure (no DOM, no `chrome.*`), so it's fast, deterministic and
  testable in Node. The same matcher runs on descriptors from jsdom, Playwright or the real content
  script. Purity is enforced by `lib: ["ES2022"]` (no DOM types) and an ESLint
  `no-restricted-globals` rule.
- **Alternatives:** The matcher queries the DOM directly. Simpler at first, but it ties tests to a DOM
  implementation and mixes extraction bugs with scoring bugs.

## D-004 — ESLint + Prettier, TypeScript 6.0

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** ESLint 10 flat config with `typescript-eslint` strict, plus Prettier 3 for formatting.
  TypeScript is pinned to **6.0.3**, not 7.x.
- **Why:** These are standard and well documented, and give type-aware rules. typescript-eslint
  8.72 supports TS `<6.1`, so TS 7 would break linting.
- **Alternatives:** Biome (one fast tool, fewer type-aware rules); TS 7 once typescript-eslint
  supports it.
- **Known:** `npm audit` reports a moderate minimatch ReDoS inside typescript-eslint. It's dev-only
  and only runs our own glob patterns. The suggested fix would downgrade typescript-eslint, so it's
  not applied. Re-check when typescript-eslint updates.

## D-005 — jsdom for Node tests; layout signals in real Chromium (_Partly superseded by D-016_)

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** The harness and extractor tests use jsdom. Signals that need layout (`position`,
  visibility) get tested through Playwright in real Chromium.
- **Why:** jsdom has no layout engine, so `getBoundingClientRect()` is always zeros. Pretending
  otherwise would make position look useless in the benchmark.
- **Alternatives:** happy-dom (faster, less complete, same layout gap); running everything in
  Playwright (slow for unit tests).
- **Follow-up (Phase 2):** The benchmark probably needs a Playwright-based extractor run to score
  position fairly.

## D-006 — zod for schemas

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** `pair.json` is validated with zod 4. Stored fingerprints will also use zod (Phase 1).
- **Why:** One source of truth for runtime validation and TS types. It's small.
- **Alternatives:** Hand-written type guards (they drift from the types); JSON Schema + ajv (heavier).

## D-007 — UI framework deferred (_Superseded by v2: plain TS, no framework_)

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** The Phase 0 popup is static HTML. Choosing React or Preact waits until Phase 5, when
  there's real UI.
- **Why:** No UI to build yet, so nothing to justify a choice with.

## D-008 — Minimal permissions; content script limited to localhost for now (_Updated by D-017_)

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** The manifest requests only `storage`. The content script matches only
  `http://localhost/*` and `http://127.0.0.1/*`, and widens in Phase 3.
- **Why:** Rule 4 (everything stays on the device) and least privilege. Asking for broad host
  access before there's any feature that needs it is a bad habit, and an e2e test pins the
  permission list.
- **Alternatives:** `<all_urls>` from day one.

## D-009 — Fixture ground truth lives only in `pair.json`

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** Each pair is `before.html`, `after.html` and `pair.json` (CSS selectors for the
  target in each page; `after: null` = removed). The HTML never contains markers of the answer.
- **Why:** An answer attribute in the HTML (e.g. `data-expected`) would show up as a matching signal
  and inflate results. Three layers stop this:
  1. Ground truth exists only in `pair.json`.
  2. The harness rejects any fixture containing `data-anchor*` attributes (tested).
  3. The extractor always drops `data-anchor*` attributes, which are reserved for Anchor itself
     (tested). The content script already sets `data-anchor-loaded` on live pages.
- **Alternatives:** Inline `data-expected` attributes stripped before matching (easy to forget a
  strip path).

## D-010 — Outcome taxonomy: "medium" counts as confident

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** Each harness row is one of `correct`, `correct-abstain` (removed, matcher said
  low), `abstain` (it exists, matcher said low) or `wrong`. A match is **wrong** when confidence is
  high **or medium** and the matcher picked the wrong element, or picked anything for a removed
  feature.
- **Why:** Medium = Point mode, and pointing an older user at the wrong button is a real harm. Only
  low (Ask) is "safe". The README says a wrong match is worse than no match, so the Phase 2 benchmark
  will optimize for low `wrong`, not high `correct`.

## D-011 — E2E uses Playwright's bundled Chromium, not branded Chrome

- **Date:** 2026-11-14 · **Phase:** 0
- **Decision:** Playwright launches its own Chromium (`channel: "chromium"`, headless, persistent
  context) with the built extension loaded.
- **Why:** Branded Chrome no longer accepts `--load-extension`. Bundled Chromium is reproducible and
  runs headless with extensions. The user's own Chrome (incognito) is kept for manual checks on real
  sites in Phase 3+.

## D-012 — Target a few sites first

- **Date:** 2026-11-14 · **Phase:** 0 (user decision)
- **Decision:** v1 aims to work very well on a small set of sites rather than being general from day
  one. Which sites is to be decided before Phase 2/3.
- **Why:** Doing a few sites well gives an honest benchmark and a real demo. The matcher stays
  general-purpose; the few-sites focus only shapes fixtures and tuning.

## D-013 — Synthetic fixtures only in Phase 0

- **Date:** 2026-11-14 · **Phase:** 0 (user decision)
- **Decision:** Phase 0 ships 6 hand-written pairs for a fictional store, "Maple Market" (moved,
  renamed, restyled, nested, removed, decoy). Real archived pairs come later, with a cleanup script.
- **Why:** The synthetic pairs cover each change type on its own. Real Wayback pages need cleanup
  (toolbar, rewritten URLs, scripts) and raise a copyright question about committing site HTML to a
  public repo. That's to be settled when we add them.

## D-014 — Commits are authored by the repo owner only

- **Date:** 2026-11-14 · **Phase:** 0 (user decision)
- **Decision:** Commits use the owner's git identity, with no AI co-author trailers.
- **Why:** The owner asked for this.

## D-015 — Matcher takes a DOM root in (v2)

- **Date:** 2026-11-18 · **Milestone:** M0 rework
- **Decision:** v2 specifies `packages/matcher` as "DOM in, fingerprints and matches out", with
  `MatchResult.element: Element | null`. Capture and match both take a DOM root as a parameter. The
  matcher still never touches `window`/`document` globals or extension APIs (lint-enforced), so it
  runs on jsdom in Node and on the live page in a content script.
- **Why:** v2 requirement. Keeping extraction and scoring in one package avoids two copies of
  "what counts as a candidate".
- **Supersedes:** D-003. The API change itself is M1 work.

## D-016 — Fingerprints use meaning and structure, not pixel positions (v2)

- **Date:** 2026-11-18 · **Milestone:** M0 rework
- **Decision:** No `position` rect in fingerprints. There is only an optional weak `visual`
  signal (`region`, `sizeBucket`).
- **Why:** Adapt's text enlargement can trigger a site's mobile layout, and position-based
  matching would then break. This also removes the jsdom no-layout gap from D-005 for the main
  signals.

## D-017 — Side panel, strict CSP, Hard Rule checks (v2 M0)

- **Date:** 2026-11-18 · **Milestone:** M0 rework
- **Decision:**
  - Permissions are `storage` + `sidePanel`.
  - The toolbar icon opens the side panel via `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
    The popup is removed.
  - Production builds set
    `content_security_policy.extension_pages = "default-src 'self'; script-src 'self'; object-src 'self'; connect-src 'none'"`.
    Chromium and Edge both accept it, and e2e proves a `fetch` triggers a `connect-src` violation.
  - Hard Rules 1, 6 and 7 are enforced by ESLint on shipped source, each with a self-test, plus a
    bundle scan of the built JS (Rules 1 and 6).
  - Vite's module-preload polyfill is off because it contains `fetch`.
- **Why:** v2 Hard Rules 1, 4, 6 and 7 each ask for an automated check. APIs were verified against
  the current Chrome sidePanel and CSP docs, WXT 0.21.5 docs and the Edge sidebar docs (2026-11-18).
- **Notes:**
  - The Chrome docs don't say whether `connect-src 'none'` is allowed, so it was verified by loading
    the extension.
  - Dev mode skips the strict CSP because hot reload needs a WebSocket.
  - The `.value` lint ban is deliberately broad. Harmless uses (e.g. iterator results) need an
    `eslint-disable` with a reason.

## D-018 — E2E also runs in installed Edge

- **Date:** 2026-11-18 · **Milestone:** M0 rework
- **Decision:** `npm run test:e2e:edge` runs the same Playwright suite with `channel: "msedge"`.
- **Why:** v2 says the extension should also load in Edge. Unlike branded Chrome, Edge still
  accepts `--load-extension`, so the check can be automated instead of manual.
