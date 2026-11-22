import { expect, test } from "./fixtures.ts";
import { goto, openShelf, ring, ringIsOn, status } from "./panel.ts";
import { act, recordTask, taskSites, untrusted } from "./tasks.ts";

/**
 * M3 task 6: detours. While a task is guided, the site opens a dialog that is not part of the task.
 * Anchor names it in plain words and waits: the ring steps aside, and the dialog stays exactly as
 * the site showed it until the person answers it (Hard Rules 1 and 2). Then the guide resumes.
 */

const THEN = "Answer it the way you want. Then I'll show you the next step.";

const DETOURS = [
  { kind: "cookie", words: "The website is asking about cookies.", answer: "Reject all" },
  { kind: "survey", words: "The website is asking for your opinion.", answer: "No thanks" },
  {
    kind: "session",
    words: "The website says you will be signed out soon.",
    answer: "Stay signed in",
  },
  {
    kind: "details",
    words: "The website is asking you to check your details.",
    answer: "Remind me later",
  },
] as const;

for (const t of taskSites) {
  test(`detours on ${t.id}: named, waited for, never dismissed`, async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    test.setTimeout(150_000);
    const base = `${fixtureOrigin}/tasks/${t.id}`;
    const tab = await context.newPage();
    await tab.goto(`${base}/${t.start}`);
    const s = await openShelf(context, sw, extensionId, tab);
    await recordTask(s, t, t.task);
    await goto(s, `${base}/${t.start}`);
    await s.panel.locator("#tasks").getByRole("button", { name: t.task }).click();

    // The first steps as usual, up to the page where the detours will appear.
    for (const step of t.steps.slice(0, t.detourStep)) {
      const url = tab.url();
      await act(tab, step);
      if (step.action === "fill") await s.panel.getByRole("button", { name: "Next" }).click();
      if (step.page !== t.detourPage.split("/").pop()) await tab.waitForURL((u) => u.href !== url);
    }
    const step = t.steps[t.detourStep];
    if (!step) throw new Error("no detour step");
    const n = `Step ${t.detourStep + 1} of ${t.steps.length}`;

    for (const d of DETOURS) {
      // The site opens its dialog a moment after the page loads.
      await tab.goto(`${base}/${t.detourPage}?detour=${d.kind}`);
      await expect(s.panel.locator("#guide-progress")).toHaveText(n);
      await expect(status(s)).toHaveText(`${d.words} ${THEN}`);
      // The ring steps aside while the dialog is open.
      await expect.poll(() => ring(tab)).toBeNull();
      // Anchor never closes, hides or answers it: still there, still visible, a while later.
      const dialog = tab.locator("#detour");
      const style = await dialog.getAttribute("style");
      await tab.waitForTimeout(800);
      await expect(dialog).toBeVisible();
      expect(await dialog.getAttribute("style")).toBe(style);
      expect(await untrusted(tab)).toEqual([]);
      // No help note: nothing is wrong with the task.
      await expect(s.panel.locator("#note")).toBeHidden();

      // The person answers the dialog themselves. The guide comes back to the step.
      await dialog.getByRole("button", { name: d.answer }).click();
      await expect(dialog).toHaveCount(0);
      const instruction = (await s.panel.locator("#guide-text").textContent()) ?? "";
      await expect(status(s)).toHaveText(instruction);
      await expect.poll(() => ringIsOn(tab, step.expect ?? [step.selector])).toBe(true);
    }
  });
}
