import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./bench.ts";
import { allLabels } from "./real/labels.ts";
import { realRows } from "./real/run-real.ts";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/benchmark-report.md");

const labels = allLabels().flatMap((s) => s.features);
const confirmed = labels.filter((f) => f.status === "confirmed").length;
const proposed = labels.filter((f) => f.status === "proposed").length;

const notes = [
  "Sources: Maple Market pairs and three fixture sites (hand-written), plus real archived shopping home pages (Wayback Machine, original HTML, no scripts run).",
  `Real-site labels: ${confirmed} confirmed by Manas, ${proposed} proposed and not yet reviewed. Unreviewed rows are marked "real (unconfirmed)" and must not be used to set thresholds.`,
  "Thresholds and weights are the untuned starting values until M1 task 1.9.",
];

writeFileSync(OUT, buildReport({}, [(opts) => realRows(opts, "proposed+confirmed")], notes));
console.log(`wrote ${OUT}`);
