import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect } from "./fixtures.ts";
import { tabIdOf } from "./helpers.ts";

/**
 * Drives the real side panel. Playwright can't open the browser's side panel, so the panel page
 * is opened as a normal page pinned to the site's tab with `?tab=<id>`.
 */
export interface Shelf {
  panel: Page;
  site: Page;
  tabId: number;
}

export async function openShelf(
  context: BrowserContext,
  sw: Worker,
  extensionId: string,
  site: Page,
): Promise<Shelf> {
  const tabId = await tabIdOf(site, sw);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await expect(panel.getByRole("status")).not.toHaveText("Anchor is getting ready.");
  return { panel, site, tabId };
}

export function status(s: Shelf) {
  return s.panel.getByRole("status");
}

export async function openHelper(s: Shelf): Promise<void> {
  const helper = s.panel.locator("#helper");
  if (!(await helper.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await s.panel.getByText("For helpers").click();
  }
}

/** The helper remembers the element at `selector` under `name` (or the suggested name). */
export async function remember(s: Shelf, selector: string, name?: string): Promise<void> {
  await openHelper(s);
  await s.panel.getByRole("button", { name: "Remember a button" }).click();
  await expect(status(s)).toHaveText("Now click the button on the page.");
  await s.site.locator(selector).first().click();
  const field = s.panel.getByLabel("What should this button be called?");
  await expect(field).toBeVisible();
  if (name !== undefined) await field.fill(name);
  const before = await shelfNames(s);
  await s.panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(s)).toHaveText("Saved.");
  await expect.poll(async () => (await shelfNames(s)).length).toBe(before.length + 1);
}

export async function shelfNames(s: Shelf): Promise<string[]> {
  return s.panel.locator("#shelf .shelf-button").allTextContents();
}

export async function tap(s: Shelf, name: string): Promise<string> {
  await s.panel.locator("#shelf").getByRole("button", { name, exact: true }).click();
  await expect(status(s)).not.toHaveText("Looking…");
  return (await status(s).textContent()) ?? "";
}

/** Ring drawn by Anchor on the site page, or null. Reads the open shadow root. */
export async function ring(site: Page) {
  return site.evaluate(() => {
    const root = document.querySelector("[data-anchor]")?.shadowRoot;
    const el = root?.querySelector<HTMLElement>(".ring:not(.pick)");
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      dashed: el.classList.contains("check"),
    };
  });
}

/** True when the ring surrounds the first element matching any selector. */
export async function ringIsOn(site: Page, selectors: string[]): Promise<boolean> {
  const box = await ring(site);
  if (!box) return false;
  return site.evaluate(
    ({ selectors, box }) =>
      selectors.some((sel) =>
        [...document.querySelectorAll(sel)].some((el) => {
          const r = el.getBoundingClientRect();
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          return (
            r.width > 0 &&
            cx >= box.left &&
            cx <= box.right &&
            cy >= box.top &&
            cy <= box.bottom &&
            box.right - box.left <= r.width + 20 &&
            box.bottom - box.top <= r.height + 20
          );
        }),
      ),
    { selectors, box },
  );
}

/** Navigate the site tab and wait until the shelf has refreshed for the new page. */
export async function goto(s: Shelf, url: string): Promise<void> {
  await s.panel.evaluate(() => {
    const el = document.getElementById("status");
    if (el) el.textContent = "";
  });
  await s.site.goto(url);
  await expect(status(s)).toHaveText(/^(Tap a button|No buttons|Anchor can't)/);
}
