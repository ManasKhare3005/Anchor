import { readFileSync } from "node:fs";
import { capture, indexPage, match, type MatchOptions, type PageIndex } from "@anchor/matcher";
import type { BenchRow } from "../bench.ts";
import { allLabels, type SiteLabels } from "./labels.ts";
import { parseArchived } from "./propose.ts";
import { cachePath } from "./wayback.ts";

/**
 * Real-site rows for the benchmark: capture each labeled feature on the archived "before" page and
 * look for it on the "after" page. Pages are parsed once and cached in memory across runs.
 */

const pageCache = new Map<string, { doc: Document; index: PageIndex }>();

function page(site: SiteLabels, ts: string) {
  const key = `${site.site}/${ts}`;
  let entry = pageCache.get(key);
  if (!entry) {
    const doc = parseArchived(readFileSync(cachePath(site.site, ts), "utf8"), site.url);
    entry = { doc, index: indexPage(doc) };
    pageCache.set(key, entry);
  }
  return entry;
}

function pick(doc: Document, selectors: string[]): Element[] {
  return selectors.flatMap((s) => {
    const el = doc.querySelector(s);
    return el ? [el] : [];
  });
}

const text = (el: Element | null) =>
  el
    ? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) ||
      `<${el.tagName.toLowerCase()}>`
    : null;

export function realRows(
  opts: MatchOptions = {},
  which: "confirmed" | "proposed+confirmed" = "confirmed",
): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const site of allLabels()) {
    const before = page(site, site.before);
    const after = page(site, site.after);
    for (const f of site.features) {
      if (f.status === "rejected" || !f.before) continue;
      if (which === "confirmed" && f.status !== "confirmed") continue;
      const el = before.doc.querySelector(f.before.selector);
      if (!el) continue;
      const fp = capture(el, {
        url: site.url,
        now: "2026-01-01T00:00:00.000Z",
        id: `${site.site}:${f.id}`,
      });
      const expected = f.after ? pick(after.doc, [f.after.selector, ...f.after.alternates]) : [];
      const r = match(after.index, fp, opts);
      const outcome = !expected.length
        ? r.element === null
          ? "correct-absent"
          : "wrong"
        : r.element === null
          ? "not-found"
          : expected.includes(r.element)
            ? "correct"
            : "wrong";
      rows.push({
        source: "real-sites",
        site: site.site,
        category: site.category,
        feature: f.id,
        scenario: f.status === "confirmed" ? "real" : "real (unconfirmed)",
        expected: expected.length ? "present" : "absent",
        tier: r.tier,
        score: r.score,
        gap: r.runnerUpGap,
        outcome,
        topCorrect: r.ranked[0] !== undefined && expected.includes(r.ranked[0].element),
        got: text(r.element),
        reasons: r.reasons,
        hintExpected: false,
        hintHit: false,
        hint: text(r.menuHint),
        hintIsTarget: r.menuHint !== null && expected.includes(r.menuHint),
      });
    }
  }
  return rows;
}
