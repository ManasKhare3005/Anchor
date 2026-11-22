import { ANCHOR_HOST_ATTR } from "@anchor/matcher";

/**
 * Everything Anchor draws on a page lives in one Shadow DOM host marked `data-anchor`
 * (Hard Rule 4). The host is fixed, covers the viewport and lets clicks through; only Anchor's own
 * controls inside it take pointer events. Removing the host removes every Anchor change.
 */

const HOST_STYLE = [
  "all: initial",
  "display: block",
  "position: fixed",
  "inset: 0",
  "z-index: 2147483647",
  "pointer-events: none",
].join("; ");

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.ring {
  position: fixed;
  border: 4px solid #0b57d0;
  border-radius: 8px;
  box-shadow: 0 0 0 4px #ffffff, 0 0 0 7px #0b57d0;
  pointer-events: none;
}
.ring.check { border-style: dashed; }
.ring.pick { border: 3px dashed #b3261e; box-shadow: 0 0 0 3px #ffffff; }
.card {
  position: fixed;
  max-width: min(360px, calc(100vw - 24px));
  padding: 12px 16px;
  border: 3px solid #111111;
  border-radius: 10px;
  background: #ffffff;
  color: #111111;
  font: 20px/1.4 system-ui, sans-serif;
  pointer-events: auto;
}
/* The pick banner lets clicks through everywhere except its own button, and moves away from
   whatever the helper is pointing at. */
.banner { bottom: 12px; right: 12px; pointer-events: none; }
.banner.top { bottom: auto; top: 12px; }
.banner button { pointer-events: auto; }
/* The pointing note never blocks the page: only its own button takes clicks. */
.note { pointer-events: none; }
.note button { pointer-events: auto; }
.card p { margin: 0 0 8px; }
.card button {
  min-height: 44px;
  min-width: 44px;
  padding: 6px 14px;
  border: 2px solid #111111;
  border-radius: 8px;
  background: #f1f1f1;
  color: #111111;
  font: inherit;
  cursor: pointer;
}
.card button:focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }
@media (forced-colors: active) {
  .ring, .ring.pick { border-color: Highlight; box-shadow: none; }
  .card { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
`;

export interface Overlay {
  host: HTMLElement;
  root: ShadowRoot;
}

let current: Overlay | null = null;

export function getOverlay(doc: Document): Overlay {
  if (current && current.host.isConnected) return current;
  const host = doc.createElement("div");
  host.setAttribute(ANCHOR_HOST_ATTR, "");
  host.setAttribute("style", HOST_STYLE);
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CSS;
  root.append(style);
  doc.documentElement.append(host);
  current = { host, root };
  return current;
}

export function hasOverlay(): boolean {
  return current !== null && current.host.isConnected;
}

export function removeOverlay(): void {
  current?.host.remove();
  current = null;
}

/** True when the event happened on Anchor's own UI. */
export function fromOverlay(e: Event): boolean {
  const host = current?.host;
  return host !== undefined && e.composedPath().includes(host);
}

/** A card (banner or note) with a message and buttons. Text is set with textContent only. */
export function card(
  doc: Document,
  className: string,
  message: string,
  buttons: { label: string; onPress: () => void }[],
): HTMLElement {
  const el = doc.createElement("div");
  el.className = `card ${className}`;
  el.setAttribute("role", "status");
  const p = doc.createElement("p");
  p.textContent = message;
  el.append(p);
  for (const b of buttons) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    btn.addEventListener("click", b.onPress);
    el.append(btn);
  }
  return el;
}

/** Place a fixed box over an element's current box. */
export function placeOver(box: HTMLElement, target: Element, pad = 6): void {
  const r = target.getBoundingClientRect();
  box.style.left = `${r.left - pad}px`;
  box.style.top = `${r.top - pad}px`;
  box.style.width = `${r.width + pad * 2}px`;
  box.style.height = `${r.height + pad * 2}px`;
}
