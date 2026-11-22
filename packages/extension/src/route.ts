import { FingerprintSchema, type Fingerprint } from "@anchor/matcher";
import { z } from "zod";

/**
 * Routes (CLAUDE.md § Data model): a task recorded once, then guided one step at a time.
 * Every step that points at something carries a fingerprint, so the matcher re-finds it after a
 * redesign. A "your turn" step records only that a field exists, never what was typed (Hard Rule 7).
 */

export const StepKindSchema = z.enum(["click", "your-turn", "navigate"]);
export type StepKind = z.infer<typeof StepKindSchema>;

export const StepSchema = z
  .object({
    kind: StepKindSchema,
    fingerprint: FingerprintSchema.optional(),
    /** Plain words shown to the person. */
    instruction: z.string().min(1).max(200),
  })
  .refine((s) => s.kind === "navigate" || s.fingerprint !== undefined, {
    message: "click and your-turn steps need a fingerprint",
  });

export type Step = z.infer<typeof StepSchema>;

export const RouteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  site: z.string().min(1),
  steps: z.array(StepSchema).min(1).max(50),
});

export type Route = z.infer<typeof RouteSchema>;

/** What a field asks of the person: typing, or choosing from options. */
export type FieldKind = "type" | "choose";

/** The site's own label for the element, for an instruction. Never page content beyond that. */
export function labelOf(fp: Fingerprint): string {
  const label = fp.signals.accessibleName || fp.signals.text;
  return label.length > 60 ? `${label.slice(0, 57)}…` : label;
}

export function clickInstruction(fp: Fingerprint): string {
  const label = labelOf(fp);
  return label ? `Click "${label}".` : "Click the circled button.";
}

export function yourTurnInstruction(fp: Fingerprint, field: FieldKind): string {
  const label = labelOf(fp);
  if (field === "choose") return label ? `Your turn: choose "${label}".` : "Your turn: choose one.";
  return label ? `Your turn: fill in "${label}".` : "Your turn: fill in the circled box.";
}

export function clickStep(fp: Fingerprint): Step {
  return { kind: "click", fingerprint: fp, instruction: clickInstruction(fp) };
}

export function yourTurnStep(fp: Fingerprint, field: FieldKind): Step {
  return { kind: "your-turn", fingerprint: fp, instruction: yourTurnInstruction(fp, field) };
}

/**
 * Help note for a route step (CLAUDE.md § Data model, HelpNote): site, route name, step number,
 * the step's label and the date. Never page content.
 */
export function routeHelpNote(
  site: string,
  routeName: string,
  stepIndex: number,
  step: Step,
  date: Date,
): string {
  const day = date.toISOString().slice(0, 10);
  const label = step.fingerprint ? labelOf(step.fingerprint) : "";
  const what = label ? ` ("${label}")` : "";
  return `Anchor couldn't find step ${stepIndex + 1}${what} of "${routeName}" on ${site} (${day}). Could you take a look?`;
}
