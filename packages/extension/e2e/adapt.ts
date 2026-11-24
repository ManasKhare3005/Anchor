import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Worker } from "@playwright/test";
import { expect } from "./fixtures.ts";
import type { ChromeApi } from "./helpers.ts";

/** Helpers for the M4 Adapt tests. */

export interface Settings {
  text: "normal" | "larger" | "largest";
  targets: boolean;
  calm: boolean;
}

export const ALL_ON: Settings = { text: "largest", targets: true, calm: true };
export const ALL_OFF: Settings = { text: "normal", targets: false, calm: false };

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

export const adaptTruth = JSON.parse(readFileSync(join(FIXTURES, "adapt/adapt.json"), "utf8")) as {
  page: string;
  facts: string[];
  clutter: string[];
  stays: string[];
  lowContrast: string[];
  unknownBackground: string;
  smallTargets: string[];
  checkbox: string;
  animated: string;
  transition: string;
};

/** Every fixture page, as a path under the fixture server. */
export function allFixturePages(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html")) out.push(relative(FIXTURES, p).replaceAll("\\", "/"));
    }
  };
  walk(FIXTURES);
  return out;
}

/** Write the setup answers straight into storage, as the writer would (null: not answered). */
export async function setAdapt(sw: Worker, settings: Settings | null): Promise<void> {
  await sw.evaluate(async (settings) => {
    const c = (
      globalThis as unknown as {
        chrome: ChromeApi & { storage: { local: { set(i: object): Promise<void> } } };
      }
    ).chrome;
    const got = await c.storage.local.get("anchor");
    const cur = (got.anchor as Record<string, unknown> | undefined) ?? {
      schemaVersion: 3,
      buttons: [],
      routes: [],
      adapt: null,
    };
    await c.storage.local.set({ anchor: { ...cur, adapt: settings } });
  }, settings);
}

/** Adapt's stylesheet is on the page (or gone). */
export async function adaptStyled(site: Page, on = true): Promise<void> {
  await expect(site.locator("style[data-anchor='adapt']")).toHaveCount(on ? 1 : 0);
}

export interface FactSnap {
  key: number;
  text: string;
  visible: boolean;
}

/**
 * Facts on the page (Hard Rule 2), found by the test's own rules rather than Anchor's: anything
 * with its own text holding a digit, legal or warning words, and every alert, dialog, live region
 * and marked amount, date or legal block. Keyed by position among body's elements (Adapt never
 * adds to or reorders body).
 */
export async function facts(site: Page): Promise<FactSnap[]> {
  return site.evaluate(() => {
    const WORDS =
      /\d|©|terms|privacy|polic|legal|insured|fdic|lender|cookie|consent|session|signed out|sign out|expire|warning|alert|security/i;
    const MARKED =
      ".amount, .asof, .legal, [role='alert'], [role='alertdialog'], [role='dialog'], [role='status'], dialog, [aria-live]";
    const all = [...document.body.querySelectorAll("*")];
    const own = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ");
    const out: { key: number; text: string; visible: boolean }[] = [];
    all.forEach((el, key) => {
      if (el.closest("[data-anchor]") || el.closest("script, style")) return;
      if (!el.matches(MARKED) && !WORDS.test(own(el))) return;
      const ok = (el as Element & { checkVisibility(o: object): boolean }).checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      });
      out.push({
        key,
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        visible: ok && el.getClientRects().length > 0,
      });
    });
    return out;
  });
}

export async function pristineHtml(site: Page): Promise<string> {
  return site.evaluate(() => document.documentElement.outerHTML);
}
