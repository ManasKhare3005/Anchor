import { expect, test } from "./fixtures.ts";
import { openShelf } from "./panel.ts";
import { recordTask, storedJson, taskSites, typedValues, untrusted } from "./tasks.ts";

/**
 * M3 task 3: recording a task through the real side panel, on each fixture site's v1 flow. The
 * task really happens (several pages, filled-in forms); Anchor writes down click and "your turn"
 * steps and never stores what was typed (Hard Rule 7).
 */

interface StoredRoute {
  name: string;
  site: string;
  steps: { kind: string; instruction: string; fingerprint?: { signals: { tag: string } } }[];
}

for (const t of taskSites) {
  test(`records "${t.task}" on ${t.id} v1`, async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    test.setTimeout(90_000);
    const tab = await context.newPage();
    await tab.goto(`${fixtureOrigin}/tasks/${t.id}/${t.start}`);
    const s = await openShelf(context, sw, extensionId, tab);
    await recordTask(s, t, t.task);

    // The task really happened: the site's own confirmation page is showing.
    await expect(tab).toHaveURL(/\/v1\/done\.html/);
    // Anchor caused no event on the site (Hard Rule 1).
    expect(await untrusted(tab)).toEqual([]);

    const raw = await storedJson(sw);
    // Not one typed value anywhere in storage (Hard Rule 7), even though the review page shows
    // them right next to the button that was recorded.
    for (const v of typedValues) expect(raw, `stored "${v}"`).not.toContain(v);

    const store = JSON.parse(raw) as { anchor: { schemaVersion: number; routes: StoredRoute[] } };
    expect(store.anchor.schemaVersion).toBe(2);
    const [route] = store.anchor.routes;
    expect(route?.name).toBe(t.task);
    expect(route?.site).toBe("localhost");
    expect(route?.steps.map((st) => st.kind)).toEqual(t.steps.map((st) => st.kind));
    for (const st of route?.steps ?? []) {
      expect(st.instruction).toMatch(/^(Click ".+"\.|Your turn: (fill in|choose) ".+"\.)$/);
    }
    // The task is on the person's list.
    await expect(s.panel.locator("#tasks").getByRole("button", { name: t.task })).toBeVisible();
  });
}

test("a chosen radio button is not stored: the step names the group", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  test.setTimeout(90_000);
  const t = taskSites.find((x) => x.id === "carewell");
  if (!t) throw new Error("carewell task missing");
  const tab = await context.newPage();
  await tab.goto(`${fixtureOrigin}/tasks/${t.id}/${t.start}`);
  const s = await openShelf(context, sw, extensionId, tab);
  await recordTask(s, t, t.task);
  const store = JSON.parse(await storedJson(sw)) as { anchor: { routes: StoredRoute[] } };
  const steps = store.anchor.routes[0]?.steps ?? [];
  // The person chose "Oak Avenue"; the step points at the group and says its legend.
  expect(steps[2]?.instruction).toBe('Your turn: choose "Pickup store".');
  expect(JSON.stringify(steps[2])).not.toContain("Oak Avenue");
});

test("undo and cancel while recording", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  const tab = await context.newPage();
  await tab.goto(`${fixtureOrigin}/tasks/brightline/v1/pay.html`);
  const s = await openShelf(context, sw, extensionId, tab);
  await s.panel.getByText("For helpers").click();
  await s.panel.getByRole("button", { name: "Record a task" }).click();
  await tab.locator("#acct").fill("Quokka Lantern");
  await tab.locator("#amt").fill("73.19");
  await expect(s.panel.locator("#recorded li")).toHaveCount(2);
  await s.panel.getByRole("button", { name: "Undo last step" }).click();
  await expect(s.panel.locator("#recorded li")).toHaveText([
    'Your turn: fill in "Account number".',
  ]);
  await s.panel.getByRole("button", { name: "Cancel" }).first().click();
  await expect(s.panel.getByRole("status")).toHaveText("Recording stopped. Nothing was saved.");
  // Recording really stopped: further typing is not written down, and the banner is gone.
  await tab.locator("#amt").fill("1.00");
  await expect(tab.locator("[data-anchor]")).toHaveCount(0);
  const raw = await storedJson(sw);
  expect(raw).not.toContain('routes":[{');
});
