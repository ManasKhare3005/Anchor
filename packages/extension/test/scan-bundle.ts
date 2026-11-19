import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Scans built JavaScript for Hard Rule 1 (never clicks or navigates) and Hard Rule 6 (no network)
 * violations, including ones that come from dependencies and so are invisible to lint.
 *
 * WXT's own `dispatchEvent(new CustomEvent(...))` is allowed: it is not a mouse or keyboard event
 * and never targets a page element the person would click.
 */
export const BANNED_PATTERNS: { rule: string; pattern: RegExp }[] = [
  { rule: "Hard Rule 6: fetch", pattern: /\bfetch\s*\(/ },
  { rule: "Hard Rule 6: XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { rule: "Hard Rule 6: WebSocket", pattern: /\bWebSocket\b/ },
  { rule: "Hard Rule 6: EventSource", pattern: /\bEventSource\b/ },
  { rule: "Hard Rule 6: sendBeacon", pattern: /\bsendBeacon\b/ },
  { rule: "Hard Rule 6: importScripts", pattern: /\bimportScripts\s*\(/ },
  { rule: "Hard Rule 1: .click()", pattern: /\.click\s*\(\s*\)/ },
  { rule: "Hard Rule 1: .submit()", pattern: /\.submit\s*\(\s*\)/ },
  { rule: "Hard Rule 1: requestSubmit", pattern: /\brequestSubmit\b/ },
  {
    rule: "Hard Rule 1: synthetic input event",
    pattern: /\bnew\s+(Mouse|Pointer|Keyboard|Input|Touch|Wheel|Drag)Event\b/,
  },
  { rule: "Hard Rule 1: window.open", pattern: /\bwindow\.open\s*\(/ },
  { rule: "Hard Rule 1: location.assign/replace", pattern: /\blocation\.(assign|replace)\s*\(/ },
];

export interface Violation {
  file: string;
  rule: string;
  excerpt: string;
}

function* jsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* jsFiles(full);
    else if (/\.(m?js|html)$/.test(name)) yield full;
  }
}

export function scanBundle(dir: string): Violation[] {
  const out: Violation[] = [];
  for (const file of jsFiles(dir)) {
    const source = readFileSync(file, "utf8");
    for (const { rule, pattern } of BANNED_PATTERNS) {
      const m = pattern.exec(source);
      if (m) {
        const at = m.index;
        out.push({
          file: relative(dir, file),
          rule,
          excerpt: source.slice(Math.max(0, at - 40), at + 40),
        });
      }
    }
  }
  return out;
}
