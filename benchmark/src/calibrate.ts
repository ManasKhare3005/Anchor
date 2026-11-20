import { tierFor, type Thresholds, type Tier } from "@anchor/matcher";
import type { Outcome } from "./run.ts";
import type { BenchRow } from "./bench.ts";

/**
 * Threshold calibration (M1 task 1.9).
 *
 * Every benchmark row stores the best candidate's score, its gap to the runner-up and whether that
 * candidate is a right answer, so any threshold setting can be replayed without re-running the
 * matcher. The search picks the thresholds that find the most features while keeping wrong matches
 * within target: ≤ 1% at "sure" and ≤ 5% at "fairly" (CLAUDE.md). "A wrong match is worse than no
 * match": ties go to the stricter setting.
 */

export interface Targets {
  sureWrongMax: number;
  fairlyWrongMax: number;
}

/** The project targets (CLAUDE.md). The report checks results against these. */
export const DEFAULT_TARGETS: Targets = { sureWrongMax: 0.01, fairlyWrongMax: 0.05 };

/**
 * What calibration actually optimizes for: zero wrong matches on the calibration set. Tuning up to
 * the 5% limit overfit badly (leave-one-site-out "fairly" wrong rate 10.8%, 2026-11-20), while
 * zero-tolerance kept held-out sites at 0 wrong. A deliberate safety margin.
 */
export const CALIBRATION_TARGETS: Targets = { sureWrongMax: 0, fairlyWrongMax: 0 };

export function retier(row: BenchRow, t: Thresholds): { tier: Tier; outcome: Outcome } {
  const tier = tierFor(row.score, row.gap, t);
  if (tier === "unsure") {
    return { tier, outcome: row.expected === "absent" ? "correct-absent" : "not-found" };
  }
  return { tier, outcome: row.topCorrect ? "correct" : "wrong" };
}

export interface Evaluation {
  thresholds: Thresholds;
  good: number;
  sure: { correct: number; wrong: number };
  fairly: { correct: number; wrong: number };
  notFound: number;
  correctAbsent: number;
}

export function evaluate(rows: readonly BenchRow[], t: Thresholds): Evaluation {
  const e: Evaluation = {
    thresholds: t,
    good: 0,
    sure: { correct: 0, wrong: 0 },
    fairly: { correct: 0, wrong: 0 },
    notFound: 0,
    correctAbsent: 0,
  };
  for (const row of rows) {
    const { tier, outcome } = retier(row, t);
    if (outcome === "correct" || outcome === "correct-absent") e.good++;
    if (outcome === "not-found") e.notFound++;
    if (outcome === "correct-absent") e.correctAbsent++;
    if (tier === "sure" || tier === "fairly") {
      e[tier][outcome === "correct" ? "correct" : "wrong"]++;
    }
  }
  return e;
}

const rate = (x: { correct: number; wrong: number }) =>
  x.correct + x.wrong ? x.wrong / (x.correct + x.wrong) : 0;

export function meetsTargets(e: Evaluation, targets: Targets = DEFAULT_TARGETS): boolean {
  return rate(e.sure) <= targets.sureWrongMax && rate(e.fairly) <= targets.fairlyWrongMax;
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let x = from; x <= to + 1e-9; x += step) out.push(Math.round(x * 100) / 100);
  return out;
};

/** Every threshold setting considered. "fairly" is never stricter than "sure". */
export function grid(): Thresholds[] {
  const out: Thresholds[] = [];
  for (const sScore of range(0.6, 0.95, 0.05))
    for (const sGap of range(0.05, 0.4, 0.05))
      for (const fScore of range(0.35, sScore, 0.05))
        for (const fGap of range(0.02, sGap, 0.02))
          out.push({ sure: { score: sScore, gap: sGap }, fairly: { score: fScore, gap: fGap } });
  return out;
}

const strictness = (t: Thresholds) => t.sure.score + t.sure.gap + t.fairly.score + t.fairly.gap;

/** Best feasible setting: most good outcomes, then most "sure" answers, then the strictest. */
export function calibrate(
  rows: readonly BenchRow[],
  targets: Targets = DEFAULT_TARGETS,
): Evaluation | null {
  let best: Evaluation | null = null;
  for (const t of grid()) {
    const e = evaluate(rows, t);
    if (!meetsTargets(e, targets)) continue;
    if (
      !best ||
      e.good > best.good ||
      (e.good === best.good && e.sure.correct > best.sure.correct) ||
      (e.good === best.good &&
        e.sure.correct === best.sure.correct &&
        strictness(t) > strictness(best.thresholds))
    ) {
      best = e;
    }
  }
  return best;
}

export interface HeldOut {
  site: string;
  thresholds: Thresholds;
  result: Evaluation;
}

/**
 * Leave-one-site-out: calibrate on every other site, then score the held-out site with those
 * thresholds. Shows how the thresholds do on a site they were not tuned on.
 */
export function leaveOneSiteOut(
  rows: readonly BenchRow[],
  targets: Targets = DEFAULT_TARGETS,
): { folds: HeldOut[]; total: Evaluation } {
  const sites = [...new Set(rows.map((r) => r.site))].sort();
  const folds: HeldOut[] = [];
  for (const site of sites) {
    const train = rows.filter((r) => r.site !== site);
    const test = rows.filter((r) => r.site === site);
    const chosen = calibrate(train, targets);
    if (!chosen) continue;
    folds.push({ site, thresholds: chosen.thresholds, result: evaluate(test, chosen.thresholds) });
  }
  const total: Evaluation = {
    thresholds: folds[0]?.thresholds ?? {
      sure: { score: 1, gap: 1 },
      fairly: { score: 1, gap: 1 },
    },
    good: 0,
    sure: { correct: 0, wrong: 0 },
    fairly: { correct: 0, wrong: 0 },
    notFound: 0,
    correctAbsent: 0,
  };
  for (const f of folds) {
    total.good += f.result.good;
    total.sure.correct += f.result.sure.correct;
    total.sure.wrong += f.result.sure.wrong;
    total.fairly.correct += f.result.fairly.correct;
    total.fairly.wrong += f.result.fairly.wrong;
    total.notFound += f.result.notFound;
    total.correctAbsent += f.result.correctAbsent;
  }
  return { folds, total };
}
