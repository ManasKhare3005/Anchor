import { basename } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractCandidates } from "../src/extract.ts";
import { findLeaks, listPairDirs, loadPair } from "../src/pairs.ts";
import { classify, runAll, runPair, summarize } from "../src/run.ts";

const dirs = listPairDirs();

describe("fixture pairs", () => {
  it("has at least the 6 synthetic pairs", () => {
    expect(dirs.length).toBeGreaterThanOrEqual(6);
  });

  describe.each(dirs.map((d) => [basename(d), d] as const))("%s", (name, dir) => {
    const loaded = loadPair(dir);

    it("has a valid pair.json whose id matches the folder", () => {
      expect(loaded.pair.id).toBe(name);
    });

    it("contains no Anchor markers that could leak the answer", () => {
      expect(findLeaks(loaded.beforeHtml)).toEqual([]);
      expect(findLeaks(loaded.afterHtml)).toEqual([]);
    });

    it("resolves every selector to exactly one extracted element", () => {
      expect(() => runPair(loaded)).not.toThrow();
    });
  });
});

describe("leak guard", () => {
  it("detects data-anchor attributes", () => {
    expect(findLeaks('<button data-anchor-expected="1">x</button>')).toHaveLength(1);
  });

  it("extractor drops data-anchor attributes even if present", () => {
    const doc = new JSDOM('<button id="b" data-anchor-x="1" data-test="t">Go</button>').window
      .document;
    const [c] = extractCandidates(doc).candidates;
    expect(c?.attributes).toEqual({ id: "b", "data-test": "t" });
  });
});

describe("outcome classification", () => {
  it("treats a confident pick of the wrong element as wrong", () => {
    expect(classify("c1", "c2", "medium")).toBe("wrong");
  });
  it("treats a confident match on a removed feature as wrong", () => {
    expect(classify(null, "c2", "high")).toBe("wrong");
  });
  it("treats low confidence on a removed feature as correct-abstain", () => {
    expect(classify(null, "c2", "low")).toBe("correct-abstain");
  });
  it("treats low confidence on an existing feature as abstain, not wrong", () => {
    expect(classify("c1", "c1", "low")).toBe("abstain");
  });
  it("treats a confident correct pick as correct", () => {
    expect(classify("c1", "c1", "high")).toBe("correct");
  });
});

describe("harness run (stub matcher)", () => {
  const rows = runAll();
  const summary = summarize(rows);

  it("produces one row per target", () => {
    const expected = dirs.reduce((n, d) => n + loadPair(d).pair.targets.length, 0);
    expect(rows).toHaveLength(expected);
  });

  it("never produces a wrong match", () => {
    expect(summary.counts.wrong).toBe(0);
  });
});
