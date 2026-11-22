import { match, type Fingerprint, type MatchResult, type SiteState } from "@anchor/matcher";
import type { GuideReply, PageEvent } from "../messages.ts";
import type { Step } from "../route.ts";
import { targetOf } from "./candidate.ts";
import { removeOverlay } from "./overlay.ts";
import { rematchOf, resultFor } from "./point.ts";
import { drawRing, shown, type RingHandle } from "./ring.ts";

/**
 * Guiding a route, one step at a time (M3). The side panel sends the current step; this page
 * finds it, circles it, and watches for the person to do it themselves:
 *
 * - click step: the person's own click inside the element (observed, never swallowed);
 * - your-turn step: a `change` event on the field (nothing reads what was typed), or Next in the
 *   panel. The following click step is watched too, so typing then pressing the button straight
 *   away moves on two steps.
 *
 * Anchor never clicks, types, submits or navigates (Hard Rule 1). An unsure step draws nothing
 * (Hard Rule 5) and keeps watching the page: if the step shows up later, the panel is told.
 */

export interface GuideRequest {
  index: number;
  step: Step;
  next?: Step | undefined;
  siteButtons: Fingerprint[];
  pageMates: Fingerprint[];
}

/**
 * Judge the page as a group (CLAUDE.md § Matching approach). A step recorded together with other
 * steps on one page is only looked for when at least one of those is on the current page too.
 * Without this, a step left behind on an earlier page ("Review payment") can match a look-alike on
 * the next page ("Confirm and pay"), which is a wrong element that can send money.
 */
export function onItsPage(doc: Document, pageMates: Fingerprint[]): boolean {
  if (pageMates.length === 0) return true;
  return pageMates.some((m) => match(doc, m).tier !== "unsure");
}

const NOT_HERE = "Its page isn't showing: none of the steps recorded with it are here.";

const FAIRLY = "I think it's this one now. Please check before you click it.";
const IN_MENU = "It's inside this menu. Open it, and I'll show you.";

let active: { stop: () => void } | null = null;

export function stopGuiding(): void {
  active?.stop();
  active = null;
}

function replyOf(
  result: Pick<MatchResult, "tier" | "score" | "runnerUpGap" | "reasons">,
  state: SiteState,
  inMenu: boolean,
): GuideReply {
  return {
    tier: result.tier,
    inMenu,
    state,
    score: result.score,
    gap: result.runnerUpGap,
    reasons: result.reasons,
    detour: null,
  };
}

const UNSURE: Pick<MatchResult, "tier" | "score" | "runnerUpGap" | "reasons"> = {
  tier: "unsure",
  score: 0,
  runnerUpGap: 0,
  reasons: [],
};

export function guide(doc: Document, req: GuideRequest, emit: (e: PageEvent) => void): GuideReply {
  stopGuiding();
  const win = doc.defaultView;
  const fp = req.step.fingerprint;
  if (!win || !fp) return replyOf(UNSURE, "unknown", false);

  let ring: RingHandle | null = null;
  let finished = false;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let watchForStep: MutationObserver | null = null;
  // The following click step, watched while the person does a your-turn step.
  const nextFp = req.step.kind === "your-turn" && req.next?.kind === "click" ? req.next : null;
  let nextEl: Element | null = null;

  const done = (index: number, through: number) => {
    if (finished && through <= req.index) return;
    finished = true;
    emit({ type: "anchor:step-done", index, through });
  };

  const noteFor = (inMenu: boolean, tier: "sure" | "fairly") =>
    inMenu
      ? IN_MENU
      : tier === "fairly"
        ? `${req.step.instruction} ${FAIRLY}`
        : req.step.instruction;

  /** What the panel was last told, so it hears when the person opens the menu. */
  let told: GuideReply | null = null;

  function show(target: Element, tier: "sure" | "fairly", reply: GuideReply) {
    ring?.stop();
    told = reply;
    ring = drawRing(doc, target, {
      tier,
      noteFor: (inMenu) => {
        if (told && told.inMenu !== inMenu) {
          told = { ...told, inMenu };
          emit({ type: "anchor:guide-update", index: req.index, reply: told });
        }
        return noteFor(inMenu, tier);
      },
      onShowOriginal: () => {
        stopGuiding();
        removeOverlay();
      },
      rematch: () => (fp && onItsPage(doc, req.pageMates) ? rematchOf(doc, fp) : null),
      onLost: () => {
        ring = null;
        emit({
          type: "anchor:guide-update",
          index: req.index,
          reply: replyOf(UNSURE, "unknown", false),
        });
        waitForStep();
      },
    });
  }

  /** Not found (yet): watch the page, quietly, until the step can be found confidently. */
  function waitForStep() {
    watchForStep?.disconnect();
    watchForStep = new MutationObserver(() => {
      if (waiting) clearTimeout(waiting);
      waiting = setTimeout(() => {
        waiting = undefined;
        if (!fp || ring) return;
        const { result, state } = find(fp);
        if (!result.element || result.tier === "unsure") return;
        watchForStep?.disconnect();
        const reply = replyOf(result, state, !shown(result.element));
        show(result.element, result.tier, reply);
        emit({ type: "anchor:guide-update", index: req.index, reply });
      }, 300);
    });
    watchForStep.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function find(f: Fingerprint) {
    const found = resultFor(doc, f, req.siteButtons);
    if (!found.result.element || found.result.tier === "unsure") return found;
    if (onItsPage(doc, req.pageMates)) return found;
    const result: MatchResult = {
      ...found.result,
      element: null,
      tier: "unsure",
      reasons: [NOT_HERE, ...found.result.reasons],
    };
    return { result, state: found.state };
  }

  const inside = (e: Event, el: Element | null) => el !== null && e.composedPath().includes(el);

  function onClick(e: Event) {
    if (!e.isTrusted) return;
    if (ring && req.step.kind === "click" && inside(e, ring.target())) done(req.index, req.index);
    else if (nextEl && inside(e, nextEl)) done(req.index + 1, req.index + 1);
  }

  function onChange(e: Event) {
    if (!e.isTrusted || req.step.kind !== "your-turn" || !ring) return;
    const t = targetOf(e);
    if (!(t instanceof Element)) return;
    const target = ring.target();
    // A radio step points at the group's first option; any option in the group counts.
    const name = target.getAttribute("name");
    const sameGroup =
      name !== null &&
      t.tagName === "INPUT" &&
      t.getAttribute("type") === "radio" &&
      t.getAttribute("name") === name;
    if (t === target || target.contains(t) || sameGroup) {
      done(req.index, req.index);
    }
  }

  const opts = { capture: true, passive: true } as const;
  win.addEventListener("click", onClick, opts);
  win.addEventListener("change", onChange, opts);

  active = {
    stop() {
      ring?.stop();
      ring = null;
      watchForStep?.disconnect();
      if (waiting) clearTimeout(waiting);
      win.removeEventListener("click", onClick, opts);
      win.removeEventListener("change", onChange, opts);
    },
  };

  const { result, state } = find(fp);
  if (nextFp?.fingerprint) nextEl = rematchOf(doc, nextFp.fingerprint);
  if (!result.element || result.tier === "unsure") {
    // Nothing of Anchor's stays on the page when nothing is shown.
    removeOverlay();
    waitForStep();
    return replyOf(result, state, false);
  }
  const reply = replyOf(result, state, !shown(result.element));
  show(result.element, result.tier, reply);
  return reply;
}
