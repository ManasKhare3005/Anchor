import { createHost, type Overlay } from "../overlay.ts";

/**
 * The person's own names beside the site's buttons (Hard Rule 3: adds, never replaces). Drawn in
 * Anchor's own Shadow DOM host just above (or below) the button; the page DOM is untouched and
 * clicks pass straight through.
 */

const CSS = `
:host { all: initial; }
.name {
  position: fixed;
  max-width: 280px;
  padding: 2px 10px;
  border: 2px solid #ffffff;
  border-radius: 8px;
  background: #0b57d0;
  color: #ffffff;
  font: 600 18px/1.3 system-ui, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
@media (forced-colors: active) {
  .name { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
`;

export interface NameTag {
  element: Element;
  /** The person's name for it. */
  name: string;
  /** The site's own label, for the screen-reader description. */
  label: string;
}

let overlay: Overlay | null = null;
let frame = 0;
let tags: { tag: NameTag; box: HTMLElement }[] = [];

function place(): void {
  const doc = overlay?.host.ownerDocument;
  if (!doc) return;
  const vh = doc.documentElement.clientHeight;
  for (const { tag, box } of tags) {
    const r = tag.element.getBoundingClientRect();
    const hidden = !tag.element.isConnected || r.width === 0 || r.bottom < 0 || r.top > vh;
    box.hidden = hidden;
    if (hidden) continue;
    const h = box.offsetHeight;
    const top = r.top - h - 4 >= 0 ? r.top - h - 4 : r.bottom + 4;
    box.style.left = `${Math.max(4, r.left)}px`;
    box.style.top = `${top}px`;
  }
  frame = doc.defaultView?.requestAnimationFrame(place) ?? 0;
}

/** Show these names, replacing any shown before. */
export function showNames(doc: Document, list: NameTag[]): void {
  const same =
    list.length === tags.length &&
    list.every((t, i) => tags[i]?.tag.element === t.element && tags[i]?.tag.name === t.name);
  if (same && overlay?.host.isConnected) return;
  hideNames();
  if (!list.length) return;
  overlay = createHost(doc, "names", CSS);
  tags = list.map((tag) => {
    const box = doc.createElement("div");
    box.className = "name";
    box.setAttribute("role", "note");
    box.setAttribute("aria-label", `Your name for "${tag.label}": ${tag.name}`);
    box.textContent = tag.name;
    overlay?.root.append(box);
    return { tag, box };
  });
  place();
}

export function hideNames(): void {
  if (frame) overlay?.host.ownerDocument.defaultView?.cancelAnimationFrame(frame);
  frame = 0;
  overlay?.host.remove();
  overlay = null;
  tags = [];
}
