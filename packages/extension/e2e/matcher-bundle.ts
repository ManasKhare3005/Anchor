import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * Builds @anchor/matcher into one classic script exposing `window.AnchorMatcher`, so e2e tests can
 * run the real matcher inside real Chromium pages (with real layout), the way the content script
 * will in M2. Test-only: never shipped.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(here, "../../matcher/src/index.ts");

let cached: string | null = null;

export async function matcherBundle(): Promise<string> {
  if (cached) return cached;
  const outDir = mkdtempSync(join(tmpdir(), "anchor-matcher-"));
  await build({
    logLevel: "silent",
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry: ENTRY, name: "AnchorMatcher", formats: ["iife"], fileName: () => "matcher.js" },
    },
  });
  cached = readFileSync(join(outDir, "matcher.js"), "utf8");
  return cached;
}
