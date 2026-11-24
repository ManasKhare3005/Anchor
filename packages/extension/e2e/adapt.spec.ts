import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { sendToTab, tabIdOf } from "./helpers.ts";
import {
  ALL_OFF,
  ALL_ON,
  adaptStyled,
  adaptTruth as truth,
  allFixturePages,
  facts,
  pristineHtml,
  setAdapt,
} from "./adapt.ts";

/**
 * M4 task 3: the Adapt engine on real pages. Hard Rule 2 (facts keep their text and stay visible),
 * Hard Rule 4 (Show original restores the page exactly), and each comfort option doing what it
 * says.
 */

async function shown(site: Page, sel: string): Promise<boolean> {
  return site.locator(sel).first().isVisible();
}

test("Hard Rules 2 and 4 on every fixture page, with every option on", async ({
  context,
  serviceWorker: sw,
  fixtureOrigin,
}) => {
  test.setTimeout(300_000);
  const pages = allFixturePages();
  expect(pages.length).toBeGreaterThan(50);
  const site = await context.newPage();
  const tabId = await tabIdOf(site, sw);
  for (const path of pages) {
    await setAdapt(sw, null);
    await site.goto(`${fixtureOrigin}/${path}`);
    await adaptStyled(site, false);
    const pristine = await pristineHtml(site);
    const before = await facts(site);

    await setAdapt(sw, ALL_ON);
    await adaptStyled(site);
    const after = await facts(site);
    expect(
      after.map((f) => f.key),
      path,
    ).toEqual(before.map((f) => f.key));
    for (const [i, b] of before.entries()) {
      const a = after[i];
      expect(a?.text, `${path}: fact text`).toBe(b.text);
      if (b.visible)
        expect(a?.visible, `${path}: "${b.text.slice(0, 60)}" still visible`).toBe(true);
    }

    await sendToTab(sw, tabId, { type: "anchor:show-original" });
    expect(await pristineHtml(site), `${path}: Show original`).toBe(pristine);
  }
});

test("the adapt page: clutter hidden, facts kept, contrast raised, bigger targets, calm motion", async ({
  context,
  serviceWorker: sw,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/${truth.page}`);
  const before = await site.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    return getComputedStyle(el).color;
  }, truth.unknownBackground);
  for (const sel of [...truth.clutter, ...truth.stays])
    expect(await shown(site, sel), sel).toBe(true);

  await setAdapt(sw, ALL_ON);
  await adaptStyled(site);

  // Calmer pages: named ads and the ad-sized frame go; a promo with a price, the cookie notice,
  // the session warning and the newsletter field stay.
  for (const sel of truth.clutter) await expect(site.locator(sel), sel).toBeHidden();
  for (const sel of truth.stays) expect(await shown(site, sel), sel).toBe(true);
  for (const sel of truth.facts) expect(await shown(site, sel), sel).toBe(true);

  // Contrast: faint text now reads at 4.5:1 or more; text over a gradient is left alone. Polled:
  // calm motion gives every change a 0.01ms transition, so the new colour lands on the next frame.
  const ratios = () =>
    site.evaluate((sels) => {
      const lum = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      return sels.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        let bg = "rgb(255, 255, 255)";
        for (let cur: Element | null = el; cur; cur = cur.parentElement) {
          const c = getComputedStyle(cur).backgroundColor;
          if (c !== "rgba(0, 0, 0, 0)") {
            bg = c;
            break;
          }
        }
        const [hi, lo] = [lum(getComputedStyle(el).color), lum(bg)].sort((a, b) => b - a);
        return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
      });
    }, truth.lowContrast);
  await expect.poll(async () => Math.min(...(await ratios()))).toBeGreaterThanOrEqual(4.5);
  const hero = await site.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel) as HTMLElement).color,
    truth.unknownBackground,
  );
  expect(hero).toBe(before);

  // Bigger page and targets: at least 44 CSS px before the page zoom, so larger on screen.
  for (const sel of truth.smallTargets) {
    const h = await site
      .locator(sel)
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(h, sel).toBeGreaterThanOrEqual(44 * 1.5 - 1);
  }
  const box = await site.locator(truth.checkbox).evaluate((el) => el.getBoundingClientRect().width);
  expect(box).toBeGreaterThanOrEqual(24 * 1.5 - 1);
  expect(await site.evaluate(() => getComputedStyle(document.body).zoom)).toBe("1.5");

  // Calm motion: the spinner's endless animation and the slow fade are cut to almost nothing.
  const motion = await site.evaluate(
    ([a, t]) => ({
      anim: getComputedStyle(document.querySelector(a as string) as Element).animationDuration,
      count: getComputedStyle(document.querySelector(a as string) as Element)
        .animationIterationCount,
      trans: getComputedStyle(document.querySelector(t as string) as Element).transitionDuration,
    }),
    [truth.animated, truth.transition],
  );
  expect(parseFloat(motion.anim)).toBeLessThan(0.001);
  expect(motion.count).toBe("1");
  expect(parseFloat(motion.trans)).toBeLessThan(0.001);
});

test("saved answers apply on every page load without the panel; all No removes everything", async ({
  context,
  serviceWorker: sw,
  fixtureOrigin,
}) => {
  await setAdapt(sw, { text: "larger", targets: false, calm: false });
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/sites/riverbank/v1/home.html`);
  await adaptStyled(site);
  expect(await site.evaluate(() => getComputedStyle(document.body).zoom)).toBe("1.25");
  await site.goto(`${fixtureOrigin}/tasks/carewell/v1/home.html`);
  await adaptStyled(site);

  // A change of answers shows at once on the open page.
  await setAdapt(sw, { text: "normal", targets: false, calm: true });
  await expect.poll(() => site.evaluate(() => getComputedStyle(document.body).zoom)).toBe("1");
  await adaptStyled(site);
  await setAdapt(sw, ALL_OFF);
  await adaptStyled(site, false);
  await expect(site.locator("[style*='important']")).toHaveCount(0);
});

test("Show original stays until the changes are asked for again", async ({
  context,
  serviceWorker: sw,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  const tabId = await tabIdOf(site, sw);
  await site.goto(`${fixtureOrigin}/${truth.page}`);
  const pristine = await pristineHtml(site);
  await setAdapt(sw, ALL_ON);
  await adaptStyled(site);
  await sendToTab(sw, tabId, { type: "anchor:show-original" });
  expect(await pristineHtml(site)).toBe(pristine);
  // A storage change (another tab, the helper) doesn't sneak the changes back onto this page.
  await setAdapt(sw, { ...ALL_ON, text: "larger" });
  await site.waitForTimeout(500);
  expect(await pristineHtml(site)).toBe(pristine);
  // "Show my changes again".
  await sendToTab(sw, tabId, { type: "anchor:adapt-show", settings: null });
  await adaptStyled(site);
  expect(await site.evaluate(() => getComputedStyle(document.body).zoom)).toBe("1.25");
});

test("high-contrast mode: Anchor leaves the colours to the person's own setting", async ({
  context,
  serviceWorker: sw,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.emulateMedia({ forcedColors: "active" });
  await setAdapt(sw, ALL_ON);
  await site.goto(`${fixtureOrigin}/${truth.page}`);
  await adaptStyled(site);
  for (const sel of truth.lowContrast) {
    expect(await site.locator(sel).getAttribute("style"), sel).toBeNull();
  }
});
