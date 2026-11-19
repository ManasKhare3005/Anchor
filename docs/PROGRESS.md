# Anchor — Progress

Source of truth: `MYCLAUDE.md` (v2). The v1 brief and log are in `docs/archive/`. Long-form
decision records are in `docs/decisions.md`.

## Done

- **v1 Phase 0 scaffold** (2026-11-14, commits `2b959de`, `455d7c7`): npm workspaces, strict TS,
  ESLint + Prettier, matcher stub, WXT MV3 extension, Playwright e2e, fixture harness over 6 synthetic
  pairs. All green. The v1 "Phase 1 Capture" plan is superseded by v2 (see below).

## In progress

- **M0 rework for v2.** Plan: `docs/plan-M0.md`. All steps are done and waiting for Manas to
  confirm the milestone.
  - [x] Docs moved to the v2 layout
  - [x] `extension/` → `packages/extension/`, `tools/harness/` → `benchmark/`
  - [x] Paths, workspaces, lint config updated
  - [x] Side panel replaces popup; toolbar icon opens it
  - [x] Content script no longer touches the page; it answers `ping` instead
  - [x] Hard Rule lint checks (Rules 1, 6, 7) + 29 self-tests
  - [x] Bundle scan (Rules 1, 6) + self-test
  - [x] Restrictive CSP. Chromium and Edge accept `connect-src 'none'`; e2e proves the violation.
  - [x] E2E updated: 7 tests, passing in bundled Chromium **and** installed Edge
  - [x] Commands section in `MYCLAUDE.md`
  - [x] Fresh-clone check (see results)

### M0 results (2026-11-18)

- `npm run check`: green. 73 unit tests: extension 43 (lint self-tests, bundle scan), benchmark
  28, matcher 2.
- `npm run test:e2e`: 7/7 in Chromium. `npm run test:e2e:edge`: 7/7 in Edge.
- Fresh clone (`git clone` → `npm ci` → `npm run check`): see the log entry.

### Known gaps (M0)

- **Untested by machine:** actually clicking the toolbar icon. Playwright can't click browser
  toolbars, so e2e checks `getPanelBehavior().openPanelOnActionClick === true` instead. Needs one
  manual click in Chrome.
- `benchmark/src/extract.ts` still reads `getAttribute("value")` for submit-button labels.
  That's allowed because the benchmark isn't shipped, but it must not move into the matcher as-is
  (Hard Rule 7). The M1 plan handles it.
- `npm audit`: a moderate advisory inside typescript-eslint, dev-only (D-004).

## Decisions made

- 2026-11-18: v2 (`MYCLAUDE.md`) replaces the v1 brief. Restore mode is dropped and everything goes
  through the side-panel shelf.
- 2026-11-18: Matcher takes DOM in, not plain descriptors. This supersedes D-003, as v2 requires;
  the API changes in M1.
- 2026-11-18: Fingerprints use meaning and structure, not pixel positions. This supersedes the
  position field and D-005's plan to score position.
- 2026-11-18: Keep WXT 0.21.5. It is still maintained (release 2026-10-26) and its docs cover side
  panels.
- 2026-11-18: Popup removed. The toolbar icon opens the side panel via `setPanelBehavior`.
- 2026-11-18: The content script never edits the page outside the `data-anchor` Shadow DOM host.
  The v1 `<html data-anchor-loaded>` hook is removed (Hard Rule 4).
- 2026-11-18: Vite's module-preload polyfill is off. It calls `fetch` and would fail the Rule 6
  bundle scan.
- 2026-11-18: Edge e2e is automated (`npm run test:e2e:edge`). Branded Edge still accepts unpacked
  extensions.
- 2026-11-18: `MYCLAUDE.md` is excluded from Prettier so it stays exactly as Manas wrote it (plus
  the Commands section).
- 2026-11-18: The bundle scan bans mouse and keyboard event construction, not all `dispatchEvent`.
  WXT uses `CustomEvent` internally.
- 2026-11-14 (v1, still valid): npm workspaces; ESLint + Prettier; TS 6.0 (typescript-eslint
  supports < 6.1); zod; Playwright's bundled Chromium for e2e; ground truth only in fixture metadata
  (leak guard); "fairly sure" counts as confident when scoring wrong matches; commits authored by
  Manas only.

## Carried from the superseded v1 Phase 1 plan, for M1/M2

- Privacy scrubbing of captured text (money, long digit runs, emails, names after greetings) still
  applies to `neighborText`, even though nothing leaves the device.
- Single writer for storage, through the service worker, to avoid lost writes between tabs.
- Picking must swallow the whole pointer sequence (`pointerdown` / `mousedown` / `click`) so the
  real element never fires.
- Fixture with a `mousedown` handler to prove it.

## Questions for Manas

1. Rename `MYCLAUDE.md` → `CLAUDE.md`? Claude Code loads `CLAUDE.md` automatically every session, so
   the rules would always be in context. Right now it's only read when asked.
2. May I push M0 to `origin/main` when it's done? (v2 rule 5: ask before pushing.)
3. Which real sites go into `benchmark/sites.json` first? (needed for M1)
4. Are the wrong-match targets (1% sure, 5% fairly sure) right? (after the first M1 report)
5. License and public name for the repository.
6. Should the helper page sit behind a simple PIN?
7. The 6 Maple Market store pairs: keep them as matcher unit fixtures alongside the new
   bank/pharmacy/utility sites, or drop them? (decided in the M1 plan; my default is keep)
