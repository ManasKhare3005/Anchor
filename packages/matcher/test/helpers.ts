import { JSDOM } from "jsdom";

/** Parse HTML into a jsdom Document at the given URL (scripts never run). */
export function dom(html: string, url = "https://shop.example.com/home"): Document {
  return new JSDOM(html, { url }).window.document;
}

/** Exactly one element for a selector, or throw. */
export function one(doc: Document | Element, selector: string): Element {
  const found = doc.querySelectorAll(selector);
  if (found.length !== 1) throw new Error(`"${selector}" matched ${found.length}`);
  return found[0] as Element;
}
