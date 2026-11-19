import { pathPattern, signalsOf } from "./dom.ts";
import { SCHEMA_VERSION, type Fingerprint } from "./types.ts";

export interface CaptureContext {
  /** Page URL where the element was captured. */
  url: string;
  /** ISO timestamp. Passed in so capture stays deterministic and testable. */
  now: string;
  /** Stable id. Generated when absent. */
  id?: string;
  /** The person's own name for the feature. */
  personalName?: string;
}

/**
 * Second-level labels that sit under a country code, so the registrable domain needs one more
 * label (example.co.uk, example.com.au). A small built-in list instead of a full public suffix
 * list dependency; good enough for grouping fingerprints by site.
 */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu", "nhs", "gob", "gouv"]);

export function registrableDomain(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/^[\d.]+$/.test(host) || host === "localhost" || !host.includes(".")) return host;
  const labels = host.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const sld = labels[labels.length - 2] ?? "";
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join(".");
}

export function pagePatternOf(url: string): string {
  return pathPattern(url, url);
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `fp-${Date.now().toString(36)}-${Math.random()}`;
}

/** Remember an element: its meaning and structure, scrubbed of personal details. */
export function capture(el: Element, ctx: CaptureContext): Fingerprint {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ctx.id ?? newId(),
    site: registrableDomain(ctx.url),
    pagePattern: pagePatternOf(ctx.url),
    ...(ctx.personalName ? { personalName: ctx.personalName } : {}),
    signals: signalsOf(el),
    variants: [],
    createdAt: ctx.now,
    lastSeenAt: ctx.now,
  };
}
