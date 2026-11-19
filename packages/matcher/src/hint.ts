import { conceptsOf } from "./lexicon.ts";
import type { PageIndex } from "./match.ts";
import { tokens } from "./text.ts";
import type { Fingerprint, Signals } from "./types.ts";

/**
 * "Elsewhere" search (CLAUDE.md § Matching approach): when a feature is not on the current page,
 * look for a navigation, menu or footer link that probably leads to it. A hit is only ever a
 * hint: it is returned as `menuHint`, never as the matched element, and always "unsure".
 */

const NAV_KINDS = new Set([
  "nav",
  "navigation",
  "header",
  "banner",
  "footer",
  "contentinfo",
  "menu",
  "menubar",
]);
const STOP = new Set(["a", "an", "the", "my", "your", "of", "and", "or", "to", "for", "in", "on"]);

export const HINT_MIN_SCORE = 0.4;

function isNavLink(s: Signals): boolean {
  if (s.role !== "link" && s.role !== "menuitem") return false;
  return s.ancestorTrail.some((t) => NAV_KINDS.has(t.split(":")[0] ?? ""));
}

function words(s: Signals): Set<string> {
  return new Set(
    tokens(`${s.text} ${s.accessibleName}`).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function hrefWords(s: Signals): Set<string> {
  return new Set(
    (s.attributes.href ?? "")
      .split(/[/\-_.]+/)
      .filter((w) => w.length > 2 && w !== "*" && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / Math.min(a.size, b.size);
}

export function hintScore(remembered: Signals, link: Signals): number {
  const ca = new Set([...conceptsOf(remembered.text), ...conceptsOf(remembered.accessibleName)]);
  const cb = new Set([...conceptsOf(link.text), ...conceptsOf(link.accessibleName)]);
  const concept = [...ca].some((c) => cb.has(c)) ? 1 : 0;
  const text = overlap(words(remembered), words(link));
  const href = overlap(hrefWords(remembered), new Set([...hrefWords(link), ...words(link)]));
  return Math.max(concept * 0.8, text * 0.7, href * 0.6);
}

/** Best nav/menu/footer link that likely leads to the feature, or null. */
export function findMenuHint(page: PageIndex, fp: Fingerprint): Element | null {
  let best: { el: Element; score: number } | null = null;
  for (const c of page.candidates) {
    if (!isNavLink(c.signals)) continue;
    const score = Math.max(...[fp.signals, ...fp.variants].map((r) => hintScore(r, c.signals)));
    if (score >= HINT_MIN_SCORE && (!best || score > best.score)) best = { el: c.element, score };
  }
  return best?.el ?? null;
}
