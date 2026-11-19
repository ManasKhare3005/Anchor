import type { CandidateDescriptor } from "@anchor/matcher";

/**
 * Minimal DOM -> descriptor extractor for the Phase 0 harness only. jsdom has no layout, so
 * `position` is omitted (see DECISIONS.md D-005). The real extractor is built in Phase 1.
 */

const INTERACTIVE =
  'a[href], button, input[type="submit"], input[type="button"], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"]';

/** Attributes worth keeping as signals. Anchor's own data-anchor-* are always dropped. */
const KEPT_ATTRS = ["id", "name", "href", "type", "class", "title"];

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "input") return "button";
  return tag;
}

export function attributesOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("data-anchor")) continue;
    if (KEPT_ATTRS.includes(name) || name.startsWith("data-")) out[name] = attr.value;
  }
  return out;
}

export function domPathOf(el: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) {
      parts.push(tag);
      break;
    }
    const same = [...parent.children].filter((c) => c.tagName === cur?.tagName);
    parts.push(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
  }
  return parts.reverse().join(">");
}

/** Visible text of up to `limit` nearby interactive or heading elements, nearest ancestor first. */
export function neighborsOf(el: Element, limit = 4): string[] {
  const out: string[] = [];
  for (let anc = el.parentElement; anc && out.length < limit; anc = anc.parentElement) {
    for (const n of anc.querySelectorAll(`${INTERACTIVE}, h1, h2, h3, label`)) {
      if (n === el || n.contains(el)) continue;
      const t = clean(n.textContent);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function describe(el: Element, ref: string): CandidateDescriptor {
  const ariaLabel = el.getAttribute("aria-label");
  return {
    ref,
    text: clean(el.textContent) || clean(el.getAttribute("value")),
    role: roleOf(el),
    ...(ariaLabel ? { ariaLabel } : {}),
    attributes: attributesOf(el),
    domPath: domPathOf(el),
    neighbors: neighborsOf(el),
  };
}

export interface Extracted {
  candidates: CandidateDescriptor[];
  /** Maps descriptor ref back to its element. */
  elements: Map<string, Element>;
}

export function extractCandidates(doc: Document): Extracted {
  const elements = new Map<string, Element>();
  const candidates = [...doc.querySelectorAll(INTERACTIVE)].map((el, i) => {
    const ref = `c${i}`;
    elements.set(ref, el);
    return describe(el, ref);
  });
  return { candidates, elements };
}
