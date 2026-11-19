import { z } from "zod";

/**
 * Fingerprint schema (CLAUDE.md § Data model, refined in M1).
 *
 * Built from the element's meaning and structure, never pixel positions (D-016). Stored text is
 * scrubbed of personal details at capture time.
 */

export const SCHEMA_VERSION = 1;

export const SignalsSchema = z.object({
  /** Visible text, scrubbed. */
  text: z.string(),
  /** Approximate accessible name, scrubbed. */
  accessibleName: z.string(),
  /** button, link, menuitem, textbox... */
  role: z.string(),
  tag: z.string(),
  /** id, name, type, href (path pattern), class (stable tokens), data-*, aria-* (allow-listed). */
  attributes: z.record(z.string(), z.string()),
  neighborText: z.object({ before: z.string(), after: z.string() }),
  /** Landmarks, headings and form context, outermost first. */
  ancestorTrail: z.array(z.string()),
  /** Weak signal only; absent when there is no layout (e.g. jsdom). */
  visual: z.object({ region: z.string(), sizeBucket: z.string() }).optional(),
});

export type Signals = z.infer<typeof SignalsSchema>;

export const FingerprintSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  /** Registrable domain, e.g. "example.co.uk". */
  site: z.string().min(1),
  /** URL path pattern where it was captured, ids replaced by "*". */
  pagePattern: z.string(),
  /** The person's own name for it, e.g. "Pay the light bill". */
  personalName: z.string().optional(),
  signals: SignalsSchema,
  /** Extra observed forms (A/B tests). */
  variants: z.array(SignalsSchema),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});

export type Fingerprint = z.infer<typeof FingerprintSchema>;

export type Tier = "sure" | "fairly" | "unsure";

export interface SignalScore {
  signal: string;
  /** 0 to 1. */
  similarity: number;
  weight: number;
}

export interface ScoredCandidate {
  element: Element;
  score: number;
  hidden: boolean;
  signals: SignalScore[];
}

export interface MatchResult {
  /** The element to point at. Always null when tier is "unsure" (Hard Rule 5). */
  element: Element | null;
  /** 0 to 1, score of the best candidate. */
  score: number;
  tier: Tier;
  /** Score distance from the best candidate to the runner-up. */
  runnerUpGap: number;
  /** True when the element exists but is hidden, e.g. inside a closed menu. */
  hidden: boolean;
  /** Human-readable explanation for the helper view. Never page content beyond scrubbed labels. */
  reasons: string[];
  /** Nav or menu link that probably leads to the feature on another page. Always "unsure". */
  menuHint: Element | null;
  /** Best candidates, for debugging and the benchmark. */
  ranked: ScoredCandidate[];
}
