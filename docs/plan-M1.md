# Plan — M1: Matcher and benchmark (the proof)

Answers "does the core idea work?" before any real interface. Source: `CLAUDE.md` § M1,
§ Matching approach, § Data model.

## Done when (from CLAUDE.md)

- `docs/benchmark-report.md` exists, with per-tier counts of correct, wrong and not found, the
  weakest signal, and every wrong match shown.
- Thresholds are set from it, and the "sure" tier meets ≤ 1% wrong matches on fixtures **and**
  labeled real pages. "Fairly sure" is checked against its ≤ 5% target.

## Inputs already decided

- **Real sites:** generic shopping sites first, then detail-sensitive ones (pharmacy, government,
  bank public pages). Manas, 2026-11-19.
- **Maple Market pairs stay** as extra matcher fixtures.
- **No pixel positions.** Signals come from meaning and structure (D-016). The matcher takes a DOM
  root in (D-015).

## Matcher design (`packages/matcher`)

**API (pure; DOM root passed in, no globals, no extension APIs):**

```ts
capture(el: Element, ctx: { url: string; personalName?: string; now: string }): Fingerprint
match(root: Document | Element, fp: Fingerprint, opts?: MatchOptions): MatchResult
classifySite(root, fps: Fingerprint[]): SiteObservation   // normal | logged-out | local-change | redesign | unknown
confirmRedesign(prev: SiteObservation, curr: SiteObservation): boolean  // two-visit rule
```

**Candidates.** These elements are considered:

- links, buttons, `summary`, form controls
- ARIA roles: button, link, menuitem, tab, option, checkbox, radio, switch
- anything else with `tabindex >= 0` or an `onclick` attribute

The search covers open shadow roots and same-origin iframes. It skips Anchor's own
`[data-anchor]` host. Hidden candidates (e.g. inside a closed menu) still count, and the result
flags them as `hidden` so M2 can say "it's in the Account menu".

**Signals.** Similo-style: many weak signals → one weighted score. Each signal returns a
similarity in 0–1.

| Signal                  | How compared                                                            | Starting weight |
| ----------------------- | ----------------------------------------------------------------------- | --------------- |
| visible text            | token overlap + edit distance, after normalizing and scrubbing          | high            |
| accessible name         | same as text (aria-labelledby → aria-label → alt/title → text)          | high            |
| concept                 | small hand-made task lexicon (see below)                                | medium          |
| role                    | equal / compatible (button↔link counts partly)                          | medium          |
| tag                     | equal                                                                   | low             |
| id / name / data-testid | equal; ids that look generated (long digit runs, hashes) are ignored    | medium–high     |
| href path               | path-segment overlap; query and hash dropped; ids → `*`                 | high for links  |
| class tokens            | Jaccard, generated-looking classes dropped                              | low             |
| neighbor text           | text just before and after, token overlap                               | medium          |
| ancestor trail          | landmarks (header/nav/main/aside/footer/form/dialog) + nearest headings | low–medium      |
| visual region/size      | coarse bucket, weak only                                                | very low        |

- `score = Σ wᵢ·simᵢ / Σ wᵢ`, over the signals the fingerprint has.
- `variants` (A/B forms) are scored too, and the best one counts.
- `reasons[]` lists each signal's contribution, for the helper view.
- Weights start hand-set and are then tuned on the benchmark (below).

**Concept lexicon (no AI, Hard Rule 10).** About 15 hand-written groups of words that mean the
same task:

- orders / track / purchases / my orders
- sign in / log in / log on
- cart / basket / bag
- pay bill / make a payment / pay now
- refill / renew prescription
- help / support / customer service / contact us
- account / profile / my account
- …

This catches renames like "Track order" → "Orders" (the decoy fixture), where spelling alone
fails. The lexicon gets its own tests, including the decoy: "Track a return" must **not** beat
"Orders".

**Tiers** need a high score **and** a clear gap to the runner-up:

- `sure`: score ≥ T_sure and gap ≥ G_sure
- `fairly`: score ≥ T_fair and gap ≥ G_fair
- otherwise `unsure`, with `element: null`. There is no fallback to the best available candidate
  (Hard Rule 5).
- Separate `menuHint` field: if the feature isn't on this page, nav and menu links that point to it
  are returned here, always `unsure`. The hint never lands in `element`.

Starting thresholds are placeholders, set from the benchmark in task 1.9.

**Privacy at capture.** Text and neighbor text are scrubbed:

- money → `<money>`
- 4+ digit runs → `<num>`
- emails → `<email>`
- names after greetings → `<name>`
- neighbor text capped at 40 characters

Candidates get the same scrub, so scrubbing doesn't hurt matching.

**Hard Rule 7.** The matcher never reads `.value` or the `value` attribute. That includes
`<input type=submit value="Pay now">`, even though that attribute is an author-written label, not
typed text. This is the cautious option; it costs a signal on older sites (question for Manas
below). Such buttons fall back to aria-label/title, or the default label "Submit".

## Fixture sites (`fixtures/sites/`)

Three fake sites: **Riverbank** (bank), **CareWell Pharmacy**, **Brightline Utilities**. Each has:

- `v1/`: 3–4 pages (home, account, task page)
- `v2/` (redesign), covering:
  - a button moves
  - a button is renamed
  - tag and class names change
  - a button moves into a menu
  - a button moves to another page (reached by a nav link)
  - one feature is removed
  - one decoy (a similar-looking but different button)
- `states/` (variants of v1 that are **not** redesigns):
  - logged out
  - sale banner
  - cookie popup
  - survey modal
  - A/B variant
  - session-timeout warning
- prices, dates and legal text throughout, with their selectors listed (used by the M4 "never
  changes facts" tests)
- `site.json`: ground truth. For each feature, the selector in v1, and in v2 one of: a selector, an
  "elsewhere" nav link, or `null`. For each state, the expected classification. The leak guard
  applies, so no answers appear in the HTML.

All self-contained HTML/CSS, fictional names, no external assets.

## Real-site benchmark (`benchmark/`)

- `benchmark/sites.json`: site, category, page URL, two Wayback timestamps (before and after a
  redesign), features. Validated with zod.
- **Fetcher:** finds snapshots through the Wayback CDX API. It fetches the original HTML with the
  `id_` URL form, which has no Wayback toolbar and no rewritten links. Results are cached in
  `benchmark/cache/`, which is **git-ignored**, so no site HTML is committed. Requests are polite
  (≤ 1 per second, with retry and backoff). It detects bot-check or empty pages and skips them.
  The fetcher is a dev tool and never ships, so Rule 6 doesn't apply to it, and it adds no new
  dependencies (it uses Node's built-in `fetch`).
- **Order:**
  1. Shopping: about 10 big retail sites × about 5 features (sign in, cart, orders/track, search,
     help).
  2. Then pharmacy, government benefits and bank public pages.
- **Labels:** I propose ground truth in `benchmark/labels/*.json` plus a review sheet
  (`docs/benchmark-labels-review.md`), with each feature's element text, context and selector
  before and after. **Manas confirms** before those labels count. This is the one place M1 waits
  on you.
- **Limit:** archived HTML is the server-rendered page only (jsdom runs no scripts). Sites that
  render everything client-side will show few candidates. They are flagged in the report rather
  than silently counted.

## Runner, calibration and report

- The runner covers Maple Market pairs + fixture sites + labeled real pairs. For each feature:
  capture on before → match on after → outcome (correct / wrong / not found × tier).
  "Removed" features count as correct only when the result is `unsure`.
- **Calibration:** grid search over T and G per tier. It maximizes "correct" subject to wrong
  rate ≤ 1% (sure) and ≤ 5% (fairly). To avoid tuning on the test data, thresholds are checked
  with **leave-one-site-out** validation, and the report shows both the in-sample and held-out
  numbers.
- **Ablation:** each signal is turned off in turn. The signal whose removal hurts least is the
  "weakest", as the report requires.
- `docs/benchmark-report.md` is generated by `npm run benchmark`: per-tier table, per-category
  table (shopping vs sensitive), weakest signal, every wrong match with its reasons, thresholds
  chosen.

## Tasks (each: tests first, `npm run check` green, commit, push)

1. **Types + candidates + capture**
   - zod schemas for `Fingerprint` / `MatchResult`
   - candidate collection (shadow roots, iframes, skips `[data-anchor]`)
   - accessible name, scrubbing, `capture()`
   - Hard Rule 7 lint applies (the matcher is shipped source)
2. **Signals + lexicon:** one similarity function per signal, each with unit tests.
3. **`match()` + tiers:** scoring, variants, reasons, gap rule, `element: null` below "fairly". The
   Maple Market harness moves to the new API, and the old `benchmark/src/extract.ts` is removed.
4. **Fixture sites:** three sites with v1, v2, states and `site.json`, plus validation tests.
5. **Site state:** `classifySite` + `confirmRedesign`, tested on every state variant.
6. **Elsewhere search:** `menuHint` from nav and menu links when the feature moved to another page.
7. **Runner + report** over fixtures: metrics, ablation, `docs/benchmark-report.md`.
8. **Real-site pipeline:** `sites.json`, CDX lookup, fetch + cache, sanity checks, label proposer
   and review sheet. Shopping first. **Pause for Manas to confirm labels.**
9. **Calibrate:** thresholds from the benchmark (leave-one-site-out), written into the matcher;
   report regenerated. Then the sensitive categories.
10. **Runs in a real browser:** an e2e test that loads the bundled matcher into a fixture page in
    Chromium and runs capture → match, proving it works outside jsdom.
11. **Wrap-up:** `PROGRESS.md`, short summary to Manas.

## Risks

- **Small sample:** ~50 real features + ~40 fixture features means "≤ 1% wrong" is really "zero
  wrong seen". The report will say so plainly and show confidence intervals.
- **Overfitting to fixtures I wrote myself:** that's why the real-site set exists, plus held-out
  validation.
- **Wayback gaps:** bot-check snapshots, missing captures, JS-only pages. Mitigations are caching,
  sanity checks and flagging, and swapping sites when needed.
- **Lexicon bias:** hand-written word groups could favor the fixtures. The lexicon is frozen
  before the real-site labels are seen and changed only with a logged reason.
- **jsdom performance** on large retail pages (MBs of HTML) may be slow. Benchmark runs are
  cached, and unit tests stick to fixtures.
