import { execFileSync } from "node:child_process";
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
const arg = (name, fallback = "N-A") => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;

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
  const result = await api(`/d1/database/${databaseId}/query`, { method: "POST", body: JSON.stringify(params.length ? { sql, params } : { sql }) });
  if (!result[0]?.success) throw new Error("Cloudflare D1 read-back query failed.");
  return result[0].results ?? [];
}
async function timed(label, sql, params = []) {
  const started = Date.now();
  const rows = await query(sql, params);
  return { label, elapsedMs: Date.now() - started, rows: rows.length };
}

const database = await api(`/d1/database/${databaseId}`);
if (database.uuid !== databaseId || database.name !== "forms_bruna_nutri") throw new Error("Unexpected D1 target during read-back.");
const [counts] = await query(`SELECT
  (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'IBGE_POF') AS ibge_portions,
  (SELECT COUNT(DISTINCT canonical_food_id) FROM canonical_food_portions WHERE source = 'IBGE_POF') AS ibge_foods,
  (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'TBCA') AS tbca_portions,
  (SELECT COUNT(*) FROM food_nutrient_values) AS nutrient_values,
  (SELECT COUNT(*) FROM canonical_food_portions p LEFT JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'IBGE_POF' AND f.id IS NULL) AS orphan_portions,
  (SELECT COUNT(*) FROM (SELECT source_portion_id FROM canonical_food_portions WHERE source = 'IBGE_POF' GROUP BY source_portion_id HAVING COUNT(*) > 1)) AS duplicate_source_portions,
  (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'IBGE_POF' AND (gram_weight IS NULL OR gram_weight <= 0)) AS invalid_portion_weights,
  (SELECT COUNT(*) FROM canonical_food_portions p JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'IBGE_POF' AND (f.source != 'IBGE_POF' OR p.source_food_id != f.source_food_id)) AS source_provenance_failures,
  (SELECT COUNT(*) FROM canonical_food_portions p JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'IBGE_POF' AND instr(p.source_food_id, ':') = 0) AS preparation_binding_failures`);
const samples = await query(`SELECT f.id AS canonical_food_id, f.name, f.source_food_id, f.preparation_code, f.preparation_name, p.source, p.source_portion_id, p.label, p.source_measure_quantity, p.source_measure_unit, p.gram_weight
  FROM canonical_foods f JOIN canonical_food_portions p ON p.canonical_food_id = f.id
  WHERE p.source = 'IBGE_POF' AND f.id IN (SELECT DISTINCT canonical_food_id FROM canonical_food_portions WHERE source = 'IBGE_POF' ORDER BY canonical_food_id LIMIT 20)
  ORDER BY f.id, p.source_portion_id`);
const goldenTerms = ["ovo", "arroz", "feij", "banana", "leite", "frango", "pao", "queijo", "batata", "ma"].map((term) => ({ term, found: 0 }));
for (const golden of goldenTerms) golden.found = Number((await query("SELECT COUNT(*) AS count FROM canonical_foods f JOIN canonical_food_portions p ON p.canonical_food_id = f.id WHERE p.source = 'IBGE_POF' AND lower(f.name) LIKE ?1", [`%${golden.term}%`]))[0]?.count ?? 0);
const performance = [];
for (const term of ["ovo", "arroz", "feijao", "frango", "banana"]) performance.push(await timed(term, "SELECT food_id, name FROM canonical_foods_fts WHERE canonical_foods_fts MATCH ?1 LIMIT 20", [term]));
const idempotency = JSON.parse(readFileSync(resolve(root, "reports/food-database-f7-production-dry-run.json"), "utf8"));
const importState = JSON.parse(readFileSync(resolve(root, "reports/food-database-f7-production-import-state.json"), "utf8"));
const qa = { searchSmoke: arg("--search-smoke"), ibgePortionUi: arg("--portion-ui"), quantityGramsSync: arg("--quantity-grams"), nutritionEngineAuthority: arg("--nutrition-engine"), security: arg("--security") };
const integrityPass = Number(counts.ibge_portions) === 11670 && Number(counts.ibge_foods) === 1942 && Number(counts.tbca_portions) === 8157 && Number(counts.nutrient_values) === 636572 && Number(counts.orphan_portions) === 0 && Number(counts.duplicate_source_portions) === 0 && Number(counts.invalid_portion_weights) === 0 && Number(counts.source_provenance_failures) === 0 && Number(counts.preparation_binding_failures) === 0;
const idempotencyPass = Number(idempotency.counts.NEW_PORTIONS) === 0 && Number(idempotency.counts.ALREADY_EXISTS_EXACT) === 11670 && Number(idempotency.counts.CONFLICTS) === 0 && Number(idempotency.counts.INVALID) === 0 && Number(idempotency.counts.BLOCKED_AMBIGUOUS) === 0;
const qaPass = qa.searchSmoke === "PASS" && qa.security === "PASS" && [qa.ibgePortionUi, qa.quantityGramsSync, qa.nutritionEngineAuthority].every((value) => value === "PASS" || value === "N-A");
const result = {
  timestamp: new Date().toISOString(), codeRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), targetEnvironment: "production", targetDatabase: `${databaseId.slice(0, 8)}...${databaseId.slice(-4)}`,
  artifactSha256: idempotency.artifact.sha256, backupReference: idempotency.backup, sourceRows: idempotency.sourceRows, dryRunNew: importState.attempted,
  attempted: importState.attempted, inserted: importState.inserted, skipped: importState.skipped, blocked: importState.blocked, failed: importState.failed, conflicts: importState.conflicts,
  postImportIbgePortions: Number(counts.ibge_portions), postImportIbgeFoods: Number(counts.ibge_foods), tbcaBefore: 8157, tbcaAfter: Number(counts.tbca_portions), nutrientBaselineBefore: 636572, nutrientBaselineAfter: Number(counts.nutrient_values),
  idempotencyDryRunNew: Number(idempotency.counts.NEW_PORTIONS), idempotencyExact: Number(idempotency.counts.ALREADY_EXISTS_EXACT), integrity: { orphanPortions: Number(counts.orphan_portions), duplicateSourcePortions: Number(counts.duplicate_source_portions), invalidPortionWeights: Number(counts.invalid_portion_weights), sourceProvenanceFailures: Number(counts.source_provenance_failures), preparationBindingFailures: Number(counts.preparation_binding_failures), pass: integrityPass },
  samples, goldenTerms, performance, qa, rollbackRequired: !integrityPass, rollbackExecuted: false, promotionReady: integrityPass && idempotencyPass && qaPass, promotionComplete: integrityPass && idempotencyPass && qaPass,
};
writeFileSync(resolve(root, "reports/food-database-f7-production-import-manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(root, "reports/food-database-f7-production-promotion.md"), `# F7 Production Promotion\n\n## Approval\nExplicit F7.4 approval was supplied in this task.\n\n## Pre-write and backup\n- Artifact: ${result.artifactSha256}\n- Backup: ${result.backupReference.filename} (${result.backupReference.checksum})\n\n## Import\n- Attempted/inserted/skipped: ${result.attempted}/${result.inserted}/${result.skipped}\n- Blocked NO_CANONICAL_IDENTITY: ${result.blocked}\n- Failed/conflicts: ${result.failed}/${result.conflicts}\n\n## Read-back\n- IBGE portions/foods: ${result.postImportIbgePortions}/${result.postImportIbgeFoods}\n- TBCA before/after: ${result.tbcaBefore}/${result.tbcaAfter}\n- Nutrients before/after: ${result.nutrientBaselineBefore}/${result.nutrientBaselineAfter}\n- Integrity: ${integrityPass ? "PASS" : "FAIL"}\n- Idempotency: ${idempotencyPass ? "PASS" : "FAIL"}\n\n## Product QA\n${JSON.stringify(qa, null, 2)}\n\n## Performance\n${JSON.stringify(performance, null, 2)}\n\n## Rollback\nRequired: ${result.rollbackRequired ? "yes" : "no"}; executed: no.\n\n## Decision\nPromotion complete: ${result.promotionComplete ? "yes" : "no"}.\n`);
console.log(JSON.stringify(result, null, 2));
