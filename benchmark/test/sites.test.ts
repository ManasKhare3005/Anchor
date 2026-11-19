import { basename } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs helper without type declarations
import { renderStates, v1HomeOf } from "../../fixtures/sites/make-states.mjs";
import { findLeaks } from "../src/pairs.ts";
import { runAllSites, runSite } from "../src/run-sites.ts";
import { listSiteDirs, loadSite } from "../src/sites.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const dirs = listSiteDirs();

describe("fixture sites", () => {
  it("has the bank, pharmacy and utility sites", () => {
    expect(dirs.map((d) => basename(d))).toEqual(["brightline", "carewell", "riverbank"]);
  });

  describe.each(dirs.map((d) => [basename(d), d] as const))("%s", (name, dir) => {
    const loaded = loadSite(dir);

    it("has a valid site.json whose id matches the folder", () => {
      expect(loaded.site.id).toBe(name);
    });

    it("covers every required change kind and state", () => {
      const changes = new Set(loaded.site.features.flatMap((f) => f.change));
      for (const c of ["renamed", "removed", "decoy", "into-menu"]) {
        expect(changes.has(c), `${name} lacks ${c}`).toBe(true);
      }
      expect(loaded.site.states.map((s) => s.kind).sort()).toEqual([
        "ab-variant",
        "cookie-popup",
        "logged-out",
        "sale-banner",
        "session-timeout",
        "survey-modal",
      ]);
    });

    it("has generated state pages that are up to date", () => {
      const fresh = renderStates(name, v1HomeOf(name)) as Record<string, string>;
      for (const [kind, html] of Object.entries(fresh)) {
        expect(readFileSync(join(dir, "states", `${kind}.html`), "utf8"), kind).toBe(html);
      }
    });

    it("lists fact nodes that exist", () => {
      for (const [page, selectors] of Object.entries(loaded.site.facts)) {
        const doc = new JSDOM(loaded.read(page)).window.document;
        for (const s of selectors) expect(doc.querySelector(s), `${page} ${s}`).not.toBeNull();
      }
    });

    it("has no Anchor markers in any page and every selector resolves exactly once", () => {
      expect(() => runSite(loaded)).not.toThrow();
      for (const page of ["v1/home.html", "v2/home.html"]) {
        expect(findLeaks(loaded.read(page))).toEqual([]);
      }
    });
  });

  it("covers moves into menus, moves to other pages and decoys across the sites", () => {
    const all = new Set(dirs.flatMap((d) => loadSite(d).site.features.flatMap((f) => f.change)));
    for (const c of ["into-menu", "other-page", "decoy", "removed", "restyled", "moved"]) {
      expect(all.has(c), c).toBe(true);
    }
  });
});

describe("fixture sites with the current matcher", () => {
  const rows = runAllSites();

  it("runs every feature × scenario", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("records every wrong match (none allowed at 'sure')", () => {
    const wrongSure = rows.filter((r) => r.outcome === "wrong" && r.tier === "sure");
    expect(wrongSure.map((r) => `${r.site}/${r.feature}/${r.scenario} → ${r.got}`)).toEqual([]);
  });
});
