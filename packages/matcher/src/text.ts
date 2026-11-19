/**
 * Text normalization and privacy scrubbing. Pure string functions.
 *
 * Scrubbing runs on everything the matcher stores (text, names, neighbor text, headings) and on
 * candidates the same way, so it never costs matching accuracy. Nothing leaves the device either
 * way (Hard Rule 6); scrubbing keeps stored fingerprints from holding personal details.
 */

const MONEY =
  /(?:[$€£¥₹]\s?\d[\d,.\s]*\d|[$€£¥₹]\s?\d|\b\d[\d,.]*\s?[€£¥₹]|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|dollars?)\b)/giu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** Four or more digits, allowing spaces or dashes inside (order, card, phone, account numbers). */
const LONG_DIGITS = /\d(?:[\s-]?\d){3,}/g;
/** Greeting followed by a capitalised word: the word is very likely a name. */
const GREETING_NAME =
  /\b(hi|hello|hey|welcome(?: back)?|good (?:morning|afternoon|evening)),?\s+(\p{Lu}[\p{L}'-]*)/giu;

export function scrub(input: string): string {
  return input
    .replace(EMAIL, "<email>")
    .replace(MONEY, "<money>")
    .replace(LONG_DIGITS, "<num>")
    .replace(GREETING_NAME, (_m, greeting: string) => `${greeting} <name>`);
}

/** Collapse whitespace and trim. */
export function clean(input: string | null | undefined): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

/** Cut to at most `max` characters, on a word boundary when possible. */
export function clip(input: string, max: number, fromEnd = false): string {
  if (input.length <= max) return input;
  if (fromEnd) {
    const tail = input.slice(input.length - max);
    const space = tail.indexOf(" ");
    return space > 0 && space < max / 2 ? tail.slice(space + 1) : tail;
  }
  const head = input.slice(0, max);
  const space = head.lastIndexOf(" ");
  return space > max / 2 ? head.slice(0, space) : head;
}

/** Lowercase, strip accents and punctuation (placeholders like <num> survive), collapse spaces. */
export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/<(money|email|num|name)>/g, " $1placeholder ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(" ") : [];
}
