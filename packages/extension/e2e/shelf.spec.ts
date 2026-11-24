import { expect, test } from "./fixtures.ts";
import { anchorNodeCount, uiHostCount } from "./helpers.ts";
import {
  goto,
  openHelper,
  openShelf,
  remember,
  ring,
  ringIsOn,
  shelfNames,
  status,
  tap,
} from "./panel.ts";

/** M2 tasks 3–6: the shelf in the real side panel, pointing on real pages. */

const RB = "/sites/riverbank";

test("remember buttons, same order every time, survives reload, remove", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await expect(status(s)).toHaveText(
    "No buttons saved for this website yet. Your helper can add them.",
  );

  await remember(s, "#paybill-btn", "Pay the light bill");
  await remember(s, "#statements-link"); // suggested name = the site's label
  await remember(s, "#atm-link", "Cash machine");
  const names = await shelfNames(s);
  expect(names).toEqual(["Pay the light bill", "View statements", "Cash machine"]);

  await s.panel.reload();
  await expect.poll(() => shelfNames(s)).toEqual(names);

  await openHelper(s);
  await s.panel.getByRole("button", { name: "Remove View statements" }).click();
  await expect.poll(() => shelfNames(s)).toEqual(["Pay the light bill", "Cash machine"]);
  // Picking left nothing on the page and the site saw no click. (The name tag for "Pay the light
  // bill" beside the site's button is meant to be there.)
  expect(await uiHostCount(site)).toBe(0);
  expect(site.url()).toBe(`${fixtureOrigin}${RB}/v1/home.html`);
});

test("cancel naming saves nothing", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await openHelper(s);
  await s.panel.getByRole("button", { name: "Remember a button" }).click();
  await site.locator("#atm-link").click();
  await s.panel.getByRole("button", { name: "Cancel" }).click();
  await expect(status(s)).toHaveText("Nothing was saved.");
  expect(await shelfNames(s)).toEqual([]);
});

test("points at the redesigned button; the ring is dashed when only fairly sure", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, "#atm-link", "Cash machine");

  // Same page first: sure, solid ring on the remembered element.
  expect(await tap(s, "Cash machine")).toBe("Here it is. It's circled on the page.");
  expect(await ringIsOn(site, ["#atm-link"])).toBe(true);
  expect((await ring(site))?.dashed).toBe(false);

  await goto(s, `${fixtureOrigin}${RB}/v2/home.html`);
  const message = await tap(s, "Cash machine");
  expect([
    "Here it is. It's circled on the page.",
    "I think it's this one now. Please check before you click it.",
  ]).toContain(message);
  expect(await ringIsOn(site, ['footer a[href="/locations"]'])).toBe(true);
  expect((await ring(site))?.dashed).toBe(message.startsWith("I think"));
  // Pointing never navigates or clicks.
  expect(site.url()).toBe(`${fixtureOrigin}${RB}/v2/home.html`);
});

test("a button inside a closed menu: ring on the menu, then on the button once open", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, "#statements-link", "Statements");

  await goto(s, `${fixtureOrigin}${RB}/v2/home.html`);
  expect(await tap(s, "Statements")).toBe("It's inside a menu. Open the menu, and I'll show you.");
  expect(await ringIsOn(site, ["details.rb-menu > summary"])).toBe(true);

  // The person opens the menu themselves; the ring moves onto the link.
  await site.locator("details.rb-menu > summary").click();
  await expect
    .poll(() => ringIsOn(site, ['details.rb-menu a[href="/documents/statements"]']))
    .toBe(true);
});

test("a removed button: calm ask with a help note, no ring (Hard Rule 5)", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, "#order-checks", "Order checks");
  await remember(s, "#paybill-btn", "Pay a bill");

  await goto(s, `${fixtureOrigin}${RB}/v2/home.html`);
  expect(await tap(s, "Order checks")).toBe("This website changed. Let's ask your helper.");
  expect(await ring(site)).toBeNull();
  const note = s.panel.locator("#note-text");
  await expect(note).toBeVisible();
  await expect(note).toHaveText(
    /^Anchor couldn't find the "Order checks" button on localhost \(\d{4}-\d{2}-\d{2}\)\. Could you take a look\?$/,
  );
  // Helper details carry the reasons; the person's area doesn't.
  await openHelper(s);
  await expect(s.panel.locator("#details")).toContainText("unsure");
});

test("signed out: says so calmly instead of 'website changed'", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v1/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, "#paybill-btn", "Pay a bill");
  await remember(s, "#transfer-btn", "Transfer");
  await remember(s, "#statements-link", "Statements");

  await goto(s, `${fixtureOrigin}${RB}/states/logged-out.html`);
  expect(await tap(s, "Pay a bill")).toBe(
    "You may need to sign in first. Then tap the button again.",
  );
  expect(await ring(site)).toBeNull();
  await expect(s.panel.locator("#note")).toBeHidden();
});

test("Show original removes every Anchor change (Hard Rule 4)", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}${RB}/v2/home.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, ".tile--pay", "Pay a bill");
  await tap(s, "Pay a bill");
  expect(await uiHostCount(site)).toBe(1);

  await s.panel.getByRole("button", { name: "Show original" }).click();
  await expect(status(s)).toHaveText("The page is back to how the website shows it.");
  const { live, pristine } = await site.evaluate(async () => {
    const html = await (await fetch(location.href)).text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return { live: document.documentElement.outerHTML, pristine: parsed.documentElement.outerHTML };
  });
  expect(live).toBe(pristine);

  // The note on the page has its own "Show original" too.
  await tap(s, "Pay a bill");
  await site.getByRole("button", { name: "Show original" }).click();
  expect(await anchorNodeCount(site)).toBe(0);
});

test("the page re-renders (single-page apps): the ring follows the new element", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const site = await context.newPage();
  await site.goto(`${fixtureOrigin}/pages/handlers.html`);
  const s = await openShelf(context, sw, extensionId, site);
  await remember(s, "#pay", "Pay");
  expect(await tap(s, "Pay")).toBe("Here it is. It's circled on the page.");

  // Replace the button with a fresh copy somewhere else, as a framework re-render would.
  await site.evaluate(() => {
    const old = document.getElementById("pay");
    const fresh = old?.cloneNode(true) as HTMLElement;
    fresh.id = "pay-new";
    old?.remove();
    document.querySelector("main")?.prepend(fresh);
  });
  await expect.poll(() => ringIsOn(site, ["#pay-new"])).toBe(true);

  // Removed for good: the ring goes away rather than pointing at something else.
  await site.evaluate(() => document.getElementById("pay-new")?.remove());
  await expect.poll(() => ring(site)).toBeNull();
});
