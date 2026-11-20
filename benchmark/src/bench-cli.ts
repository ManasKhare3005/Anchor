import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THRESHOLDS } from "@anchor/matcher";
import { buildReport, fixtureRows } from "./bench.ts";
import { CALIBRATION_TARGETS, calibrate, evaluate, leaveOneSiteOut } from "./calibrate.ts";
import { allLabels } from "./real/labels.ts";
import { realRows } from "./real/run-real.ts";
import { BENCH_DIR } from "./real/wayback.ts";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/benchmark-report.md");

const labels = allLabels().flatMap((s) => s.features);
const confirmed = labels.filter((f) => f.status === "confirmed").length;
const proposed = labels.filter((f) => f.status === "proposed").length;

// Calibration uses fixtures + confirmed real labels only. Proposed labels that Claude's pre-check
// marked ok are shown as a preview, never used to choose thresholds.
const calibrationRows = [...fixtureRows(), ...realRows({}, "confirmed")];
const chosen = calibrate(calibrationRows, CALIBRATION_TARGETS);
const loso = leaveOneSiteOut(calibrationRows, CALIBRATION_TARGETS);
const check = JSON.parse(readFileSync(join(BENCH_DIR, "claude-check.json"), "utf8")) as Record<
  string,
  [string, string]
>;
/** Real rows in the report: confirmed, or proposed and pre-checked ok (labels Claude flagged as wrong are left out). */
const shown = (r: { scenario: string; site: string; feature: string }) =>
  r.scenario === "real" || check[`${r.site}-${r.feature}`]?.[0] === "ok";
const previewRows = realRows({}, "proposed+confirmed").filter(
  (r) => r.scenario !== "real" && shown(r),
);
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const matchesDefaults =
  chosen !== null &&
  same(chosen.thresholds.sure.score, DEFAULT_THRESHOLDS.sure.score) &&
  same(chosen.thresholds.sure.gap, DEFAULT_THRESHOLDS.sure.gap) &&
  same(chosen.thresholds.fairly.score, DEFAULT_THRESHOLDS.fairly.score) &&
  same(chosen.thresholds.fairly.gap, DEFAULT_THRESHOLDS.fairly.gap);

const notes = [
  "Sources: Maple Market pairs and three fixture sites (hand-written), plus real archived shopping home pages (Wayback Machine, original HTML, no scripts run).",
  `Real-site labels: ${confirmed} confirmed by Manas, ${proposed} proposed and not yet reviewed. Unreviewed rows are marked "real (unconfirmed)" and are never used to set thresholds.`,
];

writeFileSync(
  OUT,
  buildReport({}, [(opts) => realRows(opts, "proposed+confirmed").filter(shown)], notes, {
    setDescription: `fixtures${confirmed ? ` + ${confirmed} confirmed real-site labels` : " only (no real-site labels confirmed yet)"}`,
    chosen,
    loso,
    matchesDefaults,
    preview: {
      description: `preview: ${previewRows.length} unconfirmed real labels (pre-checked ok)`,
      result: evaluate(previewRows, DEFAULT_THRESHOLDS),
    },
  }),
);
console.log(`wrote ${OUT}`);
