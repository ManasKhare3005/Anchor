import { capture, collectCandidates } from "@anchor/matcher";
import { clickStep, withoutNeighborText, yourTurnStep, type Step } from "../route.ts";
import { candidateFor, targetOf } from "./candidate.ts";
import { fieldKind, groupLabelFor, isField, stepElementFor } from "./fields.ts";
import { card, fromOverlay, getOverlay, removeOverlay } from "./overlay.ts";

/**
 * Recording a route (M3). The helper or the person does the task as usual; Anchor writes down each
 * step. Nothing is swallowed or changed: the clicks really happen on the site.
 *
 * - A click on a button or link is a "click" step.
 * - Typing or choosing in a field is a "your turn" step. Only the event's type is used; the
 *   field's value is never read (Hard Rule 7).
 * - The same element is not written down twice in a row.
 */

let active: { stop: () => void } | null = null;

export function isRecording(): boolean {
  return active !== null;
}

export function stopRecording(): void {
  active?.stop();
}

/**
 * `afterInput`: a field was filled in earlier in this recording, on a previous page. From the first
 * field on, steps keep no neighbor text (see `withoutNeighborText`).
 */
export function startRecording(
  doc: Document,
  afterInput: boolean,
  onStep: (step: Step) => void,
): void {
  stopRecording();
  const win = doc.defaultView;
  if (!win) return;
  const { root } = getOverlay(doc);
  const banner = card(doc, "banner", "Anchor is writing down each step.", []);
  root.append(banner);

  let last: Element | null = null;
  let typed = afterInput;
  const now = () => new Date().toISOString();
  const url = () => doc.location.href;
  const fingerprint = (el: Element) => {
    const fp = capture(el, { url: url(), now: now() });
    return typed ? withoutNeighborText(fp) : fp;
  };

  function onClick(e: Event) {
    if (fromOverlay(e)) return;
    const el = candidateFor(targetOf(e), new Set(collectCandidates(doc)));
    // A click into a field is not a step; typing or choosing there is.
    if (!el || isField(el) || el === last) return;
    last = el;
    onStep(clickStep(fingerprint(el)));
  }

  function onField(e: Event) {
    if (fromOverlay(e)) return;
    const target = targetOf(e);
    if (!(target instanceof Element) || !isField(target)) return;
    const el = stepElementFor(target);
    if (el === last) return;
    last = el;
    typed = true;
    onStep(yourTurnStep(fingerprint(el), fieldKind(el), groupLabelFor(el)));
  }

  const opts = { capture: true, passive: true } as const;
  win.addEventListener("click", onClick, opts);
  win.addEventListener("input", onField, opts);
  win.addEventListener("change", onField, opts);

  function stop() {
    win?.removeEventListener("click", onClick, opts);
    win?.removeEventListener("input", onField, opts);
    win?.removeEventListener("change", onField, opts);
    banner.remove();
    active = null;
    if (root.querySelectorAll(".ring, .card").length === 0) removeOverlay();
  }

  active = { stop };
}
