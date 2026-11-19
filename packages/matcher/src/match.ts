import { collectCandidates, isHidden, signalsOf } from "./dom.ts";
import { findMenuHint } from "./hint.ts";
import {
  DEFAULT_WEIGHTS,
  combine,
  compareSignals,
  type SignalName,
  type Weights,
} from "./similarity.ts";
import type { Fingerprint, MatchResult, ScoredCandidate, Signals, Tier } from "./types.ts";

export interface Thresholds {
  sure: { score: number; gap: number };
  fairly: { score: number; gap: number };
}

/**
 * Placeholder thresholds. Replaced by values calibrated on the benchmark in M1 task 1.9.
 * A tier needs a high score AND a clear gap to the runner-up (CLAUDE.md § Matching approach).
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  sure: { score: 0.75, gap: 0.15 },
  fairly: { score: 0.55, gap: 0.08 },
};

export interface MatchOptions {
  thresholds?: Thresholds;
  weights?: Weights;
  /** Signals to leave out (benchmark ablation). */
  disabled?: ReadonlySet<SignalName>;
  /** How many ranked candidates to return. */
  keep?: number;
}

/** Signals of every candidate on a page, computed once and reused across fingerprints. */
export interface PageIndex {
  candidates: { element: Element; signals: Signals }[];
}

export function indexPage(root: Document | Element): PageIndex {
  return {
    candidates: collectCandidates(root).map((element) => ({
      element,
      signals: signalsOf(element),
    })),
  };
}

export function tierFor(score: number, gap: number, t: Thresholds): Tier {
  if (score >= t.sure.score && gap >= t.sure.gap) return "sure";
  if (score >= t.fairly.score && gap >= t.fairly.gap) return "fairly";
  return "unsure";
}

const SIGNAL_LABELS: Record<SignalName, string> = {
  text: "visible text",
  accessibleName: "accessible name",
  concept: "meaning of the label",
  role: "kind of control",
  tag: "HTML tag",
  identity: "id or data attributes",
  href: "link address",
  class: "CSS classes",
  neighbors: "nearby text",
  trail: "page region",
  visual: "rough position",
};

function explain(best: ScoredCandidate | undefined, gap: number, tier: Tier, t: Thresholds) {
  if (!best) return ["No clickable elements on this page."];
  const reasons: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  reasons.push(`Best candidate scored ${pct(best.score)}; next best is ${pct(gap)} lower.`);
  const strong = best.signals
    .filter((s) => s.similarity >= 0.8)
    .map((s) => SIGNAL_LABELS[s.signal as SignalName]);
  const weak = best.signals
    .filter((s) => s.similarity < 0.4 && s.weight >= 1)
    .map((s) => SIGNAL_LABELS[s.signal as SignalName]);
  if (strong.length) reasons.push(`Matches on: ${strong.join(", ")}.`);
  if (weak.length) reasons.push(`Differs in: ${weak.join(", ")}.`);
  if (tier === "unsure") {
    if (best.score >= t.fairly.score && gap < t.fairly.gap) {
      reasons.push("Two or more elements look alike, so Anchor will not guess.");
    } else {
      reasons.push("No element is similar enough.");
    }
  }
  if (best.hidden) reasons.push("The element is hidden, probably inside a closed menu.");
  return reasons;
}

/**
 * Find the remembered feature on a page.
 *
 * Below the "fairly sure" tier, `element` is null: Anchor never falls back to the best available
 * candidate (Hard Rule 5). `ranked` is for debugging and the benchmark only.
 */
export function match(
  root: Document | Element | PageIndex,
  fp: Fingerprint,
  opts: MatchOptions = {},
): MatchResult {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const disabled = opts.disabled ?? new Set<SignalName>();
  const page = "candidates" in root ? root : indexPage(root);
  const forms = [fp.signals, ...fp.variants];

  const scored: ScoredCandidate[] = page.candidates.map(({ element, signals }) => {
    let best: ScoredCandidate | null = null;
    for (const remembered of forms) {
      const parts = compareSignals(remembered, signals, weights, disabled);
      const score = combine(parts);
      if (!best || score > best.score) {
        best = { element, score, hidden: false, signals: parts };
      }
    }
    return best ?? { element, score: 0, hidden: false, signals: [] };
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (top) top.hidden = isHidden(top.element);
  const score = top?.score ?? 0;
  const gap = top ? score - (scored[1]?.score ?? 0) : 0;
  const tier = top ? tierFor(score, gap, t) : "unsure";
  // Only look elsewhere when nothing here is a confident pick. The hint is a separate field and
  // never becomes `element` (Hard Rule 5).
  const hint = tier === "unsure" ? findMenuHint(page, fp) : null;
  const reasons = explain(top, gap, tier, t);
  if (hint) reasons.push("A menu or navigation link may lead to it on another page.");

  return {
    element: tier === "unsure" ? null : (top?.element ?? null),
    score,
    tier,
    runnerUpGap: gap,
    hidden: tier !== "unsure" && (top?.hidden ?? false),
    reasons,
    menuHint: hint,
    ranked: scored.slice(0, opts.keep ?? 5),
  };
}
