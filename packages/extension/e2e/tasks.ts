import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Worker } from "@playwright/test";
import { expect } from "./fixtures.ts";
import type { ChromeApi } from "./helpers.ts";
import { openHelper, status, type Shelf } from "./panel.ts";

/** Ground truth and person-like actions for the M3 task-flow fixtures (fixtures/tasks). */

export interface TaskStep {
  kind: "click" | "your-turn";
  action: "click" | "fill" | "select" | "check";
  selector: string;
  page: string;
  value?: string;
  expect?: string[];
  v2: string[];
}

export interface TaskSite {
  id: string;
  task: string;
  start: string;
  v2start: string;
  steps: TaskStep[];
  detourPage: string;
  detourStep: number;
}

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/tasks");

export const taskSites = (
  JSON.parse(readFileSync(resolve(DIR, "tasks.json"), "utf8")) as { sites: TaskSite[] }
).sites;

/** Every marker string typed during the tests. None may ever reach Anchor's storage. */
export const typedValues = taskSites.flatMap((s) => s.steps.flatMap((st) => st.value ?? []));

/** Do one step the way a person would, on whatever element `selector` names. */
export async function act(site: Page, step: TaskStep, selector = step.selector): Promise<void> {
  const el = site.locator(selector).first();
  switch (step.action) {
    case "click":
      await el.click();
      break;
    case "fill":
      await el.fill(step.value ?? "");
      break;
    case "select":
      await el.selectOption({ label: step.value ?? "" });
      break;
    case "check":
      await el.check();
      break;
  }
}

/** Anchor's recording banner is on the page (the content script for this page load is armed). */
export async function recorderArmed(site: Page): Promise<void> {
  await expect
    .poll(() =>
      site.evaluate(
        () =>
          document
            .querySelector("[data-anchor]")
            ?.shadowRoot?.querySelector(".banner")
            ?.textContent?.includes("writing down") ?? false,
      ),
    )
    .toBe(true);
}

export async function recordedCount(s: Shelf): Promise<number> {
  return s.panel.locator("#recorded li").count();
}

/** Record the fixture task on v1 through the real panel, doing each step like a person. */
export async function recordTask(s: Shelf, t: TaskSite, name: string): Promise<void> {
  await openHelper(s);
  await s.panel.getByRole("button", { name: "Record a task" }).click();
  await expect(status(s)).toHaveText(/writes down each step/);
  for (const [i, step] of t.steps.entries()) {
    await recorderArmed(s.site);
    const url = s.site.url();
    await act(s.site, step);
    await expect.poll(() => recordedCount(s)).toBe(i + 1);
    const next = t.steps[i + 1];
    if (next && next.page !== step.page) await s.site.waitForURL((u) => u.href !== url);
  }
  await s.panel.getByRole("button", { name: "Finish" }).click();
  await s.panel.getByLabel("What is this task called?").fill(name);
  await s.panel.getByRole("button", { name: "Save task" }).click();
  await expect(status(s)).toHaveText("Task saved.");
}

/** Everything Anchor has stored, as one JSON string. */
export async function storedJson(sw: Worker): Promise<string> {
  return sw.evaluate(async () => {
    const c = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    return JSON.stringify(await c.storage.local.get(null as unknown as string));
  });
}

/** Events the site saw that no person made (Hard Rule 1: must stay empty). */
export async function untrusted(site: Page): Promise<string[]> {
  return site.evaluate(() => (window as unknown as { untrusted: string[] }).untrusted);
}
