import { z } from "zod";

/**
 * Adapt (M4): what the person answered in setup, and what that turns on. Pure, no DOM.
 *
 * The person never sees a settings page: three plain questions, answered once (CLAUDE.md § M4).
 */

export const AdaptSettingsSchema = z.object({
  /** "Is the text on websites hard to read?" No / A little / A lot. */
  text: z.enum(["normal", "larger", "largest"]),
  /** "Do small buttons give you trouble?" */
  targets: z.boolean(),
  /** "Do moving or busy pages bother you?" */
  calm: z.boolean(),
});

export type AdaptSettings = z.infer<typeof AdaptSettingsSchema>;

export const ADAPT_OFF: AdaptSettings = { text: "normal", targets: false, calm: false };

export interface AdaptPlan {
  /** Page size factor (CSS zoom on body). 1 = unchanged. */
  zoom: number;
  /** More line, letter and word spacing in text blocks. */
  spacing: boolean;
  /** Raise low-contrast text to at least 4.5:1. */
  contrast: boolean;
  /** At least 44px for buttons, fields and block links. */
  targets: boolean;
  /** Animations and transitions to near zero, no smooth scrolling. */
  motion: boolean;
  /** Hide ads and promos that hold no facts. */
  declutter: boolean;
}

const ZOOM = { normal: 1, larger: 1.25, largest: 1.5 } as const;

export function planFor(s: AdaptSettings): AdaptPlan {
  const reading = s.text !== "normal";
  return {
    zoom: ZOOM[s.text],
    spacing: reading,
    contrast: reading,
    targets: s.targets,
    motion: s.calm,
    declutter: s.calm,
  };
}

/** True when the plan changes nothing on the page. */
export function isIdle(p: AdaptPlan): boolean {
  return p.zoom === 1 && !p.spacing && !p.contrast && !p.targets && !p.motion && !p.declutter;
}
