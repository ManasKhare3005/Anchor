import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BENCH_DIR } from "./wayback.ts";

export const LABELS_DIR = join(BENCH_DIR, "labels");

const SpotSchema = z.object({
  selector: z.string(),
  alternates: z.array(z.string()),
  text: z.string(),
  href: z.string(),
  region: z.string(),
});

const LabelSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Where the feature is on the before page; null = not on the page (feature skipped). */
  before: SpotSchema.nullable(),
  /** Where it is on the after page; null = gone from this page. */
  after: SpotSchema.nullable(),
  /**
   * proposed: generated, not yet reviewed. confirmed: Manas agreed. rejected: excluded.
   * Only confirmed labels count toward thresholds.
   */
  status: z.enum(["proposed", "confirmed", "rejected"]),
  note: z.string().optional(),
});

export const SiteLabelsSchema = z.object({
  site: z.string(),
  url: z.string(),
  category: z.string(),
  before: z.string(),
  after: z.string(),
  features: z.array(LabelSchema),
});

export type SiteLabels = z.infer<typeof SiteLabelsSchema>;
export type Label = z.infer<typeof LabelSchema>;

export function labelsPath(site: string): string {
  return join(LABELS_DIR, `${site}.json`);
}

export function loadLabels(site: string): SiteLabels | null {
  const p = labelsPath(site);
  return existsSync(p) ? SiteLabelsSchema.parse(JSON.parse(readFileSync(p, "utf8"))) : null;
}

export function allLabels(): SiteLabels[] {
  if (!existsSync(LABELS_DIR)) return [];
  return readdirSync(LABELS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => SiteLabelsSchema.parse(JSON.parse(readFileSync(join(LABELS_DIR, f), "utf8"))));
}

export function saveLabels(labels: SiteLabels): void {
  writeFileSync(labelsPath(labels.site), `${JSON.stringify(labels, null, 2)}\n`);
}
