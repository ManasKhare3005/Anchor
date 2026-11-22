import { classifySite, match, type Fingerprint, type MatchResult } from "@anchor/matcher";
import type { FindReply } from "../messages.ts";
import { card, getOverlay, removeOverlay } from "./overlay.ts";

/**
 * Pointing (CLAUDE.md § What happens when the person clicks a shelf button): scroll the real
 * element into view and draw a ring around it. Never clicks, focuses or changes the element
 * (Hard Rule 1). Below "fairly sure" nothing is drawn (Hard Rule 5).
 */

const NOTE = {
  sure: "Here it is.",
  fairly: "I think it's this one now.",
  inMenu: "It's inside this menu. Open it, and I'll show you.",
} as const;

let active: { stop: () => void } | null = null;

export function stopPointing(): void {
  active?.stop();
}

function shown(el: Element): boolean {
  if (!el.isConnected || el.getClientRects().length === 0) return false;
  const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return check ? check.call(el, { visibilityProperty: true }) : true;
}

/** What to circle when the element itself is hidden: the closed menu that holds it. */
function visibleStandIn(el: Element): Element | null {
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

function resultFor(doc: Document, fp: Fingerprint, siteButtons: Fingerprint[]) {
  const all = siteButtons.some((b) => b.id === fp.id) ? siteButtons : [...siteButtons, fp];
  const obs = classifySite(doc, all, `${Date.now()}`);
  const mine = obs.features.find((f) => f.fingerprintId === fp.id);
  return { result: mine?.result ?? match(doc, fp), state: obs.state };
}

function reply(result: MatchResult, state: FindReply["state"], inMenu: boolean): FindReply {
  return {
    tier: result.tier,
    inMenu,
    state,
    score: result.score,
    gap: result.runnerUpGap,
    reasons: result.reasons,
  };
}

export function point(doc: Document, fp: Fingerprint, siteButtons: Fingerprint[]): FindReply {
  stopPointing();
  const { result, state } = resultFor(doc, fp, siteButtons);
  let target = result.element;
  if (!target || result.tier === "unsure") {
    removeOverlay();
    return reply(result, state, false);
  }

  const tier = result.tier;
  const win = doc.defaultView;
  const { root } = getOverlay(doc);
  const ring = doc.createElement("div");
  ring.className = tier === "sure" ? "ring" : "ring check";
  const message = doc.createElement("p");
  const note = card(doc, "note", "", [{ label: "Show original", onPress: () => clear() }]);
  note.replaceChild(message, note.firstElementChild as Element);
  root.append(ring, note);

  let inMenu = !shown(target);
  const standIn = inMenu ? visibleStandIn(target) : target;
  (standIn ?? target).scrollIntoView({ block: "center", inline: "nearest" });

  let frame = 0;
  let rematch: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (target?.isConnected || rematch) return;
    // The page re-rendered (single-page apps): find the feature again.
    rematch = setTimeout(() => {
      rematch = undefined;
      const again = match(doc, fp);
      if (again.element && again.tier !== "unsure") target = again.element;
      else clear();
    }, 200);
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  function place() {
    if (!target) return;
    inMenu = !shown(target);
    const box = inMenu ? visibleStandIn(target) : target;
    ring.hidden = box === null;
    const text = inMenu ? NOTE.inMenu : NOTE[tier];
    // Only on change: the note is a live region, and rewriting it would re-announce it.
    if (message.textContent !== text) message.textContent = text;
    if (box) {
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
      const below = r.bottom + pad + 12;
      const top =
        below + noteBox.height <= vh ? below : Math.max(8, r.top - pad - 12 - noteBox.height);
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - noteBox.width - 8));
      Object.assign(note.style, { left: `${left}px`, top: `${top}px` });
    }
    frame = win?.requestAnimationFrame(place) ?? 0;
  }
  place();

  function stop() {
    if (frame) win?.cancelAnimationFrame(frame);
    if (rematch) clearTimeout(rematch);
    observer.disconnect();
    ring.remove();
    note.remove();
    active = null;
  }

  function clear() {
    stop();
    removeOverlay();
  }

  active = { stop };
  return reply(result, state, inMenu);
}
