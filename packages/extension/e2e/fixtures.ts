import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext, type Worker } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = resolve(here, "../.output/chrome-mv3");
const FIXTURES_DIR = resolve(here, "../../../fixtures");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".js": "text/javascript",
};

/** Tiny static server for fixture pages on localhost (the only origin the content script runs on). */
function serveFixtures(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = normalize(join(FIXTURES_DIR, urlPath));
    if (!file.startsWith(FIXTURES_DIR + sep)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file)
      .then((body) => {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      })
      .catch(() => res.writeHead(404).end());
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      ok({ server, origin: `http://localhost:${port}` });
    }),
  );
}

interface Fixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  fixtureOrigin: string;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      // Default: Playwright's bundled Chromium. Set ANCHOR_E2E_CHANNEL=msedge to try Edge.
      channel: process.env.ANCHOR_E2E_CHANNEL ?? "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
  // eslint-disable-next-line no-empty-pattern
  fixtureOrigin: async ({}, use) => {
    const { server, origin } = await serveFixtures();
    await use(origin);
    // The browser holds keep-alive sockets open; drop them or close() waits forever.
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  },
});

export const expect = test.expect;
