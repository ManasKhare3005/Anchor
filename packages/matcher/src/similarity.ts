import { conceptsOf } from "./lexicon.ts";
import { normalize, tokens } from "./text.ts";
import type { Signals } from "./types.ts";

/**
 * One similarity function per signal. Each returns a number in [0, 1], or `null` when the
 * remembered element (fingerprint side) has nothing to compare, in which case the signal is
 * left out of the weighted score instead of counting as a mismatch.
 */

export type SignalName =
  | "text"
  | "accessibleName"
  | "concept"
  | "role"
  | "tag"
  | "identity"
  | "href"
  | "class"
  | "neighbors"
  | "trail"
  | "visual";

export type Weights = Record<SignalName, number>;

/** Starting weights; tuned on the benchmark in task 1.9. */
export const DEFAULT_WEIGHTS: Weights = {
  text: 3,
  accessibleName: 3,
  concept: 2,
  role: 1,
  tag: 0.5,
  identity: 2,
  href: 2.5,
  class: 0.5,
  neighbors: 1,
  trail: 1,
  visual: 0.3,
};

function dice<T>(a: readonly T[], b: readonly T[]): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const counts = new Map<T, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  let common = 0;
  for (const x of b) {
    const c = counts.get(x) ?? 0;
    if (c > 0) {
      common++;
      counts.set(x, c - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}

function trigrams(s: string): string[] {
  const padded = `  ${s} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Text similarity: exact match 1; otherwise token overlap blended with character trigrams. */
export function textSimilarity(remembered: string, candidate: string): number | null {
  const a = normalize(remembered);
  if (!a) return null;
  const b = normalize(candidate);
  if (!b) return 0;
  if (a === b) return 1;
  const tokenScore = dice(tokens(a), tokens(b));
  const charScore = dice(trigrams(a), trigrams(b));
  return 0.6 * tokenScore + 0.4 * charScore;
}

export function conceptSimilarity(remembered: Signals, candidate: Signals): number | null {
  const a = new Set([...conceptsOf(remembered.text), ...conceptsOf(remembered.accessibleName)]);
  if (!a.size) return null;
  const b = new Set([...conceptsOf(candidate.text), ...conceptsOf(candidate.accessibleName)]);
  if (!b.size) return 0;
  // Share the main concept → strong; any extra concepts on either side water it down slightly.
  return jaccard(a, b) > 0 ? 0.5 + 0.5 * jaccard(a, b) : 0;
}

const COMPATIBLE_ROLES = new Set([
  "button|link",
  "link|menuitem",
  "button|menuitem",
  "link|tab",
  "button|tab",
  "menuitem|option",
  "searchbox|textbox",
  "combobox|textbox",
]);

export function roleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const key = [a, b].sort().join("|");
  return COMPATIBLE_ROLES.has(key) ? 0.6 : 0;
}

const IDENTITY_KEYS = (key: string) => key === "id" || key === "name" || key.startsWith("data-");

/** Fraction of the remembered element's stable identifiers that the candidate also has. */
export function identitySimilarity(
  remembered: Record<string, string>,
  candidate: Record<string, string>,
): number | null {
  const keys = Object.keys(remembered).filter(IDENTITY_KEYS);
  if (!keys.length) return null;
  const candidateValues = new Set(
    Object.entries(candidate)
      .filter(([k]) => IDENTITY_KEYS(k))
      .map(([, v]) => v.toLowerCase()),
  );
  let hits = 0;
  for (const k of keys) {
    const v = (remembered[k] ?? "").toLowerCase();
    if (candidate[k]?.toLowerCase() === v) hits += 1;
    else if (candidateValues.has(v)) hits += 0.7; // same value moved to another attribute
  }
  return hits / keys.length;
}

/** Path-pattern similarity by segments; off-site links must also share the host. */
export function hrefSimilarity(
  remembered: Record<string, string>,
  candidate: Record<string, string>,
): number | null {
  const a = remembered.href;
  if (!a) return null;
  const b = candidate.href;
  if (!b) return 0;
  if ((remembered["href-host"] ?? "") !== (candidate["href-host"] ?? "")) return 0;
  if (a === b) return 1;
  const sa = a.split("/").filter(Boolean);
  const sb = b.split("/").filter(Boolean);
  if (!sa.length || !sb.length) return 0;
  return 0.8 * dice(sa, sb) + 0.2 * (sa[sa.length - 1] === sb[sb.length - 1] ? 1 : 0);
}

export function classSimilarity(
  remembered: Record<string, string>,
  candidate: Record<string, string>,
): number | null {
  const a = remembered.class;
  if (!a) return null;
  return jaccard(
    new Set(a.split(" ")),
    new Set((candidate.class ?? "").split(" ").filter(Boolean)),
  );
}

export function neighborSimilarity(remembered: Signals, candidate: Signals): number | null {
  const parts = [
    textSimilarity(remembered.neighborText.before, candidate.neighborText.before),
    textSimilarity(remembered.neighborText.after, candidate.neighborText.after),
  ].filter((x): x is number => x !== null);
  if (!parts.length) return null;
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}

/** Landmark kinds (header, nav, menu...) matter most; names and headings refine it. */
export function trailSimilarity(remembered: string[], candidate: string[]): number | null {
  if (!remembered.length) return null;
  const kind = (s: string) => s.split(":")[0] ?? s;
  const kinds = jaccard(new Set(remembered.map(kind)), new Set(candidate.map(kind)));
  const full = jaccard(new Set(remembered), new Set(candidate));
  return 0.6 * kinds + 0.4 * full;
}

export function visualSimilarity(remembered: Signals, candidate: Signals): number | null {
  if (!remembered.visual || !candidate.visual) return null;
  const region = remembered.visual.region === candidate.visual.region ? 1 : 0;
  const size = remembered.visual.sizeBucket === candidate.visual.sizeBucket ? 1 : 0;
  return 0.7 * region + 0.3 * size;
}

export interface SignalScore {
  signal: SignalName;
  similarity: number;
  weight: number;
}

/** Every applicable signal for one candidate. Disabled signals are skipped (for ablation). */
export function compareSignals(
  remembered: Signals,
  candidate: Signals,
  weights: Weights = DEFAULT_WEIGHTS,
  disabled: ReadonlySet<SignalName> = new Set(),
): SignalScore[] {
  const raw: [SignalName, number | null][] = [
    ["text", textSimilarity(remembered.text, candidate.text)],
    // When the accessible name is just the visible text again, comparing it would count the label
    // twice (the M1 ablation showed this lets look-alike decoys win). Count it only when it adds
    // information, e.g. an icon button whose name comes from aria-label.
    [
      "accessibleName",
      normalize(remembered.accessibleName) === normalize(remembered.text)
        ? null
        : textSimilarity(remembered.accessibleName, candidate.accessibleName),
    ],
    ["concept", conceptSimilarity(remembered, candidate)],
    ["role", roleSimilarity(remembered.role, candidate.role)],
    ["tag", remembered.tag === candidate.tag ? 1 : 0],
    ["identity", identitySimilarity(remembered.attributes, candidate.attributes)],
    ["href", hrefSimilarity(remembered.attributes, candidate.attributes)],
    ["class", classSimilarity(remembered.attributes, candidate.attributes)],
    ["neighbors", neighborSimilarity(remembered, candidate)],
    ["trail", trailSimilarity(remembered.ancestorTrail, candidate.ancestorTrail)],
    ["visual", visualSimilarity(remembered, candidate)],
  ];
  return raw
    .filter((r): r is [SignalName, number] => r[1] !== null && !disabled.has(r[0]))
    .map(([signal, similarity]) => ({ signal, similarity, weight: weights[signal] }));
}

/** Weighted average of the applicable signals. */
export function combine(scores: readonly SignalScore[]): number {
  let num = 0;
  let den = 0;
  for (const s of scores) {
    num += s.weight * s.similarity;
    den += s.weight;
  }
  return den ? num / den : 0;
}
