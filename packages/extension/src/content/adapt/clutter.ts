import { ANCHOR_HOST_ATTR } from "@anchor/matcher";
import { protectedReason } from "./facts.ts";

/**
 * Clutter for the "calmer pages" option: blocks a site itself names as ads, sponsors, promos or
 * newsletter sign-ups, and third-party frames of standard ad sizes. Only hidden when they hold no
 * fact (Hard Rule 2, `protectedReason`). Cautious by design: an unnamed block is never clutter.
 */

const TOKENS = new Set([
  "ad",
  "ads",
  "advert",
  "adverts",
  "advertisement",
  "advertising",
  "adslot",
  "adunit",
  "sponsor",
  "sponsored",
  "promo",
  "promos",
  "promotion",
  "promotional",
  "newsletter",
]);

/** Standard ad sizes (IAB), width × height in CSS pixels. */
const AD_SIZES = [
  [300, 250],
  [336, 280],
  [728, 90],
  [970, 90],
  [970, 250],
  [160, 600],
  [300, 600],
  [320, 50],
  [468, 60],
];

/** Never clutter, whatever they are called: page structure the person finds their way by. */
const STRUCTURE =
  "html, body, main, nav, header, footer, form, dialog, h1, h2, [role='main'], [role='navigation'], [role='banner'], [role='search'], [role='dialog'], [role='alertdialog']";

/** Words in an id or class: split on punctuation and camelCase, lower-cased. */
export function nameTokens(el: Element): string[] {
  const raw = `${el.id} ${el.getAttribute("class") ?? ""}`;
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

function namedClutter(el: Element): boolean {
  if (nameTokens(el).some((t) => TOKENS.has(t))) return true;
  return /^(advertisement|sponsored)\b/i.test(el.getAttribute("aria-label") ?? "");
}

function adFrame(el: Element): boolean {
  if (el.tagName !== "IFRAME") return false;
  const src = el.getAttribute("src") ?? "";
  let thirdParty = false;
  try {
    thirdParty = new URL(src, el.ownerDocument.baseURI).origin !== el.ownerDocument.location.origin;
  } catch {
    return false;
  }
  if (!thirdParty) return false;
  const r = el.getBoundingClientRect();
  const w = Number(el.getAttribute("width")) || Math.round(r.width);
  const h = Number(el.getAttribute("height")) || Math.round(r.height);
  return AD_SIZES.some(([aw, ah]) => w === aw && h === ah);
}

export interface ClutterOptions {
  /** Elements the person relies on: never hidden, nor anything holding them. */
  keep?: ReadonlySet<Element>;
  /** A block covering more than this share of the page is never clutter (probably content). */
  maxShare?: number;
}

/** The outermost clutter blocks under `root`, safe to hide. */
export function findClutter(root: Document | Element, o: ClutterOptions = {}): Element[] {
  const doc = "documentElement" in root ? root : root.ownerDocument;
  const keep = o.keep ?? new Set<Element>();
  const maxShare = o.maxShare ?? 0.5;
  const page = doc.documentElement.scrollWidth * doc.documentElement.scrollHeight;
  const found: Element[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.closest(`[${ANCHOR_HOST_ATTR}]`)) continue;
    if (found.some((f) => f.contains(el))) continue;
    if (!namedClutter(el) && !adFrame(el)) continue;
    if (el.matches(STRUCTURE) || el.querySelector("main, [role='main'], h1")) continue;
    if (protectedReason(el, keep)) continue;
    const r = el.getBoundingClientRect();
    if (page > 0 && (r.width * r.height) / page > maxShare) continue;
    found.push(el);
  }
  return found;
}
