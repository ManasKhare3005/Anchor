import { FingerprintSchema, type SiteState, type Tier } from "@anchor/matcher";
import { z } from "zod";

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
]);

export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export interface WhereReply {
  site: string;
  pagePattern: string;
}

// ---- Content script → side panel (runtime.sendMessage) ----

export const PickEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("anchor:picked"), fingerprint: FingerprintSchema }),
  z.object({ type: z.literal("anchor:pick-cancelled") }),
]);

export type PickEvent = z.infer<typeof PickEventSchema>;

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
