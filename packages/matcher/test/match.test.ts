import { describe, expect, it } from "vitest";
import { capture } from "../src/capture.ts";
import { indexPage, match, tierFor, DEFAULT_THRESHOLDS } from "../src/match.ts";
import { dom, one } from "./helpers.ts";

const URL_ = "https://shop.example.com/home";
const NOW = "2026-11-19T00:00:00.000Z";

const BEFORE = `
  <header><a href="/">Shop</a>
    <nav><a href="/deals">Deals</a><a href="/account">Your account</a><a href="/help">Help</a></nav>
    <button id="track-order" onclick="go()">Track order</button>
  </header>
  <main><h1>Welcome</h1><button>Add to cart</button></main>`;

function remember(html: string, selector: string) {
  const doc = dom(html, URL_);
  return capture(one(doc, selector), { url: URL_, now: NOW, id: "fp" });
}

describe("match", () => {
  const fp = remember(BEFORE, "#track-order");

  it("finds an unchanged element as sure", () => {
    const doc = dom(BEFORE, URL_);
    const r = match(doc, fp);
    expect(r.tier).toBe("sure");
    expect(r.element).toBe(one(doc, "#track-order"));
    expect(r.reasons.join(" ")).toMatch(/Matches on/);
  });

  it("follows a moved element (same text and id, new region)", () => {
    const doc = dom(
      `<header><nav><a href="/deals">Deals</a></nav></header>
       <aside><h2>Quick links</h2><button id="track-order">Track order</button></aside>
       <main><button>Add to cart</button></main>`,
      URL_,
    );
    const r = match(doc, fp);
    expect(r.element).toBe(one(doc, "#track-order"));
    expect(r.tier).not.toBe("unsure");
  });

  it("returns null and unsure when the feature is gone (no fallback)", () => {
    const doc = dom(
      `<header><nav><a href="/deals">Deals</a></nav><button id="gift">Gift cards</button></header>`,
      URL_,
    );
    const r = match(doc, fp);
    expect(r.tier).toBe("unsure");
    expect(r.element).toBeNull();
    expect(r.ranked.length).toBeGreaterThan(0); // debugging info still there
  });

  it("refuses to choose between two look-alikes", () => {
    const doc = dom(
      `<header><button class="a">Track order</button></header>
       <footer><button class="a">Track order</button></footer>`,
      URL_,
    );
    const r = match(doc, remember(`<button class="a">Track order</button>`, "button"));
    expect(r.tier).toBe("unsure");
    expect(r.element).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/look alike/);
  });

  it("reports hidden matches (inside a closed menu)", () => {
    const doc = dom(
      `<header><details><summary>Your account</summary>
         <a id="t" href="/orders/track">Track order</a></details></header>`,
      URL_,
    );
    const r = match(doc, fp);
    expect(r.element).toBe(one(doc, "#t"));
    expect(r.hidden).toBe(true);
  });

  it("uses variants (A/B forms)", () => {
    const fpWithVariant = {
      ...fp,
      signals: { ...fp.signals, text: "Something else", accessibleName: "Something else" },
      variants: [fp.signals],
    };
    const doc = dom(BEFORE, URL_);
    expect(match(doc, fpWithVariant).element).toBe(one(doc, "#track-order"));
  });

  it("accepts a prebuilt page index", () => {
    const doc = dom(BEFORE, URL_);
    expect(match(indexPage(doc), fp).element).toBe(one(doc, "#track-order"));
  });

  it("never returns an element when the page has no candidates", () => {
    const r = match(dom(`<p>Just text</p>`, URL_), fp);
    expect(r).toMatchObject({ element: null, tier: "unsure", score: 0 });
  });
});

describe("tierFor", () => {
  it("needs both score and gap", () => {
    expect(tierFor(0.95, 0.5, DEFAULT_THRESHOLDS)).toBe("sure");
    expect(tierFor(0.95, 0.1, DEFAULT_THRESHOLDS)).toBe("fairly");
    expect(tierFor(0.95, 0.01, DEFAULT_THRESHOLDS)).toBe("unsure");
    expect(tierFor(0.6, 0.5, DEFAULT_THRESHOLDS)).toBe("fairly");
    expect(tierFor(0.4, 0.5, DEFAULT_THRESHOLDS)).toBe("unsure");
  });
});
