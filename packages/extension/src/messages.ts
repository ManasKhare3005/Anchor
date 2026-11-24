import { FingerprintSchema, type SiteState, type Tier } from "@anchor/matcher";
import { z } from "zod";
import { AdaptSettingsSchema } from "./adapt.ts";
import { RouteSchema, StepSchema } from "./route.ts";

/**
 * Messages between extension parts. Every receiver validates with these schemas, so no part
 * trusts an unknown shape.
 */

export interface Ping {
  type: "anchor:ping";
}

export interface PingReply {
  ok: true;
}

export function isPing(message: unknown): message is Ping {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "anchor:ping"
  );
}

// ---- Side panel → service worker (the single storage writer) ----

export const ShelfRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("anchor:shelf-add"), fingerprint: FingerprintSchema }),
  z.object({ type: z.literal("anchor:shelf-rename"), id: z.string().min(1), name: z.string() }),
  z.object({ type: z.literal("anchor:shelf-remove"), id: z.string().min(1) }),
  z.object({ type: z.literal("anchor:shelf-route-add"), route: RouteSchema }),
  z.object({ type: z.literal("anchor:shelf-route-remove"), id: z.string().min(1) }),
  z.object({ type: z.literal("anchor:shelf-adapt-set"), settings: AdaptSettingsSchema }),
]);

export type ShelfRequest = z.infer<typeof ShelfRequestSchema>;

export type ShelfReply = { ok: true } | { ok: false; error: string };

export function isShelfRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { type?: unknown }).type === "string" &&
    (message as { type: string }).type.startsWith("anchor:shelf-")
  );
}

// ---- Side panel → content script (tabs.sendMessage) ----

export const ContentRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("anchor:where") }),
  z.object({ type: z.literal("anchor:pick-start") }),
  z.object({ type: z.literal("anchor:pick-stop") }),
  z.object({
    type: z.literal("anchor:find"),
    fingerprint: FingerprintSchema,
    /** All of this site's buttons, to tell "signed out" from "website changed". */
    siteButtons: z.array(FingerprintSchema),
  }),
  z.object({ type: z.literal("anchor:show-original") }),
  z.object({
    type: z.literal("anchor:record-start"),
    /** A field was already filled in earlier in this recording (on a previous page). */
    afterInput: z.boolean(),
  }),
  z.object({ type: z.literal("anchor:record-stop") }),
  z.object({
    type: z.literal("anchor:guide-step"),
    /** Position of `step` in the route; echoed back in events. */
    index: z.number().int().min(0),
    step: StepSchema,
    /**
     * The step after a "your turn" step. Watched too, so typing and then pressing the button
     * straight away does not lose the button press.
     */
    next: StepSchema.optional(),
    siteButtons: z.array(FingerprintSchema),
    /** The other steps recorded on the same page as `step` (see `onItsPage` in guide.ts). */
    pageMates: z.array(FingerprintSchema),
  }),
  z.object({ type: z.literal("anchor:guide-stop") }),
  /**
   * Show these Adapt settings on this page now, without saving (setup's before-and-after, "Show
   * my changes again"). null: the saved settings.
   */
  z.object({ type: z.literal("anchor:adapt-show"), settings: AdaptSettingsSchema.nullable() }),
]);

export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export interface WhereReply {
  site: string;
  pagePattern: string;
}

// ---- Content script → side panel (runtime.sendMessage) ----

const GuideReplySchema = z.object({
  tier: z.enum(["sure", "fairly", "unsure"]),
  inMenu: z.boolean(),
  state: z.enum(["normal", "logged-out", "local-change", "redesign", "unknown"]),
  score: z.number(),
  gap: z.number(),
  reasons: z.array(z.string()),
  detour: z.string().nullable(),
});

export const PageEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("anchor:picked"), fingerprint: FingerprintSchema }),
  z.object({ type: z.literal("anchor:pick-cancelled") }),
  z.object({ type: z.literal("anchor:recorded"), step: StepSchema }),
  /** The person did step `index` (and `through`, when they did the watched next step too). */
  z.object({
    type: z.literal("anchor:step-done"),
    index: z.number().int().min(0),
    through: z.number().int().min(0),
  }),
  /** The page changed while guiding step `index`: found later, lost, or a detour came or went. */
  z.object({
    type: z.literal("anchor:guide-update"),
    index: z.number().int().min(0),
    reply: GuideReplySchema,
  }),
]);

export type PageEvent = z.infer<typeof PageEventSchema>;

// ---- Content script → side panel: reply to anchor:find ----

export interface FindReply {
  tier: Tier;
  /** The element is hidden inside a closed menu; the ring is on the menu instead. */
  inMenu: boolean;
  /** Site state from all of this site's buttons (logged-out, redesign...). */
  state: SiteState;
  score: number;
  gap: number;
  /** For the helper section only. */
  reasons: string[];
}

// ---- Content script → side panel: reply to anchor:guide-step ----

/** Like FindReply, plus the detour on the page (in plain words), if any. */
export type GuideReply = z.infer<typeof GuideReplySchema>;
