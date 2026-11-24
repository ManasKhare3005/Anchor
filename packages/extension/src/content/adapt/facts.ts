/**
 * Hard Rule 2: never changes facts. Prices, amounts, numbers, dates, legal text, security alerts,
 * consent dialogs and session warnings stay exactly as the site shows them and are never hidden.
 *
 * This is the never-hide list. When in doubt, an element is protected: hiding too little is
 * clutter; hiding too much could hide a fact.
 */

/** Any digit: prices, amounts, account numbers, dates, times, phone numbers, percentages. */
const NUMBER = /\d/;

const LEGAL =
  /©|®|\b(terms|conditions|privacy|copyright|legal|disclosures?|disclaimers?|agreements?|polic(y|ies)|licen[cs]ed?|fdic|insured|lender|rights reserved|liability|warrant(y|ies)|apr|fees?)\b/i;

const WARNING =
  /\b(cookies?|consent|session|sign(ed)? (you )?out|log(ged)? out|time ?out|timed out|expir(e|es|ed|ing)|security|fraud|alert|warning|suspicious|verify|password|recall|urgent|important)\b/i;

/** Dialogs, alerts and live regions: shown exactly as the site shows them. */
const ANNOUNCED =
  "dialog, [role='dialog'], [role='alertdialog'], [role='alert'], [role='status'], [role='log'], [role='timer'], [aria-live]:not([aria-live='off']), [aria-modal='true']";

const FIELDS = "input, select, textarea, [contenteditable]:not([contenteditable='false'])";

/** Inside a dialog, alert or live region (or is one). */
export function isAnnounced(el: Element): boolean {
  return el.closest(ANNOUNCED) !== null;
}

/**
 * Why `el` must stay as it is, or null when it holds no fact. `keep` holds elements the person
 * relies on (their shelf buttons and task steps found on this page).
 */
export function protectedReason(
  el: Element,
  keep: ReadonlySet<Element> = new Set(),
): string | null {
  if (isAnnounced(el) || el.querySelector(ANNOUNCED)) return "alert or dialog";
  const text = el.textContent ?? "";
  const label = `${text} ${el.getAttribute("aria-label") ?? ""}`;
  if (NUMBER.test(label)) return "number";
  if (LEGAL.test(label)) return "legal text";
  if (WARNING.test(label)) return "warning";
  if (el.matches(FIELDS) || el.querySelector(FIELDS)) return "form field";
  for (const k of keep) if (el === k || el.contains(k)) return "the person's own button";
  return null;
}
