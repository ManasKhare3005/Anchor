import type { ResultRow, Summary } from "./run.ts";

export function formatReport(rows: readonly ResultRow[], summary: Summary): string {
  const header = ["pair", "target", "expected", "got", "confidence", "outcome"];
  const body = rows.map((r) => [
    r.pair,
    r.target,
    r.expectedRef ?? "(removed)",
    r.gotRef ?? "-",
    r.confidence,
    r.outcome === "wrong" ? "WRONG" : r.outcome,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((row) => (row[i] ?? "").length)),
  );
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  const { counts, total } = summary;
  return [
    line(header),
    line(widths.map((w) => "-".repeat(w))),
    ...body.map(line),
    "",
    `targets: ${total}  correct: ${counts.correct}  correct-abstain: ${counts["correct-abstain"]}  abstain: ${counts.abstain}  wrong: ${counts.wrong}`,
  ].join("\n");
}
