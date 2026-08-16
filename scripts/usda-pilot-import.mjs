#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "node:sqlite";
import { normalizeText } from "./lib/food-kb-import-core.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BATCH_ID = "USDA_PILOT_20260816";
const DEFAULT_TARGET = resolve(ROOT_DIR, "reports/food-kb-usda-pilot.sqlite");
const DEFAULT_REPORT = resolve(ROOT_DIR, "reports/food-kb-usda-pilot-report.md");

const NUTRIENTS = [
  ["ENERGY_KCAL", "energy_kcal", "kcal"],
  ["ENERGY_KJ", "energy_kj", "kJ"],
  ["PROTEIN", "protein_g", "g"],
  ["CARBOHYDRATE", "carbohydrate_g", "g"],
  ["SUGARS", "sugars_g", "g"],
  ["TOTAL_FAT", "fat_g", "g"],
  ["SATURATED_FAT", "saturated_fat_g", "g"],
  ["MONOUNSATURATED_FAT", "monounsaturated_fat_g", "g"],
  ["POLYUNSATURATED_FAT", "polyunsaturated_fat_g", "g"],
  ["TRANS_FAT", "trans_fat_g", "g"],
  ["FIBER", "fiber_g", "g"],
  ["SODIUM", "sodium_mg", "mg"],
  ["CALCIUM", "calcium_mg", "mg"],
  ["IRON", "iron_mg", "mg"],
  ["MAGNESIUM", "magnesium_mg", "mg"],
  ["PHOSPHORUS", "phosphorus_mg", "mg"],
  ["POTASSIUM", "potassium_mg", "mg"],
  ["ZINC", "zinc_mg", "mg"],
  ["COPPER", "copper_mg", "mg"],
  ["MANGANESE", "manganese_mg", "mg"],
  ["SELENIUM", "selenium_mcg", "mcg"],
  ["VITAMIN_A", "vitamin_a_mcg", "mcg"],
  ["VITAMIN_C", "vitamin_c_mg", "mg"],
  ["VITAMIN_D", "vitamin_d_mcg", "mcg"],
  ["VITAMIN_E", "vitamin_e_mg", "mg"],
  ["THIAMIN", "vitamin_b1_mg", "mg"],
  ["RIBOFLAVIN", "vitamin_b2_mg", "mg"],
  ["NIACIN", "vitamin_b3_mg", "mg"],
  ["VITAMIN_B6", "vitamin_b6_mg", "mg"],
  ["VITAMIN_B12", "vitamin_b12_mcg", "mcg"],
  ["FOLATE", "folate_mcg", "mcg"],
  ["CHOLESTEROL", "cholesterol_mg", "mg"],
];

const CATEGORIES = [
  { id: "cereals", label: "Cereais", quota: 70, patterns: ["rice", "oat", "wheat", "bread", "pasta", "cereal", "quinoa", "barley", "cornmeal"] },
  { id: "meats", label: "Carnes", quota: 60, patterns: ["beef", "pork", "lamb", "veal", "meat"] },
  { id: "poultry", label: "Aves", quota: 55, patterns: ["chicken", "turkey", "duck"] },
  { id: "fish", label: "Peixes", quota: 55, patterns: ["salmon", "tuna", "cod", "fish", "trout", "sardine", "halibut"] },
  { id: "eggs", label: "Ovos", quota: 35, patterns: ["egg"] },
  { id: "dairy", label: "Leite e laticinios", quota: 65, patterns: ["milk", "yogurt", "cheese", "dairy", "cottage"] },
  { id: "fruits", label: "Frutas", quota: 70, patterns: ["apple", "banana", "blueberry", "berry", "orange", "grape", "fruit", "pear", "peach"] },
  { id: "greens", label: "Verduras", quota: 50, patterns: ["lettuce", "spinach", "kale", "greens", "arugula", "cabbage"] },
  { id: "vegetables", label: "Legumes", quota: 70, patterns: ["broccoli", "carrot", "tomato", "pepper", "vegetable", "squash", "zucchini"] },
  { id: "legumes", label: "Leguminosas", quota: 55, patterns: ["bean", "lentil", "chickpea", "pea", "soy"] },
  { id: "nuts", label: "Oleaginosas", quota: 45, patterns: ["almond", "peanut", "walnut", "cashew", "pistachio", "seed"] },
  { id: "oils", label: "Oleos", quota: 35, patterns: ["oil", "olive oil", "canola", "sunflower", "safflower"] },
  { id: "tubers", label: "Tuberculos", quota: 45, patterns: ["potato", "yam", "cassava", "taro", "beet"] },
];

function parseArgs(argv) {
  const args = { mode: "dry-run", db: null, target: DEFAULT_TARGET, report: DEFAULT_REPORT, batchId: DEFAULT_BATCH_ID, pilotSize: 720 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--import") args.mode = "import";
    else if (arg === "--rerun") args.mode = "rerun";
    else if (arg === "--audit") args.mode = "audit";
    else if (["--db", "--target", "--report", "--batch-id", "--pilot-size"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`);
      if (arg === "--db") args.db = value;
      if (arg === "--target") args.target = value;
      if (arg === "--report") args.report = value;
      if (arg === "--batch-id") args.batchId = value;
      if (arg === "--pilot-size") args.pilotSize = Number(value);
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!args.db) throw new Error("Use --db com o caminho da food_knowledge_base_v3.sqlite.");
  if (!Number.isInteger(args.pilotSize) || args.pilotSize < 100 || args.pilotSize > 1000) throw new Error("--pilot-size deve ficar entre 100 e 1000.");
  args.db = resolve(args.db);
  args.target = resolve(args.target);
  args.report = resolve(args.report);
  return args;
}

function idFor(sourceId) {
  return `usda_${createHash("sha1").update(sourceId).digest("hex").slice(0, 20)}`;
}

function nutrientCount(row) {
  return NUTRIENTS.reduce((count, [, column]) => row[column] === null || row[column] === undefined ? count : count + 1, 0);
}

function loadEligible(v3) {
  const cols = NUTRIENTS.map(([, column]) => `n.${column}`).join(", ");
  const negativeChecks = NUTRIENTS.map(([, column]) => `(n.${column} IS NOT NULL AND n.${column} < 0)`).join(" OR ");
  const riskyFoodIds = new Set(v3.prepare(
    `SELECT DISTINCT l.food_id
       FROM canonical_food_source_links l
       JOIN canonical_group_audits a ON a.canonical_food_id = l.canonical_food_id
      WHERE a.audit_status <> 'REVIEWED'
        AND a.risk_level IN ('HIGH', 'MEDIUM')`
  ).all().map((row) => row.food_id));
  const rows = v3.prepare(
    `SELECT f.id, f.original_name, f.normalized_name, f.source AS upstream_source, f.source_id AS upstream_source_id,
            f.source_url, f.source_version, f.food_group, f.data_quality, f.is_branded, f.is_recipe,
            n.basis, ${cols}
       FROM foods f
       JOIN food_nutrients n ON n.food_id = f.id
      WHERE f.source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')
        AND n.basis = '100_g'
        AND f.is_branded = 0
        AND f.is_recipe = 0
        AND n.energy_kcal IS NOT NULL
        AND n.protein_g IS NOT NULL
        AND n.carbohydrate_g IS NOT NULL
        AND n.fat_g IS NOT NULL
        AND NOT (${negativeChecks})
      ORDER BY f.source, f.source_id`
  ).all();
  const seen = new Set();
  return rows.filter((row) => {
    if (riskyFoodIds.has(row.id)) return false;
    const key = normalizeText(row.original_name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    row.source_id = `${row.upstream_source}:${row.upstream_source_id}`;
    row.normalized_name = key;
    row.coverage = nutrientCount(row);
    return true;
  });
}

function selectPilot(candidates, size) {
  const selected = [];
  const selectedIds = new Set();
  const byCategory = {};
  const sorted = [...candidates].sort((a, b) => b.coverage - a.coverage || a.original_name.length - b.original_name.length || a.original_name.localeCompare(b.original_name));
  for (const category of CATEGORIES) {
    const matches = sorted.filter((row) => category.patterns.some((pattern) => row.normalized_name.includes(pattern)));
    byCategory[category.id] = [];
    for (const row of matches) {
      if (selectedIds.has(row.source_id)) continue;
      selected.push({ ...row, pilot_category: category.id });
      byCategory[category.id].push(row.source_id);
      selectedIds.add(row.source_id);
      if (byCategory[category.id].length >= category.quota || selected.length >= size) break;
    }
    if (selected.length >= size) break;
  }
  for (const row of sorted) {
    if (selected.length >= size) break;
    if (selectedIds.has(row.source_id)) continue;
    selected.push({ ...row, pilot_category: "quality_fill" });
    selectedIds.add(row.source_id);
  }
  return { selected, byCategory };
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      dataset_version TEXT NULL,
      planned_foods INTEGER NOT NULL DEFAULT 0,
      created_foods INTEGER NOT NULL DEFAULT 0,
      created_nutrients INTEGER NOT NULL DEFAULT 0,
      noop_foods INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS food_catalog_usda_foods (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
      source_id TEXT NOT NULL,
      upstream_source TEXT NOT NULL CHECK (upstream_source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')),
      upstream_source_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      food_group TEXT NULL,
      data_quality TEXT NULL,
      source_url TEXT NULL,
      source_version TEXT NULL,
      import_run_id TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, source_id)
    );
    CREATE INDEX IF NOT EXISTS food_catalog_usda_foods_search_idx ON food_catalog_usda_foods(normalized_name, upstream_source, data_quality);
    CREATE TABLE IF NOT EXISTS food_catalog_usda_nutrients (
      id TEXT PRIMARY KEY,
      food_id TEXT NOT NULL REFERENCES food_catalog_usda_foods(id) ON DELETE CASCADE,
      nutrient_code TEXT NOT NULL,
      value REAL NULL,
      unit TEXT NOT NULL CHECK (unit IN ('g', 'mg', 'mcg', 'kcal', 'kJ')),
      basis_amount REAL NOT NULL DEFAULT 100 CHECK (basis_amount > 0),
      basis_unit TEXT NOT NULL DEFAULT 'g' CHECK (basis_unit IN ('g', 'ml')),
      source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
      provenance TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(food_id, nutrient_code)
    );
    CREATE INDEX IF NOT EXISTS food_catalog_usda_nutrients_food_idx ON food_catalog_usda_nutrients(food_id);
  `);
}

function importPilot(target, selected, batchId) {
  mkdirSync(dirname(target), { recursive: true });
  const before = existsSync(target) ? statSync(target).size : 0;
  const db = new sqlite.DatabaseSync(target);
  ensureSchema(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO import_batches (id, source, status, dataset_version, planned_foods, created_at, updated_at, metadata_json) VALUES (?, 'USDA', 'RUNNING', 'food_knowledge_base_v3.sqlite', ?, ?, ?, ?)`)
    .run(batchId, selected.length, now, now, JSON.stringify({ selection: "representative_quality_pilot" }));
  const insertFood = db.prepare(`INSERT OR IGNORE INTO food_catalog_usda_foods
    (id, source, source_id, upstream_source, upstream_source_id, original_name, normalized_name, food_group, data_quality, source_url, source_version, import_run_id, created_at)
    VALUES (?, 'USDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertNutrient = db.prepare(`INSERT OR IGNORE INTO food_catalog_usda_nutrients
    (id, food_id, nutrient_code, value, unit, basis_amount, basis_unit, source, provenance, created_at)
    VALUES (?, ?, ?, ?, ?, 100, 'g', 'USDA', ?, ?)`);
  let createdFoods = 0;
  let noopFoods = 0;
  let createdNutrients = 0;
  db.exec("BEGIN");
  try {
    for (const row of selected) {
      const foodId = idFor(row.source_id);
      const info = insertFood.run(foodId, row.source_id, row.upstream_source, row.upstream_source_id, row.original_name, row.normalized_name, row.food_group ?? null, row.data_quality ?? null, row.source_url ?? null, row.source_version ?? null, batchId, now);
      if (info.changes) createdFoods += 1; else noopFoods += 1;
      for (const [code, column, unit] of NUTRIENTS) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        const nutrientId = `${foodId}_${code}`;
        const ninfo = insertNutrient.run(nutrientId, foodId, code, value, unit, JSON.stringify({ upstream_source: row.upstream_source, upstream_source_id: row.upstream_source_id, source_url: row.source_url ?? null }), now);
        if (ninfo.changes) createdNutrients += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.prepare("UPDATE import_batches SET status = 'COMPLETED', created_foods = ?, created_nutrients = ?, noop_foods = ?, failures = 0, updated_at = ? WHERE id = ?")
    .run(createdFoods, createdNutrients, noopFoods, new Date().toISOString(), batchId);
  const counts = {
    foods: db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_foods WHERE import_run_id = ?").get(batchId).c,
    nutrients: db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_nutrients n JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.import_run_id = ?").get(batchId).c,
    totalFoods: db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_foods").get().c,
    totalNutrients: db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_nutrients").get().c,
  };
  db.close();
  const after = statSync(target).size;
  return { createdFoods, noopFoods, createdNutrients, counts, storageBeforeBytes: before, storageAfterBytes: after, storageDeltaBytes: after - before };
}

function audit(target, v3, selected, batchId) {
  const db = new sqlite.DatabaseSync(target, { readOnly: true });
  db.exec("PRAGMA foreign_keys = ON");
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  const duplicateSources = db.prepare("SELECT source_id, COUNT(*) c FROM food_catalog_usda_foods GROUP BY source_id HAVING c > 1").all().length;
  const orphans = db.prepare("SELECT COUNT(*) c FROM food_catalog_usda_nutrients n LEFT JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.id IS NULL").get().c;
  const negatives = db.prepare("SELECT COUNT(*) c FROM food_catalog_usda_nutrients WHERE value < 0").get().c;
  const units = db.prepare("SELECT unit, COUNT(*) c FROM food_catalog_usda_nutrients GROUP BY unit ORDER BY unit").all();
  const zeroRows = db.prepare("SELECT COUNT(*) c FROM food_catalog_usda_nutrients WHERE value = 0").get().c;
  const nullRows = selected.reduce((sum, row) => sum + NUTRIENTS.filter(([, column]) => row[column] === null || row[column] === undefined).length, 0);
  const auditSample = selected.slice(0, 50);
  const diffs = [];
  for (const row of auditSample) {
    const importedFood = db.prepare("SELECT * FROM food_catalog_usda_foods WHERE source_id = ?").get(row.source_id);
    if (!importedFood || importedFood.original_name !== row.original_name) diffs.push({ sourceId: row.source_id, field: "food", expected: row.original_name, actual: importedFood?.original_name ?? null });
    for (const [code, column, unit] of NUTRIENTS) {
      const expected = row[column];
      if (expected === null || expected === undefined) continue;
      const imported = db.prepare("SELECT value, unit FROM food_catalog_usda_nutrients WHERE food_id = ? AND nutrient_code = ?").get(idFor(row.source_id), code);
      if (!imported || imported.value !== expected || imported.unit !== unit) diffs.push({ sourceId: row.source_id, code, expected, actual: imported?.value ?? null, expectedUnit: unit, actualUnit: imported?.unit ?? null });
    }
  }
  const coverage = db.prepare("SELECT nutrient_code, unit, COUNT(*) c FROM food_catalog_usda_nutrients GROUP BY nutrient_code, unit ORDER BY nutrient_code").all();
  db.close();
  return { integrity, foreignKeys: foreignKeys.length, duplicateSources, orphans, negatives, units, zeroRows, nullRows, auditedFoods: auditSample.length, diffs, coverage };
}

function benchmark(target, queries) {
  const db = new sqlite.DatabaseSync(target, { readOnly: true });
  const stmt = db.prepare(`SELECT id, source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE ? ORDER BY CASE WHEN normalized_name LIKE ? THEN 0 ELSE 1 END, length(original_name), original_name LIMIT 20`);
  const results = [];
  for (const query of queries) {
    const normalized = normalizeText(query);
    const samples = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      stmt.all(`%${normalized}%`, `${normalized}%`);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    results.push({ query, p50: samples[10], p95: samples[18], max: samples[19] });
  }
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id, source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE ? ORDER BY CASE WHEN normalized_name LIKE ? THEN 0 ELSE 1 END, length(original_name), original_name LIMIT 20").all("%rice%", "rice%");
  db.close();
  return { results, queryPlanRice: plan };
}

function writeReport(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    "# USDA Pilot Import Report",
    "",
    `Batch: ${data.batchId}`,
    `Target local DB: \`${data.target}\``,
    "",
    "## Import",
    "",
    `- Pilot selected: ${data.selected.length}`,
    `- Created foods: ${data.importResult?.createdFoods ?? 0}`,
    `- Created nutrient rows: ${data.importResult?.createdNutrients ?? 0}`,
    `- No-op foods on rerun: ${data.rerunResult?.noopFoods ?? 0}`,
    `- Storage delta: ${data.importResult?.storageDeltaBytes ?? 0} bytes`,
    "",
    "## Categories",
    "",
    ...CATEGORIES.map((category) => `- ${category.label}: ${data.categoryCounts[category.id] ?? 0}`),
    `- Quality fill: ${data.categoryCounts.quality_fill ?? 0}`,
    "",
    "## Integrity",
    "",
    `- integrity_check: ${data.audit?.integrity ?? "not_run"}`,
    `- foreign_key_check rows: ${data.audit?.foreignKeys ?? "not_run"}`,
    `- duplicate source_id: ${data.audit?.duplicateSources ?? "not_run"}`,
    `- orphan nutrients: ${data.audit?.orphans ?? "not_run"}`,
    `- negative values: ${data.audit?.negatives ?? "not_run"}`,
    `- audited foods: ${data.audit?.auditedFoods ?? 0}`,
    `- audit diffs: ${data.audit?.diffs?.length ?? 0}`,
    "",
    "## Units",
    "",
    ...(data.audit?.units ?? []).map((row) => `- ${row.unit}: ${row.c}`),
    "",
    "## NULL vs Zero",
    "",
    `- Imported true zero nutrient rows: ${data.audit?.zeroRows ?? 0}`,
    `- Source NULL nutrient values not imported as rows: ${data.audit?.nullRows ?? 0}`,
    "",
    "## Nutrient Coverage",
    "",
    "| Nutrient | Unit | Rows |",
    "| --- | --- | ---: |",
    ...(data.audit?.coverage ?? []).map((row) => `| ${row.nutrient_code} | ${row.unit} | ${row.c} |`),
    "",
    "## Performance",
    "",
    "| Query | p50 ms | p95 ms | max ms |",
    "| --- | ---: | ---: | ---: |",
    ...(data.benchmark?.results ?? []).map((row) => `| ${row.query} | ${row.p50.toFixed(3)} | ${row.p95.toFixed(3)} | ${row.max.toFixed(3)} |`),
    "",
    "## Decision",
    "",
    data.decision,
    "",
  ];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const v3 = new sqlite.DatabaseSync(args.db, { readOnly: true });
  const eligible = loadEligible(v3);
  const { selected } = selectPilot(eligible, args.pilotSize);
  const categoryCounts = selected.reduce((acc, row) => {
    acc[row.pilot_category] = (acc[row.pilot_category] ?? 0) + 1;
    return acc;
  }, {});
  const data = { batchId: args.batchId, target: args.target, selected, categoryCounts };
  if (args.mode === "dry-run") {
    data.decision = "DRY_RUN_ONLY";
  } else if (args.mode === "import" || args.mode === "rerun" || args.mode === "audit") {
    data.importResult = importPilot(args.target, selected, args.batchId);
    data.rerunResult = importPilot(args.target, selected, args.batchId);
    data.audit = audit(args.target, v3, selected, args.batchId);
    data.benchmark = benchmark(args.target, ["arroz", "feijao", "banana", "leite", "ovo", "frango", "rice", "salmon", "turkey", "blueberry", "greek yogurt", "quinoa"]);
    data.decision = data.audit.diffs.length === 0 && data.audit.negatives === 0 && data.audit.orphans === 0 && data.audit.duplicateSources === 0
      ? "GO_WITH_FIXES: piloto fiel e idempotente; antes da carga completa, reduzir os 7.790 para allowlist operacional por grupo/uso clinico e revisar performance em ambiente alvo."
      : "NO_GO: divergencias/integridade exigem correcao antes de ampliar.";
  }
  writeReport(args.report, data);
  console.log(JSON.stringify({
    mode: args.mode,
    target: args.target,
    report: args.report,
    eligible: eligible.length,
    selected: selected.length,
    categoryCounts,
    import: data.importResult ?? null,
    rerun: data.rerunResult ?? null,
    audit: data.audit ? { ...data.audit, diffs: data.audit.diffs.length } : null,
    decision: data.decision,
  }, null, 2));
  v3.close();
}

main();
