import { FingerprintSchema } from "@anchor/matcher";
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
