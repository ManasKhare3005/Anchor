import { JSDOM } from "jsdom";
import { capture, indexPage, match, type MatchOptions, type Tier } from "@anchor/matcher";
import { findLeaks, listPairDirs, loadPair, type LoadedPair } from "./pairs.ts";

/**
 * Outcome of one remembered feature (CLAUDE.md § M1 report: correct / wrong / not found, per tier).
 *
 * - correct: matcher pointed at the right element ("sure" or "fairly")
 * - correct-absent: feature was removed and the matcher said "unsure" (nothing pointed at)
 * - not-found: feature exists, matcher said "unsure" (safe: Anchor asks)
 * - wrong: matcher pointed at the wrong element, or at anything when the feature was removed.
 *   The worst outcome.
 */
export type Outcome = "correct" | "correct-absent" | "not-found" | "wrong";

export interface ResultRow {
  pair: string;
  target: string;
  expected: "present" | "removed";
  tier: Tier;
  score: number;
  gap: number;
  outcome: Outcome;
  /** Text of the element the matcher pointed at, for the report. */
  got: string | null;
  reasons: string[];
}

export class FixtureError extends Error {}

const FIXTURE_URL = "http://localhost/";
const NOW = "2026-01-01T00:00:00.000Z";

function parse(html: string): Document {
  return new JSDOM(html, { url: FIXTURE_URL }).window.document;
}

function single(doc: Document, selector: string, where: string): Element {
  const found = doc.querySelectorAll(selector);
  if (found.length !== 1) {
    throw new FixtureError(
      `${where}: selector "${selector}" matched ${found.length} elements, expected 1`,
    );
  }
  return found[0] as Element;
}

export function classify(expected: Element | null, got: Element | null): Outcome {
  if (expected === null) return got === null ? "correct-absent" : "wrong";
  if (got === null) return "not-found";
  return got === expected ? "correct" : "wrong";
}

export function runPair(loaded: LoadedPair, opts: MatchOptions = {}): ResultRow[] {
  const { pair } = loaded;
  const pages: [string, string][] = [
    ["before.html", loaded.beforeHtml],
    ["after.html", loaded.afterHtml],
  ];
  for (const [file, html] of pages) {
    const leaks = findLeaks(html);
    if (leaks.length) {
      throw new FixtureError(`${pair.id}/${file}: contains Anchor markers ${leaks.join(", ")}`);
    }
  }
  const before = parse(loaded.beforeHtml);
  const after = parse(loaded.afterHtml);
  const afterIndex = indexPage(after);

  return pair.targets.map((t, i) => {
    const beforeEl = single(before, t.before, `${pair.id}/before.html`);
    const expected = t.after === null ? null : single(after, t.after, `${pair.id}/after.html`);
    const fp = capture(beforeEl, { url: FIXTURE_URL, now: NOW, id: `${pair.id}#${i}` });
    const result = match(afterIndex, fp, opts);
    return {
      pair: pair.id,
      target: t.label,
      expected: expected ? "present" : "removed",
      tier: result.tier,
      score: result.score,
      gap: result.runnerUpGap,
      outcome: classify(expected, result.element),
      got: result.element ? (result.element.textContent ?? "").replace(/\s+/g, " ").trim() : null,
      reasons: result.reasons,
    };
  });
}

export function runAll(dirs = listPairDirs(), opts: MatchOptions = {}): ResultRow[] {
  return dirs.flatMap((d) => runPair(loadPair(d), opts));
}

export interface Summary {
  total: number;
  counts: Record<Outcome, number>;
}

export function summarize(rows: readonly ResultRow[]): Summary {
  const counts: Record<Outcome, number> = {
    correct: 0,
    "correct-absent": 0,
    "not-found": 0,
    wrong: 0,
  };
  for (const r of rows) counts[r.outcome]++;
  return { total: rows.length, counts };
}
