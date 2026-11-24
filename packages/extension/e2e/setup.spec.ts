import type { Worker } from "@playwright/test";
import { ALL_OFF, ALL_ON, adaptStyled, adaptTruth } from "./adapt.ts";
import { expect, test } from "./fixtures.ts";
import { storedJson } from "./tasks.ts";
import { openHelper, openShelf, status, type Shelf } from "./panel.ts";

/**
 * M4 task 5: first-run setup in the side panel. Three plain questions, the answers shown on the
 * page straight away, before and after, then kept. No settings page for the person.
 */

const ASK_TEXT = "Let's make websites easier for you. Is the text on websites hard to read?";
const ASK_TARGETS = "Do small buttons give you trouble?";
const ASK_CALM = "Do moving or busy pages bother you?";

async function savedAdapt(sw: Worker): Promise<unknown> {
  return (
    (JSON.parse(await storedJson(sw)) as { anchor?: { adapt?: unknown } }).anchor?.adapt ?? null
  );
}

async function answer(s: Shelf, ...labels: string[]): Promise<void> {
  const asks = [ASK_TEXT, ASK_TARGETS, ASK_CALM];
  for (const [i, label] of labels.entries()) {
    await expect(status(s)).toHaveText(asks[i] ?? "");
    await s.panel.locator("#setup").getByRole("button", { name: label, exact: true }).click();
  }
}

async function zoom(s: Shelf): Promise<string> {
  return s.site.evaluate(() => getComputedStyle(document.body).zoom);
}

test.describe("first run", () => {
  test.use({ firstRun: true });

  test("three questions, before and after on the page, then kept for every page", async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    const site = await context.newPage();
    await site.goto(`${fixtureOrigin}/${adaptTruth.page}`);
    const s = await openShelf(context, sw, extensionId, site);

    // Only the question, its answers and Show original: one thing at a time.
    await expect(status(s)).toHaveText(ASK_TEXT);
    await expect(s.panel.locator("#shelf-title")).toBeHidden();
    await expect(s.panel.locator("#helper")).toBeHidden();
    await expect(s.panel.getByRole("button", { name: "Show original" })).toBeVisible();

    await answer(s, "A lot", "Yes", "Yes");
    await expect(status(s)).toHaveText(
      'This is the page with your changes. Tap "See it before" to compare.',
    );
    await adaptStyled(site);
    expect(await zoom(s)).toBe("1.5");
    // Trying out is not saving.
    expect(await savedAdapt(sw)).toBeNull();

    await s.panel.getByRole("button", { name: "See it before" }).click();
    await expect(status(s)).toHaveText(
      'This is the page as the website shows it. Tap "See it after" to compare.',
    );
    await adaptStyled(site, false);
    await s.panel.getByRole("button", { name: "See it after" }).click();
    await adaptStyled(site);

    await s.panel.getByRole("button", { name: "Keep these changes" }).click();
    await expect(status(s)).toHaveText("Saved. Websites will look like this from now on.");
    expect(await savedAdapt(sw)).toEqual(ALL_ON);
    await expect(s.panel.locator("#shelf-title")).toBeVisible();
    await adaptStyled(site);

    // Every page from now on, with no panel involved; never asked again.
    const other = await context.newPage();
    await other.goto(`${fixtureOrigin}/sites/carewell/v1/home.html`);
    await adaptStyled(other);
    await s.panel.reload();
    await expect(status(s)).not.toHaveText(ASK_TEXT);
    await expect(s.panel.locator("#setup")).toBeHidden();
  });

  test("Not now saves nothing, leaves the page alone, and asks again next time", async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    const site = await context.newPage();
    await site.goto(`${fixtureOrigin}/${adaptTruth.page}`);
    const s = await openShelf(context, sw, extensionId, site);
    await answer(s, "A little");
    await s.panel.getByRole("button", { name: "Not now" }).click();
    await expect(status(s)).toHaveText("That's fine. I'll ask again next time.");
    await expect(s.panel.locator("#shelf-title")).toBeVisible();
    expect(await savedAdapt(sw)).toBeNull();
    await adaptStyled(site, false);
    await s.panel.reload();
    await expect(status(s)).toHaveText(ASK_TEXT);
  });

  test("answering No to everything changes nothing, and is remembered", async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    const site = await context.newPage();
    await site.goto(`${fixtureOrigin}/${adaptTruth.page}`);
    const s = await openShelf(context, sw, extensionId, site);
    await answer(s, "No", "No", "No");
    await expect(status(s)).toHaveText("Nothing on websites will change.");
    await expect(s.panel.getByRole("button", { name: "See it before" })).toBeHidden();
    await s.panel.getByRole("button", { name: "Keep these changes" }).click();
    expect(await savedAdapt(sw)).toEqual(ALL_OFF);
    await adaptStyled(site, false);
    await s.panel.reload();
    await expect(s.panel.locator("#setup")).toBeHidden();
  });
});

test("the helper can ask the questions again; Start over begins again", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/${adaptTruth.page}`);
  const s = await openShelf(context, sw, extensionId, site);
  await expect(s.panel.locator("#setup")).toBeHidden();
  await openHelper(s);
  await s.panel.getByRole("button", { name: "Ask the setup questions again" }).click();
  await answer(s, "A little", "No", "No");
  await adaptStyled(site);
  expect(await zoom(s)).toBe("1.25");
  await s.panel.getByRole("button", { name: "Start over" }).click();
  await expect(status(s)).toHaveText(ASK_TEXT);
  await adaptStyled(site, false);
  await answer(s, "No", "Yes", "No");
  await s.panel.getByRole("button", { name: "Keep these changes" }).click();
  expect(await savedAdapt(sw)).toEqual({ text: "normal", targets: true, calm: false });
});

test("after Show original, the changes come back with one tap, and with the next page", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/${adaptTruth.page}`);
  const s = await openShelf(context, sw, extensionId, site);
  await openHelper(s);
  await s.panel.getByRole("button", { name: "Ask the setup questions again" }).click();
  await answer(s, "A lot", "No", "No");
  await s.panel.getByRole("button", { name: "Keep these changes" }).click();
  await adaptStyled(site);

  await s.panel.getByRole("button", { name: "Show original" }).click();
  await expect(status(s)).toHaveText("The page is back to how the website shows it.");
  await adaptStyled(site, false);
  await s.panel.getByRole("button", { name: "Show my changes again" }).click();
  await expect(status(s)).toHaveText("Your changes are back.");
  await adaptStyled(site);
  await expect(s.panel.getByRole("button", { name: "Show my changes again" })).toBeHidden();

  await s.panel.getByRole("button", { name: "Show original" }).click();
  await adaptStyled(site, false);
  await site.reload();
  await adaptStyled(site);
  await expect(s.panel.getByRole("button", { name: "Show my changes again" })).toBeHidden();
});
