import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { matcherBundle } from "./matcher-bundle.ts";

/**
 * M1 task 1.10: the matcher runs in a real browser, not only in jsdom. Captures on a fixture v1
 * page and matches on its v2 redesign inside Chromium, where real layout exists.
 */

import type * as MatcherModule from "@anchor/matcher";

type Matcher = typeof MatcherModule;
declare global {
  interface Window {
    AnchorMatcher: Matcher;
  }
}

async function load(page: Page, url: string) {
  await page.goto(url);
  await page.addScriptTag({ content: await matcherBundle() });
}

test("capture on v1 and match on v2 inside Chromium", async ({ context, fixtureOrigin }) => {
  const page = await context.newPage();
  const base = `${fixtureOrigin}/sites/riverbank`;

  await load(page, `${base}/v1/home.html`);
  const fp = await page.evaluate(() => {
    const el = document.querySelector("#signout");
    if (!el) throw new Error("no #signout");
    return window.AnchorMatcher.capture(el, { url: location.href, now: "t", id: "signout" });
  });
  // Real layout: the weak visual signal exists here (it can't in jsdom).
  expect(fp.signals.visual).toBeDefined();
  expect(fp.signals.text).toBe("Sign out");

  await load(page, `${base}/v2/home.html`);
  const result = await page.evaluate((remembered) => {
    const r = window.AnchorMatcher.match(document, remembered);
    return {
      tier: r.tier,
      text: r.element?.textContent?.trim() ?? null,
      isUserButton: r.element?.closest(".rb-user") !== null,
    };
  }, fp);
  expect(result.tier).not.toBe("unsure");
  expect(result).toMatchObject({ text: "Sign out", isUserButton: true });
});

test("returns no element for a removed feature, in Chromium", async ({
  context,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  const base = `${fixtureOrigin}/sites/riverbank`;
  await load(page, `${base}/v1/home.html`);
  const fp = await page.evaluate(() =>
    window.AnchorMatcher.capture(document.querySelector("#order-checks") as Element, {
      url: location.href,
      now: "t",
      id: "checks",
    }),
  );
  await load(page, `${base}/v2/home.html`);
  const r = await page.evaluate((remembered) => {
    const m = window.AnchorMatcher.match(document, remembered);
    return { tier: m.tier, hasElement: m.element !== null };
  }, fp);
  expect(r).toEqual({ tier: "unsure", hasElement: false });
});

test("site state in Chromium: the cookie popup state is still 'normal'", async ({
  context,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  const base = `${fixtureOrigin}/sites/carewell`;
  await load(page, `${base}/v1/home.html`);
  const fps = await page.evaluate(() =>
    ["#refill-btn", "#rx-status", "#vaccine-link", "#store-link"].map((s, i) =>
      window.AnchorMatcher.capture(document.querySelector(s) as Element, {
        url: location.href,
        now: "t",
        id: `f${i}`,
      }),
    ),
  );
  await load(page, `${base}/states/cookie-popup.html`);
  const state = await page.evaluate(
    (remembered) => window.AnchorMatcher.classifySite(document, remembered, "visit").state,
    fps,
  );
  expect(state).toBe("normal");
});

test("the bundled matcher contains no Hard Rule 1 or 6 violations", async () => {
  const { BANNED_PATTERNS } = await import("../test/scan-bundle.ts");
  const code = await matcherBundle();
  const hits = BANNED_PATTERNS.filter(({ pattern }) => pattern.test(code)).map((b) => b.rule);
  expect(hits).toEqual([]);
});
