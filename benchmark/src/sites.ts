import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Fixture sites (bank, pharmacy, utility): v1, redesigned v2, and non-redesign states. */

export const SITES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures/sites");

const Selectors = z.array(z.string().min(1));

const FeatureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Selector of the remembered element on v1/home.html. */
  v1: z.string().min(1),
  change: z.array(z.string()).min(1),
  v2: z.object({
    page: z.string(),
    /** Any of these is a correct answer on `page`. Empty = not on this page. */
    selectors: Selectors,
    /** Feature moved to another page. */
    elsewhere: z.object({ page: z.string(), selectors: Selectors.min(1) }).optional(),
    /** Nav/menu link on `page` that leads to the feature's new page. */
    hint: Selectors.optional(),
  }),
});

const StateSchema = z.object({
  page: z.string(),
  kind: z.enum([
    "logged-out",
    "sale-banner",
    "cookie-popup",
    "survey-modal",
    "ab-variant",
    "session-timeout",
  ]),
  /** Expected site classification. */
  expect: z.enum(["normal", "logged-out"]),
  /**
   * Per-feature expected selectors on this page. Features not listed: for "normal" states the v1
   * selector still applies (states are v1 plus overlays); for "logged-out" they are absent.
   */
  features: z.record(z.string(), Selectors).optional(),
});

export const SiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  home: z.string(),
  features: z.array(FeatureSchema).min(1),
  states: z.array(StateSchema),
  /** Fact nodes (prices, dates, legal text) per page, for Hard Rule 2 tests in M4. */
  facts: z.record(z.string(), Selectors),
});

export type Site = z.infer<typeof SiteSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type SiteState = z.infer<typeof StateSchema>;

export interface LoadedSite {
  dir: string;
  site: Site;
  read(page: string): string;
}

export function listSiteDirs(root = SITES_DIR): string[] {
  return readdirSync(root)
    .filter((n) => !n.startsWith("_") && statSync(join(root, n)).isDirectory())
    .sort()
    .map((n) => join(root, n));
}

export function loadSite(dir: string): LoadedSite {
  const site = SiteSchema.parse(JSON.parse(readFileSync(join(dir, "site.json"), "utf8")));
  return { dir, site, read: (page) => readFileSync(join(dir, page), "utf8") };
}

/** Expected selectors for a feature on a state page. */
export function expectedOnState(feature: Feature, state: SiteState): string[] {
  const listed = state.features?.[feature.id];
  if (listed) return listed;
  return state.expect === "normal" ? [feature.v1] : [];
}
