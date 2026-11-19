export { capture, pagePatternOf, registrableDomain, type CaptureContext } from "./capture.ts";
export {
  ANCHOR_HOST_ATTR,
  accessibleNameOf,
  attributesOf,
  collectCandidates,
  isHidden,
  signalsOf,
} from "./dom.ts";
export { CONCEPTS, conceptsOf } from "./lexicon.ts";
export {
  DEFAULT_THRESHOLDS,
  indexPage,
  match,
  tierFor,
  type MatchOptions,
  type PageIndex,
  type Thresholds,
} from "./match.ts";
export { DEFAULT_WEIGHTS, type SignalName, type Weights } from "./similarity.ts";
export { scrub } from "./text.ts";
export * from "./types.ts";
export {
  classifySite,
  confirmRedesign,
  type FeatureObservation,
  type FeatureStatus,
  type SiteObservation,
  type SiteState,
} from "./site.ts";
