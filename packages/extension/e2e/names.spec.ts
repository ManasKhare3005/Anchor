import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { goto, openShelf, remember, status } from "./panel.ts";

/**
 * M4 task 4: the person's own names beside the site's buttons. Hard Rule 3 (adds, never
 * replaces: the site's label is unchanged), Hard Rule 5 (only beside a "sure" match: never a name
 * on the wrong button), Hard Rule 4 (Show original takes them away).
 */

const SITE = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/sites/riverbank/site.json"),
    "utf8",
  ),
) as { features: { id: string; v1: string; v2: { selectors: string[] } }[] };

interface Tag {
  name: string;
  hidden: boolean;
  left: number;
  top: number;
  bottom: number;
}

async function tags(site: Page): Promise<Tag[]> {
  return site.evaluate(() => {
    const root = document.querySelector("[data-anchor='names']")?.shadowRoot;
    return [...(root?.querySelectorAll<HTMLElement>(".name") ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name: el.textContent ?? "",
        hidden: el.hidden === true,
        left: r.left,
        top: r.top,
        bottom: r.bottom,
      };
    });
  });
}

/** True when the tag sits just above (or just below) the first visible element matching a selector. */
async function besideOne(site: Page, tag: Tag, selectors: string[]): Promise<boolean> {
  return site.evaluate(
    ({ tag, selectors }) =>
      selectors.some((sel) =>
        [...document.querySelectorAll(sel)].some((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return false;
          const leftOk = Math.abs(tag.left - Math.max(4, r.left)) < 2;
          const above = Math.abs(tag.bottom - (r.top - 4)) < 2;
          const below = Math.abs(tag.top - (r.bottom + 4)) < 2;
          return leftOk && (above || below);
        }),
      ),
    { tag, selectors },
  );
}

test("names appear beside the site's own buttons, only for sure matches, and go with Show original", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  test.setTimeout(180_000);
  const base = `${fixtureOrigin}/sites/riverbank`;
  const site = await context.newPage();
  await site.setViewportSize({ width: 1280, height: 1600 });
  await site.goto(`${base}/v1/home.html`);
  const labels = await site.evaluate(
    (sels) => sels.map((s) => document.querySelector(s)?.textContent ?? ""),
    SITE.features.map((f) => f.v1),
  );
  const s = await openShelf(context, sw, extensionId, site);
  for (const f of SITE.features) await remember(s, f.v1, `My ${f.id}`);

  // v1: every button is found for sure, and its name sits right beside it.
  await goto(s, `${base}/v1/home.html`);
  await expect.poll(async () => (await tags(site)).length).toBe(SITE.features.length);
  for (const t of await tags(site)) {
    const f = SITE.features.find((x) => `My ${x.id}` === t.name);
    expect(f, t.name).toBeDefined();
    if (!f || t.hidden) continue;
    expect(await besideOne(site, t, [f.v1]), t.name).toBe(true);
  }
  // Hard Rule 3: the site's own labels are exactly as they were.
  expect(
    await site.evaluate(
      (sels) => sels.map((s) => document.querySelector(s)?.textContent ?? ""),
      SITE.features.map((f) => f.v1),
    ),
  ).toEqual(labels);
  // The names never block the page: clicks go through to the site.
  expect(
    await site.evaluate(() => {
      const host = document.querySelector("[data-anchor='names']") as HTMLElement;
      return getComputedStyle(host).pointerEvents;
    }),
  ).toBe("none");

  // v2 (redesign): a name only where the button is found for sure, and always on the right one.
  await goto(s, `${base}/v2/home.html`);
  await site.waitForTimeout(800);
  const v2 = await tags(site);
  expect(v2.length).toBeGreaterThan(0);
  expect(v2.length).toBeLessThan(SITE.features.length);
  for (const t of v2) {
    const f = SITE.features.find((x) => `My ${x.id}` === t.name);
    expect(f?.v2.selectors.length, `${t.name} has a right answer on v2`).toBeGreaterThan(0);
    if (!f || t.hidden) continue;
    expect(await besideOne(site, t, f.v2.selectors), `${t.name} beside the right button`).toBe(
      true,
    );
  }

  // Show original: names gone, page body untouched.
  const body = await site.evaluate(() => document.body.outerHTML);
  await s.panel.getByRole("button", { name: "Show original" }).click();
  await expect(status(s)).toHaveText("The page is back to how the website shows it.");
  await expect(site.locator("[data-anchor]")).toHaveCount(0);
  expect(await site.evaluate(() => document.body.outerHTML)).toBe(body);
});
