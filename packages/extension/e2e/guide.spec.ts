import { expect, test } from "./fixtures.ts";
import { goto, openShelf, ringIsOn, status, type Shelf } from "./panel.ts";
import { act, recordTask, taskSites, untrusted, type TaskSite } from "./tasks.ts";

/**
 * M3 task 4: guiding a recorded task on v1, one step at a time. Each step is circled, and the
 * guide moves on only when the person does the step: their own click on the element, a choice in a
 * field, or Next after typing. Anchor never clicks, types or submits (Hard Rule 1).
 */

async function progress(s: Shelf): Promise<string> {
  return (await s.panel.locator("#guide-progress").textContent()) ?? "";
}

async function startTask(s: Shelf, t: TaskSite): Promise<void> {
  await s.panel.locator("#tasks").getByRole("button", { name: t.task }).click();
  await expect(s.panel.locator("#guide")).toBeVisible();
}

async function recorded(s: Shelf, t: TaskSite, base: string): Promise<void> {
  await recordTask(s, t, t.task);
  await goto(s, `${base}/${t.start}`);
}

for (const t of taskSites) {
  test(`guides "${t.task}" on ${t.id} v1 to the end`, async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    test.setTimeout(120_000);
    const base = `${fixtureOrigin}/tasks/${t.id}`;
    const tab = await context.newPage();
    await tab.goto(`${base}/${t.start}`);
    const s = await openShelf(context, sw, extensionId, tab);
    await recorded(s, t, base);
    await startTask(s, t);

    for (const [i, step] of t.steps.entries()) {
      await expect(s.panel.locator("#guide-progress")).toHaveText(
        `Step ${i + 1} of ${t.steps.length}`,
      );
      const instruction = (await s.panel.locator("#guide-text").textContent()) ?? "";
      // On v1 every step is found for sure: the message is the plain instruction.
      await expect(status(s)).toHaveText(instruction);
      await expect.poll(() => ringIsOn(tab, step.expect ?? [step.selector])).toBe(true);
      // Only a click step has no Next: the person's own click moves it on.
      await expect(s.panel.getByRole("button", { name: "Next" })).toBeVisible({
        visible: step.kind === "your-turn",
      });

      const url = tab.url();
      await act(tab, step);
      // Typing doesn't move on by itself (Anchor can't tell when the person has finished); the
      // person taps Next. Choosing and clicking are observed.
      if (step.action === "fill") await s.panel.getByRole("button", { name: "Next" }).click();
      const next = t.steps[i + 1];
      if (next && next.page !== step.page) await tab.waitForURL((u) => u.href !== url);
    }

    await expect(status(s)).toHaveText("All done. You finished the task.");
    await expect(s.panel.locator("#guide")).toBeHidden();
    await expect(tab).toHaveURL(/\/v1\/done\.html/);
    expect(await untrusted(tab)).toEqual([]);
    // Nothing of Anchor's is left on the finished page.
    await expect(tab.locator("[data-anchor]")).toHaveCount(0);
  });
}

test("typing then pressing the button straight away moves on two steps", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  test.setTimeout(120_000);
  const t = taskSites.find((x) => x.id === "brightline");
  if (!t) throw new Error("brightline task missing");
  const base = `${fixtureOrigin}/tasks/${t.id}`;
  const tab = await context.newPage();
  await tab.goto(`${base}/${t.start}`);
  const s = await openShelf(context, sw, extensionId, tab);
  await recorded(s, t, base);
  await startTask(s, t);

  // Step 1: click "Pay my bill".
  await tab.locator("#paybill-link").click();
  await expect(s.panel.locator("#guide-progress")).toHaveText("Step 2 of 5");
  // Step 2: type the account number, tap Next.
  await tab.locator("#acct").fill("Quokka Lantern");
  await s.panel.getByRole("button", { name: "Next" }).click();
  await expect(s.panel.locator("#guide-progress")).toHaveText("Step 3 of 5");
  // Step 3: type the amount and click Continue on the page without tapping Next.
  await tab.locator("#amt").fill("73.19");
  await tab.locator("#continue-btn").click();
  await tab.waitForURL(/review\.html/);
  await expect(s.panel.locator("#guide-progress")).toHaveText("Step 5 of 5");
  expect(await progress(s)).toBe("Step 5 of 5");
});

test("a click elsewhere does not move the guide on; Stop ends it and cleans the page", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  test.setTimeout(120_000);
  const t = taskSites.find((x) => x.id === "riverbank");
  if (!t) throw new Error("riverbank task missing");
  const base = `${fixtureOrigin}/tasks/${t.id}`;
  const tab = await context.newPage();
  await tab.goto(`${base}/${t.start}`);
  const s = await openShelf(context, sw, extensionId, tab);
  await recorded(s, t, base);
  await startTask(s, t);
  await expect(s.panel.locator("#guide-progress")).toHaveText("Step 1 of 6");
  await tab.getByRole("heading", { name: "Your accounts" }).click();
  await tab.waitForTimeout(600);
  await expect(s.panel.locator("#guide-progress")).toHaveText("Step 1 of 6");

  const before = await tab.evaluate(() => document.documentElement.outerHTML.length);
  await s.panel.getByRole("button", { name: "Stop the task" }).click();
  await expect(status(s)).toHaveText("The task is stopped. You can start it again any time.");
  await expect(tab.locator("[data-anchor]")).toHaveCount(0);
  expect(await tab.evaluate(() => document.documentElement.outerHTML.length)).toBeLessThan(before);
});

test("Show original during a task leaves the page as the site sent it", async ({
  context,
  serviceWorker: sw,
  extensionId,
  fixtureOrigin,
}) => {
  test.setTimeout(120_000);
  const t = taskSites.find((x) => x.id === "carewell");
  if (!t) throw new Error("carewell task missing");
  const base = `${fixtureOrigin}/tasks/${t.id}`;
  const tab = await context.newPage();
  await tab.goto(`${base}/${t.start}`);
  const pristine = await tab.evaluate(() => document.documentElement.outerHTML);
  const s = await openShelf(context, sw, extensionId, tab);
  await recorded(s, t, base);
  const fresh = await tab.evaluate(() => document.documentElement.outerHTML);
  expect(fresh).toBe(pristine);
  await startTask(s, t);
  await expect.poll(() => ringIsOn(tab, ["#refill-link"])).toBe(true);
  await s.panel.getByRole("button", { name: "Show original" }).click();
  await expect(status(s)).toHaveText("The page is back to how the website shows it.");
  await expect(s.panel.locator("#guide")).toBeHidden();
  expect(await tab.evaluate(() => document.documentElement.outerHTML)).toBe(pristine);
});
