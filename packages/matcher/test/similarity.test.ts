import { describe, expect, it } from "vitest";
import { conceptsOf } from "../src/lexicon.ts";
import {
  classSimilarity,
  combine,
  compareSignals,
  conceptSimilarity,
  hrefSimilarity,
  identitySimilarity,
  roleSimilarity,
  textSimilarity,
  trailSimilarity,
} from "../src/similarity.ts";
import type { Signals } from "../src/types.ts";

const sig = (over: Partial<Signals> = {}): Signals => ({
  text: "",
  accessibleName: "",
  role: "button",
  tag: "button",
  attributes: {},
  neighborText: { before: "", after: "" },
  ancestorTrail: [],
  ...over,
});

describe("conceptsOf (lexicon)", () => {
  it.each([
    ["Track order", ["orders"]],
    ["Your orders", ["orders"]],
    ["Orders", ["orders"]],
    ["Track my package", ["orders"]],
    ["Track a return", ["returns"]],
    ["Log in", ["sign-in"]],
    ["Sign In", ["sign-in"]],
    ["Basket", ["cart"]],
    ["Make a payment", ["pay-bill"]],
    ["Refill prescriptions", ["prescriptions", "refill"]],
    ["Customer Service", ["help"]],
    ["Gift cards", []],
  ])("%s → %j", (text, expected) => {
    expect([...conceptsOf(text)].sort()).toEqual([...expected].sort());
  });
});

describe("textSimilarity", () => {
  it("is null when nothing was remembered", () => {
    expect(textSimilarity("", "anything")).toBeNull();
  });
  it("is 1 for equal text after normalization", () => {
    expect(textSimilarity("Track Order", "track order!")).toBe(1);
  });
  it("is 0 when the candidate has no text", () => {
    expect(textSimilarity("Track order", "")).toBe(0);
  });
  it("ranks close wording above unrelated wording", () => {
    const close = textSimilarity("Track order", "Track my order") ?? 0;
    const far = textSimilarity("Track order", "Gift cards") ?? 0;
    expect(close).toBeGreaterThan(0.5);
    expect(far).toBeLessThan(0.2);
  });
});

describe("conceptSimilarity", () => {
  it("links renames that share a concept", () => {
    expect(conceptSimilarity(sig({ text: "Track order" }), sig({ text: "Orders" }))).toBe(1);
  });

  it("keeps the decoy apart: 'Track a return' is not 'Track order'", () => {
    expect(conceptSimilarity(sig({ text: "Track order" }), sig({ text: "Track a return" }))).toBe(
      0,
    );
  });

  it("is null when the remembered label has no known concept", () => {
    expect(conceptSimilarity(sig({ text: "Gift cards" }), sig({ text: "Orders" }))).toBeNull();
  });
});

describe("roleSimilarity", () => {
  it("full for equal, partial for interchangeable, zero otherwise", () => {
    expect(roleSimilarity("button", "button")).toBe(1);
    expect(roleSimilarity("button", "link")).toBe(0.6);
    expect(roleSimilarity("link", "checkbox")).toBe(0);
  });
});

describe("identitySimilarity", () => {
  it("counts matching stable ids and data attributes", () => {
    expect(identitySimilarity({ id: "orders" }, { id: "orders" })).toBe(1);
    expect(identitySimilarity({ id: "orders", "data-testid": "o" }, { id: "orders" })).toBe(0.5);
    expect(identitySimilarity({ id: "orders" }, { "data-testid": "orders" })).toBe(0.7);
    expect(identitySimilarity({ class: "x" }, { id: "y" })).toBeNull();
  });
});

describe("hrefSimilarity", () => {
  it("compares path patterns and hosts", () => {
    expect(hrefSimilarity({ href: "/orders/track" }, { href: "/orders/track" })).toBe(1);
    expect(hrefSimilarity({ href: "/orders/track" }, { href: "/orders" }) ?? 0).toBeGreaterThan(
      0.4,
    );
    expect(hrefSimilarity({ href: "/orders" }, {})).toBe(0);
    expect(
      hrefSimilarity(
        { href: "/faq", "href-host": "a.com" },
        { href: "/faq", "href-host": "b.com" },
      ),
    ).toBe(0);
    expect(hrefSimilarity({}, { href: "/x" })).toBeNull();
  });
});

describe("classSimilarity / trailSimilarity", () => {
  it("Jaccard on stable class tokens", () => {
    expect(classSimilarity({ class: "a b" }, { class: "b c" })).toBeCloseTo(1 / 3);
  });
  it("weights landmark kinds over names", () => {
    const same = trailSimilarity(["header", "nav"], ["header", "nav"]);
    const moved = trailSimilarity(["header", "nav"], ["aside"]);
    expect(same).toBe(1);
    expect(moved).toBe(0);
  });
});

describe("compareSignals / combine", () => {
  it("skips signals the remembered element lacks, and disabled signals", () => {
    const scores = compareSignals(
      sig({ text: "Go" }),
      sig({ text: "Go" }),
      undefined,
      new Set(["tag"]),
    );
    const names = scores.map((s) => s.signal);
    expect(names).toContain("text");
    expect(names).not.toContain("tag");
    expect(names).not.toContain("href");
  });

  it("identical signals score 1", () => {
    const s = sig({ text: "Track order", accessibleName: "Track order", attributes: { id: "t" } });
    expect(combine(compareSignals(s, s))).toBe(1);
  });
});
