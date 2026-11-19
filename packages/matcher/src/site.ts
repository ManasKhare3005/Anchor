import { indexPage, match, type MatchOptions, DEFAULT_THRESHOLDS } from "./match.ts";
import type { Fingerprint, MatchResult } from "./types.ts";

/**
 * Redesign vs. different state (CLAUDE.md § Matching approach): judge a person's fingerprints on
 * a site as a group, not one by one.
 */

export type SiteState = "normal" | "logged-out" | "local-change" | "redesign" | "unknown";

/**
 * - found: located at "sure" or "fairly"
 * - ambiguous: clearly present but look-alikes prevent a pick (e.g. a timeout popup with its own
 *   "Sign out"). Counts as present for the site state; still never pointed at.
 * - missing: nothing similar enough
 */
export type FeatureStatus = "found" | "ambiguous" | "missing";

export interface FeatureObservation {
  fingerprintId: string;
  status: FeatureStatus;
  /** Found, but its text, kind of control or page region differs from what was remembered. */
  changed: boolean;
  result: MatchResult;
}

export interface SiteObservation {
  state: SiteState;
  /** Identifies one page load; the two-visit rule needs two different ones. */
  visitId: string;
  features: FeatureObservation[];
  loginFormPresent: boolean;
}

function statusOf(r: MatchResult, opts: MatchOptions): FeatureStatus {
  if (r.element) return "found";
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  return r.score >= t.fairly.score ? "ambiguous" : "missing";
}

/** Found, but its label, kind of control, tag or page region is not what was remembered. */
function changedFrom(r: MatchResult): boolean {
  const best = r.ranked[0];
  if (!r.element || !best) return false;
  const sim = (name: string) => best.signals.find((s) => s.signal === name)?.similarity ?? 1;
  return ["text", "accessibleName", "role", "tag", "trail"].some((name) => sim(name) < 0.999);
}

function hasLoginForm(root: Document | Element): boolean {
  return root.querySelector("input[type='password' i]") !== null;
}

export function classifySite(
  root: Document | Element,
  fps: readonly Fingerprint[],
  visitId: string,
  opts: MatchOptions = {},
): SiteObservation {
  const index = indexPage(root);
  const features: FeatureObservation[] = fps.map((fp) => {
    const result = match(index, fp, opts);
    const status = statusOf(result, opts);
    return { fingerprintId: fp.id, status, changed: changedFrom(result), result };
  });
  const loginFormPresent = hasLoginForm(root);

  const total = features.length;
  const present = features.filter((f) => f.status !== "missing").length;
  const missing = total - present;
  const found = features.filter((f) => f.status === "found");
  const moved = found.filter((f) => f.changed).length;

  let state: SiteState;
  if (total === 0) state = "unknown";
  else if (loginFormPresent && present * 2 < total) state = "logged-out";
  else if (present * 2 < total) state = "unknown";
  else if (found.length && moved * 2 >= found.length) state = "redesign";
  else if (missing > 0) state = "local-change";
  else state = "normal";

  return { state, visitId, features, loginFormPresent };
}

/**
 * Report a redesign to the helper only when two separate visits agree: both say "redesign" and
 * mostly the same features changed or went missing.
 */
export function confirmRedesign(prev: SiteObservation, curr: SiteObservation): boolean {
  if (prev.visitId === curr.visitId) return false;
  if (prev.state !== "redesign" || curr.state !== "redesign") return false;
  const affected = (o: SiteObservation) =>
    new Set(
      o.features.filter((f) => f.status === "missing" || f.changed).map((f) => f.fingerprintId),
    );
  const a = affected(prev);
  const b = affected(curr);
  if (!a.size && !b.size) return true;
  let inter = 0;
  for (const id of a) if (b.has(id)) inter++;
  return inter / (a.size + b.size - inter) >= 0.5;
}
