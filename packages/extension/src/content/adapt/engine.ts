import { ANCHOR_HOST_ATTR } from "@anchor/matcher";
import { isIdle, type AdaptPlan } from "../../adapt.ts";
import { findClutter } from "./clutter.ts";
import { fixColor, over, parseColor, toCss, type Rgba } from "./contrast.ts";
import { cssFor } from "./css.ts";
import { isAnnounced } from "./facts.ts";

/**
 * Applies an Adapt plan to a page and takes it all back (Hard Rule 4).
 *
 * - Stylesheet changes live in one `<style data-anchor="adapt">` element.
 * - Per-element changes (contrast fixes, hidden clutter) are inline `!important` styles. The
 *   registry keeps each element's original `style` attribute, or its absence, and restores it
 *   exactly.
 * - Content the site adds later is adapted too (debounced MutationObserver).
 *
 * Writes styles only: never text, never attributes other than `style`, never events (Hard
 * Rules 1 and 2).
 */

export const ADAPT_STYLE_ATTR = "adapt";

interface State {
  doc: Document;
  plan: AdaptPlan;
  keep: () => ReadonlySet<Element>;
  style: HTMLStyleElement;
  observer: MutationObserver | null;
  timer: ReturnType<typeof setTimeout> | undefined;
}

let state: State | null = null;
/** Element → its `style` attribute before Adapt touched it (null: it had none). */
const touched = new Map<Element, string | null>();

function setStyle(el: Element, prop: string, value: string): void {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
  if (!touched.has(el)) touched.set(el, el.getAttribute("style"));
  el.style.setProperty(prop, value, "important");
}

function restoreAll(): void {
  for (const [el, original] of touched) {
    // Write the attribute first: Chrome syncs CSSOM edits into the attribute lazily, and a bare
    // removeAttribute right after setProperty can leave an empty style="" behind.
    el.setAttribute("style", original ?? "");
    if (original === null) el.removeAttribute("style");
  }
  touched.clear();
}

function ours(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return el !== null && el.closest(`[${ANCHOR_HOST_ATTR}]`) !== null;
}

const WHITE: Rgba = [255, 255, 255, 1];

/**
 * The solid colour behind `el`, or null when it can't be known (an image or gradient is behind
 * the text). See-through layers are combined; the canvas is white.
 */
function backgroundOf(el: Element, cache: Map<Element, Rgba | null>): Rgba | null {
  if (cache.has(el)) return cache.get(el) ?? null;
  const win = el.ownerDocument.defaultView;
  const layers: Rgba[] = [];
  let result: Rgba | null = WHITE;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const cs = win?.getComputedStyle(cur);
    if (!cs) break;
    if (cs.backgroundImage !== "none") {
      result = null;
      break;
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg[3] > 0) {
      layers.push(bg);
      if (bg[3] >= 1) break;
    }
  }
  if (result) {
    result = layers.reduceRight<Rgba>((under, layer) => over(layer, under), WHITE);
  }
  cache.set(el, result);
  return result;
}

function hasOwnText(el: Element): boolean {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()) return true;
  }
  return false;
}

function contrastPass(doc: Document): void {
  const win = doc.defaultView;
  // Forced colours (Windows high contrast) already chose the person's colours (Hard Rule 9).
  if (!win || win.matchMedia("(forced-colors: active)").matches) return;
  const cache = new Map<Element, Rgba | null>();
  for (const el of doc.body?.querySelectorAll("*") ?? []) {
    if (touched.has(el) || !hasOwnText(el) || ours(el) || isAnnounced(el)) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const fg = parseColor(cs.color);
    const bg = backgroundOf(el, cache);
    if (!fg || !bg) continue;
    const fixed = fixColor(fg, bg);
    if (fixed) setStyle(el, "color", toCss(fixed));
  }
}

function declutterPass(doc: Document, keep: ReadonlySet<Element>): void {
  for (const el of findClutter(doc, { keep })) setStyle(el, "display", "none");
}

function passes(s: State): void {
  if (!s.doc.body) return;
  if (s.plan.declutter) declutterPass(s.doc, s.keep());
  if (s.plan.contrast) contrastPass(s.doc);
}

function whenReady(doc: Document, run: () => void): void {
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
  } else run();
}

/**
 * Apply `plan` to `doc`, replacing any plan applied before. `keep` returns the elements the person
 * relies on (never hidden).
 */
export function applyAdapt(doc: Document, plan: AdaptPlan, keep: () => ReadonlySet<Element>): void {
  removeAdapt();
  if (isIdle(plan)) return;
  const style = doc.createElement("style");
  style.setAttribute(ANCHOR_HOST_ATTR, ADAPT_STYLE_ATTR);
  style.textContent = cssFor(plan);
  doc.documentElement.append(style);
  const s: State = { doc, plan, keep, style, observer: null, timer: undefined };
  state = s;
  if (!plan.contrast && !plan.declutter) return;
  whenReady(doc, () => {
    if (state !== s) return;
    passes(s);
    s.observer = new MutationObserver((records) => {
      if (records.every((r) => ours(r.target))) return;
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = undefined;
        if (state === s) passes(s);
      }, 300);
    });
    s.observer.observe(doc.documentElement, { childList: true, subtree: true });
    // Ads and late content arrive after the page has loaded.
    doc.defaultView?.addEventListener("load", () => state === s && passes(s), { once: true });
  });
}

/** Take every Adapt change off the page. */
export function removeAdapt(): void {
  const s = state;
  state = null;
  if (s) {
    s.observer?.disconnect();
    if (s.timer) clearTimeout(s.timer);
    s.style.remove();
  }
  restoreAll();
}

export function adaptOn(): boolean {
  return state !== null;
}
