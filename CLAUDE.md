# Anchor

Anchor is a browser extension that sits between a person and every website. It remembers the buttons and tasks a person relies on, guides them through each task one step at a time, and keeps working when a site redesigns. The one promise to the user: **your button is always where you left it.**

This file is the source of truth for the project. It describes version 2 of the idea. If something here is unclear or seems wrong, write the question in `docs/PROGRESS.md` and choose the more cautious option.

## How to work on this project

Read this section before doing anything.

1. **Work one milestone at a time, in order.** Stop at the end of each milestone and summarize what was built, what is untested, and what needs a decision. Do not start the next milestone until asked.
2. **Plan before coding.** At the start of a milestone, write a short plan to `docs/plan-M<n>.md` (what you will build, in what order, how it will be tested).
3. **Keep `docs/PROGRESS.md` current.** Sections: Done, In progress, Decisions made (with one-line reasons), Questions for Manas.
4. **Tests ship with the code.** Run the full suite before calling anything done. Report failures honestly; never weaken a test to make it pass.
5. **Small commits** with clear messages. Ask before pushing to a remote.
6. **The Hard Rules below beat every other requirement.** If a task seems to need breaking one, stop and flag it.
7. **Verify browser APIs against current documentation** (Manifest V3, side panel, storage, built-in AI). They change often; do not rely on memory.
8. **Ask before adding a dependency** that is large, unmaintained, or makes network calls.
9. **Never test against real bank, health or email accounts.** Use the fixture sites.
10. After M0, add a "Commands" section to this file with the real build, test and load-in-Chrome commands.

## Commands

Requires Node 24+ (see `.nvmrc`). Run from the repository root.

| What | Command |
| --- | --- |
| Install (fresh clone) | `npm ci` then `npx playwright install chromium` (once per machine) |
| Build the extension | `npm run build` → output in `packages/extension/.output/chrome-mv3` |
| Everything except e2e | `npm run check` (format check, lint incl. Hard Rule checks, typecheck, unit tests + bundle scan, build) |
| Unit tests only | `npm test` |
| E2E in bundled Chromium | `npm run test:e2e` |
| E2E in installed Edge | `npm run test:e2e:edge` |
| Fixture harness report | `npm run harness` |
| Lint / format | `npm run lint` / `npm run format` |
| Dev mode (hot reload) | `npm run dev -w @anchor/extension` (opens a browser with the extension; dev builds skip the strict CSP) |

**Load in Chrome or Edge by hand:** `npm run build`, open `chrome://extensions` (Edge: `edge://extensions`), turn on Developer mode, click "Load unpacked", choose `packages/extension/.output/chrome-mv3`. Click the Anchor toolbar icon to open the side panel. The content script runs only on `http://localhost` and `http://127.0.0.1` for now.

## The product in brief

### Two people

| | The user (e.g. an older adult) | The helper (e.g. their daughter) |
| --- | --- | --- |
| Role | Uses the web as usual | Installs, sets up and maintains Anchor |
| Sees | A readable page, the My buttons shelf, calm messages | What changed on each site, what couldn't be found, which routes broke. Never page content or anything typed. |
| Does | Clicks as normal; can always tap "Show original" | Answers setup questions, names buttons in the person's words, re-picks a lost button, records routes |

Design principle: **calm for the user, details for the helper.**

### Three parts

- **Anchor (the engine).** For each feature the person relies on ("Pay bill", "Refill prescription"), store a fingerprint and find the feature again after the site changes. Every remembered feature sits on a **My buttons shelf** in the browser's side panel, in the same place on every site.
- **Routes (what people use daily).** A task such as "pay the electric bill" is recorded once, then guided one step at a time. Each step is a fingerprint, so routes repair themselves after a redesign.
- **Adapt (comfort).** Larger text and targets, calmer pages, and the person's own names shown beside a site's labels.

### What happens when the person clicks a shelf button

| Matcher confidence | Behavior |
| --- | --- |
| Sure | **Take me there:** scroll to the real element and highlight it. The person clicks it. |
| Fairly sure | **Point and check:** same highlight, with the note "I think it's this one now." |
| Unsure | **Ask:** calm message on the shelf: "This website changed. Let's ask your helper," with a help note ready to send. |

Version 1 had a "Restore" mode that drew the old button back onto the page and clicked the real one. **It is dropped. Do not build it.**

## Hard Rules

These are invariants. Each one needs an automated check wherever a check is possible.

1. **Never clicks for the person.** Anchor scrolls and highlights only. No `.click()`, no synthetic mouse or keyboard events, no `form.submit()`, no programmatic navigation on the person's behalf. *Check: lint rule plus a test that scans the built bundle.*
2. **Never changes facts.** Prices, amounts, numbers, dates, legal text, security alerts, consent dialogs and session warnings stay exactly as the site shows them, and are never hidden. *Check: fixture tests comparing those nodes before and after Adapt.*
3. **Adds, never replaces.** A plain name appears beside a site's own label, never instead of it.
4. **"Show original" is always one tap away** and removes every Anchor change on the page in one call. All injected UI lives in a Shadow DOM host marked with a `data-anchor` attribute; all style changes are reversible. *Check: e2e test that the DOM matches the untouched page after "Show original".*
5. **Never guesses silently.** A match below the "sure" tier is always shown as uncertain. No fallback to "best available".
6. **Nothing leaves the device unless the person sends it.** No servers, no accounts, no analytics, no telemetry, no remote fonts or scripts. The extension makes zero network requests. *Check: bundle scan for `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`; restrictive content security policy for extension pages.*
7. **Never records what the person types.** The recorder notes that an input step exists, never its value. Do not read `.value` from page inputs anywhere. *Check: lint rule plus recorder tests with filled-in forms.*
8. **Helpers pair in person.** No remote control, no helper accounts, no screen sharing.
9. **Works alongside the person's own tools.** Do not break screen readers, browser zoom or high-contrast modes. Injected UI must be keyboard-accessible and labeled.
10. **The core works without AI.** Everything in M1 to M6 runs with no language model. On-device AI is a later, optional add-on behind an interface.
11. **Free to build and run.** No paid services or API keys.

## Technical decisions

- **Platform:** Chrome extension, Manifest V3, desktop first. It should also load in Edge. No mobile work yet.
- **Language:** TypeScript, strict mode.
- **Build:** a currently maintained Manifest V3 bundler setup. Check what is maintained today before choosing.
- **UI:** the smallest thing that works (plain TypeScript or a tiny library). No heavy framework.
- **Storage:** `chrome.storage.local` with a versioned schema, plus JSON export and import.
- **Tests:** unit tests for the matcher; end-to-end tests that load the unpacked extension in a real browser against the fixture sites.

### Repository layout

```
packages/matcher/     Pure TypeScript. DOM in, fingerprints and matches out. No extension APIs.
                      Must run in a content script and in Node (with a DOM library) for the benchmark.
packages/extension/   Service worker, content script, side panel (shelf + route guide), helper page.
fixtures/             Fake sites for development and e2e tests (see below).
benchmark/            Real-site snapshot pairs, labels, runner, report generator.
docs/                 PROGRESS.md, plans, benchmark report.
```

### Fixture sites

Build at least three small fake sites (a bank, a pharmacy, a utility). Each needs:

- a **v1** and a redesigned **v2** where buttons move, get renamed, change tag and class names, move into menus, or move to another page;
- **state variants** that are *not* redesigns: logged out, a sale banner, a cookie popup, a survey modal, an A/B variant, a session-timeout warning;
- pages with prices, dates and legal text for the "never changes facts" tests.

## Data model (starting point; refine in M1)

```ts
type Fingerprint = {
  id: string;
  site: string;               // registrable domain
  pagePattern: string;        // URL pattern where it was captured
  personalName?: string;      // "Pay the light bill"
  signals: {
    text: string;             // visible text
    accessibleName: string;
    role: string;             // button, link, menuitem...
    tag: string;
    attributes: Record<string, string>;   // id, name, href path, data-*, aria-*
    neighborText: { before: string; after: string };
    ancestorTrail: string[];  // landmarks, headings, form context
    visual?: { region: string; sizeBucket: string };   // weak signal only
  };
  variants: Fingerprint["signals"][];     // extra observed forms (A/B tests)
  createdAt: string; lastSeenAt: string;
};

type MatchResult = {
  element: Element | null;
  score: number;              // 0 to 1
  tier: "sure" | "fairly" | "unsure";
  runnerUpGap: number;        // distance to the second-best candidate
  reasons: string[];          // for the helper view
};

type Route = { id: string; name: string; site: string; steps: Step[] };
type Step = {
  kind: "click" | "your-turn" | "navigate";
  fingerprint?: Fingerprint;
  instruction: string;        // plain words shown to the user
};

type HelpNote = { site: string; routeName?: string; stepIndex?: number;
                  label: string; date: string };   // never page content
```

## Matching approach

- Score every candidate interactive element against the fingerprint using **many weak signals combined into one weighted similarity score**. The published "Similo" approach (Nass et al., arXiv 2208.00677) is the model to start from.
- A tier needs both a high score **and** a clear gap to the runner-up. Two near-identical candidates means "unsure".
- **A wrong match is worse than no match.** Calibrate thresholds on the benchmark. Starting targets: wrong matches at the "sure" tier at or below 1%, at the "fairly sure" tier at or below 5%. Confirm targets with Manas after the first report.
- Capture fingerprints from the original DOM's meaning and structure, **not pixel positions**. Adapt's text enlargement can trigger a site's mobile layout; that must not break matching.
- Search open shadow roots and same-origin iframes. Handle single-page apps that re-render (re-attach with a mutation observer).
- **Redesign vs. different state:** judge the person's fingerprints on a site as a group.
  - None found, login form present: logged out. Say nothing alarming.
  - Most found, one missing: local change. Handle that one feature.
  - Most found in new places: redesign. Update fingerprints, tell the helper.
  - Require the same result on two separate visits before reporting a redesign.
- If a feature is not on the current page, look for it in the site's menus and navigation links and treat any hit as "unsure".

## Milestones

### M0: Scaffold
Repository layout, build, lint (including the Hard Rule lint checks), unit and e2e test harness, a "hello" extension that opens a side panel. Done when a fresh clone builds, tests pass, and the extension loads.

### M1: Matcher and benchmark (the proof)
This comes before any real interface. It answers "does the core idea work?"

- `packages/matcher`: capture, match, tiering, site-state classification.
- Fixture sites with v1, v2 and state variants.
- Real-site benchmark:
  - `benchmark/sites.json` lists pages with two archive timestamps each (before and after a redesign), fetched from the Wayback Machine into a git-ignored cache.
  - Start with about 10 sites older adults use (pharmacy, utility, government benefits, bank public pages, email sign-in) and about 5 features per site.
  - Propose ground-truth labels; Manas confirms them. Archived pages cover public pages only; logged-in flows are covered by fixtures.
  - `docs/benchmark-report.md`: for each tier, counts of correct, wrong and not found; the weakest signal; examples of every wrong match.
- Done when the report exists, thresholds are set from it, and the "sure" tier meets its wrong-match target on fixtures and labeled real pages.

### M2: My buttons shelf and pointing
- "Remember this button": the helper clicks an element and gives it a name.
- Side panel shelf listing this site's buttons, same order every time.
- Clicking a shelf button: scroll into view, highlight ring, tier-appropriate note. Ask state with a help note.
- "Show original".
- Done when e2e tests pass on every fixture's v1 to v2 change and on every state variant.

### M3: Routes
- **Record:** capture clicks as fingerprints while the helper or user does the task. Inputs become "your turn" steps with no value stored.
- **Guide:** the side panel shows one step at a time in plain words and highlights the next element. Advance by *observing* the person's own click.
- **Self-repair:** each step is re-found by the matcher. If a step is unsure, pause calmly and prepare a help note naming that step.
- **Detours:** when a dialog or overlay appears that is not in the route (cookie banner, survey, "update your details"), say what it is in plain words and wait. Never dismiss it automatically.

### M4: Adapt (no AI)
- First-run setup: two or three plain questions ("Is the text hard to read?", "Do small buttons give you trouble?"), then an immediate before-and-after on a real page. No settings page for the user.
- Text scale, larger click targets, spacing and contrast, calmer motion, clutter hiding with the never-hide list from Hard Rule 2.
- Personal names shown beside site labels.

### M5: Helper tools
- Helper page: what changed on each site, what could not be found, which routes broke, with the matcher's reasons.
- Help note: a short pre-written message (site, route, step; no page content) sent through `mailto:` or copied as text.
- Fix file: export and import of fingerprints and routes as validated JSON, so a helper can repair a step and send it back.
- Re-pick flow for a lost button.

### M6: Look-alike warning
Compare the current site with the sites the person really uses. If the page resembles one of them but the domain differs (near-miss spelling, look-alike characters, same brand words), show a calm warning. Warn only; never block.

### Later (do not build yet)
Shared route packs for common sites, optional on-device AI for labels and error messages, iPad Safari, Firefox, gentle "this button lives here now" teaching hints.

## Interface rules for anything the user sees

- Plain words, short sentences, no jargon, no error codes, no blame.
- Large text (18px or more), large targets (44px or more), strong contrast.
- One message at a time. Nothing blinks, nothing times out.
- Calm wording. Example: "This website changed. Let's ask your helper." Not: "Error: element not found."
- All technical detail goes to the helper page.

## Out of scope

Backend or cloud services, accounts or login, analytics, automation that clicks or fills forms, password or payment handling, mobile browsers, and monetization.

## Questions for Manas (resolve as they come up)

- Which real sites go into `benchmark/sites.json` first?
- Are the wrong-match targets (1% and 5%) right after seeing the first report?
- License and public name for the repository.
- Should the helper page sit behind a simple PIN so the user doesn't open it by accident?
