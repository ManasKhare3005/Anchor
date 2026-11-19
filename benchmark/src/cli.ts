import { formatReport } from "./report.ts";
import { runAll, summarize } from "./run.ts";

const rows = runAll();
console.log(formatReport(rows, summarize(rows)));
