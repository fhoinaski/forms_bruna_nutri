import { writeFileSync } from "node:fs";
// @ts-expect-error DatabaseSync is available in the Node 22 runtime used by local calibration.
import { DatabaseSync } from "node:sqlite";
import { canonicalFoodSearch, type CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const queries = ["ovo", "ovo cozido", "ovo frito", "arroz", "arroz integral", "feijão", "feijão preto", "frango", "peito de frango", "frango grelhado", "banana", "banana prata", "leite", "leite integral", "leite desnatado", "pão", "pão integral", "queijo", "queijo minas", "batata", "batata doce", "maçã", "aveia", "iogurte", "carne moída", "salmão"];
const databasePath = "reports/food-database-f3-3-ibge-test.sqlite";
const db = new DatabaseSync(databasePath, { readOnly: true });
const executor: CanonicalDbExecutor = async (sql, params) => db.prepare(sql).all(...params) as Record<string, unknown>[];

void (async () => {
  const runs = [];
  for (const query of queries) {
    const started = performance.now();
    const results = await canonicalFoodSearch({ query, db: executor, limit: 24 });
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const topNames = results.map((result) => result.name);
    const matches = (names: string[]) => names.some((name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized.split(" ")[0]));
    runs.push({
      query,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      resultCount: results.length,
      top1Pass: matches(topNames.slice(0, 1)),
      top3Pass: matches(topNames.slice(0, 3)),
      top5Pass: matches(topNames.slice(0, 5)),
      top: results.slice(0, 5).map((result) => ({ name: result.name, source: result.source, preparation: result.preparation?.name ?? null, score: result.score })),
    });
  }
  db.close();
  const durations = runs.map((run) => run.durationMs).sort((a, b) => a - b);
  const p = (percentile: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * percentile) - 1)] ?? 0;
  const summary = { queryTotal: runs.length, top1Pass: runs.filter((run) => run.top1Pass).length, top3Pass: runs.filter((run) => run.top3Pass).length, top5Pass: runs.filter((run) => run.top5Pass).length, zeroResults: runs.filter((run) => run.resultCount === 0).length, p50Ms: p(0.5), p95Ms: p(0.95), maxMs: durations.at(-1) ?? 0, telemetryWrites: 0, migrations: 0 };
  writeFileSync("reports/food-search-f5-ranking-calibration.json", `${JSON.stringify({ summary, runs }, null, 2)}\n`);
  writeFileSync("reports/food-search-f5-ranking-calibration.md", `# F5 Ranking Calibration\n\n${JSON.stringify(summary, null, 2)}\n\nHarness local/read-only against F3.3 test data. It records qualitative top-k coverage, not ML ground truth.\n`);
  console.log(JSON.stringify(summary, null, 2));
})();
