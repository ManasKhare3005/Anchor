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

- **M1: Matcher and benchmark** (2026-11-21). Plan: `docs/plan-M1.md`. Report: `docs/benchmark-report.md`.
  - matcher: capture, match, tiers (score + gap), duplicate-link merging, site state + two-visit rule, menu hints
  - 3 fixture sites (v1, v2, 6 states each), 6 Maple Market pairs, 21 archived real sites (12 shopping, 3 pharmacy, 4 government, 3 bank; CVS skipped)
  - thresholds: sure >= 0.60 / gap >= 0.25, fairly >= 0.35 / gap >= 0.20, tuned for zero wrong matches
  - results: fixtures 0 wrong (leave-one-site-out 0 wrong); 90 pre-checked real labels 74 correct, 16 not found, 0 wrong; sure 178 / 0 wrong (95% upper bound 2.1%)
  - **open:** real-site labels are still "proposed" (Manas has not confirmed `docs/benchmark-labels-review.md`), so thresholds come from fixtures only. Confirming labels and rerunning `npm run benchmark` recalibrates; the drift-guard test fails until `DEFAULT_THRESHOLDS` is updated to match.

## In progress

- **M2: My buttons shelf and pointing.** Plan: `docs/plan-M2.md`.

## Decisions made

- 2026-11-20: Calibration optimizes for **zero** wrong matches on the calibration set (a margin under the 1%/5% targets). Tuning up to 5% overfit: leave-one-site-out "fairly" wrong rate was 10.8%, while zero-tolerance held out at 0 wrong.
- 2026-11-20: Copies of the same link (same address + same label) are one feature, not rivals. Buttons without a link are never merged.
- 2026-11-20: The accessible name only counts as a separate signal when it differs from the visible text (it was double-counting the label).
- 2026-11-20: Lexicon change after freeze: "pharmacy" removed from the prescriptions group (it caused a misleading hint on fixtures).
- 2026-11-20: No `Claude-Session:` or other AI lines in commits (Manas's rule). One pushed commit (`6187602`) carries one by mistake; it is left as is unless Manas wants history rewritten.

- 2026-11-20: The matcher may read the `value` attribute of `<input type=submit|button|reset>` only. That attribute is a caption the site wrote, which nobody can type into. It goes through one audited helper (`buttonInputLabel`) with an eslint exception and tests proving no other input type is read (Manas).
- 2026-11-20: eBay and Kohl's: retry with other archive dates **and** add two more shopping sites (Manas: "it only makes our case more accurate").

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

1. Please confirm the real-site labels (`docs/benchmark-labels-review.md`): reply "agree" or name rows to change. Final thresholds wait on this.
2. Commit `6187602` carries a `Claude-Session:` line by mistake. Rewrite history to remove it (force push), or leave it?
3. Are the wrong-match targets (1% sure, 5% fairly sure) right? (after the first M1 report)
4. License and public name for the repository.
5. Should the helper page sit behind a simple PIN? (M5)

## M1 notes so far (untuned placeholder thresholds)

- Maple Market pairs: 9 correct, 1 correct-absent, 2 not-found, 0 wrong.
- Fixture sites (135 feature × scenario runs): 105 correct, 21 correct-absent, 8 not-found,
  **1 wrong at "fairly"**: the planted decoy "Pay my bill by phone" beat the real "Make a payment"
  (brightline). All 6 non-redesign states match like v1. Tuning happens in task 1.9.
- Site state: all 18 non-redesign state pages classified exactly (logged-out ×3, normal ×15). The
  three v2 redesigns currently read "unknown" (fewer than half the features found before tuning).
  That's safe; the target after tuning is "redesign".
- Elsewhere search: both "moved to another page" fixtures get the right nav-link hint
  ("Deposit a check" → "Mobile deposit", "Report an outage" → "Outage center"); hints never become
  the pointed-at element.
- First report (`docs/benchmark-report.md`, fixtures only, untuned): sure 109 correct / 0 wrong
  (95% upper bound 3.4%); fairly 5 / 1 wrong (the planted decoy). Ablation shows text and
  accessible name double-count: turning either off _improves_ utility. That's the main tuning target.
  The lexicon puts "pharmacy" in the prescriptions group, which causes misleading hints. Fix before
  the lexicon freeze.
- Real sites: 8 of 10 shopping sites archived (eBay and Kohl's "after" downloads keep failing). The
  proposer suggested 48 labels; Claude's pre-check marks 36 ok, 7 exclude, 5 skipped. Preview on the
  36 (unconfirmed, not used for tuning): sure 21 correct / 0 wrong, fairly 5 / 1 wrong, 9 not found.
  Nearly all of those 9 are the same link shown twice (gap 0.00), which task 1.9 addresses.
- A fetcher bug was found and fixed: block-page detection matched `CAPTCHA_ENABLED` inside script
  configs, which wrongly rejected real pages.
- In real Chromium: capture → match works on fixture v1 → v2, the visual signal is present (real
  layout), removed features return no element, the cookie-popup state is "normal", and the bundled
  matcher passes the Rule 1/6 scan.
- After task 1.9 (interim thresholds: sure ≥ 0.60 / gap ≥ 0.25, fairly ≥ 0.35 / gap ≥ 0.20): fixtures 0 wrong; all three v2 redesigns now classify as "redesign"; leave-one-site-out 0 wrong; 54 pre-checked real labels: 45 good, 0 wrong. Report total: sure 150 correct / 0 wrong (95% upper bound 2.5%), fairly 14 / 0.
- All 21 real sites with pre-checked labels (90 ok, unconfirmed): 74 correct, 16 not found, **0 wrong**. By category: bank 10/11, government 12/15, pharmacy 6/9, shopping 46/55, with no wrong match in any. Report totals: sure 178 / 0 wrong (95% upper bound 2.1%), fairly 15 / 0.
