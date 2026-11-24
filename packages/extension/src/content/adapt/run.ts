import {
  ANCHOR_HOST_ATTR,
  indexPage,
  match,
  registrableDomain,
  type Fingerprint,
} from "@anchor/matcher";
import { planFor, type AdaptSettings } from "../../adapt.ts";
import { labelOf } from "../../route.ts";
import { buttonsFor, routesFor, type Store } from "../../store.ts";
import { applyAdapt, removeAdapt } from "./engine.ts";
import { hideNames, showNames, type NameTag } from "./names.ts";

/**
 * What Adapt shows on this page load:
 * - the person's saved setup answers, live (a change in storage re-applies);
 * - or, during setup, the answers being tried out (preview, not saved);
 * - or nothing after "Show original", until the panel asks for the changes again.
 *
 * The person's own names beside the site's buttons show whatever the answers were, and go with
 * "Show original" too.
 */

let saved: AdaptSettings | null = null;
let preview: AdaptSettings | null = null;
let paused = false;
/** This site's shelf buttons and task steps: elements the person relies on are never hidden. */
let mine: Fingerprint[] = [];
/** Shelf buttons the person (or helper) gave their own name. */
let named: Fingerprint[] = [];
let watcher: MutationObserver | null = null;
let rename: ReturnType<typeof setTimeout> | undefined;

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

function same(a: string, b: string): boolean {
  const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

/** Names beside buttons found for sure (Hard Rule 5: never on a guess). */
function nameTags(doc: Document): NameTag[] {
  if (!named.length || !doc.body) return [];
  const page = indexPage(doc);
  const out: NameTag[] = [];
  for (const fp of named) {
    const name = fp.personalName ?? "";
    const r = match(page, fp);
    if (r.tier !== "sure" || !r.element) continue;
    const label = labelOfElement(r.element, fp);
    // The site already says the same thing: nothing to add.
    if (same(label, name)) continue;
    out.push({ element: r.element, name, label });
  }
  return out;
}

function labelOfElement(el: Element, fp: Fingerprint): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text || el.getAttribute("aria-label") || labelOf(fp);
}

function renderNames(doc: Document): void {
  if (paused || !named.length) {
    hideNames();
    watcher?.disconnect();
    watcher = null;
    return;
  }
  const draw = () => showNames(doc, nameTags(doc));
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => renderNames(doc), { once: true });
    return;
  }
  draw();
  if (watcher) return;
  // Single-page apps re-render: find the buttons again.
  watcher = new MutationObserver((records) => {
    const outside = records.some(
      (rec) => !(rec.target instanceof Element && rec.target.closest(`[${ANCHOR_HOST_ATTR}]`)),
    );
    if (!outside) return;
    if (rename) clearTimeout(rename);
    rename = setTimeout(() => {
      rename = undefined;
      if (!paused) draw();
    }, 300);
  });
  watcher.observe(doc.documentElement, { childList: true, subtree: true });
}

function render(doc: Document): void {
  renderNames(doc);
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
  named = store ? buttonsFor(store, site).filter((b) => b.personalName) : [];
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
  if (rename) clearTimeout(rename);
  watcher?.disconnect();
  watcher = null;
  hideNames();
  removeAdapt();
}
