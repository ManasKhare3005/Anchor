import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { findClutter, nameTokens } from "../src/content/adapt/clutter.ts";
import { fixColor, over, parseColor, ratio, type Rgba } from "../src/content/adapt/contrast.ts";
import { protectedReason } from "../src/content/adapt/facts.ts";

function page(body: string): Document {
  return new JSDOM(`<!doctype html><body>${body}</body>`, { url: "http://localhost/x.html" }).window
    .document;
}

const WHITE: Rgba = [255, 255, 255, 1];
const BLACK: Rgba = [0, 0, 0, 1];

describe("contrast maths", () => {
  it("parses computed colours", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30, 0.5]);
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual([10, 20, 30, 0.5]);
    expect(parseColor("transparent")).toBeNull();
  });

  it("WCAG ratio: black on white is 21, same on same is 1", () => {
    expect(ratio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(ratio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("leaves passing text alone", () => {
    expect(fixColor([51, 51, 51, 1], WHITE)).toBeNull();
  });

  it("darkens light grey on white until it passes, keeping a grey", () => {
    const c = fixColor([170, 170, 170, 1], WHITE);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(ratio(c, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(c[0]).toBeCloseTo(c[1], 5);
    expect(c[1]).toBeCloseTo(c[2], 5);
  });

  it("lightens dark text on a dark background", () => {
    const bg: Rgba = [20, 30, 60, 1];
    const c = fixColor([60, 70, 110, 1], bg);
    expect(c && ratio(c, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hue: light red stays red", () => {
    const c = fixColor([255, 150, 150, 1], WHITE);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c[0]).toBeGreaterThan(c[1]);
    expect(c[1]).toBeCloseTo(c[2], 5);
  });

  it("see-through text is judged as drawn", () => {
    expect(over([0, 0, 0, 0.2], WHITE)[0]).toBeCloseTo(204, 0);
    expect(fixColor([0, 0, 0, 0.2], WHITE)).not.toBeNull();
  });
});

describe("never-hide list (Hard Rule 2)", () => {
  const cases: [string, string | null][] = [
    ["<div id=t>Balance $2,431.18</div>", "number"],
    ["<div id=t>Due November 18</div>", "number"],
    ["<div id=t>Terms and conditions apply</div>", "legal text"],
    ["<div id=t>© Riverbank</div>", "legal text"],
    ["<div id=t>We use cookies</div>", "warning"],
    ["<div id=t>You will be signed out soon</div>", "warning"],
    ["<div id=t role=alert>Heads up</div>", "alert or dialog"],
    ["<div id=t><p aria-live=polite>Saved</p></div>", "alert or dialog"],
    ["<dialog open><div id=t>Hello</div></dialog>", "alert or dialog"],
    ["<div id=t><label>Name <input></label></div>", "form field"],
    ["<div id=t>Shop our spring collection</div>", null],
  ];
  for (const [html, reason] of cases) {
    it(`${html} → ${reason ?? "not protected"}`, () => {
      const d = page(html);
      expect(protectedReason(d.getElementById("t") as Element)).toBe(reason);
    });
  }

  it("protects whatever holds the person's own button", () => {
    const d = page("<div id=t><a id=k href=/x>Pay</a></div>");
    const keep = new Set([d.getElementById("k") as Element]);
    expect(protectedReason(d.getElementById("t") as Element, keep)).toBe("the person's own button");
  });
});

describe("clutter", () => {
  it("splits id and class names into words", () => {
    expect(
      nameTokens(
        page("<div id=t class='topAdBanner promo-box'></div>").getElementById("t") as Element,
      ),
    ).toEqual(["t", "top", "ad", "banner", "promo", "box"]);
  });

  it("finds blocks the site names as ads or promos, outermost only", () => {
    const d = page(`
      <div id=a class="ad-slot"><div class="ad-inner"><a href=/x>Shop now</a></div></div>
      <aside id=b class="sponsored">Sponsored stories</aside>
      <div id=c class="newsletter">Get our newsletter</div>
      <div id=d class="download">Download our app</div>
      <div id=e class="badge">New</div>`);
    expect(findClutter(d).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("never hides a promo with a price, legal words, a form or the person's button", () => {
    const d = page(`
      <div id=a class="promo">Save 20% today</div>
      <div id=b class="promo">See terms</div>
      <div id=c class="newsletter"><input aria-label="Email"></div>
      <div id=d class="ad"><a id=k href=/pay>Pay</a></div>`);
    const keep = new Set([d.getElementById("k") as Element]);
    expect(findClutter(d, { keep })).toEqual([]);
  });

  it("never hides page structure, even when it is named like an ad", () => {
    const d = page(
      `<header class="ad">Hi</header><nav class="promo">Go</nav><main class="ads">x</main>`,
    );
    expect(findClutter(d)).toEqual([]);
  });

  it("finds third-party frames of standard ad sizes only", () => {
    const d = page(`
      <iframe id=a src="https://ads.example/x" width=300 height=250></iframe>
      <iframe id=b src="https://maps.example/x" width=600 height=400></iframe>
      <iframe id=c src="/local" width=300 height=250></iframe>`);
    expect(findClutter(d).map((e) => e.id)).toEqual(["a"]);
  });

  it("ignores Anchor's own overlay", () => {
    const d = page(`<div data-anchor><div class="ad">x</div></div>`);
    expect(findClutter(d)).toEqual([]);
  });
});
