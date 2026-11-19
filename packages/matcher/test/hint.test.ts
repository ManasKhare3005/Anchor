import { describe, expect, it } from "vitest";
import { capture } from "../src/capture.ts";
import { match } from "../src/match.ts";
import { dom } from "./helpers.ts";

const URL_ = "https://power.example.com/";

describe("menuHint", () => {
  const v1 = dom(`<main><button id="o">Report an outage</button></main>`, URL_);
  const fp = capture(v1.querySelector("#o") as Element, { url: URL_, now: "t", id: "o" });

  it("suggests a nav link that leads to the feature, without pointing at it", () => {
    const v2 = dom(
      `<header><nav><a href="/billing">Billing</a><a id="oc" href="/outage-center">Outage center</a></nav></header>
       <main><h1>Dashboard</h1><button>Make a payment</button></main>`,
      URL_,
    );
    const r = match(v2, fp);
    expect(r.tier).toBe("unsure");
    expect(r.element).toBeNull();
    expect(r.menuHint).toBe(v2.querySelector("#oc"));
    expect(r.reasons.join(" ")).toMatch(/another page/);
  });

  it("ignores links outside navigation, menus and footers", () => {
    const v2 = dom(`<main><a href="/outage-center">Outage center</a><p>text</p></main>`, URL_);
    expect(match(v2, fp).menuHint).toBeNull();
  });

  it("gives no hint when nothing related exists", () => {
    const v2 = dom(`<nav><a href="/billing">Billing</a><a href="/help">Help</a></nav>`, URL_);
    expect(match(v2, fp).menuHint).toBeNull();
  });

  it("gives no hint when the feature is found on the page", () => {
    const r = match(v1, fp);
    expect(r.element).not.toBeNull();
    expect(r.menuHint).toBeNull();
  });
});
