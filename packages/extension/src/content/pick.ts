import { capture, collectCandidates, type Fingerprint } from "@anchor/matcher";
import { card, fromOverlay, getOverlay, placeOver, removeOverlay } from "./overlay.ts";

/**
 * Pick mode: the helper points at a button to remember it.
 *
 * The site must never react to the pick (Hard Rule 1): the whole pointer sequence is swallowed in
 * the capture phase at the window, before page handlers on the document or the element run.
 * Keyboard picking (Hard Rule 9): Tab to a control, Enter or Space picks it, Esc stops.
 */

const SWALLOW = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "touchstart",
  "touchend",
] as const;

export interface PickCallbacks {
  onPicked(fp: Fingerprint): void;
  onCancelled(): void;
}

let active: { stop: () => void } | null = null;

export function isPicking(): boolean {
  return active !== null;
}

export function stopPicking(): void {
  active?.stop();
}

/** The nearest element the matcher would consider, from the clicked node upward. */
function candidateFor(target: EventTarget | null, candidates: Set<Element>): Element | null {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (candidates.has(node)) return node;
    const parent: Element | null = node.parentElement;
    if (parent) {
      node = parent;
      continue;
    }
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

export function startPicking(doc: Document, cb: PickCallbacks): void {
  stopPicking();
  const win = doc.defaultView;
  if (!win) return;
  const { root } = getOverlay(doc);
  const hover = doc.createElement("div");
  hover.className = "ring pick";
  hover.hidden = true;
  const banner = card(doc, "banner", "Click the button you want to remember.", [
    { label: "Stop", onPress: () => finish(null) },
  ]);
  root.append(hover, banner);

  const candidates = () => new Set(collectCandidates(doc));

  function finish(el: Element | null) {
    stop();
    if (el) {
      cb.onPicked(capture(el, { url: doc.location.href, now: new Date().toISOString() }));
    } else {
      cb.onCancelled();
    }
  }

  function swallow(e: Event) {
    if (fromOverlay(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "click") {
      const el = candidateFor(e.composedPath()[0] ?? e.target, candidates());
      if (el) finish(el);
    }
  }

  function onMove(e: Event) {
    if (fromOverlay(e)) return;
    const el = candidateFor(e.composedPath()[0] ?? e.target, candidates());
    hover.hidden = el === null;
    if (el) placeOver(hover, el);
  }

  function onKey(e: KeyboardEvent) {
    if (fromOverlay(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "keydown") finish(null);
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = candidateFor(doc.activeElement, candidates());
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown") finish(el);
  }

  const opts = { capture: true } as const;
  for (const type of SWALLOW) win.addEventListener(type, swallow, opts);
  win.addEventListener("pointermove", onMove, opts);
  win.addEventListener("keydown", onKey, opts);
  win.addEventListener("keyup", onKey, opts);
  win.addEventListener("keypress", onKey, opts);

  function stop() {
    for (const type of SWALLOW) win?.removeEventListener(type, swallow, opts);
    win?.removeEventListener("pointermove", onMove, opts);
    win?.removeEventListener("keydown", onKey, opts);
    win?.removeEventListener("keyup", onKey, opts);
    win?.removeEventListener("keypress", onKey, opts);
    hover.remove();
    banner.remove();
    active = null;
    // Leave nothing behind if this was the only Anchor UI on the page.
    if (root.querySelectorAll(".ring, .card").length === 0) removeOverlay();
  }

  active = { stop };
}
