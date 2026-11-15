import type { CandidateDescriptor, ElementFingerprint, MatchResult } from "./types.ts";

/**
 * Phase 0 stub. Always returns no candidates with "low" confidence, which maps to the safe
 * "Ask" behavior. Real scoring arrives in Phase 2.
 */
export function match(
  fingerprint: ElementFingerprint,
  _candidates: readonly CandidateDescriptor[],
): MatchResult {
  return {
    fingerprintId: fingerprint.id,
    candidates: [],
    confidence: "low",
  };
}
