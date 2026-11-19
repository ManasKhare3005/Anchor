import { describe, expect, it } from "vitest";
import { capture } from "../src/capture.ts";
import { classifySite, confirmRedesign } from "../src/site.ts";
import { dom } from "./helpers.ts";

const URL_ = "https://bank.example.com/home";
const V1 = `
  <header><nav><a href="/accounts">Accounts</a><a href="/help">Help</a></nav>
    <button id="out">Sign out</button></header>
  <main><h1>Your accounts</h1>
    <button id="transfer">Transfer money</button>
    <button id="pay">Pay a bill</button>
    <a id="stmt" href="/statements">View statements</a>
  </main>`;

const v1 = dom(V1, URL_);
const fps = ["#out", "#transfer", "#pay", "#stmt"].map((s, i) =>
  capture(v1.querySelector(s) as Element, { url: URL_, now: "t", id: `f${i}` }),
);

describe("classifySite", () => {
  it("normal when everything is where it was", () => {
    expect(classifySite(dom(V1, URL_), fps, "v1").state).toBe("normal");
  });

  it("normal with an overlay that duplicates a button (ambiguous counts as present)", () => {
    const page = dom(
      V1 + `<div role="alertdialog"><p>Signing out soon</p><button>Sign out</button></div>`,
      URL_,
    );
    const obs = classifySite(page, fps, "v");
    expect(obs.state).toBe("normal");
    const signOut = obs.features[0];
    expect(signOut?.status).not.toBe("missing");
    // Never the popup's button: either the original, or no pick at all.
    if (signOut?.result.element) {
      expect(signOut.result.element).toBe(page.querySelector("#out"));
    }
  });

  it("treats a present-but-ambiguous feature as present, not missing", () => {
    const twin = `<main><button class="go">Continue</button><button class="go">Continue</button></main>`;
    const fp = capture(
      dom(`<main><button class="go">Continue</button></main>`, URL_).querySelector(
        "button",
      ) as Element,
      {
        url: URL_,
        now: "t",
        id: "c",
      },
    );
    const obs = classifySite(dom(twin, URL_), [fp], "v");
    expect(obs.features[0]?.status).toBe("ambiguous");
    expect(obs.features[0]?.result.element).toBeNull();
    expect(obs.state).toBe("normal");
  });

  it("logged-out when a login form is shown and most features are gone", () => {
    const page = dom(
      `<header><nav><a href="/help">Help</a></nav></header>
       <form><label for="u">User</label><input id="u"><input type="password"><button>Sign in</button></form>`,
      URL_,
    );
    const obs = classifySite(page, fps, "v");
    expect(obs.loginFormPresent).toBe(true);
    expect(obs.state).toBe("logged-out");
  });

  it("local-change when one feature is missing and the rest are untouched", () => {
    const page = dom(V1.replace(`<a id="stmt" href="/statements">View statements</a>`, ""), URL_);
    expect(classifySite(page, fps, "v").state).toBe("local-change");
  });

  it("redesign when most features are found in new places", () => {
    const page = dom(
      `<header><nav><a href="/accounts">Accounts</a><a href="/help">Help</a></nav></header>
       <aside><h2>Shortcuts</h2>
         <button id="transfer">Transfer money</button>
         <button id="pay">Pay a bill</button>
         <a id="stmt" href="/statements">View statements</a>
         <button id="out">Sign out</button>
       </aside>`,
      URL_,
    );
    const obs = classifySite(page, fps, "v");
    expect(obs.features.filter((f) => f.status === "found").length).toBe(4);
    expect(obs.state).toBe("redesign");
  });

  it("unknown when there is nothing to judge", () => {
    expect(classifySite(dom(V1, URL_), [], "v").state).toBe("unknown");
  });
});

describe("confirmRedesign (two-visit rule)", () => {
  const redesigned = `<aside><button id="transfer">Transfer money</button><button id="pay">Pay a bill</button>
    <a id="stmt" href="/statements">View statements</a><button id="out">Sign out</button></aside>`;

  it("needs two different visits that agree", () => {
    const a = classifySite(dom(redesigned, URL_), fps, "visit-1");
    const b = classifySite(dom(redesigned, URL_), fps, "visit-2");
    expect(a.state).toBe("redesign");
    expect(confirmRedesign(a, b)).toBe(true);
  });

  it("is false for the same visit, or when one visit was normal", () => {
    const a = classifySite(dom(redesigned, URL_), fps, "visit-1");
    expect(confirmRedesign(a, a)).toBe(false);
    const normal = classifySite(dom(V1, URL_), fps, "visit-2");
    expect(confirmRedesign(a, normal)).toBe(false);
  });
});
