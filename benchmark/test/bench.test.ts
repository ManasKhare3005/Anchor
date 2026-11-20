import { describe, expect, it } from "vitest";
import { renderReport, tierStats, utility, wilsonUpper, type BenchRow } from "../src/bench.ts";
import { DEFAULT_THRESHOLDS } from "@anchor/matcher";

const row = (over: Partial<BenchRow>): BenchRow => ({
  source: "fixture-sites",
  site: "s",
  category: "c",
  feature: "f",
  scenario: "v2",
  expected: "present",
  tier: "sure",
  score: 0.9,
  gap: 0.3,
  outcome: "correct",
  got: "x",
  reasons: [],
  hintExpected: false,
  hintHit: false,
  hint: null,
  hintIsTarget: false,
  topCorrect: true,
  ...over,
});

describe("wilsonUpper", () => {
  it("is 0 with no data and grows above the point estimate for small samples", () => {
    expect(wilsonUpper(0, 0)).toBe(0);
    expect(wilsonUpper(0, 100)).toBeGreaterThan(0.03);
    expect(wilsonUpper(0, 100)).toBeLessThan(0.04);
    expect(wilsonUpper(1, 10)).toBeGreaterThan(0.1);
  });
});

describe("tierStats / utility", () => {
  const rows = [
    row({}),
    row({ outcome: "wrong" }),
    row({ tier: "fairly" }),
    row({ tier: "unsure", outcome: "not-found", got: null }),
    row({ tier: "unsure", outcome: "correct-absent", got: null, expected: "absent" }),
  ];

  it("counts per tier with wrong rates", () => {
    const [sure, fairly, unsure] = tierStats(rows);
    expect(sure).toMatchObject({ correct: 1, wrong: 1, wrongRate: 0.5 });
    expect(fairly).toMatchObject({ correct: 1, wrong: 0, wrongRate: 0 });
    expect(unsure).toMatchObject({ notFound: 1, correctAbsent: 1 });
  });

  it("punishes wrong answers ten times harder than it rewards correct ones", () => {
    expect(utility(rows)).toBe(3 - 10);
  });
});

describe("renderReport", () => {
  const md = renderReport({
    rows: [row({}), row({ outcome: "wrong", got: "Decoy", reasons: ["because"] })],
    thresholds: DEFAULT_THRESHOLDS,
    ablation: {
      baseline: 1,
      rows: [{ signal: "text", utility: 2, delta: 1, correct: 2, wrong: 0 }],
    },
    states: [
      { site: "s", page: "p", kind: "logged-out", expected: "logged-out", got: "logged-out" },
    ],
    generatedAt: "2026-11-19",
  });

  it("has every section the plan requires", () => {
    for (const h of [
      "## Thresholds",
      "## Results by tier",
      "## Results by source",
      "## Weakest signal",
      "## Every wrong match",
      "## Moved to another page",
      "## Site state",
    ]) {
      expect(md).toContain(h);
    }
  });

  it("lists every wrong match with its reasons and names the weakest signal", () => {
    expect(md).toContain('"Decoy"');
    expect(md).toContain("because");
    expect(md).toContain("weakest: **text**");
  });
});
