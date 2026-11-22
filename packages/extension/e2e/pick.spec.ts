import { expect, test } from "./fixtures.ts";
import { anchorNodeCount, collectEvents, events, sendToTab, siteHits, tabIdOf } from "./helpers.ts";

/** M2 task 2: the helper picks a button; the site never sees the pick (Hard Rule 1). */

interface Picked {
  type: string;
  fingerprint?: { signals: { text: string; tag: string }; site: string; pagePattern: string };
}

const picked = async (sw: Parameters<typeof events>[0]) => (await events(sw)) as Picked[];

test.describe("pick mode", () => {
  test("clicking picks the nearest control and the site sees nothing", async ({
    context,
    serviceWorker: sw,
    fixtureOrigin,
  }) => {
    const page = await context.newPage();
    await page.goto(`${fixtureOrigin}/pages/handlers.html`);
    const tab = await tabIdOf(page, sw);
    await collectEvents(sw);

    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await expect(page.locator("[data-anchor]")).toHaveCount(1);
    await expect(page.getByText("Click the button you want to remember.")).toBeVisible();

    // Click on the inner <b>: resolves to the role=button tile around it.
    await page.locator("#tile b").click();
    await expect.poll(async () => (await events(sw)).length).toBe(1);
    const [first] = await picked(sw);
    expect(first?.type).toBe("anchor:picked");
    expect(first?.fingerprint?.signals.text).toBe("Transfer money");
    expect(first?.fingerprint?.site).toBe("localhost");
    expect(first?.fingerprint?.pagePattern).toBe("/pages/handlers.html");

    expect(await siteHits(page)).toEqual([]);
    // Pick mode ends after one pick and leaves nothing on the page.
    expect(await anchorNodeCount(page)).toBe(0);
    await page.locator("#pay").click();
    expect(await siteHits(page)).toContain("pay:click");
  });

  test("links and submit buttons do nothing while picking", async ({
    context,
    serviceWorker: sw,
    fixtureOrigin,
  }) => {
    const page = await context.newPage();
    const url = `${fixtureOrigin}/pages/handlers.html`;
    await page.goto(url);
    const tab = await tabIdOf(page, sw);
    await collectEvents(sw);

    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await page.locator("#statements").click();
    await expect.poll(async () => (await events(sw)).length).toBe(1);
    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await page.locator("#send").click();

    await expect.poll(async () => (await events(sw)).length).toBe(2);
    const texts = (await picked(sw)).map((e) => e.fingerprint?.signals.text);
    expect(texts).toEqual(["Statements", "Send"]);
    expect(page.url()).toBe(url);
    expect(await siteHits(page)).toEqual([]);
  });

  test("keyboard: Enter picks the focused control, Esc stops", async ({
    context,
    serviceWorker: sw,
    fixtureOrigin,
  }) => {
    const page = await context.newPage();
    await page.goto(`${fixtureOrigin}/pages/handlers.html`);
    const tab = await tabIdOf(page, sw);
    await collectEvents(sw);

    await page.locator("#pay").focus();
    await page.evaluate(() => {
      (window as unknown as { hits: string[] }).hits.length = 0;
    });
    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await events(sw)).length).toBe(1);
    expect((await picked(sw))[0]?.fingerprint?.signals.text).toBe("Pay a bill");

    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await events(sw)).length).toBe(2);
    expect((await picked(sw))[1]?.type).toBe("anchor:pick-cancelled");
    expect(await siteHits(page)).toEqual([]);
    expect(await anchorNodeCount(page)).toBe(0);
  });

  test("the Stop button cancels, and show-original removes the banner", async ({
    context,
    serviceWorker: sw,
    fixtureOrigin,
  }) => {
    const page = await context.newPage();
    await page.goto(`${fixtureOrigin}/pages/handlers.html`);
    const tab = await tabIdOf(page, sw);
    await collectEvents(sw);

    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    await page.getByRole("button", { name: "Stop" }).click();
    await expect.poll(async () => (await events(sw)).length).toBe(1);
    expect((await picked(sw))[0]?.type).toBe("anchor:pick-cancelled");

    await sendToTab(sw, tab, { type: "anchor:pick-start" });
    expect(await anchorNodeCount(page)).toBe(1);
    await sendToTab(sw, tab, { type: "anchor:show-original" });
    expect(await anchorNodeCount(page)).toBe(0);
    await page.locator("#pay").click();
    expect(await siteHits(page)).toContain("pay:click");
  });
});
