import type { AdaptPlan } from "../../adapt.ts";

/**
 * The one stylesheet Adapt adds to a page. Pure: plan in, CSS out. Facts are never touched here:
 * nothing in it hides, moves out of view or rewrites content (Hard Rule 2).
 */
export function cssFor(p: AdaptPlan): string {
  const parts: string[] = [];
  if (p.zoom !== 1) {
    // On body, not html: Anchor's overlay hosts sit outside body, so rings and notes keep their
    // own size and their positions (getBoundingClientRect is zoom-aware since Chrome 128).
    // CSS zoom doesn't change media queries, so the site doesn't switch to its mobile layout.
    parts.push(`body { zoom: ${p.zoom} !important; }`);
  }
  if (p.spacing) {
    // Close to WCAG 1.4.12 text spacing, on text blocks only (not icons or fixed-height bars).
    parts.push(
      `body { letter-spacing: 0.02em !important; word-spacing: 0.06em !important; }`,
      `body :where(p, li, dd, dt, td, th, label, blockquote, figcaption, legend, summary) { line-height: 1.6 !important; }`,
      `body :where(p) { margin-block-end: 1em !important; }`,
    );
  }
  if (p.targets) {
    // min-height does nothing on inline links in running text, and helps every block link.
    parts.push(
      `body :where(a[href], button, [role='button'], [role='link'], [role='menuitem'], [role='tab'], summary, select, textarea, input:not([type='hidden'], [type='checkbox'], [type='radio'])) { min-height: 44px !important; }`,
      `body :where(button, [role='button'], input[type='submit'], input[type='button'], input[type='reset']) { min-width: 44px !important; }`,
      `body :where(input[type='checkbox'], input[type='radio']) { width: 24px !important; height: 24px !important; }`,
    );
  }
  if (p.motion) {
    parts.push(
      `html { scroll-behavior: auto !important; }`,
      `body, body *, body *::before, body *::after { animation-duration: 0.01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; scroll-behavior: auto !important; }`,
    );
  }
  return parts.join("\n");
}
