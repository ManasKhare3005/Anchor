import { card, getOverlay } from "./overlay.ts";

/**
 * The highlight ring and its note, shared by shelf pointing and route guiding. Draws only: never
 * clicks, focuses or changes the element (Hard Rule 1).
 *
 * - Follows the element every animation frame (scrolling, layout changes).
 * - A hidden element (closed menu) gets the ring on the menu that holds it.
 * - When the page re-renders and the element is gone, asks `rematch` for it again.
 */

export function shown(el: Element): boolean {
  if (!el.isConnected || el.getClientRects().length === 0) return false;
  const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return check ? check.call(el, { visibilityProperty: true }) : true;
}

/** What to circle when the element itself is hidden: the closed menu that holds it. */
export function visibleStandIn(el: Element): Element | null {
  const details = el.closest("details:not([open])");
  const summary = details?.querySelector(":scope > summary");
  if (summary && shown(summary)) return summary;
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (shown(cur) && cur !== el.ownerDocument.body && cur !== el.ownerDocument.documentElement) {
      return cur;
    }
  }
  return null;
}

export interface RingOptions {
  tier: "sure" | "fairly";
  /** The note's words, given whether the element is hidden in a menu. */
  noteFor(inMenu: boolean): string;
  onShowOriginal(): void;
  /** Find the element again after a re-render; null when it can't be found confidently. */
  rematch(): Element | null;
  /** The element is gone and couldn't be found again. The ring has already stopped. */
  onLost(): void;
  /** While true, the ring and note step aside (a detour is open). */
  pause?(): boolean;
}

export interface RingHandle {
  stop(): void;
  target(): Element;
  inMenu(): boolean;
}

export function drawRing(doc: Document, first: Element, o: RingOptions): RingHandle {
  const win = doc.defaultView;
  const { root } = getOverlay(doc);
  const ring = doc.createElement("div");
  ring.className = o.tier === "sure" ? "ring" : "ring check";
  const message = doc.createElement("p");
  const note = card(doc, "note", "", [
    { label: "Show original", onPress: () => o.onShowOriginal() },
  ]);
  note.replaceChild(message, note.firstElementChild as Element);
  root.append(ring, note);

  let target = first;
  let inMenu = !shown(target);
  const standIn = inMenu ? visibleStandIn(target) : target;
  (standIn ?? target).scrollIntoView({ block: "center", inline: "nearest" });

  let frame = 0;
  let stopped = false;
  let rematch: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (target.isConnected || rematch) return;
    // The page re-rendered (single-page apps): find the element again.
    rematch = setTimeout(() => {
      rematch = undefined;
      const again = o.rematch();
      if (again) {
        target = again;
        return;
      }
      stop();
      o.onLost();
    }, 200);
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  function place() {
    if (stopped) return;
    inMenu = !shown(target);
    const box = inMenu ? visibleStandIn(target) : target;
    const paused = o.pause?.() ?? false;
    ring.hidden = box === null || paused;
    note.hidden = paused;
    const text = o.noteFor(inMenu);
    // Only on change: the note is a live region, and rewriting it would re-announce it.
    if (message.textContent !== text) message.textContent = text;
    if (box && !paused) {
      const r = box.getBoundingClientRect();
      const pad = 6;
      Object.assign(ring.style, {
        left: `${r.left - pad}px`,
        top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
      const vw = doc.documentElement.clientWidth;
      const vh = doc.documentElement.clientHeight;
      const noteBox = note.getBoundingClientRect();
      const gap = pad + 12;
      let left: number;
      let top: number;
      if (r.right + gap + noteBox.width <= vw - 8) {
        // Beside the element: the next control in a form is usually below it, not to the side.
        left = r.right + gap;
        top = Math.min(Math.max(8, r.top - pad), Math.max(8, vh - noteBox.height - 8));
      } else {
        const below = r.bottom + gap;
        top = below + noteBox.height <= vh ? below : Math.max(8, r.top - gap - noteBox.height);
        left = Math.min(Math.max(8, r.left), Math.max(8, vw - noteBox.width - 8));
      }
      Object.assign(note.style, { left: `${left}px`, top: `${top}px` });
    }
    frame = win?.requestAnimationFrame(place) ?? 0;
  }
  place();

  function stop() {
    stopped = true;
    if (frame) win?.cancelAnimationFrame(frame);
    if (rematch) clearTimeout(rematch);
    observer.disconnect();
    ring.remove();
    note.remove();
  }

  return { stop, target: () => target, inMenu: () => inMenu };
}
