import type { FindReply } from "../messages.ts";

/**
 * Everything the person reads in the side panel after tapping a shelf button.
 * Plain words, short sentences, no jargon, no blame (CLAUDE.md § Interface rules).
 */

export const WORDS = {
  loading: "Anchor is getting ready.",
  unsupported: "Anchor can't help on this page.",
  empty: "No buttons saved for this website yet. Your helper can add them.",
  ready: "Tap a button, and I'll show you where it is.",
  looking: "Looking…",
  sure: "Here it is. It's circled on the page.",
  fairly: "I think it's this one now. Please check before you click it.",
  inMenu: "It's inside a menu. Open the menu, and I'll show you.",
  signedOut: "You may need to sign in first. Then tap the button again.",
  changed: "This website changed. Let's ask your helper.",
  pageGone: "The page changed. Tap the button again.",
  original: "The page is back to how the website shows it.",
  pickNow: "Now click the button on the page.",
  pickCancelled: "Nothing was saved.",
  saved: "Saved.",
  removed: "Removed.",
  copied: "Copied. You can paste it into a message to your helper.",
  copyFailed: "Couldn't copy. You can read the note to your helper instead.",
  problem: "Something went wrong. Nothing was changed.",
} as const;

export function messageFor(r: FindReply): string {
  if (r.tier === "sure") return r.inMenu ? WORDS.inMenu : WORDS.sure;
  if (r.tier === "fairly") return r.inMenu ? WORDS.inMenu : WORDS.fairly;
  return r.state === "logged-out" ? WORDS.signedOut : WORDS.changed;
}

/** Help note (CLAUDE.md § Data model): site, button name and date only. Never page content. */
export function helpNote(site: string, label: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `Anchor couldn't find the "${label}" button on ${site} (${day}). Could you take a look?`;
}

/** Technical detail, for the helper section only. */
export function detailsFor(label: string, r: FindReply): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return [
    `"${label}": ${r.tier}, score ${pct(r.score)}, gap ${pct(r.gap)}, site looks ${r.state}.`,
    ...r.reasons,
  ].join(" ");
}
