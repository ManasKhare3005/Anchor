import type { ResultRow, Summary } from "./run.ts";

export function formatReport(rows: readonly ResultRow[], summary: Summary): string {
  const header = ["pair", "target", "expected", "tier", "score", "gap", "outcome", "got"];
  const body = rows.map((r) => [
    r.pair,
    r.target,
    r.expected,
    r.tier,
    r.score.toFixed(2),
    r.gap.toFixed(2),
    r.outcome === "wrong" ? "WRONG" : r.outcome,
    r.got ?? "-",
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
    `targets: ${total}  correct: ${counts.correct}  correct-absent: ${counts["correct-absent"]}  not-found: ${counts["not-found"]}  wrong: ${counts.wrong}`,
  ].join("\n");
}
