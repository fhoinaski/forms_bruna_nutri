import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import XLSX from "xlsx";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
export const IBGE_ARTIFACT_SHA256 = "3d0ff06acf0b55c22a621f57e6fb218d4505af204ed2be1571bfbe02fbab17c9";
export const IBGE_ARTIFACT_PATH = "data-local/ibge-pof-2008-2009-reference-measures-db.zip";

const value = (input) => input === null || input === undefined || String(input).trim() === "" ? null : String(input).trim();
const numeric = (input) => { const parsed = Number(input); return Number.isFinite(parsed) ? parsed : null; };
const hash = (input) => createHash("sha256").update(input).digest("hex");
export const portionId = (foodCode, preparationCode, measureCode) => `${foodCode}:${preparationCode}:${measureCode}`;

export function assertArtifact(path = IBGE_ARTIFACT_PATH) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Official IBGE artifact not found: ${resolved}`);
  const sha256 = hash(readFileSync(resolved));
  if (sha256 !== IBGE_ARTIFACT_SHA256) throw new Error(`IBGE artifact checksum mismatch: expected ${IBGE_ARTIFACT_SHA256}, got ${sha256}`);
  return { path: resolved, sha256 };
}

export function readIbgePortions(artifactPath = IBGE_ARTIFACT_PATH) {
  assertArtifact(artifactPath);
  const workbook = XLSX.read(execFileSync("tar", ["-xOf", resolve(artifactPath), "tabelamedidas_bd.xls"], { maxBuffer: 8 * 1024 * 1024 }), { type: "buffer", dense: true, codepage: 1252 });
  const sheet = workbook.Sheets["Tab_Medidas Caseiras"];
  if (!sheet) throw new Error("Official IBGE worksheet Tab_Medidas Caseiras is missing.");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  return rows.slice(5).map((row) => ({
    foodCode: value(row[0]), foodName: value(row[1]), preparationCode: value(row[2]), preparationName: value(row[3]),
    measureCode: value(row[4]), measure: value(row[5]), standardMeasureCode: value(row[6]), standardMeasure: value(row[7]),
    grams: numeric(row[8]), referenceSourceCode: value(row[9]), rawDescription: value(row[10]),
  })).filter((row) => row.foodCode && row.preparationCode && row.measureCode);
}

export function buildImportPlan(portions, canonicalRows, existingRows) {
  const canonicalBySourceId = new Map(canonicalRows.map((row) => [String(row.source_food_id), row]));
  const existingBySourcePortion = new Map(existingRows.filter((row) => row.source === "IBGE_POF" && row.source_portion_id).map((row) => [String(row.source_portion_id), row]));
  const existingEquivalent = new Set(existingRows.map((row) => `${row.canonical_food_id}|${row.label}|${row.gram_weight}`));
  const counts = { SOURCE_TOTAL: portions.length, MAPPED_TO_CANONICAL: 0, BLOCKED_NO_CANONICAL: 0, BLOCKED_AMBIGUOUS: 0, INVALID: 0, ALREADY_EXISTS_EXACT: 0, ALREADY_EXISTS_EQUIVALENT: 0, NEW_PORTIONS: 0, CONFLICTS: 0 };
  const plan = [];
  for (const portion of portions) {
    const sourceFoodId = `${portion.foodCode}:${portion.preparationCode}`;
    const sourcePortionId = portionId(portion.foodCode, portion.preparationCode, portion.measureCode);
    if (!portion.grams || portion.grams <= 0 || !portion.measure) { counts.INVALID++; plan.push({ ...portion, sourceFoodId, sourcePortionId, status: "INVALID" }); continue; }
    const canonical = canonicalBySourceId.get(sourceFoodId);
    if (!canonical) { counts.BLOCKED_NO_CANONICAL++; plan.push({ ...portion, sourceFoodId, sourcePortionId, status: "PORTION_BLOCKED_NO_CANONICAL_FOOD" }); continue; }
    counts.MAPPED_TO_CANONICAL++;
    const label = `1 ${portion.measure}`;
    const existing = existingBySourcePortion.get(sourcePortionId);
    if (existing) {
      if (existing.canonical_food_id === canonical.id && Number(existing.gram_weight) === portion.grams && existing.label === label) { counts.ALREADY_EXISTS_EXACT++; plan.push({ ...portion, sourceFoodId, sourcePortionId, canonicalFoodId: canonical.id, label, status: "ALREADY_EXISTS_EXACT" }); }
      else { counts.CONFLICTS++; plan.push({ ...portion, sourceFoodId, sourcePortionId, canonicalFoodId: canonical.id, label, status: "SOURCE_PORTION_CONFLICT" }); }
      continue;
    }
    if (existingEquivalent.has(`${canonical.id}|${label}|${portion.grams}`)) { counts.ALREADY_EXISTS_EQUIVALENT++; plan.push({ ...portion, sourceFoodId, sourcePortionId, canonicalFoodId: canonical.id, label, status: "ALREADY_EXISTS_EQUIVALENT" }); continue; }
    counts.NEW_PORTIONS++;
    plan.push({ ...portion, sourceFoodId, sourcePortionId, canonicalFoodId: canonical.id, label, status: "NEW_PORTION" });
  }
  return { counts, plan };
}

export function openTestDb(testPath, baselinePath) {
  const target = resolve(testPath);
  if (!existsSync(target)) { mkdirSync(resolve(target, ".."), { recursive: true }); cpSync(resolve(baselinePath), target); }
  return new DatabaseSync(target);
}

export function importPlan(db, plan, runId) {
  const insertBatch = db.prepare("INSERT INTO import_batches (id, source, status, dataset_version, planned_foods, created_foods, created_nutrients, noop_foods, failures, created_at, updated_at, metadata_json) VALUES (?, 'IBGE_POF', 'running', 'POF_2008_2009_REFERENCE_MEASURES', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)");
  const insert = db.prepare("INSERT OR IGNORE INTO canonical_food_portions (id, canonical_food_id, source, source_food_id, source_portion_id, label, source_measure_quantity, source_measure_unit, source_measure_raw, parsed_label_grams, gram_weight, ml_weight, weight_source, confidence, import_batch_id, created_at) VALUES (?, ?, 'IBGE_POF', ?, ?, ?, 1, ?, ?, NULL, ?, NULL, 'structured_quantity', 'high', ?, CURRENT_TIMESTAMP)");
  const rows = plan.filter((row) => row.status === "NEW_PORTION");
  let inserted = 0;
  db.exec("BEGIN");
  try {
    insertBatch.run(runId, JSON.stringify({ artifactSha256: IBGE_ARTIFACT_SHA256, mode: "LOCAL_TEST_ONLY", sourceRows: plan.length }));
    for (const row of rows) inserted += Number(insert.run(`ibge_pof_portion_${hash(row.sourcePortionId).slice(0, 24)}`, row.canonicalFoodId, row.sourceFoodId, row.sourcePortionId, row.label, row.measure, row.rawDescription, row.grams, runId).changes);
    db.prepare("UPDATE import_batches SET status = 'completed', planned_foods = ?, created_foods = ?, noop_foods = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(rows.length, inserted, rows.length - inserted, runId);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return { inserted, planned: rows.length };
}
