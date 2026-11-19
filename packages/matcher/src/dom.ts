import { clean, clip, scrub } from "./text.ts";
import type { Signals } from "./types.ts";

/**
 * Everything that reads the DOM. Works on any DOM implementation (browser, jsdom): no globals such
 * as `document`, `Node` or `HTMLElement`; node types are checked by number and tag name.
 *
 * Hard Rule 7: never reads `.value`, the value attribute, or text inside contenteditable regions.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Anchor's own UI host. Never a candidate, never part of neighbor text. */
export const ANCHOR_HOST_ATTR = "data-anchor";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "summary",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[tabindex]:not([tabindex^='-'])",
  "[onclick]",
].join(",");

const SKIP_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);

const LANDMARK_TAGS: Record<string, string> = {
  HEADER: "header",
  NAV: "nav",
  MAIN: "main",
  ASIDE: "aside",
  FOOTER: "footer",
  FORM: "form",
  DIALOG: "dialog",
};

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "complementary",
  "contentinfo",
  "form",
  "search",
  "dialog",
  "alertdialog",
  "menu",
  "menubar",
  "region",
]);

const KEPT_ATTRS = new Set(["id", "name", "type", "role", "for", "title", "alt", "rel"]);
const KEPT_ARIA = new Set(["aria-haspopup", "aria-controls", "aria-current", "aria-expanded"]);

// ---------------------------------------------------------------------------------------------
// Traversal

function isAnchorHost(el: Element): boolean {
  return el.hasAttribute(ANCHOR_HOST_ATTR);
}

/**
 * All candidate elements under `root`, in document order. Descends into open shadow roots and
 * same-origin iframes. Skips Anchor's own UI.
 */
export function collectCandidates(root: Document | Element | ShadowRoot): Element[] {
  const out: Element[] = [];
  const visit = (scope: Document | Element | ShadowRoot) => {
    const all = scope.querySelectorAll("*");
    for (const el of all) {
      if (el.closest(`[${ANCHOR_HOST_ATTR}]`)) continue;
      if (el.matches(INTERACTIVE_SELECTOR)) out.push(el);
      if (el.shadowRoot) visit(el.shadowRoot);
      if (el.tagName === "IFRAME" || el.tagName === "FRAME") {
        const inner = sameOriginDocument(el);
        if (inner) visit(inner);
      }
    }
  };
  if ("nodeType" in root && root.nodeType === ELEMENT_NODE && isAnchorHost(root as Element)) {
    return out;
  }
  visit(root);
  return out;
}

function sameOriginDocument(frame: Element): Document | null {
  try {
    return (frame as HTMLIFrameElement).contentDocument ?? null;
  } catch {
    return null; // cross-origin
  }
}

/** Hidden by attribute, inline style, closed <details>, or zero layout (when layout exists). */
export function isHidden(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = parentElementAcrossShadow(cur)) {
    if (cur.hasAttribute("hidden")) return true;
    if (cur.getAttribute("aria-hidden") === "true") return true;
    const style = (cur.getAttribute("style") ?? "").replace(/\s/g, "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
    if (cur !== el && cur.tagName === "DETAILS" && !cur.hasAttribute("open")) {
      // Inside a closed <details>, only the <summary> is shown.
      const summary = cur.querySelector(":scope > summary");
      if (!summary || !summary.contains(el)) return true;
    }
    const view = cur.ownerDocument.defaultView;
    const computed = view?.getComputedStyle?.(cur);
    if (computed && (computed.display === "none" || computed.visibility === "hidden")) return true;
  }
  return false;
}

function parentElementAcrossShadow(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode() as ShadowRoot | Document;
  return "host" in root ? root.host : null;
}

// ---------------------------------------------------------------------------------------------
// Text

function isContentEditable(el: Element): boolean {
  const v = el.getAttribute("contenteditable");
  return v !== null && v !== "false";
}

/**
 * Visible-ish text of a subtree: text nodes plus image alt text. Skips scripts, styles,
 * aria-hidden parts, Anchor UI and contenteditable regions (which can hold typed text).
 */
export function textOf(node: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === TEXT_NODE) {
      parts.push(n.textContent ?? "");
      return;
    }
    if (n.nodeType !== ELEMENT_NODE) return;
    const el = n as Element;
    if (SKIP_TEXT_TAGS.has(el.tagName.toUpperCase())) return;
    if (el.getAttribute("aria-hidden") === "true") return;
    if (isAnchorHost(el) || isContentEditable(el)) return;
    if (el.tagName === "IMG") {
      parts.push(` ${el.getAttribute("alt") ?? ""} `);
      return;
    }
    // Form fields: their text is typed by the person or is option lists. Never include.
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
    for (const child of el.childNodes) walk(child);
  };
  walk(node);
  return clean(parts.join(" "));
}

function textById(scopeOf: Element, id: string): string {
  const root = scopeOf.getRootNode() as Document | ShadowRoot;
  const target = root.getElementById?.(id) ?? scopeOf.ownerDocument.getElementById(id);
  return target ? textOf(target) : "";
}

/**
 * Approximate accessible name (simplified accname rules): aria-labelledby, aria-label,
 * associated <label>, alt, title, placeholder, then contents. Never the value attribute.
 */
export function accessibleNameOf(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const name = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => textById(el, id))
        .join(" "),
    );
    if (name) return name;
  }
  const aria = clean(el.getAttribute("aria-label"));
  if (aria) return aria;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) {
      const name = clean([...labels].map((l) => textOf(l)).join(" "));
      if (name) return name;
    }
  }
  const alt = clean(el.getAttribute("alt"));
  if (alt) return alt;
  const contents = tag === "INPUT" ? "" : textOf(el);
  if (contents) return contents;
  const title = clean(el.getAttribute("title"));
  if (title) return title;
  const placeholder = clean(el.getAttribute("placeholder"));
  if (placeholder) return placeholder;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "submit") return "Submit";
    if (type === "reset") return "Reset";
  }
  return "";
}

// ---------------------------------------------------------------------------------------------
// Role and attributes

export function roleOf(el: Element): string {
  const explicit = clean(el.getAttribute("role")).split(" ")[0];
  if (explicit) return explicit;
  switch (el.tagName) {
    case "A":
      return el.hasAttribute("href") ? "link" : "generic";
    case "BUTTON":
    case "SUMMARY":
      return "button";
    case "SELECT":
      return el.hasAttribute("multiple") ? "listbox" : "combobox";
    case "TEXTAREA":
      return "textbox";
    case "INPUT": {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (["submit", "button", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox" || type === "radio") return type;
      if (type === "search") return "searchbox";
      if (type === "range") return "slider";
      return "textbox";
    }
    default:
      return el.tagName.toLowerCase();
  }
}

/** Ids and classes made by frameworks or build tools change on every deploy; drop them. */
export function looksGenerated(token: string): boolean {
  if (token.length > 40) return true;
  if (/\d{3,}/.test(token)) return true;
  if (/[a-z][-_]\d+$/i.test(token)) return true; // list/instance indexes: react-select-12, item_4
  if (/[:]/.test(token)) return true;
  if (/(^|[-_])[a-z0-9]{5,8}$/i.test(token) && /\d/.test(token) && /[a-z]/i.test(token)) {
    return true; // css-modules / styled-components hashes, e.g. "Button_x7k2a"
  }
  if (/^[a-f0-9]{8,}$/i.test(token)) return true;
  return false;
}

/** URL path as a pattern: no origin, query or hash; id-like segments become "*". */
export function pathPattern(href: string, base: string): string {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol;
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => (looksGenerated(s) || /^\d+$/.test(s) || /[^\x20-\x7e]/.test(s) ? "*" : s));
  return `/${segments.join("/")}`.toLowerCase();
}

/** Same-site test for href: host of the link vs the page. */
function hostOf(href: string, base: string): string {
  try {
    return new URL(href, base).hostname;
  } catch {
    return "";
  }
}

export function attributesOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const base = el.ownerDocument.baseURI || "http://localhost/";
  for (const name of el.getAttributeNames()) {
    const lower = name.toLowerCase();
    if (lower.startsWith("data-anchor")) continue;
    const raw = el.getAttribute(name) ?? "";
    if (lower === "href") {
      out.href = pathPattern(raw, base);
      const host = hostOf(raw, base);
      if (host && host !== hostOf(base, base)) out["href-host"] = host;
      continue;
    }
    if (lower === "class") {
      const stable = raw
        .split(/\s+/)
        .filter((c) => c && !looksGenerated(c))
        .sort();
      if (stable.length) out.class = stable.join(" ");
      continue;
    }
    if (lower === "id" || lower === "name") {
      if (raw && !looksGenerated(raw)) out[lower] = raw;
      continue;
    }
    if (KEPT_ATTRS.has(lower) || KEPT_ARIA.has(lower)) {
      if (raw.length <= 60) out[lower] = scrub(raw);
      continue;
    }
    if (lower.startsWith("data-") && raw.length <= 40 && !looksGenerated(raw)) {
      out[lower] = scrub(raw);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Context

const NEIGHBOR_MAX = 40;

function nodeText(n: Node): string {
  if (n.nodeType === TEXT_NODE) return clean(n.textContent);
  if (n.nodeType === ELEMENT_NODE) return textOf(n as Element);
  return "";
}

function stopAt(el: Element): boolean {
  return el.tagName === "BODY" || el.tagName === "HTML";
}

/** Nearest non-empty text before and after the element in document order, scrubbed and clipped. */
export function neighborTextOf(el: Element): { before: string; after: string } {
  const find = (dir: "previousSibling" | "nextSibling"): string => {
    let cur: Node | null = el;
    for (let hops = 0; cur && hops < 50; hops++) {
      let sib: Node | null = (cur as ChildNode)[dir];
      while (sib) {
        const t = nodeText(sib);
        if (t) {
          return clip(scrub(t), NEIGHBOR_MAX, dir === "previousSibling");
        }
        sib = (sib as ChildNode)[dir];
      }
      const parent: Element | null = (cur as ChildNode).parentElement;
      if (!parent || stopAt(parent)) break;
      cur = parent;
    }
    return "";
  };
  return { before: find("previousSibling"), after: find("nextSibling") };
}

function isLandmark(el: Element): boolean {
  const role = clean(el.getAttribute("role")).split(" ")[0] ?? "";
  return el.tagName in LANDMARK_TAGS || el.tagName === "SECTION" || LANDMARK_ROLES.has(role);
}

/**
 * Nearest h1–h6 before the element, searching backwards through siblings and ancestors' siblings
 * but never leaving the enclosing landmark or section (a heading in another region is noise).
 */
function headingBefore(el: Element): string {
  let cur: Element | null = el;
  for (let hops = 0; cur && hops < 200; hops++) {
    if (cur !== el && isLandmark(cur)) break;
    if (cur.parentElement && stopAt(cur.parentElement) && cur !== el && !isLandmark(cur)) {
      // Top-level non-landmark block: its earlier siblings are other page regions.
      break;
    }
    let sib: Element | null = cur.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) return textOf(sib);
      const inner = sib.querySelectorAll("h1,h2,h3,h4,h5,h6");
      const last = inner[inner.length - 1];
      if (last) return textOf(last);
      sib = sib.previousElementSibling;
    }
    cur = cur.parentElement;
    if (cur && stopAt(cur)) break;
  }
  return "";
}

/** Landmarks and form context from the outside in, plus the nearest heading before it. */
export function ancestorTrailOf(el: Element): string[] {
  const trail: string[] = [];
  for (let cur = parentElementAcrossShadow(el); cur; cur = parentElementAcrossShadow(cur)) {
    if (stopAt(cur)) break;
    const role = clean(cur.getAttribute("role")).split(" ")[0] ?? "";
    const landmark = LANDMARK_TAGS[cur.tagName] ?? (LANDMARK_ROLES.has(role) ? role : "");
    const isMenu = cur.tagName === "DETAILS";
    if (!landmark && !isMenu) continue;
    const label = clean(cur.getAttribute("aria-label"));
    const summary = isMenu ? textOf(cur.querySelector(":scope > summary") ?? cur) : "";
    const name = clip(scrub(label || summary), 30);
    trail.unshift(name ? `${landmark || "menu"}:${name.toLowerCase()}` : landmark || "menu");
  }
  const heading = clip(scrub(headingBefore(el)), 40);
  if (heading) trail.push(`heading:${heading.toLowerCase()}`);
  return trail;
}

/** Coarse page region and size, only when real layout exists. A weak signal by design. */
export function visualOf(el: Element): Signals["visual"] {
  const rect = el.getBoundingClientRect?.();
  const view = el.ownerDocument.defaultView;
  if (!rect || !view || rect.width === 0 || rect.height === 0) return undefined;
  const w = view.innerWidth || 1;
  const docTop = rect.top + (view.scrollY || 0);
  const cx = (rect.left + rect.width / 2) / w;
  const horizontal = cx < 0.33 ? "left" : cx > 0.66 ? "right" : "center";
  const vertical = docTop < 150 ? "top" : "body";
  const area = rect.width * rect.height;
  const sizeBucket = area < 1500 ? "small" : area < 8000 ? "medium" : "large";
  return { region: `${vertical}-${horizontal}`, sizeBucket };
}

/** All signals for one element. Used for both capture and candidates. */
export function signalsOf(el: Element): Signals {
  const visual = visualOf(el);
  return {
    text: scrub(textOf(el)),
    accessibleName: scrub(accessibleNameOf(el)),
    role: roleOf(el),
    tag: el.tagName.toLowerCase(),
    attributes: attributesOf(el),
    neighborText: neighborTextOf(el),
    ancestorTrail: ancestorTrailOf(el),
    ...(visual ? { visual } : {}),
  };
}
