import { normalize } from "./text.ts";

/**
 * Hand-written concept groups: different words for the same task. Catches renames such as
 * "Track order" → "Your orders" without any language model (Hard Rule 10).
 *
 * Phrases are matched on normalized text (lowercase, no punctuation, no accents). Patterns must
 * stay specific: "track a return" is a returns concept, not an orders concept.
 *
 * FROZEN before real-site labels are seen (plan-M1). Changes need a logged reason in PROGRESS.md.
 */
export const CONCEPTS: Record<string, RegExp> = {
  orders:
    /\b(orders?|order history|order status|track (my |your |an |the )?(order|package|parcel|delivery)s?|tracking|purchases|purchase history|where s my (order|stuff|package))\b/,
  returns: /\b(returns?|return (an |my )?items?|track (a |my )?return|refunds?|exchanges?)\b/,
  "sign-in": /\b(sign ?in|log ?in|log ?on|sign ?on)\b/,
  "sign-out": /\b(sign ?out|log ?out|log ?off)\b/,
  register: /\b(sign ?up|register|create (an |your )?account|join now|enroll|enrol)\b/,
  cart: /\b(cart|basket|bag|trolley)\b/,
  checkout: /\b(check ?out|proceed to (checkout|payment)|place (your )?order)\b/,
  account: /\b(account|profile|my info|personal (info|details))\b/,
  help: /\b(help|support|customer (service|care)|contact( us)?|faqs?|get help|chat with us)\b/,
  search: /\b(search|find)\b/,
  "pay-bill":
    /\b(pay( my| your| a| the)? bills?|make (a )?payments?|pay now|pay online|bill pay|one time payment|pay (my |your )?balance)\b/,
  billing: /\b(bills?|billing|statements?|invoices?|balance)\b/,
  refill:
    /\b(refills?|renew( (my|your))? (prescriptions?|rx|meds|medications?)|reorder (prescriptions?|rx|meds))\b/,
  // "pharmacy" removed 2026-11-20: it names a department or a store ("Find a pharmacy"), not a
  // prescription task, and made "Find a pharmacy" hint at "Refill Rx" (fixture benchmark).
  prescriptions: /\b(prescriptions?|rx|medications?|meds)\b/,
  appointments:
    /\b(appointments?|book (a |an )?(visit|appointment)|schedule|vaccines?|vaccinations?)\b/,
  locations:
    /\b(store locator|find a (store|branch|location|pharmacy)|stores?|locations?|branch(es)?|atms?)\b/,
  transfer: /\b(transfers?|send money|move money|pay someone|zelle)\b/,
  deals: /\b(deals|offers|sales?|coupons?|weekly ad|discounts?)\b/,
  outage: /\b(outages?|power (cut|out)|report (an |a )?(outage|problem))\b/,
  usage: /\b(usage|energy use|meter readings?|my use)\b/,
  benefits: /\b(benefits?|claims?|apply|application status|my (ssa|medicare))\b/,
  home: /^(home|home page|homepage)$/,
};

export function conceptsOf(text: string): Set<string> {
  const n = normalize(text);
  const out = new Set<string>();
  if (!n) return out;
  for (const [concept, pattern] of Object.entries(CONCEPTS)) {
    if (pattern.test(n)) out.add(concept);
  }
  return out;
}
