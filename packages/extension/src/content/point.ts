import { classifySite, match, type Fingerprint, type MatchResult } from "@anchor/matcher";
import type { FindReply } from "../messages.ts";
import { adaptPause } from "./adapt/run.ts";
import { removeOverlay } from "./overlay.ts";
import { drawRing, shown, type RingHandle } from "./ring.ts";

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

let active: RingHandle | null = null;

export function stopPointing(): void {
  active?.stop();
  active = null;
}

/** Match one fingerprint, judging the site from all of its remembered fingerprints. */
export function resultFor(doc: Document, fp: Fingerprint, siteButtons: Fingerprint[]) {
  const all = siteButtons.some((b) => b.id === fp.id) ? siteButtons : [...siteButtons, fp];
  const obs = classifySite(doc, all, `${Date.now()}`);
  const mine = obs.features.find((f) => f.fingerprintId === fp.id);
  return { result: mine?.result ?? match(doc, fp), state: obs.state };
}

/** A confident element after a re-render, or null. */
export function rematchOf(doc: Document, fp: Fingerprint): Element | null {
  const again = match(doc, fp);
  return again.element && again.tier !== "unsure" ? again.element : null;
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
  const target = result.element;
  if (!target || result.tier === "unsure") {
    removeOverlay();
    return reply(result, state, false);
  }
  const tier = result.tier;
  const clear = () => {
    stopPointing();
    removeOverlay();
  };
  active = drawRing(doc, target, {
    tier,
    noteFor: (inMenu) => (inMenu ? NOTE.inMenu : NOTE[tier]),
    // Hard Rule 4: every Anchor change goes, Adapt and the person's names too.
    onShowOriginal: () => {
      clear();
      adaptPause();
    },
    rematch: () => rematchOf(doc, fp),
    onLost: clear,
  });
  return reply(result, state, !shown(target));
}
