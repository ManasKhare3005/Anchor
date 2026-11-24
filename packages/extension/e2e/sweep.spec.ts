import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { goto, openShelf, remember, tap, type Shelf } from "./panel.ts";

/**
 * M2 "done when": every fixture site's v1 → v2 change and every state variant, through the real
 * side panel. The helper remembers every feature on v1; then each shelf button is tapped on v2,
 * on the "moved to another page" page and on all six state pages.
 *
 * Outcomes per tap:
 * - correct: the ring is on a right answer (or on the closed menu that holds it)
 * - wrong: the ring is on anything else, or on anything when the feature is gone. Must be 0.
 * - not found: Anchor asked although the feature exists. Safe (Hard Rule 5), counted.
 * - absent: Anchor asked and the feature really is gone.
 */

const SITES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/sites");

interface Feature {
  id: string;
  label: string;
  v1: string;
  v2: { page: string; selectors: string[]; elsewhere?: { page: string; selectors: string[] } };
}
interface State {
  page: string;
  kind: string;
  expect: "normal" | "logged-out";
  features?: Record<string, string[]>;
}
interface Site {
  id: string;
  features: Feature[];
  states: State[];
}

const sites = readdirSync(SITES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => JSON.parse(readFileSync(join(SITES, d.name, "site.json"), "utf8")) as Site);

const SURE = "Here it is. It's circled on the page.";
const FAIRLY = "I think it's this one now. Please check before you click it.";
const IN_MENU = "It's inside a menu. Open the menu, and I'll show you.";
const CHANGED = "This website changed. Let's ask your helper.";
const SIGNED_OUT = "You may need to sign in first. Then tap the button again.";

type Outcome = "correct" | "wrong" | "not-found" | "absent";

/** Where the ring is, relative to the expected elements. Runs in the site page. */
async function judge(site: Page, selectors: string[]) {
  return site.evaluate((selectors) => {
    const root = document.querySelector("[data-anchor='']")?.shadowRoot;
    const ring = root?.querySelector<HTMLElement>(".ring:not(.pick)");
    if (!ring || ring.hidden) return { ring: false, on: false, dashed: false };
    const box = ring.getBoundingClientRect();
    const surrounds = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      return (
        r.width > 0 &&
        cx >= box.left &&
        cx <= box.right &&
        cy >= box.top &&
        cy <= box.bottom &&
        box.width <= r.width + 20 &&
        box.height <= r.height + 20
      );
    };
    const on = selectors.some((sel) =>
      [...document.querySelectorAll(sel)].some((el) => {
        if (surrounds(el)) return true;
        // Hidden in a closed menu: the ring is on the menu's summary.
        const summary = el.closest("details:not([open])")?.querySelector(":scope > summary");
        return summary ? surrounds(summary) : false;
      }),
    );
    return { ring: true, on, dashed: ring.classList.contains("check") };
  }, selectors);
}

interface Row {
  page: string;
  feature: string;
  outcome: Outcome;
  message: string;
}

async function check(s: Shelf, page: string, f: Feature, expected: string[], signedOut: boolean) {
  const message = await tap(s, f.label);
  const j = await judge(s.site, expected);
  let outcome: Outcome;
  if (j.ring) {
    outcome = j.on ? "correct" : "wrong";
    // The note matches the ring: solid for sure, dashed for fairly sure (Hard Rule 5).
    expect([SURE, FAIRLY, IN_MENU], `${page} ${f.id}`).toContain(message);
    if (message === SURE) expect(j.dashed, `${page} ${f.id}`).toBe(false);
    if (message === FAIRLY) expect(j.dashed, `${page} ${f.id}`).toBe(true);
  } else {
    outcome = expected.length ? "not-found" : "absent";
    expect(message, `${page} ${f.id}`).toBe(signedOut ? SIGNED_OUT : CHANGED);
  }
  return { page, feature: f.id, outcome, message };
}

for (const site of sites) {
  test(`fixture sweep: ${site.id}`, async ({
    context,
    serviceWorker: sw,
    extensionId,
    fixtureOrigin,
  }) => {
    test.setTimeout(240_000);
    const base = `${fixtureOrigin}/sites/${site.id}`;
    const tab = await context.newPage();
    await tab.goto(`${base}/v1/home.html`);
    const s = await openShelf(context, sw, extensionId, tab);
    for (const f of site.features) await remember(s, f.v1, f.label);

    const rows: Row[] = [];
    // v1 itself: everything is found where it was remembered.
    for (const f of site.features) rows.push(await check(s, "v1", f, [f.v1], false));

    // v2: redesigned.
    await goto(s, `${base}/${site.features[0]?.v2.page ?? "v2/home.html"}`);
    for (const f of site.features) rows.push(await check(s, "v2", f, f.v2.selectors, false));

    // Moved to another page: found there.
    for (const f of site.features) {
      if (!f.v2.elsewhere) continue;
      await goto(s, `${base}/${f.v2.elsewhere.page}`);
      rows.push(await check(s, "v2-elsewhere", f, f.v2.elsewhere.selectors, false));
    }

    // State variants are not redesigns.
    for (const st of site.states) {
      await goto(s, `${base}/${st.page}`);
      for (const f of site.features) {
        const expected = st.features?.[f.id] ?? (st.expect === "normal" ? [f.v1] : []);
        rows.push(await check(s, st.kind, f, expected, st.expect === "logged-out"));
      }
    }

    const summary = rows.reduce<Record<string, Record<Outcome, number>>>((acc, r) => {
      const counts = (acc[r.page] ??= { correct: 0, wrong: 0, "not-found": 0, absent: 0 });
      counts[r.outcome]++;
      return acc;
    }, {});
    console.log(site.id, JSON.stringify(summary));
    for (const r of rows.filter((r) => r.outcome === "not-found")) {
      console.log(`  not found (asked, safe): ${r.page} ${r.feature}`);
    }

    // Never a wrong element, anywhere.
    expect(rows.filter((r) => r.outcome === "wrong")).toEqual([]);
    // v1 and every non-redesign state: every present feature is found.
    const mustFind = rows.filter(
      (r) => r.page !== "v2" && r.page !== "v2-elsewhere" && r.outcome === "not-found",
    );
    expect(mustFind).toEqual([]);
  });
}
