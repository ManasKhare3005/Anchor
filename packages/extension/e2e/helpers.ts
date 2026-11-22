import type { Page, Worker } from "@playwright/test";

/** Minimal view of chrome.* inside extension pages and the service worker, for tests. */
export interface ChromeApi {
  tabs: {
    query(q: object): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  runtime: {
    onMessage: { addListener(fn: (m: unknown) => void): void };
    sendMessage(message: unknown): Promise<unknown>;
  };
  storage: { local: { get(k: string): Promise<Record<string, unknown>> } };
}

/** Tab id of a page: bring it to the front and ask which tab is active. */
export async function tabIdOf(page: Page, sw: Worker): Promise<number> {
  await page.bringToFront();
  const id = await sw.evaluate(async () => {
    const c = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    const [tab] = await c.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  if (id < 0) throw new Error("no active tab");
  return id;
}

/** Send a message to a tab's content script, retrying until the script is listening. */
export async function sendToTab(sw: Worker, tabId: number, message: unknown): Promise<unknown> {
  return sw.evaluate(
    async ({ tabId, message }) => {
      const c = (globalThis as unknown as { chrome: ChromeApi }).chrome;
      for (let i = 0; i < 50; i++) {
        try {
          return await c.tabs.sendMessage(tabId, message);
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw new Error("content script never answered");
    },
    { tabId, message },
  );
}

/** Start collecting runtime messages in the service worker (content → extension events). */
export async function collectEvents(sw: Worker): Promise<void> {
  await sw.evaluate(() => {
    const g = globalThis as unknown as { anchorEvents?: unknown[]; chrome: ChromeApi };
    if (g.anchorEvents) return;
    g.anchorEvents = [];
    g.chrome.runtime.onMessage.addListener((m) => {
      g.anchorEvents?.push(m);
    });
  });
}

export async function events(sw: Worker): Promise<{ type: string; fingerprint?: unknown }[]> {
  return sw.evaluate(
    () => (globalThis as unknown as { anchorEvents?: { type: string }[] }).anchorEvents ?? [],
  );
}

export async function siteHits(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { hits: string[] }).hits);
}

export async function anchorNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("[data-anchor]").length);
}
