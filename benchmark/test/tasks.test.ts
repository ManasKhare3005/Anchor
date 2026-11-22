import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capture, match } from "@anchor/matcher";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs helper without type declarations
import { render } from "../../fixtures/tasks/make-tasks.mjs";

/** M3 task-flow fixtures: generated pages are current, and the ground truth points at real elements. */

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures/tasks");

interface TaskStep {
  kind: string;
  action: string;
  selector: string;
  page: string;
  expect?: string[];
  v2: string[];
  value?: string;
}
interface TaskSite {
  id: string;
  steps: TaskStep[];
}

const tasks = JSON.parse(readFileSync(join(DIR, "tasks.json"), "utf8")) as { sites: TaskSite[] };

function load(rel: string): Document {
  const html = readFileSync(join(DIR, rel), "utf8");
  return new JSDOM(html, { url: `http://localhost/tasks/${rel}` }).window.document;
}

describe("task fixtures", () => {
  it("generated pages match make-tasks.mjs", () => {
    for (const [rel, html] of Object.entries(render() as Record<string, string>)) {
      expect(readFileSync(join(DIR, rel), "utf8"), rel).toBe(html);
    }
  });

  describe.each(tasks.sites.map((s) => [s.id, s] as const))("%s", (id, site) => {
    it("every v1 selector exists on its page, and v2 selectors on the same-named v2 page", () => {
      for (const step of site.steps) {
        const v1 = load(`${id}/v1/${step.page}`);
        expect(v1.querySelector(step.selector), step.selector).not.toBeNull();
        const v2 = load(`${id}/v2/${step.page}`);
        for (const sel of step.v2) expect(v2.querySelector(sel), sel).not.toBeNull();
      }
    });

    it("v1 → v2 in jsdom: the matcher never picks a wrong element", () => {
      const tiers: string[] = [];
      for (const step of site.steps) {
        const v1 = load(`${id}/v1/${step.page}`);
        const el = v1.querySelector(step.selector);
        if (!el) throw new Error(step.selector);
        const fp = capture(el, { url: v1.URL, now: "2026-11-22T00:00:00.000Z" });
        const v2 = load(`${id}/v2/${step.page}`);
        const r = match(v2, fp);
        tiers.push(`${step.selector}:${r.tier}(${r.score.toFixed(2)}/${r.runnerUpGap.toFixed(2)})`);
        if (!r.element) continue;
        const right = step.v2.flatMap((sel) => [...v2.querySelectorAll(sel)]);
        expect(right.includes(r.element), `${id} ${step.selector} → wrong element`).toBe(true);
      }
      console.log(id, tiers.join("  "));
    });
  });
});
