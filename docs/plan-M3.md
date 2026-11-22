# M3 plan: Routes

## Goal (from CLAUDE.md)

- **Record:** capture clicks as fingerprints while the helper or the person does the task. Inputs
  become "your turn" steps with no value stored.
- **Guide:** the side panel shows one step at a time in plain words and highlights the next element.
  It advances by _observing_ the person's own click.
- **Self-repair:** each step is re-found by the matcher. When a step is unsure, pause calmly and
  prepare a help note naming that step.
- **Detours:** when a dialog or overlay that is not in the route appears (cookie banner, survey,
  "update your details"), say what it is in plain words and wait. Never dismiss it.

## Done when

E2E tests, through the real side panel, on all three fixture sites:

1. A task is recorded on v1 across several pages, with filled-in form fields. The stored route
   holds click and "your turn" steps, and **none of the typed text** appears anywhere in storage.
2. Guiding on v1 completes the task. Every step advances only when the test clicks or types the way
   a person would. Anchor never clicks.
3. Guiding on v2 re-finds the steps it can. It **never points at a wrong element**. It pauses with
   a help note naming the route and the step when a step is unsure.
4. Each detour (cookie banner, survey, session warning, "update your details") is named in plain
   words. The ring waits, and the dialog is still on the page untouched until the test closes it.
   Then the guide resumes.
5. Show original stops recording or guiding and leaves the page DOM pristine.

## Architecture

The side panel is the conductor, because it survives page loads; content scripts don't.

```
side panel ── tabs msg ──► content script (per page load)
  recording: list of steps        record-start / record-stop
  guiding: route + step index     guide-step {step, next?} / guide-stop
     ▲                              │
     └──── runtime msg ─────────────┘  recorded {step} · step-done · guide-update {reply}
service worker: single writer (routes added beside buttons)
```

- **Store schema v2:** `{ schemaVersion: 2, buttons, routes }`. Version 1 data migrates on read
  (`routes: []`). The writer gets `route-add` and `route-remove`.
- **Route and Step** follow the CLAUDE.md data model. Step kinds:
  - `click`
  - `your-turn` (text fields, selects, checkboxes, radios)
  - `navigate` (in the schema, but not recorded in M3)
- **Instructions** are generated from the site's own label:
  - `Click "Pay now".`
  - `Your turn: fill in "Amount".`
  - `Your turn: choose "Payee".`
- **Recorder (content):**
  - Listens in the capture phase and never swallows: the task really happens.
  - A click on a button or link becomes a click step.
  - Typing in a field becomes a your-turn step, detected from the `input`/`change` event _type_
    only. Nothing reads `.value`.
  - The same field is never recorded twice in a row.
  - A click into a field is not a step; the typing is.
  - After every page load the panel re-arms the recorder.
- **Guide (content):**
  - Matches the step and draws the ring with a step note.
  - Listens in the capture phase for the person's click inside the target (never swallowed), then
    reports `step-done`.
  - For a your-turn step it watches for a `change` event on the field, or the panel's Next. It
    also watches the following click step, so typing then pressing the button straight away
    doesn't lose a step.
  - When the step is unsure it draws nothing and keeps watching the page (debounced mutation
    observer). If the step appears later it reports `guide-update`. Nothing times out.
- **Detours:**
  - A visible `dialog[open]`, `[role=dialog]`, `[role=alertdialog]` or `[aria-modal=true]` that
    doesn't contain the step's element.
  - It's named from its own words: cookies / survey or feedback / session or time-out /
    "update" or "confirm your details" / otherwise "a message".
  - The ring hides while it's open and comes back when it closes.
  - The detour text is used only for the panel message, never stored, never in a help note.
- **Help note** (`HelpNote`): site, route name, step number, the step's label, date.

## Fixtures

The M1 home pages stay untouched, so the benchmark and drift guard don't move. Task flows live in
`fixtures/tasks/<site>/{v1,v2}/`:

| Site       | Task                  | v1 steps                                                                    | v2 change                                                   |
| ---------- | --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| riverbank  | Pay a bill            | home → Bill Pay → payee, amount, date → Review → Pay now → done             | renamed, tag changed, one link in a menu                    |
| carewell   | Refill a prescription | home → Refills → choose prescription → pickup store → Request refill → done | renamed, moved; "Confirm" step removed (unsure → help note) |
| brightline | Pay the electric bill | home → Pay bill → amount, account → Continue → Submit payment → done        | redesign with class and tag changes                         |

`fixtures/tasks/detours.js` adds a detour after load when the URL asks for it
(`?detour=cookie|survey|session|details`). The detour comes from the site, with its own close
button.

## Tasks (each one commit and push)

1. Store v2, migration, route model, instruction words, help note. Unit tests.
2. Task fixtures (3 sites, v1 and v2, detours).
3. Recorder plus the panel "Record a task" UI. E2E: records on v1 and stores no typed text.
4. Guide plus the panel step view. E2E: completes on v1, advances on observed clicks only.
5. Self-repair on v2: never wrong, pause plus help note. E2E.
6. Detours: name, wait, resume, never dismiss. E2E.
7. Wrap-up: PROGRESS, short summary.

## Not in M3

- Editing a step's words, re-picking a lost step, and updating fingerprints after a redesign (M5
  helper tools).
- Recording `navigate` steps.
- Routes that span tabs or sites.

## Hard Rule checks

- **Rule 1:** existing lint and bundle scan. E2E asserts the site saw no event from Anchor while
  guiding (`handlers.html`-style hit log on task pages).
- **Rule 4:** Show original during guiding leaves the page pristine.
- **Rule 5:** an unsure step draws no ring.
- **Rule 7:** e2e fills fields with marker strings and asserts storage never contains them. Lint
  still forbids `.value`.
- **Rule 2:** detour dialogs are never hidden or closed by Anchor (e2e checks they stay open).
