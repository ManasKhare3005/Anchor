import { JSDOM } from "jsdom";
import {
  capture,
  indexPage,
  match,
  type Fingerprint,
  type MatchOptions,
  type PageIndex,
  type Tier,
} from "@anchor/matcher";
import { findLeaks } from "./pairs.ts";
import { FixtureError, type Outcome } from "./run.ts";
import { expectedOnState, listSiteDirs, loadSite, type LoadedSite } from "./sites.ts";

export interface SiteRow {
  site: string;
  category: string;
  feature: string;
  /** "v2", "v2-elsewhere", or a state kind. */
  scenario: string;
  expected: "present" | "absent";
  tier: Tier;
  score: number;
  gap: number;
  outcome: Outcome;
  got: string | null;
  /** Whether a nav/menu hint was expected here, and whether the matcher's hint hit one. */
  hintExpected: boolean;
  hintHit: boolean;
  /** Text of whatever hint the matcher gave (null if none). */
  hint: string | null;
  /** The hint is itself one of the expected elements (e.g. the right link, inside a closed menu). */
  hintIsTarget: boolean;
  reasons: string[];
}

const NOW = "2026-01-01T00:00:00.000Z";
const urlFor = (site: string, page: string) => `http://localhost/sites/${site}/${page}`;

function parse(html: string, url: string): Document {
  return new JSDOM(html, { url }).window.document;
}

function resolveAll(doc: Document, selectors: string[], where: string): Element[] {
  return selectors.map((s) => {
    const found = doc.querySelectorAll(s);
    if (found.length !== 1) {
      throw new FixtureError(`${where}: "${s}" matched ${found.length} elements, expected 1`);
    }
    return found[0] as Element;
  });
}

function judge(expected: Element[], got: Element | null): Outcome {
  if (!expected.length) return got === null ? "correct-absent" : "wrong";
  if (got === null) return "not-found";
  return expected.includes(got) ? "correct" : "wrong";
}

const text = (el: Element | null) =>
  el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() || `<${el.tagName.toLowerCase()}>` : null;

export function runSite(loaded: LoadedSite, opts: MatchOptions = {}): SiteRow[] {
  const { site } = loaded;
  const pages = new Map<string, { doc: Document; index: PageIndex }>();
  const page = (p: string) => {
    let entry = pages.get(p);
    if (!entry) {
      const html = loaded.read(p);
      const leaks = findLeaks(html);
      if (leaks.length)
        throw new FixtureError(`${site.id}/${p}: Anchor markers ${leaks.join(", ")}`);
      const doc = parse(html, urlFor(site.id, p));
      entry = { doc, index: indexPage(doc) };
      pages.set(p, entry);
    }
    return entry;
  };

  const rows: SiteRow[] = [];
  const home = page(site.home);

  for (const feature of site.features) {
    const [el] = resolveAll(home.doc, [feature.v1], `${site.id}/${site.home}`);
    const fp: Fingerprint = capture(el as Element, {
      url: urlFor(site.id, site.home),
      now: NOW,
      id: `${site.id}:${feature.id}`,
    });

    const run = (scenario: string, p: string, selectors: string[], hint: string[] = []) => {
      const target = page(p);
      const expected = resolveAll(target.doc, selectors, `${site.id}/${p}`);
      const hints = resolveAll(target.doc, hint, `${site.id}/${p} (hint)`);
      const r = match(target.index, fp, opts);
      rows.push({
        site: site.id,
        category: site.category,
        feature: feature.id,
        scenario,
        expected: expected.length ? "present" : "absent",
        tier: r.tier,
        score: r.score,
        gap: r.runnerUpGap,
        outcome: judge(expected, r.element),
        got: text(r.element),
        hintExpected: hints.length > 0,
        hintHit: r.menuHint !== null && hints.includes(r.menuHint),
        hint: text(r.menuHint),
        hintIsTarget: r.menuHint !== null && expected.includes(r.menuHint),
        reasons: r.reasons,
      });
    };

    run("v2", feature.v2.page, feature.v2.selectors, feature.v2.hint);
    if (feature.v2.elsewhere) {
      run("v2-elsewhere", feature.v2.elsewhere.page, feature.v2.elsewhere.selectors);
    }
    for (const state of site.states) {
      run(state.kind, state.page, expectedOnState(feature, state));
    }
  }
  return rows;
}

export function runAllSites(dirs = listSiteDirs(), opts: MatchOptions = {}): SiteRow[] {
  return dirs.flatMap((d) => runSite(loadSite(d), opts));
}
