# M2 plan: My buttons shelf and pointing

## Done when (from CLAUDE.md)

E2E tests pass on every fixture's v1 → v2 change and on every state variant: the helper remembers
each feature on v1 through the real side panel, then the shelf points at the right element (or
asks) on v2 and on all six state pages.

## Architecture

```
side panel (shelf UI)  ──runtime msg──►  service worker  ──►  chrome.storage.local
      │    ▲                              (single writer: add / rename / remove,
      │    │ storage.onChanged             zod-validated, versioned schema)
      │    │
      └─tabs msg──► content script (fixture origins only)
                     pick mode: swallow pointer + click, capture fingerprint
                     find: match → scroll + highlight ring + note (Shadow DOM, data-anchor)
                     show original: remove every Anchor node and listener
```

- **Storage.** Key `anchor`, value `{ schemaVersion: 1, buttons: Fingerprint[] }`. Shelf order is
  array order (same order every time). Pure reducer functions in `src/store.ts`, unit tested; the
  service worker is the only code that writes. The side panel reads and listens for changes.
- **Which page.** The side panel asks the active tab's content script where it is (site + page
  pattern). No `tabs` permission needed. A `?tab=<id>` query parameter pins a tab (used by e2e,
  where the panel opens as a normal page).
- **Picking** (helper). The content script swallows the whole pointer sequence (`pointerdown`,
  `mousedown`, `pointerup`, `mouseup`, `click`, `auxclick`, `dblclick`, `contextmenu`) in the
  capture phase so the site never reacts. Keyboard: Tab to a control, Enter picks, Esc stops.
  The clicked node resolves to its nearest matcher candidate. `capture()` never reads `.value`.
- **Pointing.** `scrollIntoView({ block: "center" })` (no smooth scroll), a fixed-position ring
  following the element every animation frame, and a short note. Never `.click()` or `.focus()`.
  If the element is hidden in a closed menu, the ring goes on the nearest visible ancestor (for
  `<details>`: its `<summary>`) with "It's inside this menu. Open it, and I'll show you." and
  moves to the element once it becomes visible. If the page re-renders and the element is gone,
  match again (debounced mutation observer); if it can't be found confidently, remove the ring.
- **Tiers.** Sure: "Here it is." Fairly: "I think it's this one now." Unsure: "This website
  changed. Let's ask your helper." with a help note (site, button name, date; no page content)
  and a Copy button. Logged-out (site state from `classifySite` over all this site's buttons):
  "You may need to sign in first." Helper details (score, reasons) sit in a collapsed section.
- **Show original.** Always visible in the side panel and in the in-page note. Removes the host,
  stops the frame loop and observers. E2E: DOM equals a fresh parse of the page afterwards.
- **Calm for the user, details for the helper.** "Remember a button" and "Remove" live under a
  collapsed "For helpers" section.

## Tasks (each one commit + push)

1. **Store**: schema, reducers, service-worker writer, message validation. Unit tests.
2. **Pick mode**: content-script picking, banner in Shadow DOM, keyboard picking, swallowing.
   E2E: a fixture with `mousedown`/`click` handlers proves the site never sees the pick.
3. **Shelf UI**: list for the current site, name form (suggested name = button text), remove.
   E2E: remember via the panel, survives reload, same order.
4. **Pointing**: find, scroll, ring, notes per tier, hidden-in-menu, SPA re-attach. E2E.
5. **Ask + help note + logged-out message.** E2E.
6. **Show original.** E2E: pristine DOM after.
7. **Fixture sweep**: every feature on every fixture site, v2 and all states. Assert never a
   wrong element; a feature that exists may be "asked" (safe), and the found count must be at
   least the benchmark's.
8. Wrap-up: PROGRESS, short summary.

## Not in M2

Two-visit redesign reporting and fingerprint self-update (helper page, M5), menu-hint display
(M5), export/import (M5), routes (M3), Adapt (M4), widening beyond fixture origins.

## Hard Rule checks added

- Rule 1: existing lint + bundle scan cover the new code; e2e asserts the site saw no click
  during picking or pointing.
- Rule 4: e2e "Show original" pristine-DOM test; all UI inside one `data-anchor` Shadow DOM host.
- Rule 5: e2e: unsure never draws a ring.
- Rule 7: the panel's own name field is read through one audited helper (the helper typing a
  name for Anchor, not a page input).
- Rule 9: panel controls are real buttons with labels, 44px+, 18px+ text; ring and note respect
  `forced-colors`.
