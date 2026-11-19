import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { SHOPPING_FEATURES, propose, uniqueSelector } from "../src/real/propose.ts";
import { problemWith } from "../src/real/wayback.ts";

const BASE = "https://shop.example.com/";
const doc = new JSDOM(
  `<header>
     <a href="/ap/signin?x=1">Hello, sign in Account &amp; Lists</a>
     <a href="/gp/cart/view.html">0 Cart</a>
     <a href="/gp/css/order-history">Returns &amp; Orders</a>
     <form role="search" action="/s"><input name="k"><input type="submit" value="Go"></form>
   </header>
   <main><button>Add to cart</button><a href="/deals">Today's Deals</a></main>
   <footer><a href="/help">Help</a><a href="/gp/cart/view.html">Cart</a></footer>`,
  { url: BASE },
).window.document;

const rule = (id: string) => {
  const r = SHOPPING_FEATURES.find((x) => x.id === id);
  if (!r) throw new Error(`no rule ${id}`);
  return r;
};

describe("propose (independent label proposer)", () => {
  it("finds header features and prefers header/nav", () => {
    expect(propose(doc, rule("sign-in"), BASE)?.text).toMatch(/sign in/i);
    const cart = propose(doc, rule("cart"), BASE);
    expect(cart?.region).toBe("header/nav");
    expect(cart?.alternates).toHaveLength(1); // footer cart link goes to the same place
    expect(propose(doc, rule("orders"), BASE)?.href).toBe("/gp/css/order-history");
    expect(propose(doc, rule("help"), BASE)?.region).toBe("footer");
    expect(propose(doc, rule("deals"), BASE)?.text).toBe("Today's Deals");
  });

  it("never proposes 'Add to cart' as the cart", () => {
    const sel = propose(doc, rule("cart"), BASE)?.selector ?? "";
    expect(doc.querySelector(sel)?.textContent).not.toMatch(/add to cart/i);
  });

  it("finds the search submit button", () => {
    const s = propose(doc, rule("search"), BASE);
    expect(doc.querySelector(s?.selector ?? "")?.getAttribute("type")).toBe("submit");
  });

  it("builds selectors that resolve to exactly the element", () => {
    for (const el of doc.querySelectorAll("a, button, input")) {
      expect(doc.querySelectorAll(uniqueSelector(el))).toHaveLength(1);
      expect(doc.querySelector(uniqueSelector(el))).toBe(el);
    }
  });
});

describe("problemWith (archive sanity checks)", () => {
  const links = Array.from({ length: 30 }, (_, i) => `<a href="/l${i}">l</a>`).join("");
  const pad = "x".repeat(20_000);

  it("accepts a real-looking page", () => {
    expect(problemWith(`<html><body>${links}${pad}</body></html>`)).toBeNull();
  });
  it("rejects tiny pages, bot checks and client-rendered shells", () => {
    expect(problemWith("<html></html>")).toMatch(/too small/);
    expect(problemWith(`<title>Robot Check</title>${links}${pad}`)).toMatch(/bot-check/);
    expect(problemWith(`<div id="root"></div>${pad}`)).toMatch(/too few links/);
  });

  it("ignores block-page words inside scripts (e.g. a CAPTCHA_ENABLED config flag)", () => {
    const page = `<html><head><title>Shop</title><script>var c={"GLOBAL_CAPTCHA_ENABLED":true}</script></head><body>${links}${pad}</body></html>`;
    expect(problemWith(page)).toBeNull();
  });
});
