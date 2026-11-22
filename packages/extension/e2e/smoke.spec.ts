import { STRICT_CSP } from "../wxt.config.ts";
import { expect, test } from "./fixtures.ts";

/** Minimal view of the chrome.* API used inside the service worker in these tests. */
interface ChromeInWorker {
  runtime: {
    getManifest(): {
      manifest_version: number;
      permissions?: string[];
      side_panel?: { default_path?: string };
      content_security_policy?: { extension_pages?: string };
    };
  };
  sidePanel: { getPanelBehavior(): Promise<{ openPanelOnActionClick?: boolean }> };
  tabs: {
    query(q: object): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

test("service worker registers", async ({ serviceWorker }) => {
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
});

test("manifest: MV3, minimal permissions, side panel, strict CSP", async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() =>
    (globalThis as unknown as { chrome: ChromeInWorker }).chrome.runtime.getManifest(),
  );
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions?.sort()).toEqual(["sidePanel", "storage"]);
  expect(manifest.side_panel?.default_path).toBe("sidepanel.html");
  expect(manifest.content_security_policy?.extension_pages).toBe(STRICT_CSP);
});

test("toolbar icon opens the side panel", async ({ serviceWorker }) => {
  // Playwright can't click the browser toolbar; check the behavior the click relies on.
  await expect
    .poll(() =>
      serviceWorker.evaluate(async () => {
        const c = (globalThis as unknown as { chrome: ChromeInWorker }).chrome;
        return (await c.sidePanel.getPanelBehavior()).openPanelOnActionClick;
      }),
    )
    .toBe(true);
});

test("side panel renders large, labeled text", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("heading", { name: "Anchor" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Anchor can't help on this page.");
  const fontPx = await page
    .getByRole("status")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(18);
});

test("extension pages cannot reach the network (Hard Rule 6, CSP)", async ({
  context,
  extensionId,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // Require a CSP violation, not just a failed request (CORS alone would also fail it).
  const outcome = await page.evaluate(async (url) => {
    const violation = new Promise<string>((ok) =>
      document.addEventListener("securitypolicyviolation", (e) => ok(e.effectiveDirective), {
        once: true,
      }),
    );
    let reached = true;
    try {
      await fetch(url);
    } catch {
      reached = false;
    }
    const directive = await Promise.race([
      violation,
      new Promise<string>((ok) => setTimeout(() => ok("none"), 2000)),
    ]);
    return { reached, directive };
  }, `${fixtureOrigin}/pairs/001-moved/pair.json`);
  expect(outcome).toEqual({ reached: false, directive: "connect-src" });
});

test("content script runs on a fixture page and answers ping", async ({
  context,
  serviceWorker,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureOrigin}/pairs/001-moved/before.html`);
  await expect
    .poll(() =>
      serviceWorker.evaluate(async () => {
        const c = (globalThis as unknown as { chrome: ChromeInWorker }).chrome;
        const replies = await Promise.all(
          (await c.tabs.query({})).map((t) =>
            t.id === undefined
              ? null
              : c.tabs.sendMessage(t.id, { type: "anchor:ping" }).catch(() => null),
          ),
        );
        return replies.some((r) => (r as { ok?: boolean } | null)?.ok === true);
      }),
    )
    .toBe(true);
});

test("content script leaves the page DOM untouched (Hard Rule 4 groundwork)", async ({
  context,
  fixtureOrigin,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureOrigin}/pairs/001-moved/before.html`);
  await page.waitForLoadState("load");
  // Compare the live DOM with a fresh parse of the same HTML.
  const { live, pristine, anchorNodes } = await page.evaluate(async () => {
    const html = await (await fetch(location.href)).text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return {
      live: document.documentElement.outerHTML,
      pristine: parsed.documentElement.outerHTML,
      anchorNodes: document.querySelectorAll("[data-anchor]").length,
    };
  });
  expect(live).toBe(pristine);
  expect(anchorNodes).toBe(0);
});
