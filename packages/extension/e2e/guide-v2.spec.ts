import { expect, test } from "./fixtures.ts";
import { goto, openShelf, ring, ringIsOn, status, type Shelf } from "./panel.ts";
import { act, recordTask, taskSites, untrusted } from "./tasks.ts";

/**
 * M3 task 5: self-repair. A task recorded on v1 is guided on the redesigned v2. Each step is found
 * again by the matcher. A step Anchor can't find confidently gets no ring (Hard Rule 5); the guide
 * pauses with a help note naming the task and step. Never a ring on a wrong element.
 *
 * The test plays the person: they do each step on the right element, opening a menu when told to.
 * When a step is lost, the helper shows them where it is and they tap Next.
 */

const LOST = "This step changed. Let's ask your helper.";
const IN_MENU = "It's inside a menu. Open the menu, and I'll show you.";
const FAIRLY = "I think it's this one now. Please check before you click it.";

type Outcome = "found" | "wrong" | "not-found" | "absent";

async function settled(s: Shelf, i: number, n: number): Promise<string> {
  await expect(s.panel.locator("#guide-progress")).toHaveText(`Step ${i + 1} of ${n}`);
  await expect(status(s)).not.toHaveText("Looking…");
  return (await status(s).textContent()) ?? "";
}

for (const t of taskSites) {
  test(`self-repair: "${t.task}" recorded on ${t.id} v1, guided on v2`, async ({
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
    await goto(s, `${base}/${t.v2start}`);
    await s.panel.locator("#tasks").getByRole("button", { name: t.task }).click();

    const outcomes: Outcome[] = [];
    for (const [i, step] of t.steps.entries()) {
      let message = await settled(s, i, t.steps.length);
      const instruction = (await s.panel.locator("#guide-text").textContent()) ?? "";
      if (message === IN_MENU) {
        // The person opens the menu the ring is on; the ring moves to the step inside it.
        await tab.locator("details:not([open]) > summary").first().click();
        await expect.poll(() => ringIsOn(tab, step.v2)).toBe(true);
        // The panel follows: now it says the step itself.
        await expect(status(s)).not.toHaveText(IN_MENU);
        message = (await status(s).textContent()) ?? "";
      }
      const box = await ring(tab);
      if (box) {
        const right = await ringIsOn(tab, step.v2);
        outcomes.push(right ? "found" : "wrong");
        expect(right, `${t.id} step ${i + 1}: ring on a wrong element`).toBe(true);
        expect([instruction, `${instruction} ${FAIRLY}`]).toContain(message);
        // Dashed ring and "please check" go together (Hard Rule 5).
        expect(box.dashed).toBe(message.endsWith(FAIRLY));
      } else {
        expect(message).toBe(LOST);
        const note = (await s.panel.locator("#note-text").textContent()) ?? "";
        expect(note).toContain(`step ${i + 1} `);
        expect(note).toContain(`"${t.task}"`);
        outcomes.push(step.v2.length ? "not-found" : "absent");
        if (!step.v2.length) break; // The step is gone from the site: the task can't go on.
      }

      const sel = step.v2[0] ?? step.selector;
      const url = tab.url();
      await act(tab, step, sel);
      const lost = !box;
      const next = t.steps[i + 1];
      const moves = next !== undefined && next.page !== step.page;
      if (lost && moves) {
        // The person did a lost step themselves and the next page loaded. The lost step is not on
        // this page: nothing may be circled for it (it once matched "Confirm and pay" here).
        await tab.waitForURL((u) => u.href !== url);
        await settled(s, i, t.steps.length);
        expect(await ring(tab), `${t.id} step ${i + 1} circled on the next page`).toBeNull();
      }
      if (step.action === "fill" || lost) {
        await s.panel.getByRole("button", { name: "Next" }).click();
      }
      if (moves && !lost) await tab.waitForURL((u) => u.href !== url);
    }

    console.log(t.id, outcomes.join(" "));
    expect(outcomes.filter((o) => o === "wrong")).toEqual([]);
    expect(await untrusted(tab)).toEqual([]);
  });
}
