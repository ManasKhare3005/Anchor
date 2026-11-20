import { JSDOM } from "jsdom";

/**
 * Proposes ground-truth labels for real archived pages: where each common shopping feature is on
 * the "before" page and on the "after" page.
 *
 * Deliberately independent of the matcher (its own keyword and link rules, no lexicon, no
 * scoring), so the labels can't simply agree with the matcher by construction. Every proposal is
 * reviewed and confirmed by Manas before it counts.
 */

export interface FeatureRule {
  id: string;
  label: string;
  /** Matched against visible text, aria-label and title. */
  text: RegExp;
  /** Matched against the link path. */
  href?: RegExp;
  /** Text that disqualifies a candidate (e.g. "Sign in" for the cart rule). */
  not?: RegExp;
  /** Special locator for search submit buttons. */
  searchSubmit?: boolean;
}

export const SHOPPING_FEATURES: FeatureRule[] = [
  {
    id: "sign-in",
    label: "Sign in",
    text: /\b(sign[ -]?in|log[ -]?in|account (&|and) lists)\b/i,
    href: /(signin|sign-in|login|log-in|\/account\/?$|myaccount|\/ap\/)/i,
    // "register"/"create" only disqualify when the text doesn't also say sign in
    // ("Sign in or create account" is the sign-in link).
    not: /\b(sign[ -]?out|delete|pay your bill)\b|^(?!.*\bsign[ -]?in\b).*\b(register|create)\b/i,
  },
  {
    id: "cart",
    label: "Cart",
    text: /^\s*(\d+\s*)?(items? in )?(shopping )?(cart|basket|bag)\b|\bcart\b/i,
    href: /(cart|basket|\/bag\b)/i,
    not: /add to (cart|bag|basket)/i,
  },
  {
    id: "orders",
    label: "Orders / track order",
    text: /\b(orders|order status|track (an |my )?order|purchase history|returns (&|and) orders)\b/i,
    href: /(order-history|orderhistory|\/orders?(\/|$)|purchase-history|order-status|orderlookup|track-order|order-tracking)/i,
  },
  {
    id: "help",
    label: "Help / customer service",
    text: /\b(help|customer service|support|contact us)\b/i,
    not: /(help you find|maker|communit|support (&|and) services)/i,
    href: /(\/help|customer-service|customerservice|\/support|contact)/i,
  },
  {
    id: "deals",
    label: "Deals",
    text: /\b(today'?s deals|deals|weekly ad|daily deals)\b/i,
    href: /(\/deals?\b|weeklyad|weekly-ad|top-deals|coupons-deals)/i,
  },
  {
    id: "search",
    label: "Search button",
    text: /\b(search|go|submit)\b/i,
    not: /\b(clear|reset|close|cancel)\b/i,
    searchSubmit: true,
  },
];

const byId = (id: string): FeatureRule => {
  const r = SHOPPING_FEATURES.find((x) => x.id === id);
  if (!r) throw new Error(`no shopping rule ${id}`);
  return r;
};

/** Common to every category: sign in, help, search. */
const COMMON = [byId("sign-in"), byId("help"), byId("search")];

export const PHARMACY_FEATURES: FeatureRule[] = [
  ...COMMON,
  {
    id: "refill",
    label: "Refill prescriptions",
    text: /\b(refill|renew|reorder)\b.*\b(prescriptions?|rx|meds|medications?)\b|\brefill( rx)?\b/i,
    href: /(refill|\/rx\/|prescription)/i,
    not: /\b(reminders?|alerts?|transfer)\b/i,
  },
  {
    id: "find-pharmacy",
    label: "Find a pharmacy / store",
    text: /\b(find a (store|pharmacy|location)|store locator|locations?|stores near)\b/i,
    href: /(store-?locator|\/stores?\b|\/locations?\b|find-a-store)/i,
  },
  {
    id: "vaccines",
    label: "Vaccines / appointments",
    text: /\b(vaccines?|vaccinations?|immuni[sz]ations?|flu shots?|appointments?)\b/i,
    href: /(vaccin|immuni|appointment|flu-shot)/i,
  },
];

export const GOVERNMENT_FEATURES: FeatureRule[] = [
  {
    ...byId("sign-in"),
    text: /\b(sign[ -]?in|log[ -]?in|my (social security|account|medicare)|create (an )?account)\b/i,
    not: /\b(sign[ -]?out)\b/i,
  },
  byId("help"),
  byId("search"),
  {
    id: "apply",
    label: "Apply for benefits",
    text: /\b(apply( for| online)?|applications?|benefits?)\b/i,
    href: /(apply|benefits|application)/i,
    not: /\b(status|calculator|estimat)\b/i,
  },
  {
    id: "find-office",
    label: "Find an office / location",
    text: /\b(find (an |a |your )?(office|location|post office)|office locator|locations?)\b/i,
    href: /(office|locator|locations?)/i,
  },
];

export const BANK_FEATURES: FeatureRule[] = [
  ...COMMON,
  {
    id: "open-account",
    label: "Open an account",
    text: /\b(open (an |a new )?(account|checking|savings)|get started)\b/i,
    href: /(open-?account|\/checking|\/open\b|apply)/i,
  },
  {
    id: "atm-branch",
    label: "Find an ATM / branch",
    text: /\b(atms?|branch(es)?|locations?|find (us|a branch|an atm))\b/i,
    href: /(locator|\/atm|branch|locations?)/i,
  },
];

export function featuresFor(category: string): FeatureRule[] {
  switch (category) {
    case "pharmacy":
      return PHARMACY_FEATURES;
    case "government":
      return GOVERNMENT_FEATURES;
    case "bank":
      return BANK_FEATURES;
    default:
      return SHOPPING_FEATURES;
  }
}

const INTERACTIVE =
  "a[href], button, input[type='submit' i], input[type='image' i], [role='button']";

function clean(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function labelOf(el: Element): string {
  return clean(
    [
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("value"),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hrefOf(el: Element, base: string): string {
  const raw = el.getAttribute("href");
  if (!raw) return "";
  try {
    // Path only: tracking parameters (e.g. "ref=DealsRow") must not satisfy a link rule.
    return new URL(raw, base).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return raw;
  }
}

/** A selector that resolves to exactly this element in this document. */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const id = el.getAttribute("id");
  if (id && /^[A-Za-z][\w-]*$/.test(id) && doc.querySelectorAll(`#${id}`).length === 1) {
    return `#${id}`;
  }
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur.tagName !== "HTML"; cur = cur.parentElement) {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    const curId = cur.getAttribute("id");
    if (
      cur !== el &&
      curId &&
      /^[A-Za-z][\w-]*$/.test(curId) &&
      doc.querySelectorAll(`#${curId}`).length === 1
    ) {
      parts.unshift(`#${curId}`);
      break;
    }
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const same = [...parent.children].filter((c) => c.tagName === cur?.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
  }
  return parts.join(" > ");
}

function regionRank(el: Element): number {
  // Prefer header/nav (where these features usually live), then anything else, footer last.
  if (el.closest("header, [role='banner'], nav, [role='navigation']")) return 0;
  if (el.closest("footer, [role='contentinfo']")) return 2;
  return 1;
}

export interface Proposal {
  selector: string;
  /** Other elements that lead to the same place (any of them is a correct answer). */
  alternates: string[];
  text: string;
  href: string;
  region: "header/nav" | "body" | "footer";
}

/**
 * @param prefer For the "after" page: the before-page proposal. An after-page element with exactly
 *   the same text or link target is evidently the same feature and is preferred. Plain equality,
 *   not the matcher's similarity scoring.
 */
export function propose(
  doc: Document,
  rule: FeatureRule,
  base: string,
  prefer?: Proposal | null,
): Proposal | null {
  const all = [...doc.querySelectorAll(INTERACTIVE)];
  let matches: Element[];
  if (rule.searchSubmit) {
    matches = all.filter((el) => {
      const form = el.closest("form");
      if (!form) return false;
      const isSubmit =
        el.tagName === "BUTTON"
          ? (el.getAttribute("type") ?? "submit") === "submit"
          : el.tagName === "INPUT";
      const searchy =
        form.matches("[role='search'], [action*='search' i], [action*='/s' i]") ||
        form.querySelector(
          "input[type='search' i], input[name='q' i], input[name='k' i], input[name*='search' i], input[name='st' i], input[name='_nkw' i]",
        ) !== null;
      return isSubmit && searchy && !rule.not?.test(labelOf(el));
    });
    matches.sort((a, b) => regionRank(a) - regionRank(b));
  } else {
    matches = all.filter((el) => {
      const text = labelOf(el);
      if (rule.not?.test(text)) return false;
      if (text.length > 80) return false;
      return rule.text.test(text) || (rule.href ? rule.href.test(hrefOf(el, base)) : false);
    });
    // One sort, in priority order: text matches before link-only matches, then header/nav
    // before body before footer, then document order (stable sort).
    matches.sort(
      (a, b) =>
        Number(!rule.text.test(labelOf(a))) - Number(!rule.text.test(labelOf(b))) ||
        regionRank(a) - regionRank(b),
    );
  }
  if (prefer) {
    const same = (el: Element) =>
      clean(labelOf(el)).toLowerCase() === prefer.text.toLowerCase() ||
      (prefer.href !== "" && hrefOf(el, base) === prefer.href);
    matches.sort((a, b) => Number(!same(a)) - Number(!same(b)));
  }
  const best = matches[0];
  if (!best) return null;
  // Other matches that are evidently the same feature: same link target, or the same visible
  // text in the same region (sites often repeat a link, e.g. a menu button and its link).
  const bestHref = hrefOf(best, base);
  const bestText = clean(best.textContent).toLowerCase();
  const alternates = matches
    .slice(1)
    .filter(
      (m) =>
        (bestHref !== "" && hrefOf(m, base) === bestHref) ||
        (bestText !== "" &&
          clean(m.textContent).toLowerCase() === bestText &&
          regionRank(m) === regionRank(best)),
    )
    .map(uniqueSelector);
  const rank = regionRank(best);
  return {
    selector: uniqueSelector(best),
    alternates,
    text: labelOf(best).slice(0, 80),
    href: hrefOf(best, base).slice(0, 100),
    region: rank === 0 ? "header/nav" : rank === 2 ? "footer" : "body",
  };
}

export function parseArchived(html: string, url: string): Document {
  return new JSDOM(html, { url }).window.document;
}
