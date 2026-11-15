/**
 * Core data types for the matcher.
 *
 * The matcher is pure: it never touches a live DOM. An extractor (elsewhere) turns a page into
 * `CandidateDescriptor[]`; the matcher compares a stored `ElementFingerprint` against them.
 * See DECISIONS.md D-003.
 *
 * Starting point from README §6. Refined in Phase 1.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What we remember about an element the user uses. */
export interface ElementFingerprint {
  /** Stable id we assign. */
  id: string;
  /** Origin, e.g. "https://www.example.com". */
  site: string;
  /** Rough page type / URL pattern. */
  pageKind: string;
  /** What the user calls it ("Track order"). */
  label: string;
  /** Visible text. */
  text: string;
  /** ARIA role or tag semantics (button, link, ...). */
  role: string;
  ariaLabel?: string;
  /** id, name, href pattern, data-* ... */
  attributes: Record<string, string>;
  /** Structural path. Weak signal. */
  domPath: string;
  /** Nearby visible text (context). */
  neighbors: string[];
  /** Relative to viewport. */
  position: Rect;
  /** Optional perceptual hash of a cropped screenshot. */
  visualHash?: string;
  /** ISO date. */
  lastSeen: string;
}

/** One element on the new page that might be the remembered one. Produced by an extractor. */
export interface CandidateDescriptor {
  /** Extractor-assigned handle so the caller can map back to a real element. */
  ref: string;
  text: string;
  role: string;
  ariaLabel?: string;
  attributes: Record<string, string>;
  domPath: string;
  neighbors: string[];
  /** May be absent when extracted without layout (e.g. jsdom). */
  position?: Rect;
}

export type Confidence = "high" | "medium" | "low";

/** Per-signal contribution, kept so every score is inspectable. */
export interface SignalScore {
  signal: string;
  /** Similarity in [0, 1]. */
  similarity: number;
  weight: number;
}

export interface ScoredCandidate {
  ref: string;
  /** Combined score in [0, 1]. */
  score: number;
  signals: SignalScore[];
}

export interface MatchResult {
  fingerprintId: string;
  /** Best first. Empty when nothing plausible. */
  candidates: ScoredCandidate[];
  /** Confidence in candidates[0]. "low" when there are none. */
  confidence: Confidence;
}
