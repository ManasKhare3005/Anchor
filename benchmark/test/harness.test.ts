import { basename } from "node:path";
import { JSDOM } from "jsdom";
import { attributesOf, collectCandidates } from "@anchor/matcher";
import { describe, expect, it } from "vitest";
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

    it("resolves every selector to exactly one element", () => {
      expect(() => runPair(loaded)).not.toThrow();
    });
  });
});

describe("leak guard", () => {
  it("detects data-anchor attributes", () => {
    expect(findLeaks('<button data-anchor-expected="1">x</button>')).toHaveLength(1);
  });

  it("matcher drops data-anchor attributes and skips Anchor's host", () => {
    const doc = new JSDOM(
      '<button id="b" data-anchor-x="1" data-test="t">Go</button><div data-anchor><button>UI</button></div>',
    ).window.document;
    const candidates = collectCandidates(doc);
    expect(candidates).toHaveLength(1);
    expect(attributesOf(candidates[0] as Element)).toEqual({ id: "b", "data-test": "t" });
  });
});

describe("outcome classification", () => {
  const doc = new JSDOM("<a></a><b></b>").window.document;
  const a = doc.querySelector("a");
  const b = doc.querySelector("b");

  it("pointing at the wrong element is wrong", () => {
    expect(classify(a, b)).toBe("wrong");
  });
  it("pointing at anything when the feature was removed is wrong", () => {
    expect(classify(null, b)).toBe("wrong");
  });
  it("pointing at nothing when removed is correct-absent", () => {
    expect(classify(null, null)).toBe("correct-absent");
  });
  it("pointing at nothing when present is not-found (safe, not wrong)", () => {
    expect(classify(a, null)).toBe("not-found");
  });
  it("pointing at the expected element is correct", () => {
    expect(classify(a, a)).toBe("correct");
  });
});

describe("Maple Market pairs with the real matcher", () => {
  const rows = runAll();
  const summary = summarize(rows);

  it("produces one row per target", () => {
    const expected = dirs.reduce((n, d) => n + loadPair(d).pair.targets.length, 0);
    expect(rows).toHaveLength(expected);
  });

  it("never points at the wrong element", () => {
    expect(rows.filter((r) => r.outcome === "wrong")).toEqual([]);
  });

  it("keeps every unchanged control target sure", () => {
    const controls = rows.filter((r) => r.target === "Search");
    expect(controls.every((r) => r.tier === "sure" && r.outcome === "correct")).toBe(true);
  });

  it("finds most changed features (regression floor; raised as tuning improves)", () => {
    expect(summary.counts.correct + summary.counts["correct-absent"]).toBeGreaterThanOrEqual(10);
  });
});
