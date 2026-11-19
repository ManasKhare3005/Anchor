import { JSDOM } from "jsdom";
import { match, type Confidence, type ElementFingerprint } from "@anchor/matcher";
import { describe, extractCandidates } from "./extract.ts";
import { findLeaks, listPairDirs, loadPair, type LoadedPair } from "./pairs.ts";

/**
 * - correct: confident (high/medium) and picked the expected element
 * - correct-abstain: feature removed, matcher said low / nothing
 * - abstain: feature exists but matcher said low (a miss, but safe: Anchor asks)
 * - wrong: confident and picked the wrong element, or confident when the feature was removed.
 *   The worst outcome.
 */
export type Outcome = "correct" | "correct-abstain" | "abstain" | "wrong";

export interface ResultRow {
  pair: string;
  target: string;
  expectedRef: string | null;
  gotRef: string | null;
  confidence: Confidence;
  outcome: Outcome;
}

export class FixtureError extends Error {}

function parse(html: string): Document {
  return new JSDOM(html).window.document;
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

function fingerprintFrom(el: Element, id: string, label: string): ElementFingerprint {
  const d = describe(el, id);
  return {
    id,
    site: "http://localhost",
    pageKind: "home",
    label,
    text: d.text,
    role: d.role,
    ...(d.ariaLabel ? { ariaLabel: d.ariaLabel } : {}),
    attributes: d.attributes,
    domPath: d.domPath,
    neighbors: d.neighbors,
    position: { x: 0, y: 0, w: 0, h: 0 },
    lastSeen: "2026-01-01T00:00:00.000Z",
  };
}

export function classify(
  expectedRef: string | null,
  gotRef: string | null,
  confidence: Confidence,
): Outcome {
  const confident = confidence !== "low" && gotRef !== null;
  if (expectedRef === null) return confident ? "wrong" : "correct-abstain";
  if (!confident) return "abstain";
  return gotRef === expectedRef ? "correct" : "wrong";
}

export function runPair(loaded: LoadedPair): ResultRow[] {
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
  const { candidates, elements } = extractCandidates(after);
  const refOf = new Map([...elements].map(([ref, el]) => [el, ref]));

  return pair.targets.map((t, i) => {
    const beforeEl = single(before, t.before, `${pair.id}/before.html`);
    let expectedRef: string | null = null;
    if (t.after !== null) {
      const afterEl = single(after, t.after, `${pair.id}/after.html`);
      expectedRef = refOf.get(afterEl) ?? null;
      if (expectedRef === null) {
        throw new FixtureError(
          `${pair.id}: expected element "${t.after}" is not an extracted candidate`,
        );
      }
    }
    const result = match(fingerprintFrom(beforeEl, `${pair.id}#${i}`, t.label), candidates);
    const gotRef = result.candidates[0]?.ref ?? null;
    return {
      pair: pair.id,
      target: t.label,
      expectedRef,
      gotRef,
      confidence: result.confidence,
      outcome: classify(expectedRef, gotRef, result.confidence),
    };
  });
}

export function runAll(dirs = listPairDirs()): ResultRow[] {
  return dirs.flatMap((d) => runPair(loadPair(d)));
}

export interface Summary {
  total: number;
  counts: Record<Outcome, number>;
}

export function summarize(rows: readonly ResultRow[]): Summary {
  const counts: Record<Outcome, number> = {
    correct: 0,
    "correct-abstain": 0,
    abstain: 0,
    wrong: 0,
  };
  for (const r of rows) counts[r.outcome]++;
  return { total: rows.length, counts };
}
