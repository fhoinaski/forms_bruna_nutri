import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const separator = line.indexOf("=");
  if (separator <= 0 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}
const { d1Query } = await import("../lib/d1/client");
const days = Math.max(1, Math.min(180, Number(process.env.FOOD_SEARCH_TELEMETRY_REPORT_DAYS ?? 30)));
const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const [summary] = await d1Query<{ searchCount: number; zeroResultCount: number; selectionCount: number; top1: number; top3: number; selectedRankSum: number; selectedRankCount: number; durationSum: number; durationCount: number }>(`SELECT
  COALESCE(SUM(search_count), 0) AS searchCount, COALESCE(SUM(zero_result_count), 0) AS zeroResultCount,
  COALESCE(SUM(selection_count), 0) AS selectionCount, COALESCE(SUM(top1_selection_count), 0) AS top1,
  COALESCE(SUM(top3_selection_count), 0) AS top3, COALESCE(SUM(selected_rank_sum), 0) AS selectedRankSum,
  COALESCE(SUM(selected_rank_count), 0) AS selectedRankCount, COALESCE(SUM(duration_sum), 0) AS durationSum,
  COALESCE(SUM(duration_count), 0) AS durationCount FROM food_search_daily_metrics WHERE metric_date >= ?1`, [cutoff]);
const topQueries = await d1Query<{ query: string; searchCount: number; zeroResultCount: number; selectionCount: number; avgSelectedRank: number | null }>(`SELECT query_key AS query, SUM(search_count) AS searchCount, SUM(zero_result_count) AS zeroResultCount, SUM(selection_count) AS selectionCount,
  CASE WHEN SUM(selected_rank_count) = 0 THEN NULL ELSE ROUND(SUM(selected_rank_sum) * 1.0 / SUM(selected_rank_count), 2) END AS avgSelectedRank
  FROM food_search_daily_metrics WHERE metric_date >= ?1 AND query_status = 'STORED' AND query_key IS NOT NULL GROUP BY query_key ORDER BY searchCount DESC LIMIT 20`, [cutoff]);
const [redacted] = await d1Query<{ count: number }>("SELECT COALESCE(SUM(search_count + zero_result_count), 0) AS count FROM food_search_daily_metrics WHERE metric_date >= ?1 AND query_status <> 'STORED'", [cutoff]);
const sourceRows = await d1Query<{ source_selection_counts_json: string }>("SELECT source_selection_counts_json FROM food_search_daily_metrics WHERE metric_date >= ?1", [cutoff]);
const sourceSelectionMix: Record<string, number> = {};
for (const row of sourceRows) {
  for (const [source, count] of Object.entries(JSON.parse(row.source_selection_counts_json) as Record<string, number>)) {
    sourceSelectionMix[source] = (sourceSelectionMix[source] ?? 0) + Number(count);
  }
}
const metrics = summary ?? { searchCount: 0, zeroResultCount: 0, selectionCount: 0, top1: 0, top3: 0, selectedRankSum: 0, selectedRankCount: 0, durationSum: 0, durationCount: 0 };
const report = { generatedAt: new Date().toISOString(), periodDays: days, cutoff, metrics: {
  searches: Number(metrics.searchCount), zeroResultRate: Number(metrics.searchCount) ? Number(metrics.zeroResultCount) / Number(metrics.searchCount) : 0,
  selectionRate: Number(metrics.searchCount) ? Number(metrics.selectionCount) / Number(metrics.searchCount) : 0,
  top1SelectionRate: Number(metrics.selectionCount) ? Number(metrics.top1) / Number(metrics.selectionCount) : 0,
  top3SelectionRate: Number(metrics.selectionCount) ? Number(metrics.top3) / Number(metrics.selectionCount) : 0,
  meanSelectedRank: Number(metrics.selectedRankCount) ? Number(metrics.selectedRankSum) / Number(metrics.selectedRankCount) : null,
  meanDurationMs: Number(metrics.durationCount) ? Number(metrics.durationSum) / Number(metrics.durationCount) : null,
}, topQueries, sourceSelectionMix, redactedQueryEventCount: Number(redacted?.count ?? 0) };
mkdirSync(resolve("reports"), { recursive: true });
writeFileSync(resolve("reports/food-search-telemetry-current.md"), `# Food Search Telemetry\n\n\`SHORT_LIVED_RAW\` report for the last ${days} day(s). No individual events or redacted query content are displayed.\n\n## Metrics\n\n\`\`\`json\n${JSON.stringify(report.metrics, null, 2)}\n\`\`\`\n\n## Top sanitized queries\n\n\`\`\`json\n${JSON.stringify(topQueries, null, 2)}\n\`\`\`\n\nRedacted query event count: ${report.redactedQueryEventCount}.\n`);
console.log(JSON.stringify(report, null, 2));
