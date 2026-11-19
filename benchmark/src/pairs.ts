import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PairSchema, type Pair } from "./schema.ts";

export const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/pairs",
);

export interface LoadedPair {
  dir: string;
  pair: Pair;
  beforeHtml: string;
  afterHtml: string;
}

export function listPairDirs(root = FIXTURES_DIR): string[] {
  return readdirSync(root)
    .filter((name) => !name.startsWith("_") && statSync(join(root, name)).isDirectory())
    .sort()
    .map((name) => join(root, name));
}

export function loadPair(dir: string): LoadedPair {
  const raw: unknown = JSON.parse(readFileSync(join(dir, "pair.json"), "utf8"));
  const pair = PairSchema.parse(raw);
  return {
    dir,
    pair,
    beforeHtml: readFileSync(join(dir, "before.html"), "utf8"),
    afterHtml: readFileSync(join(dir, "after.html"), "utf8"),
  };
}

/**
 * Anchor's own markers (data-anchor-*) must never appear in fixture HTML: they could leak the
 * answer into matching. The extractor also ignores them, so this is belt and braces.
 */
export function findLeaks(html: string): string[] {
  return [...html.matchAll(/\sdata-anchor[\w-]*\s*=/gi)].map((m) => m[0].trim());
}
