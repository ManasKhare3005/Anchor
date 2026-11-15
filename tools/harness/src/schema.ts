import { z } from "zod";

/** Ground truth for one before/after fixture pair. Lives in pair.json, never in the HTML. */
export const TargetSchema = z.object({
  /** What the user calls the element. */
  label: z.string().min(1),
  /** CSS selector resolving to exactly one element in before.html. */
  before: z.string().min(1),
  /** CSS selector resolving to exactly one element in after.html, or null if the feature is gone. */
  after: z.string().min(1).nullable(),
  note: z.string().optional(),
});

export const ChangeKind = z.enum([
  "moved",
  "renamed",
  "restyled",
  "role-changed",
  "nested",
  "hidden-in-menu",
  "removed",
  "decoy",
]);

export const PairSchema = z.object({
  id: z.string().regex(/^\d{3}-[a-z0-9-]+$/),
  change: z.array(ChangeKind).min(1),
  description: z.string().min(1),
  targets: z.array(TargetSchema).min(1),
});

export type Pair = z.infer<typeof PairSchema>;
export type Target = z.infer<typeof TargetSchema>;
