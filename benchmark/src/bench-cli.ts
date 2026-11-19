import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./bench.ts";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/benchmark-report.md");

const notes = [
  "Sources so far: Maple Market pairs and the three fixture sites (all hand-written). Real archived sites are added in M1 task 1.8.",
  "Thresholds and weights are the untuned starting values until M1 task 1.9.",
];

writeFileSync(OUT, buildReport({}, [], notes));
console.log(`wrote ${OUT}`);
