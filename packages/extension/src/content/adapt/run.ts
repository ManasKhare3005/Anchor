import { indexPage, match, registrableDomain, type Fingerprint } from "@anchor/matcher";
import { planFor, type AdaptSettings } from "../../adapt.ts";
import { buttonsFor, routesFor, type Store } from "../../store.ts";
import { applyAdapt, removeAdapt } from "./engine.ts";

/**
 * What Adapt shows on this page load:
 * - the person's saved setup answers, live (a change in storage re-applies);
 * - or, during setup, the answers being tried out (preview, not saved);
 * - or nothing after "Show original", until the panel asks for the changes again.
 */

let saved: AdaptSettings | null = null;
let preview: AdaptSettings | null = null;
let paused = false;
/** This site's shelf buttons and task steps: elements the person relies on are never hidden. */
let mine: Fingerprint[] = [];

function current(): AdaptSettings | null {
  return preview ?? saved;
}

/** The person's own buttons and steps found on the page (top candidate, any tier). */
function keepers(doc: Document): ReadonlySet<Element> {
  const keep = new Set<Element>();
  if (!mine.length || !doc.body) return keep;
  const page = indexPage(doc);
  for (const fp of mine) {
    const r = match(page, fp);
    const el = r.element ?? r.ranked[0]?.element;
    if (el && r.score >= 0.35) keep.add(el);
  }
  return keep;
}

function render(doc: Document): void {
  const s = current();
  if (paused || !s) {
    removeAdapt();
    return;
  }
  applyAdapt(doc, planFor(s), () => keepers(doc));
}

/** The store as read at load or after a change. */
export function adaptFromStore(doc: Document, store: Store | null): void {
  saved = store?.adapt ?? null;
  const site = registrableDomain(doc.location.href);
  mine = store
    ? [
        ...buttonsFor(store, site),
        ...routesFor(store, site).flatMap((r) => r.steps.flatMap((s) => s.fingerprint ?? [])),
      ]
    : [];
  render(doc);
}

/**
 * Show these settings on this page now (setup's before-and-after, or "Show my changes again").
 * null: back to the saved settings.
 */
export function adaptShow(doc: Document, settings: AdaptSettings | null): void {
  preview = settings;
  paused = false;
  render(doc);
}

/** "Show original": no Adapt on this page until asked again. */
export function adaptPause(): void {
  paused = true;
  preview = null;
  removeAdapt();
}
