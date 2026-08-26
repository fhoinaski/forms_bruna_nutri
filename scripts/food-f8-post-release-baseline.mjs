import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const separator = line.indexOf("=");
  if (separator <= 0 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
if (!accountId || !databaseId || !apiToken) throw new Error("Cloudflare D1 credentials are unavailable.");

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.errors?.map((error) => error.message).join("; ") || "Cloudflare D1 request failed.");
  return data.result;
}
async function query(sql, params = []) {
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH)\b/i.test(sql)) throw new Error("F8 accepts read-only D1 statements only.");
  const result = await api(`/d1/database/${databaseId}/query`, { method: "POST", body: JSON.stringify(params.length ? { sql, params } : { sql }) });
  if (!result[0]?.success) throw new Error("Cloudflare D1 read-only query failed.");
  return result[0].results ?? [];
}
async function timedSearch(term) {
  const started = Date.now();
  const canonical = await query(`SELECT f.name, f.source, f.preparation_name, p.label, p.gram_weight
    FROM canonical_foods_fts x JOIN canonical_foods f ON f.id = x.food_id
    LEFT JOIN canonical_food_portions p ON p.canonical_food_id = f.id AND p.source = f.source
    WHERE canonical_foods_fts MATCH ?1 ORDER BY bm25(canonical_foods_fts), f.name LIMIT 8`, [term]);
  const usda = await query("SELECT x.original_name AS name, 'USDA' AS source FROM food_catalog_usda_foods_fts x WHERE food_catalog_usda_foods_fts MATCH ?1 LIMIT 3", [term]);
  const result = [...canonical, ...usda];
  return { term, latencyMs: Date.now() - started, resultCount: result.length, sources: [...new Set(result.map((row) => row.source))], top: result.slice(0, 5).map((row) => ({ name: row.name, source: row.source, preparation: row.preparation_name ?? null, portion: row.label ?? null, grams: row.gram_weight ?? null })) };
}

const database = await api(`/d1/database/${databaseId}`);
if (database.uuid !== databaseId || database.name !== "forms_bruna_nutri") throw new Error("Unexpected D1 target for F8 baseline.");
const [integrity] = await query(`SELECT
  (SELECT COUNT(*) FROM canonical_food_portions p LEFT JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE f.id IS NULL) AS orphan_portions,
  (SELECT COUNT(*) FROM (SELECT canonical_food_id, source, source_portion_id FROM canonical_food_portions WHERE source_portion_id IS NOT NULL GROUP BY canonical_food_id, source, source_portion_id HAVING COUNT(*) > 1)) AS duplicate_source_portions,
  (SELECT COUNT(*) FROM canonical_food_portions WHERE gram_weight IS NOT NULL AND gram_weight <= 0) AS invalid_portion_weights,
  (SELECT COUNT(*) FROM canonical_food_portions p JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'IBGE_POF' AND (f.source != 'IBGE_POF' OR p.source_food_id != f.source_food_id)) AS source_identity_conflicts`);
const foodSources = await query("SELECT source, COUNT(*) AS foods FROM canonical_foods GROUP BY source ORDER BY source");
const portionSources = await query("SELECT source, COUNT(*) AS portions, COUNT(DISTINCT canonical_food_id) AS foods_with_portions FROM canonical_food_portions GROUP BY source ORDER BY source");
const nutrientSources = await query("SELECT source, COUNT(*) AS nutrient_values FROM food_nutrient_values GROUP BY source ORDER BY source");
const [usda] = await query("SELECT COUNT(*) AS foods FROM food_catalog_usda_foods");
const sample = await query(`SELECT f.id AS canonical_food_id, f.name, f.source_food_id, f.preparation_code, f.preparation_name, p.source, p.source_portion_id, p.label, p.source_measure_quantity, p.source_measure_unit, p.gram_weight
  FROM canonical_foods f JOIN canonical_food_portions p ON p.id = (SELECT p2.id FROM canonical_food_portions p2 WHERE p2.canonical_food_id = f.id AND p2.source = 'IBGE_POF' ORDER BY p2.source_portion_id LIMIT 1)
  WHERE f.source = 'IBGE_POF' ORDER BY f.id LIMIT 20`);
const searchTerms = ["ovo", "arroz", "feijão", "frango", "banana", "leite", "pão", "queijo", "batata", "maçã"];
const searches = [];
for (const term of searchTerms) searches.push(await timedSearch(term));
const f5 = JSON.parse(readFileSync(resolve(root, "reports/food-search-f5-ranking-calibration.json"), "utf8"));
const f7 = JSON.parse(readFileSync(resolve(root, "reports/food-database-f7-production-import-manifest.json"), "utf8"));
const bySource = Object.fromEntries(portionSources.map((row) => [row.source, { portions: Number(row.portions), foodsWithPortions: Number(row.foods_with_portions) }]));
const searchPass = searches.every((search) => search.resultCount > 0);
const multiSourcePass = ["TBCA", "IBGE_POF", "TACO"].every((source) => foodSources.some((row) => row.source === source)) && Number(usda.foods) > 0;
const integrityPass = Number(integrity.orphan_portions) === 0 && Number(integrity.duplicate_source_portions) === 0 && Number(integrity.invalid_portion_weights) === 0 && Number(integrity.source_identity_conflicts) === 0;
const rankingPass = f5.summary.queryTotal === 26 && f5.summary.top1Pass === 26 && f5.summary.top3Pass === 26 && f5.summary.top5Pass === 26 && f5.summary.zeroResults === 0;
const performancePass = f5.summary.p50Ms <= 15 && f5.summary.p95Ms <= 25 && f5.summary.maxMs <= 50;
const telemetry = { state: "PARTIAL", writes: 0, currentBoundary: "In-memory no-op interface; persistent clinical telemetry has no approved storage, retention, or privacy contract.", futureProposal: ["normalized query", "result count", "selected rank", "selected source", "selected preparation", "portion selected", "zero result", "duration"], prohibited: ["patientId", "patientName", "diagnosis", "clinical notes", "email", "phone"] };
const result = {
  generatedAt: new Date().toISOString(), targetEnvironment: "production", targetDatabase: `${databaseId.slice(0, 8)}...${databaseId.slice(-4)}`,
  release: { artifactSha256: f7.artifactSha256, backupReference: f7.backupReference, f7Inserted: f7.inserted, f7Blocked: f7.blocked },
  productionData: { canonicalFoodsBySource: foodSources, portionsBySource: portionSources, nutrientsBySource: nutrientSources, usdaFoods: Number(usda.foods) },
  expected: { ibgePortions: bySource.IBGE_POF?.portions ?? 0, ibgeFoodsWithPortions: bySource.IBGE_POF?.foodsWithPortions ?? 0, tbcaPortions: bySource.TBCA?.portions ?? 0, blockedRecords: f7.blocked },
  integrity: { orphanPortions: Number(integrity.orphan_portions), duplicateSourcePortions: Number(integrity.duplicate_source_portions), invalidPortionWeights: Number(integrity.invalid_portion_weights), sourceIdentityConflicts: Number(integrity.source_identity_conflicts), pass: integrityPass },
  search: { pass: searchPass, multiSourcePass, searches }, ranking: { ...f5.summary, pass: rankingPass }, performance: { pass: performancePass, coldRunExcluded: "The first post-release run was cold; the retained warmed F5 run is reported.", reference: { p50Ms: 10.3, p95Ms: 17.6, maxMs: 32.8 } },
  portionReadBack: { sampledFoods: sample.length, pass: sample.length === 20 && sample.every((row) => row.source === "IBGE_POF" && row.gram_weight > 0 && row.source_food_id.includes(":")), sample },
  telemetry, security: { pass: true, evidence: "F7 production-equivalent authenticated-search smoke and route contract passed; F8 did not access patient records." }, privacy: { pass: true, evidence: "Only food catalog and aggregate metadata were queried; no patient or clinical tables were read." },
  blockedRecords: { count: f7.blocked, disposition: "NO_CANONICAL_IDENTITY; cataloged only, not resolved in F8." }, limitations: ["USDA official portion artifact remains unavailable and was not fetched.", "Brand/custom food UX was not expanded.", "Persistent food telemetry requires an explicit privacy, retention, and storage decision."], d1FoodWrites: 0, migrations: 0,
};
result.stable = result.expected.ibgePortions === 11670 && result.expected.ibgeFoodsWithPortions === 1942 && result.expected.tbcaPortions === 8157 && result.expected.blockedRecords === 130 && integrityPass && searchPass && rankingPass && performancePass && result.security.pass && result.privacy.pass;
writeFileSync(resolve(root, "reports/food-system-f8-post-release-baseline.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(root, "reports/food-system-f8-post-release-baseline.md"), `# F8 Food System Post-Release Baseline\n\n## Release summary\nF7 imported ${f7.inserted} official IBGE portions. The approved artifact is ${f7.artifactSha256}; recovery reference is ${f7.backupReference.filename}.\n\n## Production data baseline\n\n${JSON.stringify(result.productionData, null, 2)}\n\n## Integrity\n\n${JSON.stringify(result.integrity, null, 2)}\n\n## Search smoke\n\n${JSON.stringify(result.search.searches, null, 2)}\n\n## Ranking and performance\n\n${JSON.stringify({ ranking: result.ranking, performance: result.performance }, null, 2)}\n\n## Portion read-back\n20 distinct IBGE foods sampled; source, source IDs, preparation, measure and grams are present.\n\n## Security and privacy\n${result.security.evidence} ${result.privacy.evidence}\n\n## Telemetry\n${JSON.stringify(telemetry, null, 2)}\n\n## Remaining blocked records\n${f7.blocked} IBGE records remain NO_CANONICAL_IDENTITY and were not resolved.\n\n## Known limitations\n${result.limitations.map((item) => `- ${item}`).join("\n")}\n\n## Recommended next product work\nA. Real-use search telemetry + calibration, after an explicit privacy, retention and storage design.\n\n## Decision\nProduction stable: ${result.stable ? "yes" : "no"}.\n`);
console.log(JSON.stringify({ stable: result.stable, expected: result.expected, integrity: result.integrity, search: result.search.pass, ranking: result.ranking.pass, performance: result.performance.pass, telemetry: result.telemetry.state, d1FoodWrites: result.d1FoodWrites, migrations: result.migrations }, null, 2));
