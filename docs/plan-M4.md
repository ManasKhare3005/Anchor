# M4 plan: Adapt (no AI)

## Goal (from CLAUDE.md)

- **First-run setup:** two or three plain questions, then an immediate before-and-after on a real
  page. No settings page for the person.
- **Comfort:** text size, larger click targets, spacing and contrast, calmer motion, and clutter
  hiding that respects the never-hide list (Hard Rule 2).
- **Personal names** shown beside the site's own labels (Hard Rule 3: adds, never replaces).

## Done when

E2E tests in the real browser (Chromium and Edge), using the fixture sites:

1. **Setup flow.** On first open the panel asks three questions. The answers are applied to the
   page straight away. "See it before" / "See it after" switches between the two views. "Keep
   these changes" saves them, and every later page load is adapted without the panel open.
2. **Hard Rule 2.** On every fixture page (sites v1, v2, every state, task pages, the adapt page),
   with every option on: every price, amount, number, date, legal text, alert, consent dialog and
   session warning keeps exactly the same text and stays visible.
3. **Hard Rule 4.** After "Show original", the page DOM is byte-for-byte the page as the site sent
   it, with Adapt on and names shown.
4. **Clutter.** Ad and promo blocks without facts are hidden. A promo that shows a price stays.
5. **Matching under Adapt.** The M2 fixture sweep gives the same counts with Adapt at its largest
   size, with 0 wrong. The ring really sits on the element: `elementFromPoint` at its centre hits
   it.
6. **Names.** A shelf button with a personal name shows that name beside the site's button, only
   when the match is "sure". The site's own label text is unchanged.

## Architecture

```
panel: setup questions ─► writer (adapt-set) ─► storage.local {schemaVersion 3, adapt}
                    └── preview ─► content: applyAdapt(plan)  (not saved)
content script (document_start): read storage ─► applyAdapt(plan) ─► storage.onChanged re-applies
```

- **Store v3:** `adapt: AdaptSettings | null`. `null` means setup hasn't been answered yet. v1 and
  v2 data migrate on read. `AdaptSettings = { text: "normal" | "larger" | "largest", targets,
calm }`. Writer request: `shelf-adapt-set`.
- **Questions → plan** (`src/adapt.ts`, pure):
  - "Is the text on websites hard to read?" No / A little / A lot →
    text size 100% / 125% / 150%, plus spacing and contrast.
  - "Do small buttons give you trouble?" No / Yes → larger targets.
  - "Do moving or busy pages bother you?" No / Yes → calmer motion and clutter hiding.
- **Engine (content, `src/content/adapt/`):**
  - One `<style data-anchor="adapt">` element holds every stylesheet change:
    - text size via CSS `zoom` on `body`. Chrome 128+ reports zoom-scaled rects, and Anchor's
      overlay host sits outside `body`, so ring positions stay right. `zoom` doesn't change media
      queries, so it doesn't switch the site into its mobile layout.
    - spacing, close to WCAG 1.4.12 text-spacing values, for text blocks only.
    - targets: a 44px minimum on buttons, fields and block-level links.
    - motion: animations and transitions reduced to near zero, and smooth scrolling off.
  - Per-element changes (contrast fixes, hidden clutter) are inline styles. A registry keeps
    each element's original `style` attribute and restores it exactly.
  - `facts.ts` holds the never-hide / never-change test (Hard Rule 2):
    - digits, money, dates
    - legal words
    - alert, dialog and live regions
    - consent and session wording
    - form fields
    - the person's own buttons and task steps
  - `contrast.ts`: text under 4.5:1 against a known solid background moves toward black or white
    until it passes, keeping its hue.
    - Skipped when the background is an image.
    - Skipped in dialogs and alerts.
    - Skipped entirely in forced-colors mode (Hard Rule 9).
  - `clutter.ts`: elements whose own id or class names say ad / advert / sponsor / promo /
    newsletter, and third-party iframes of standard ad sizes, unless they hold a fact or are
    a large part of the page.
  - A debounced MutationObserver adapts content added later.
  - "Show original" undoes everything for this page load. The panel offers "Show my changes
    again".
- **Names (`names.ts`):** badges in Anchor's Shadow DOM overlay, beside each "sure" match of a
  named shelf button. Pointer events pass through. Page DOM untouched.
- **Content script runs at `document_start`** so the stylesheet lands before the first paint (no
  flash of the unadapted page). Other requests wait for DOMContentLoaded.

## Tasks (each a commit, tests with it)

1. Store v3 + `adapt.ts` plan + writer request. Unit tests (migration, plan, writer).
2. `facts.ts`, `contrast.ts`, `clutter.ts`. jsdom unit tests: color math, protected nodes,
   clutter picks.
3. Engine: stylesheet + registry + observer + show original; content script at document_start.
   Fixture `fixtures/adapt/` (facts, ads, promo with price, low-contrast text, animation, small
   buttons). E2E: Hard Rules 2 and 4 across every fixture page, clutter, contrast.
4. Names beside labels. E2E.
5. Panel: first-run questions, before/after, keep, "Not now", helper "Ask the setup questions
   again", "Show my changes again". E2E. Existing e2e tests start from "setup answered, all off",
   seeded in the fixture; setup tests start fresh.
6. Matching under Adapt: the M2 sweep with Adapt at largest, plus the elementFromPoint check.
7. Docs: PROGRESS, CLAUDE.md commands if any change.

## Out of scope (M4)

- Pausing videos, GIFs and script-driven carousels. CSS can't stop them, and pausing a video
  from script changes page state. Noted as a gap.
- AI labels. A settings page for the person.

## Hard Rule checks

- 1: lint + bundle scan unchanged; the engine only writes styles.
- 2: the e2e fact comparison over every fixture page; unit tests on `facts.ts`.
- 3: names live in the overlay; e2e checks the site's label text is unchanged.
- 4: e2e pristine-DOM check with everything on.
- 7: no `.value` reads (lint).
- 9: the contrast pass is off in forced-colors mode; browser zoom is untouched; badges are text in
  the labeled overlay.
