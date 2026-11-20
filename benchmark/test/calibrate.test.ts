import { DEFAULT_THRESHOLDS } from "@anchor/matcher";
import { describe, expect, it } from "vitest";
import { fixtureRows, type BenchRow } from "../src/bench.ts";
import {
  CALIBRATION_TARGETS,
  calibrate,
  evaluate,
  grid,
  leaveOneSiteOut,
  meetsTargets,
  retier,
} from "../src/calibrate.ts";
import { realRows } from "../src/real/run-real.ts";

const row = (over: Partial<BenchRow>): BenchRow => ({
  source: "fixture-sites",
  site: "a",
  category: "c",
  feature: "f",
  scenario: "v2",
  expected: "present",
  tier: "sure",
  score: 0.9,
  gap: 0.5,
  outcome: "correct",
  topCorrect: true,
  got: "x",
  reasons: [],
  hintExpected: false,
  hintHit: false,
  hint: null,
  hintIsTarget: false,
  ...over,
});

const T = { sure: { score: 0.8, gap: 0.3 }, fairly: { score: 0.5, gap: 0.1 } };

describe("retier", () => {
  it("replays outcomes under any thresholds", () => {
    expect(retier(row({}), T)).toEqual({ tier: "sure", outcome: "correct" });
    expect(retier(row({ topCorrect: false }), T)).toEqual({ tier: "sure", outcome: "wrong" });
    expect(retier(row({ score: 0.6, gap: 0.2 }), T)).toEqual({
      tier: "fairly",
      outcome: "correct",
    });
    expect(retier(row({ score: 0.3 }), T).outcome).toBe("not-found");
    expect(retier(row({ score: 0.3, expected: "absent", topCorrect: false }), T).outcome).toBe(
      "correct-absent",
    );
    // pointing at anything when the feature is gone is wrong
    expect(retier(row({ expected: "absent", topCorrect: false }), T).outcome).toBe("wrong");
  });
});

describe("calibrate", () => {
  const rows = [
    row({ score: 0.95, gap: 0.6 }),
    row({ score: 0.7, gap: 0.3 }),
    row({ score: 0.72, gap: 0.3, topCorrect: false, site: "b" }), // a decoy just above 0.7
    row({ score: 0.2, expected: "absent", topCorrect: false }),
  ];

  it("never accepts a setting with a wrong match under zero tolerance", () => {
    const best = calibrate(rows, CALIBRATION_TARGETS);
    expect(best).not.toBeNull();
    if (!best) return;
    expect(meetsTargets(best, CALIBRATION_TARGETS)).toBe(true);
    expect(best.sure.wrong + best.fairly.wrong).toBe(0);
  });

  it("keeps fairly no stricter than sure across the grid", () => {
    for (const t of grid()) {
      expect(t.fairly.score).toBeLessThanOrEqual(t.sure.score);
      expect(t.fairly.gap).toBeLessThanOrEqual(t.sure.gap);
    }
  });

  it("leave-one-site-out scores every site with thresholds tuned without it", () => {
    const { folds } = leaveOneSiteOut(rows, CALIBRATION_TARGETS);
    expect(folds.map((f) => f.site).sort()).toEqual(["a", "b"]);
  });
});

describe("matcher defaults match calibration (drift guard)", () => {
  it("DEFAULT_THRESHOLDS equal the calibrated thresholds on fixtures + confirmed labels", () => {
    const best = calibrate([...fixtureRows(), ...realRows({}, "confirmed")], CALIBRATION_TARGETS);
    expect(best?.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(best && evaluate(fixtureRows(), DEFAULT_THRESHOLDS).sure.wrong).toBe(0);
  });
});
