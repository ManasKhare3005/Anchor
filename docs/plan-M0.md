# Plan — M0: Scaffold (rework for v2)

M0 was built against the v1 brief (now `docs/archive/brief-v1.md`). `MYCLAUDE.md` (v2) changes
the layout, replaces the popup with a side panel, and adds Hard Rule checks. This plan brings the
existing scaffold in line with v2. Nothing from M1 (matcher API, fixture sites, benchmark) is
built here.

## Done when (from MYCLAUDE.md)

- A fresh clone builds (`npm ci && npm run build`).
- All tests pass (`npm run check` + `npm run test:e2e`).
- The extension loads in Chrome, and clicking the toolbar icon opens a "hello" side panel. It also
  loads in Edge (manual check).
- Hard Rule lint checks and bundle scans are in place and fail on violations, proven by tests.

## What changes, in order

1. **Docs layout.**
   - v1 brief → `docs/archive/brief-v1.md`
   - v1 progress → `docs/archive/progress-v1.md`
   - decisions → `docs/decisions.md`, with entries superseded by v2 marked
   - new `docs/PROGRESS.md` (Done / In progress / Decisions made / Questions for Manas)
   - short new `README.md` pointing to `MYCLAUDE.md`
2. **Repo layout.** `extension/` → `packages/extension/`. `tools/harness/` → `benchmark/` (it becomes
   the benchmark runner in M1). Workspaces, paths and the ESLint config are updated to match.
3. **Side panel instead of popup.**
   - remove `entrypoints/popup`
   - add `entrypoints/sidepanel/index.html` + `main.ts`: a plain-TS hello panel, 18px+ text, labeled
   - background calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
   - permissions become `["storage", "sidePanel"]`, verified in the generated manifest
4. **Content script stops touching the page.** The v1 test hook set `data-anchor-loaded` on
   `<html>`, which breaks Hard Rule 4 (everything Anchor adds must live inside the `data-anchor`
   Shadow DOM host). Instead, the content script answers a `ping` message, and e2e asks it through
   the service worker. A new e2e test checks that the page DOM is byte-identical with and without
   the extension, which is groundwork for the M2 "Show original" check.
5. **Hard Rule lint checks** (ESLint `no-restricted-syntax` / `no-restricted-globals` /
   `no-restricted-properties`). They apply to all shipped source: `packages/*/src`,
   `packages/extension/entrypoints`.
   - Rule 1 (never clicks): `.click()`, `.submit()`, `.requestSubmit()`,
     `new MouseEvent/PointerEvent/KeyboardEvent/InputEvent/TouchEvent/WheelEvent`, `window.open`,
     `location.assign/replace/reload`, assignment to `location` / `location.href`,
     `history.pushState/replaceState`.
   - Rule 6 (no network): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
     `navigator.sendBeacon`, `importScripts`.
   - Rule 7 (never read typed values): any `.value` property access, `getAttribute("value")`.
     Exceptions need an `eslint-disable` line with a reason; none exist in M0.
   - A lint test runs ESLint on small "bad" snippets and asserts that each rule fires, so the rules
     can't silently stop working.
6. **Bundle scan** (Rules 1 and 6). A Vitest test runs after `wxt build` and scans every emitted
   `.js` for banned patterns. Vite's module-preload polyfill (`fetch`) is turned off
   (`build.modulePreload.polyfill: false`). WXT's internal `dispatchEvent(new CustomEvent(...))` is
   allowed because it isn't a mouse or keyboard event. The scan has a self-test with a planted bad
   file.
7. **Restrictive CSP for extension pages:**
   `default-src 'self'; script-src 'self'; object-src 'self'; connect-src 'none'`. The Chrome docs
   don't say whether `connect-src 'none'` is accepted, so e2e checks that the extension loads and
   that a `fetch` from the side panel is blocked.
8. **E2E updates:**
   - service worker registers
   - manifest has `sidePanel` + `side_panel.default_path` + CSP
   - side panel page renders
   - content script answers `ping` on a fixture page
   - page DOM unchanged
   - network blocked from extension page
9. **Edge.** Try Playwright with `channel: "msedge"`. If branded Edge refuses `--load-extension` (as
   branded Chrome does), fall back to a manual "Load unpacked" check, documented in Commands.
10. **Commands section** added to `MYCLAUDE.md`, as its how-to-work rule 10 asks.
11. **Wrap-up.** Update `docs/PROGRESS.md` and commit locally. Ask before pushing.

## Carried over unchanged from v1 M0

TypeScript 6.0 strict, ESLint + Prettier, Vitest, Playwright with bundled Chromium, npm workspaces,
WXT 0.21.5 (still maintained: last release 2026-10-26), zod, jsdom, the leak guard (ground truth
lives only in fixture metadata), and the 6 Maple Market pairs. Their future (keep as matcher unit
fixtures, or replace with the bank/pharmacy/utility sites) is decided in the M1 plan.

## Tests

- existing: matcher 2, benchmark/harness 28, both staying green after the moves
- new unit: lint-rule self-tests, bundle scan + its self-test
- new e2e: listed in step 8

## Risks

- **`.value` ban:** catches harmless uses (iterator results, `Map` entries). Those need a disable
  line with a reason. That's noisy, but it's the cautious choice.
- **CSP:** `connect-src 'none'` may break WXT dev mode (hot reload uses a WebSocket). If so, apply
  the strict CSP only to production builds and note it.
- **Windows file locks:** `git mv` of `extension/` failed once with "Permission denied"; a retry
  worked. Expect occasional flakiness.
