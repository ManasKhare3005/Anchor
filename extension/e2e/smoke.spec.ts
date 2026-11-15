import { expect, test } from "./fixtures.ts";

test("extension service worker registers", async ({ serviceWorker }) => {
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
});

test("manifest is MV3 with minimal permissions", async ({ serviceWorker }) => {
  // Runs inside the service worker, where the native `chrome` global exists.
  const manifest = await serviceWorker.evaluate(() => {
    const g = globalThis as unknown as {
      chrome: { runtime: { getManifest(): { manifest_version: number; permissions?: string[] } } };
    };
    return g.chrome.runtime.getManifest();
  });
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["storage"]);
});

test("content script injects on a fixture page without changing it", async ({
  context,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureOrigin}/pairs/001-moved/before.html`);
  await expect(page.locator("html")).toHaveAttribute("data-anchor-loaded", "true");
  // Phase 0 must not alter the page: the original button is still there, untouched.
  await expect(page.locator("#track-order")).toHaveText("Track order");
});

test("popup page renders", async ({ context, serviceWorker }) => {
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("h1")).toHaveText("Anchor");
});
