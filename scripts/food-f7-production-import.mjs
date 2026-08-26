import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  IBGE_ARTIFACT_PATH,
  assertArtifact,
  buildImportPlan,
  portionId,
  readIbgePortions,
} from "./food-data/ibge-portion-import.mjs";

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
if (!process.argv.includes("--approved-f7-4")) throw new Error("Explicit F7.4 approval flag is required.");
if (!accountId || !databaseId || !apiToken) throw new Error("Cloudflare D1 credentials are unavailable.");

const backupFile = "bruna-nutri-2026-08-25T16-27-04-466Z.enc";
const approvedArtifact = "3d0ff06acf0b55c22a621f57e6fb218d4505af204ed2be1571bfbe02fbab17c9";
const expected = { sourceRows: 11800, newPortions: 11670, blocked: 130, tbca: 8157, nutrients: 636572 };
const BATCH_SIZE = 100;
const insertSql = "INSERT OR IGNORE INTO canonical_food_portions (id, canonical_food_id, source, source_food_id, source_portion_id, label, source_measure_quantity, source_measure_unit, source_measure_raw, parsed_label_grams, gram_weight, ml_weight, weight_source, confidence, import_batch_id, created_at) VALUES (?1, ?2, 'IBGE_POF', ?3, ?4, ?5, 1, ?6, ?7, NULL, ?8, NULL, 'structured_quantity', 'high', ?9, CURRENT_TIMESTAMP)";
const hash = (value) => createHash("sha256").update(value).digest("hex");

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
  if (!result[0]?.success) throw new Error("Cloudflare D1 query failed.");
  return result[0].results ?? [];
}

async function batch(statements) {
  const result = await api(`/d1/database/${databaseId}/query`, { method: "POST", body: JSON.stringify({ batch: statements }) });
  if (result.some((entry) => !entry.success)) throw new Error("Cloudflare D1 batch failed and was rolled back.");
  return result;
}

async function allRows(sql) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query(`${sql} LIMIT 500 OFFSET ?1`, [offset]);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function writeState(state) {
  writeFileSync(resolve(root, "reports/food-database-f7-production-import-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

const state = { startedAt: new Date().toISOString(), targetEnvironment: "production", attempted: 0, inserted: 0, skipped: 0, blocked: 0, failed: 0, conflicts: 0, lastSuccessfulBatch: -1, failedBatch: null, rollbackStatus: "not-applicable", importExecuted: false };
let runId = null;
try {
  const database = await api(`/d1/database/${databaseId}`);
  if (database.uuid !== databaseId || database.name !== "forms_bruna_nutri") throw new Error("Production D1 target identity is not the approved target.");
  if (!existsSync(resolve(root, "backups", backupFile))) throw new Error("Approved F7.1 backup reference is unavailable.");
  const artifact = assertArtifact(IBGE_ARTIFACT_PATH);
  if (artifact.sha256 !== approvedArtifact) throw new Error("IBGE artifact differs from the approved F7.2 checksum.");

  const sourcePortions = readIbgePortions();
  const canonicalRows = await allRows("SELECT id, source_food_id FROM canonical_foods WHERE source = 'IBGE_POF' ORDER BY id");
  const existingRows = await allRows("SELECT canonical_food_id, source, source_portion_id, label, gram_weight FROM canonical_food_portions ORDER BY id");
  const { counts, plan } = buildImportPlan(sourcePortions, canonicalRows, existingRows);
  const baseline = (await query(`SELECT
    (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'TBCA') AS tbca,
    (SELECT COUNT(*) FROM food_nutrient_values) AS nutrients,
    (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'IBGE_POF') AS ibge`))[0];
  const revalidationPass = counts.SOURCE_TOTAL === expected.sourceRows && counts.NEW_PORTIONS === expected.newPortions && counts.BLOCKED_NO_CANONICAL === expected.blocked && counts.CONFLICTS === 0 && counts.INVALID === 0 && counts.BLOCKED_AMBIGUOUS === 0 && Number(baseline.tbca) === expected.tbca && Number(baseline.nutrients) === expected.nutrients && Number(baseline.ibge) === 0;
  if (!revalidationPass) throw new Error(`Pre-write drift detected: ${JSON.stringify({ counts, baseline })}`);

  const rows = plan.filter((row) => row.status === "NEW_PORTION");
  state.attempted = rows.length;
  state.blocked = counts.BLOCKED_NO_CANONICAL;
  runId = `IBGE_POF_PORTIONS_PRODUCTION_${new Date().toISOString().replace(/[^0-9]/g, "")}`;
  const now = new Date().toISOString();
  await batch([{ sql: "INSERT INTO import_batches (id, source, status, dataset_version, planned_foods, created_foods, created_nutrients, noop_foods, failures, created_at, updated_at, metadata_json) VALUES (?1, 'IBGE_POF', 'RUNNING', 'POF_2008_2009_REFERENCE_MEASURES', ?2, 0, 0, 0, 0, ?3, ?3, ?4)", params: [runId, rows.length, now, JSON.stringify({ artifactSha256: artifact.sha256, approval: "F7.4", sourceRows: sourcePortions.length, blockedNoCanonical: state.blocked })] }]);

  for (let start = 0, batchIndex = 0; start < rows.length; start += BATCH_SIZE, batchIndex += 1) {
    const chunk = rows.slice(start, start + BATCH_SIZE);
    try {
      const result = await batch(chunk.map((row) => ({
        sql: insertSql,
        params: [`ibge_pof_portion_${hash(portionId(row.foodCode, row.preparationCode, row.measureCode)).slice(0, 24)}`, row.canonicalFoodId, row.sourceFoodId, row.sourcePortionId, row.label, row.measure, row.rawDescription, row.grams, runId],
      })));
      const changed = result.reduce((total, entry) => total + Number(entry.meta?.changes ?? 0), 0);
      state.inserted += changed;
      state.skipped += chunk.length - changed;
      state.lastSuccessfulBatch = batchIndex;
    } catch (error) {
      state.failed = rows.length - start;
      state.failedBatch = batchIndex;
      state.rollbackStatus = "failed-batch-rolled-back";
      await batch([{ sql: "UPDATE import_batches SET status = 'FAILED', created_foods = ?1, noop_foods = ?2, failures = ?3, updated_at = ?4, metadata_json = ?5 WHERE id = ?6", params: [state.inserted, state.skipped, state.failed, new Date().toISOString(), JSON.stringify({ ...state, error: error instanceof Error ? error.message : String(error) }), runId] }]);
      throw error;
    }
  }

  if (state.skipped !== 0 || state.inserted !== rows.length) throw new Error(`Unexpected insert count: ${JSON.stringify({ inserted: state.inserted, skipped: state.skipped, attempted: rows.length })}`);
  await batch([{ sql: "UPDATE import_batches SET status = 'COMPLETED', created_foods = ?1, noop_foods = ?2, failures = 0, updated_at = ?3, metadata_json = ?4 WHERE id = ?5", params: [state.inserted, state.skipped, new Date().toISOString(), JSON.stringify({ artifactSha256: artifact.sha256, sourceRows: sourcePortions.length, inserted: state.inserted, blockedNoCanonical: state.blocked, batchSize: BATCH_SIZE }), runId] }]);
  state.importExecuted = true;
  state.completedAt = new Date().toISOString();
  state.runId = runId;
  writeState(state);
  console.log(JSON.stringify(state, null, 2));
} catch (error) {
  state.error = error instanceof Error ? error.message : String(error);
  state.completedAt = new Date().toISOString();
  state.runId = runId;
  writeState(state);
  console.error(JSON.stringify(state, null, 2));
  process.exitCode = 1;
}
