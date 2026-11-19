import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type MatchOptions,
  type SignalName,
  type Thresholds,
  type Tier,
} from "@anchor/matcher";
import { classifyAllSites, type StateRow } from "./classify-sites.ts";
import { runAll } from "./run.ts";
import type { Outcome } from "./run.ts";
import { runAllSites } from "./run-sites.ts";

/** One remembered feature looked up in one scenario, from any source. */
export interface BenchRow {
  source: "maple-pairs" | "fixture-sites" | "real-sites";
  site: string;
  category: string;
  feature: string;
  scenario: string;
  expected: "present" | "absent";
  tier: Tier;
  score: number;
  gap: number;
  outcome: Outcome;
  got: string | null;
  reasons: string[];
  hintExpected: boolean;
  hintHit: boolean;
  hint: string | null;
  hintIsTarget: boolean;
}

/** Extra row sources (the real-site benchmark plugs in here in task 1.8). */
export type RowSource = (opts: MatchOptions) => BenchRow[];

export function fixtureRows(opts: MatchOptions = {}): BenchRow[] {
  const maple: BenchRow[] = runAll(undefined, opts).map((r) => ({
    source: "maple-pairs",
    site: "maple-market",
    category: "shopping",
    feature: r.target,
    scenario: r.pair,
    expected: r.expected === "present" ? "present" : "absent",
    tier: r.tier,
    score: r.score,
    gap: r.gap,
    outcome: r.outcome,
    got: r.got,
    reasons: r.reasons,
    hintExpected: false,
    hintHit: false,
    hint: null,
    hintIsTarget: false,
  }));
  const sites: BenchRow[] = runAllSites(undefined, opts).map((r) => ({
    source: "fixture-sites",
    ...r,
  }));
  return [...maple, ...sites];
}

export function collectRows(opts: MatchOptions = {}, extra: RowSource[] = []): BenchRow[] {
  return [...fixtureRows(opts), ...extra.flatMap((src) => src(opts))];
}

// ---------------------------------------------------------------------------------------------
// Metrics

export interface TierStats {
  tier: Tier;
  correct: number;
  wrong: number;
  notFound: number;
  correctAbsent: number;
  /** wrong / (correct + wrong) for pointing tiers. */
  wrongRate: number;
  /** 95% Wilson upper bound of the wrong rate (honest with small samples). */
  wrongRateUpper: number;
}

export function wilsonUpper(k: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.min(1, (centre + margin) / denom);
}

export function tierStats(rows: readonly BenchRow[]): TierStats[] {
  return (["sure", "fairly", "unsure"] as const).map((tier) => {
    const at = rows.filter((r) => r.tier === tier);
    const count = (o: Outcome) => at.filter((r) => r.outcome === o).length;
    const correct = count("correct");
    const wrong = count("wrong");
    const pointed = correct + wrong;
    return {
      tier,
      correct,
      wrong,
      notFound: count("not-found"),
      correctAbsent: count("correct-absent"),
      wrongRate: pointed ? wrong / pointed : 0,
      wrongRateUpper: wilsonUpper(wrong, pointed),
    };
  });
}

/**
 * One number for comparing settings: reward correct answers, punish wrong ones heavily
 * ("a wrong match is worse than no match").
 */
export function utility(rows: readonly BenchRow[], wrongPenalty = 10): number {
  let u = 0;
  for (const r of rows) {
    if (r.outcome === "correct" || r.outcome === "correct-absent") u += 1;
    else if (r.outcome === "wrong") u -= wrongPenalty;
  }
  return u;
}

export interface AblationRow {
  signal: SignalName;
  utility: number;
  delta: number;
  correct: number;
  wrong: number;
}

/** Turn each signal off in turn; the one whose loss hurts least is the weakest. */
export function ablation(
  base: MatchOptions,
  extra: RowSource[] = [],
): { baseline: number; rows: AblationRow[] } {
  const baseline = utility(collectRows(base, extra));
  const rows = (Object.keys(DEFAULT_WEIGHTS) as SignalName[]).map((signal) => {
    const r = collectRows({ ...base, disabled: new Set([signal]) }, extra);
    const u = utility(r);
    return {
      signal,
      utility: u,
      delta: u - baseline,
      correct: r.filter((x) => x.outcome === "correct" || x.outcome === "correct-absent").length,
      wrong: r.filter((x) => x.outcome === "wrong").length,
    };
  });
  rows.sort((a, b) => b.delta - a.delta);
  return { baseline, rows };
}

// ---------------------------------------------------------------------------------------------
// Report

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function table(header: string[], body: (string | number)[][]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export interface ReportInput {
  rows: BenchRow[];
  thresholds: Thresholds;
  ablation: { baseline: number; rows: AblationRow[] };
  states: StateRow[];
  notes?: string[];
  generatedAt: string;
}

export function renderReport(input: ReportInput): string {
  const { rows, thresholds, states } = input;
  const stats = tierStats(rows);
  const bySource = [...new Set(rows.map((r) => r.source))];
  const wrong = rows.filter((r) => r.outcome === "wrong");
  const weakest = input.ablation.rows[0];
  const hintRows = rows.filter((r) => r.hintExpected);
  const strayHints = rows.filter((r) => !r.hintExpected && r.hint !== null);

  const sections: string[] = [
    "# Benchmark report",
    "",
    `Generated by \`npm run benchmark\` on ${input.generatedAt}. Do not edit by hand.`,
    "",
    "Outcomes: **correct** = pointed at the right element; **wrong** = pointed at the wrong element, or at anything when the feature was removed; **not found** = said unsure although the feature exists (safe: Anchor asks); **correct absent** = said unsure and the feature really is gone.",
    "",
    ...(input.notes?.length ? ["## Notes", "", ...input.notes.map((n) => `- ${n}`), ""] : []),
    "## Thresholds",
    "",
    table(
      ["Tier", "Min score", "Min gap to runner-up"],
      [
        ["sure", thresholds.sure.score.toFixed(2), thresholds.sure.gap.toFixed(2)],
        ["fairly", thresholds.fairly.score.toFixed(2), thresholds.fairly.gap.toFixed(2)],
      ],
    ),
    "",
    "## Results by tier (all sources)",
    "",
    table(
      [
        "Tier",
        "Correct",
        "Wrong",
        "Not found",
        "Correct absent",
        "Wrong rate",
        "Wrong rate, 95% upper bound",
      ],
      stats.map((s) => [
        s.tier,
        s.correct,
        s.wrong,
        s.notFound,
        s.correctAbsent,
        s.tier === "unsure" ? "n/a" : pct(s.wrongRate),
        s.tier === "unsure" ? "n/a" : pct(s.wrongRateUpper),
      ]),
    ),
    "",
    "Targets: wrong rate ≤ 1% at **sure**, ≤ 5% at **fairly** (CLAUDE.md). With small samples the upper bound matters more than the point estimate.",
    "",
    "## Results by source",
    "",
    table(
      [
        "Source",
        "Runs",
        "Correct",
        "Correct absent",
        "Not found",
        "Wrong (sure)",
        "Wrong (fairly)",
      ],
      bySource.map((src) => {
        const r = rows.filter((x) => x.source === src);
        const n = (o: Outcome, tier?: Tier) =>
          r.filter((x) => x.outcome === o && (!tier || x.tier === tier)).length;
        return [
          src,
          r.length,
          n("correct"),
          n("correct-absent"),
          n("not-found"),
          n("wrong", "sure"),
          n("wrong", "fairly"),
        ];
      }),
    ),
    "",
    "## Results by scenario",
    "",
    table(
      ["Scenario", "Runs", "Correct", "Correct absent", "Not found", "Wrong"],
      [...new Set(rows.map((r) => r.scenario.replace(/^\d{3}-/, "pair:")))].sort().map((sc) => {
        const r = rows.filter((x) => x.scenario.replace(/^\d{3}-/, "pair:") === sc);
        const n = (o: Outcome) => r.filter((x) => x.outcome === o).length;
        return [sc, r.length, n("correct"), n("correct-absent"), n("not-found"), n("wrong")];
      }),
    ),
    "",
    "## Weakest signal (ablation)",
    "",
    `Each signal is turned off in turn. Utility = correct answers − 10 × wrong answers (baseline ${input.ablation.baseline}). The signal whose removal hurts least is the weakest: **${weakest?.signal ?? "n/a"}**.`,
    "",
    table(
      ["Signal turned off", "Utility", "Change", "Correct", "Wrong"],
      input.ablation.rows.map((a) => [
        a.signal,
        a.utility,
        a.delta > 0 ? `+${a.delta}` : a.delta,
        a.correct,
        a.wrong,
      ]),
    ),
    "",
    "## Every wrong match",
    "",
    wrong.length
      ? table(
          [
            "Source",
            "Site",
            "Feature",
            "Scenario",
            "Tier",
            "Score",
            "Gap",
            "Pointed at",
            "Matcher's reasons",
          ],
          wrong.map((r) => [
            r.source,
            r.site,
            r.feature,
            r.scenario,
            r.tier,
            r.score.toFixed(2),
            r.gap.toFixed(2),
            JSON.stringify(r.got ?? ""),
            r.reasons.join(" "),
          ]),
        )
      : "None.",
    "",
    "## Moved to another page (menu hints)",
    "",
    `Expected hints found: ${hintRows.filter((r) => r.hintHit).length} of ${hintRows.length}. Hints given elsewhere (possibly misleading, always shown as unsure): ${strayHints.length}.`,
    "",
    ...(strayHints.length
      ? [
          table(
            ["Site", "Feature", "Scenario", "Hint", "Hint is the feature itself"],
            strayHints.map((r) => [
              r.site,
              r.feature,
              r.scenario,
              JSON.stringify(r.hint),
              r.hintIsTarget ? "yes" : "no",
            ]),
          ),
          "",
        ]
      : []),
    "## Site state (redesign vs. different state)",
    "",
    table(
      ["Site", "Page", "Expected", "Got", ""],
      states.map((s) => [s.site, s.kind, s.expected, s.got, s.got === s.expected ? "✓" : "✗"]),
    ),
    "",
  ];
  return sections.join("\n");
}

export function buildReport(
  opts: MatchOptions = {},
  extra: RowSource[] = [],
  notes: string[] = [],
) {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  return renderReport({
    rows: collectRows(opts, extra),
    thresholds,
    ablation: ablation(opts, extra),
    states: classifyAllSites(),
    notes,
    generatedAt: new Date().toISOString().slice(0, 10),
  });
}
