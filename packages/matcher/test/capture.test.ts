import { describe, expect, it } from "vitest";
import { capture, pagePatternOf, registrableDomain } from "../src/capture.ts";
import { FingerprintSchema } from "../src/types.ts";
import { dom, one } from "./helpers.ts";

describe("registrableDomain", () => {
  it.each([
    ["https://www.amazon.com/gp/x", "amazon.com"],
    ["https://smile.amazon.co.uk/", "amazon.co.uk"],
    ["https://my.ssa.gov/", "ssa.gov"],
    ["https://www.service.nsw.gov.au/", "nsw.gov.au"],
    ["http://localhost:5173/x", "localhost"],
    ["http://127.0.0.1:8080/", "127.0.0.1"],
  ])("%s → %s", (url, expected) => {
    expect(registrableDomain(url)).toBe(expected);
  });
});

describe("pagePatternOf", () => {
  it("normalizes ids in the path and drops query", () => {
    expect(pagePatternOf("https://x.com/account/12345/bills?tab=2")).toBe("/account/*/bills");
  });
});

describe("capture", () => {
  const doc = dom(
    `<header><nav><a href="/">Home</a><a id="t" href="/orders">Track order</a></nav></header>`,
    "https://www.shop.example.com/home?x=1",
  );
  const fp = capture(one(doc, "#t"), {
    url: "https://www.shop.example.com/home?x=1",
    now: "2026-11-19T00:00:00.000Z",
    id: "fp-1",
    personalName: "Where's my parcel",
  });

  it("produces a schema-valid fingerprint", () => {
    expect(() => FingerprintSchema.parse(fp)).not.toThrow();
  });

  it("fills site, page pattern, signals and dates", () => {
    expect(fp).toMatchObject({
      schemaVersion: 1,
      id: "fp-1",
      site: "example.com",
      pagePattern: "/home",
      personalName: "Where's my parcel",
      variants: [],
      createdAt: "2026-11-19T00:00:00.000Z",
      lastSeenAt: "2026-11-19T00:00:00.000Z",
      signals: {
        text: "Track order",
        accessibleName: "Track order",
        role: "link",
        tag: "a",
        attributes: { id: "t", href: "/orders" },
        neighborText: { before: "Home", after: "" },
        ancestorTrail: ["header", "nav"],
      },
    });
  });

  it("has no visual signal without layout (jsdom), and never pixel positions", () => {
    expect(fp.signals.visual).toBeUndefined();
    expect(JSON.stringify(fp)).not.toMatch(/"(x|y|top|left|width|height)":/);
  });

  it("generates an id when none is given", () => {
    const other = capture(one(doc, "#t"), { url: "https://shop.example.com/", now: "t" });
    expect(other.id).toMatch(/.{8,}/);
  });
});
