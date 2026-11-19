# Anchor — keep every website familiar

> Working name. A personal layer between a person and every website: it makes each site fit them, and keeps it familiar even when the site redesigns.

This README is the project brief for building Anchor step by step. If you are an AI coding assistant (e.g. Claude Code) reading this: **read the whole file before writing any code, then follow the "How we work" section.**

---

## 1. The problem

- Older adults struggle with websites. Many keep **written lists of steps** for the sites they use, and when a site redesigns its navigation, those steps break and they give up.
- Families act as unpaid tech support, and every redesign means another phone call.
- Existing tools don't solve this:
  - **Accessibility overlays** are installed by websites, often break screen readers, and track users.
  - **Reader mode** only works on articles, not on shopping, forms, or account pages.
  - **"Bring back the old layout" extensions** handle one site each and break when the site drops its old version.
  - **Senior tablets** (GrandPad etc.) simplify things by locking people out of the open web.

## 2. The idea

**One rule for the user: "Your button is always where you left it."**

Anchor has three parts. Anchor is the core; the other two build on it later.

| Part               | What it does                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anchor** (core)  | Remembers the features a person uses on each site (e.g. "Track order", "Pay bill"). After a redesign, it finds the same feature in the new layout and keeps the person's familiar experience. |
| **Adapt** (later)  | Rewrites confusing labels, jargon and error messages, enlarges small buttons, hides clutter, based on the person's profile.                                                                   |
| **Routes** (later) | Saves tasks ("pay the electric bill") as guided step-by-step paths, recorded once by the user or a helper, that repair themselves when the site changes.                                      |

### The signpost rule (how Anchor behaves after a redesign)

The familiar spot always does something useful, depending on how confident the match is:

| Confidence | Behavior                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| High       | **Restore:** a button appears in the familiar spot with the familiar label. Clicking it triggers the real element on the page. |
| Medium     | **Point:** clicking the familiar spot scrolls to and highlights the real element: "It's here now."                             |
| Low        | **Ask:** a calm message: "This website changed. I've let your helper know." Never guess silently.                              |

### The helper model

- A **helper** (usually a family member) installs and sets up Anchor for the **user** (usually an older adult).
- The user sees a calm, familiar page. The **helper gets the technical details**: "Amazon changed its layout. We kept Mom's version. 1 button couldn't be found."

## 3. Non-negotiable rules

These apply to every phase. Never break them, even if a feature would be easier.

1. **Never click for the user on anything important.** Payments, submits, deletes and sends always need the user's own click.
2. **Never change facts.** Prices, numbers, amounts, dates and legal text are never rewritten or hidden.
3. **"Show original" is always one click away.**
4. **Everything stays on the device.** Profiles, fingerprints and logs live in local storage. No server, no analytics, no tracking. A user's needs can reveal disability; treat that data as sensitive.
5. **Never guess silently.** Below the confidence threshold, Anchor points or asks; it never pretends.
6. **Work alongside assistive tech** (screen readers, zoom), never replace or fight it.
7. **The core must work without AI.** On-device AI (Chrome's Prompt API / Gemini Nano) is an optional boost, because many older computers can't run it.
8. **Free to build and run.** No paid APIs required.

## 4. Prior art to learn from

- **Self-healing locators** in test automation (e.g. Healenium, Testim): capture a multi-attribute fingerprint of an element, detect when the locator breaks, relocate it with similarity scoring. Fallback order commonly used: CSS selector → text → ARIA label → relative DOM position.
- **Ringer** (Berkeley, OOPSLA 2016): web record-and-replay with a similarity-based node addressing algorithm. Prior art for Routes.
- **CoScripter** (IBM Research): recorded and shared web tasks for end users. Discontinued; shows the demand and the pitfalls.
- **Chrome built-in AI**: the Prompt API (Gemini Nano) is stable for Chrome extensions; requires desktop Chrome and capable hardware.

## 5. Proposed tech stack

Suggestions; confirm or improve them in Phase 0.

- **Chrome extension, Manifest V3**, written in **TypeScript**, bundled with **Vite**.
- **Matching engine** as a pure, framework-free TypeScript library (`/packages/matcher`), so it can be tested offline without a browser.
- **Storage:** `chrome.storage.local` and IndexedDB.
- **UI:** a small framework (React or Preact) for the popup, setup flow and helper view; plain DOM for the injected signpost overlay to keep it light.
- **Testing:** Vitest for unit tests; Playwright for end-to-end tests against saved page fixtures.
- **Optional AI:** Chrome Prompt API behind a feature flag, with graceful fallback.

## 6. Suggested architecture

```
content script ──► capture: fingerprints of elements the user uses
       │
       ├──► detector: is this page different from what we remember?
       │
       ├──► matcher (pure library): old fingerprint → best candidate + confidence
       │
       └──► renderer: Restore / Point / Ask overlay (signpost rule)

background worker ──► storage (per-site maps, profile), change log for the helper
popup / options   ──► setup flow, "show original" toggle, helper view
```

### Element fingerprint (starting point, refine in Phase 1)

```ts
interface ElementFingerprint {
  id: string; // stable id we assign
  site: string; // origin, e.g. "https://www.amazon.com"
  pageKind: string; // rough page type / URL pattern
  label: string; // what the user calls it ("Track order")
  text: string; // visible text
  role: string; // ARIA role or tag semantics (button, link, ...)
  ariaLabel?: string;
  attributes: Record<string, string>; // id, name, href pattern, data-*
  domPath: string; // structural path, used as a weak signal
  neighbors: string[]; // nearby visible text (context)
  position: { x: number; y: number; w: number; h: number }; // relative to viewport
  visualHash?: string; // optional perceptual hash of a cropped screenshot
  lastSeen: string; // ISO date
}
```

## 7. Roadmap (build slowly, one phase at a time)

Each phase ends with a demo-able result and passing tests. **Do not start the next phase until the current one is done and confirmed.**

### Phase 0: Foundations

- Set up the repo: monorepo with `/extension` and `/packages/matcher`, TypeScript, Vite, Vitest, Playwright, lint and format.
- Create `PROGRESS.md` (log) and `DECISIONS.md` (architecture decisions with reasons).
- Build a **fixture harness**: pairs of saved HTML pages, "before" and "after" a redesign. Start with 3–5 synthetic pairs written by hand (button moved, renamed, restyled, nested differently, removed), then add real pairs from archived versions of public sites.
- **Done when:** the project builds, an empty extension loads in Chrome, the test harness runs on fixture pairs.

### Phase 1: Capture

- Let the user (or helper) mark elements as "things I use": a simple pick mode, plus automatically remembering elements the user clicks repeatedly (opt-in).
- Store fingerprints locally per site.
- **Done when:** on a fixture page, marking a button stores a complete fingerprint that survives a browser restart.

### Phase 2: Matcher (the heart of the project)

- Implement the matcher as a pure library: given a fingerprint and a new DOM, return ranked candidates with a confidence score.
- Start rule-based (weighted similarity across text, role, ARIA, attributes, neighbors, position); keep each signal's contribution inspectable for debugging.
- Build a **benchmark** over the fixture pairs: accuracy, wrong-match rate, and how well confidence predicts correctness. **A wrong match is worse than no match**: tune thresholds to keep the wrong-match rate very low.
- **Done when:** benchmark results are written to `BENCHMARK.md`, with a clear threshold for High / Medium / Low.

### Phase 3: Point mode on real pages

- Detect when a remembered element is missing or changed on a live page.
- Implement **Point** (highlight + "It's here now") and **Ask** (calm message) only. No Restore yet.
- Handle single-page apps: watch DOM mutations and re-apply.
- **Done when:** on a fixture "after" page and on at least two real sites, a moved button is found and highlighted, and an unfindable one shows the calm message.

### Phase 4: Restore mode

- For High-confidence matches, place a familiar button in the familiar spot that triggers the real element.
- Enforce the rules: never auto-click; sensitive actions (pay, submit, delete, send) only ever get **Point**, never Restore, until we decide otherwise.
- Add the "show original" toggle.
- **Done when:** restore works on fixtures and real sites, and sensitive-action detection is covered by tests.

### Phase 5: First-run experience and helper view

- Helper-led setup: install, ask 2–3 simple questions, show an immediate before/after on a site the user actually uses. No account.
- A local helper view: list of sites, what changed, what couldn't be found, one-click fixes (re-pick an element).
- Very large, simple UI for the user side; plain language everywhere.
- **Done when:** someone who has never seen the tool can be set up in under 5 minutes.

### Phase 6: Adapt (basics)

- Profile-driven changes without AI first: text size, spacing, contrast, bigger click targets, hiding autoplay and popups.
- Optional AI rewriting of labels and error messages via the Chrome Prompt API, behind a feature flag, never touching facts.

### Phase 7: Routes

- Record a task once ("pay the electric bill") as a sequence of fingerprints.
- Replay it as a guided, step-by-step overlay; the user still does every click. Reuse the matcher so routes self-repair.

### Later / open

- How a helper connects remotely (same device only vs. remote link).
- Mobile (Firefox for Android, Safari extensions on iPad, or a companion browser).
- Visual matching with screenshot crops for very heavy redesigns.

## 8. How we work (instructions for the AI assistant)

1. **Plan before coding.** At the start of each phase, write a short plan in `PROGRESS.md`: goals, files to touch, tests to add, risks. Wait for my approval before implementing.
2. **One phase at a time.** Stay inside the current phase. If you think of something for a later phase, add it to the "Ideas parking lot" in `PROGRESS.md` instead of building it.
3. **Small steps.** Break each phase into small tasks; after each, run the tests and summarize what changed.
4. **Tests first for the matcher.** Every matching behavior gets a fixture and a test.
5. **Record decisions.** Any meaningful technical choice goes into `DECISIONS.md` with the reason and the alternatives considered.
6. **Respect the non-negotiable rules** in section 3. If a task seems to require breaking one, stop and ask.
7. **Ask when unsure** instead of guessing, especially about user-facing behavior.
8. **End each phase** with: what works, how to try it, benchmark or test results, known issues, and a proposed plan for the next phase.

## 9. Open questions

- How do we tell a real redesign apart from a page that just looks different (logged out, a sale banner, A/B test)?
- Which signals matter most in the fingerprint, and how should they be weighted?
- Should the first version target a few sites done very well, or be general-purpose from day one?
- How strict should Restore be on sensitive pages (banks, health portals)?
