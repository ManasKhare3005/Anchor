import { ANCHOR_HOST_ATTR, accessibleNameOf } from "@anchor/matcher";
import { shown } from "./ring.ts";

/**
 * Detours (M3): a dialog or overlay the site opened that is not part of the task (cookie banner,
 * survey, session warning, "update your details"). Anchor says what it is in plain words and
 * waits. It never closes, hides or answers it (Hard Rules 1 and 2): the person decides.
 *
 * The dialog's words are read only to choose the message. They are never stored, sent or put in a
 * help note.
 */

const DIALOGS = "dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']";

/** The open dialog that is in the person's way, if any. A dialog holding the step is the step. */
export function findDetour(doc: Document, stepElement: Element | null): Element | null {
  for (const el of doc.querySelectorAll(DIALOGS)) {
    if (el.closest(`[${ANCHOR_HOST_ATTR}]`)) continue;
    if (stepElement && el.contains(stepElement)) continue;
    if (shown(el)) return el;
  }
  return null;
}

const KINDS: { test: RegExp; words: string }[] = [
  { test: /cookie/i, words: "The website is asking about cookies." },
  {
    test: /session|time ?out|timed out|sign(ed)? (you )?out|expire/i,
    words: "The website says you will be signed out soon.",
  },
  {
    test: /survey|feedback|how are we doing|rate (us|your)|your opinion/i,
    words: "The website is asking for your opinion.",
  },
  {
    test: /(update|confirm|check|verify).{0,40}(details|information|address|phone|email)/i,
    words: "The website is asking you to check your details.",
  },
];

const THEN = "Answer it the way you want. Then I'll show you the next step.";

/** Plain words for the detour, for the side panel. */
export function describeDetour(el: Element): string {
  const words = `${accessibleNameOf(el)} ${el.textContent ?? ""}`;
  const kind = KINDS.find((k) => k.test.test(words));
  return `${kind?.words ?? "The website is showing a message."} ${THEN}`;
}
