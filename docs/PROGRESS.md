# Anchor — Progress

Source of truth: `CLAUDE.md` (v2). The v1 brief and log are in `docs/archive/`. Long-form
decision records are in `docs/decisions.md`.

## Done

- **v1 Phase 0 scaffold** (2026-11-14): npm workspaces, strict TS, ESLint + Prettier, matcher stub,
  WXT MV3 extension, Playwright e2e, fixture harness over 6 synthetic pairs.
- **M0: Scaffold (v2)** (2026-11-18, confirmed 2026-11-19). Plan: `docs/plan-M0.md`.
  - v2 layout; the toolbar icon opens a hello side panel; the content script doesn't touch the page
  - Hard Rule lint checks (Rules 1, 6, 7) with self-tests; bundle scan; `connect-src 'none'` CSP
    proven in e2e
  - results: 73 unit tests; e2e 7/7 in Chromium and 7/7 in Edge; fresh clone green
  - known gaps: the toolbar click is only checked through `getPanelBehavior` (needs one manual
    click); a dev-only npm audit advisory (D-004)

## In progress

- **M1: Matcher and benchmark.** Plan: `docs/plan-M1.md`.
  - [x] 1.1 Types + candidates + capture
  - [x] 1.2 Signals + lexicon
  - [x] 1.3 `match()` + tiers
  - [x] 1.4 Fixture sites (bank, pharmacy, utility)
  - [x] 1.5 Site state + two-visit rule
  - [ ] 1.6 Elsewhere search (`menuHint`)
  - [ ] 1.7 Runner + report over fixtures
  - [ ] 1.8 Real-site pipeline, shopping first. Pause for label confirmation.
  - [ ] 1.9 Calibrate, then sensitive categories
  - [ ] 1.10 Matcher runs in real Chromium
  - [ ] 1.11 Wrap-up

## Decisions made

- 2026-11-19: `MYCLAUDE.md` renamed to `CLAUDE.md`, so Claude Code loads it every session (Manas).
- 2026-11-19: Push to `origin/main` after each finished task, without asking. Short summary at the
  end of each milestone (Manas).
- 2026-11-19: The real-site benchmark starts with generic shopping sites, then pharmacy, government
  and bank public pages (Manas).
- 2026-11-19: Keep the 6 Maple Market pairs as extra matcher fixtures (Manas).
- 2026-11-19: Benchmark site HTML is cached git-ignored. Only `sites.json` + labels are committed
  (avoids redistributing site HTML).
- 2026-11-19: A hand-made concept lexicon handles renames without AI. It is frozen before real-site
  labels are seen.
- 2026-11-19: Below "fairly sure", `element` is `null`. Nav and menu hits go in a separate
  `menuHint` (Hard Rule 5).
- 2026-11-18: v2 (`CLAUDE.md`) replaces the v1 brief. Restore mode is dropped and everything goes
  through the side-panel shelf.
- 2026-11-18: Matcher takes DOM in (D-015). No pixel positions (D-016).
- 2026-11-18: Side panel replaces the popup; strict CSP; Hard Rule lint + bundle scan (D-017).
  Edge e2e automated (D-018).
- 2026-11-18: Keep WXT 0.21.5 (maintained; side panel docs verified). Vite's preload polyfill is
  off because it contains `fetch`.
- 2026-11-18: `CLAUDE.md` is excluded from Prettier so it stays as Manas wrote it.
- 2026-11-14 (v1, still valid): npm workspaces; ESLint + Prettier; TS 6.0; zod; Playwright's
  bundled Chromium; ground truth only in fixture metadata; "fairly sure" counts as confident when
  scoring wrong matches; commits authored by Manas only.

## Carried from the superseded v1 Phase 1 plan, for M2

- Single writer for storage, through the service worker.
- Picking swallows the whole pointer sequence (`pointerdown` / `mousedown` / `click`), with a
  fixture that has a `mousedown` handler to prove it.

## Questions for Manas

1. **`<input type=submit value="Pay now">`:** the `value` attribute here is a label the site wrote,
   not something the person typed. Hard Rule 7 says never read `.value`, so for now the matcher
   doesn't read it at all (the cautious option). That costs a matching signal on older sites,
   especially government ones. May the matcher read the `value` **attribute** only on
   submit/button/reset inputs, through one audited helper, with a test proving text inputs are
   never read?
2. Are the wrong-match targets (1% sure, 5% fairly sure) right? (after the first M1 report)
3. License and public name for the repository.
4. Should the helper page sit behind a simple PIN? (M5)

## M1 notes so far (untuned placeholder thresholds)

- Maple Market pairs: 9 correct, 1 correct-absent, 2 not-found, 0 wrong.
- Fixture sites (135 feature × scenario runs): 105 correct, 21 correct-absent, 8 not-found,
  **1 wrong at "fairly"**: the planted decoy "Pay my bill by phone" beat the real "Make a payment"
  (brightline). All 6 non-redesign states match like v1. Tuning happens in task 1.9.
- Site state: all 18 non-redesign state pages classified exactly (logged-out ×3, normal ×15). The
  three v2 redesigns currently read "unknown" (fewer than half the features found before tuning).
  That's safe; the target after tuning is "redesign".
