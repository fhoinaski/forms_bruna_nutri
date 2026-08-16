#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "node:sqlite";
import {
  buildImportPlan,
  coerceNutritionNumber,
  normalizeSourceId,
  normalizeText,
  projectTacoRowsToCatalog,
  validateSource,
} from "./lib/food-kb-import-core.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, batchSize: 20, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--db" || arg === "--source" || arg === "--limit" || arg === "--batch-size" || arg === "--report") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`);
      index += 1;
      if (arg === "--db") args.db = value;
      if (arg === "--source") args.source = value.toUpperCase();
      if (arg === "--limit") args.limit = Number(value);
      if (arg === "--batch-size") args.batchSize = Number(value);
      if (arg === "--report") args.report = value;
      continue;
    }
    throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!args.db) throw new Error("Use --db com o caminho do food_knowledge_base_v3.sqlite.");
  if (!args.source) throw new Error("Use --source TACO, --source TBCA ou --source USDA.");
  validateSource(args.source);
  if (!args.dryRun) throw new Error("Esta fase aceita somente --dry-run; nenhuma escrita em D1 e permitida.");
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) throw new Error("--limit deve ser inteiro positivo.");
  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) throw new Error("--batch-size deve ser inteiro positivo.");
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT_DIR, path), "utf8"));
}

function rowsFromTacoFile(data) {
  return Array.isArray(data) ? data : data.alimentos ?? [];
}

async function loadExistingCatalog(source) {
  const tacoRows = rowsFromTacoFile(await readJson("lib/nutrition/data/taco.json"));
  const complementaryRows = rowsFromTacoFile(await readJson("lib/nutrition/data/taco-complementar.json"));
  if (source === "TACO") return projectTacoRowsToCatalog(tacoRows, { source: "TACO" });
  if (source === "USDA") return [];
  return projectTacoRowsToCatalog(complementaryRows.filter((row) => row.tbca_codigo), { source: "TBCA" });
}

function normalizeNutrients(row) {
  if (!row) return null;
  return {
    energyKcal: coerceNutritionNumber(row.energy_kcal),
    energyKj: coerceNutritionNumber(row.energy_kj),
    proteinG: coerceNutritionNumber(row.protein_g),
    carbohydrateG: coerceNutritionNumber(row.carbohydrate_g),
    sugarsG: coerceNutritionNumber(row.sugars_g),
    fatG: coerceNutritionNumber(row.fat_g),
    saturatedFatG: coerceNutritionNumber(row.saturated_fat_g),
    monounsaturatedFatG: coerceNutritionNumber(row.monounsaturated_fat_g),
    polyunsaturatedFatG: coerceNutritionNumber(row.polyunsaturated_fat_g),
    transFatG: coerceNutritionNumber(row.trans_fat_g),
    fiberG: coerceNutritionNumber(row.fiber_g),
    sodiumMg: coerceNutritionNumber(row.sodium_mg),
    calciumMg: coerceNutritionNumber(row.calcium_mg),
    ironMg: coerceNutritionNumber(row.iron_mg),
    magnesiumMg: coerceNutritionNumber(row.magnesium_mg),
    phosphorusMg: coerceNutritionNumber(row.phosphorus_mg),
    potassiumMg: coerceNutritionNumber(row.potassium_mg),
    zincMg: coerceNutritionNumber(row.zinc_mg),
    copperMg: coerceNutritionNumber(row.copper_mg),
    manganeseMg: coerceNutritionNumber(row.manganese_mg),
    seleniumMcg: coerceNutritionNumber(row.selenium_mcg),
    vitaminAMcg: coerceNutritionNumber(row.vitamin_a_mcg),
    vitaminCMg: coerceNutritionNumber(row.vitamin_c_mg),
    vitaminDMcg: coerceNutritionNumber(row.vitamin_d_mcg),
    vitaminEMg: coerceNutritionNumber(row.vitamin_e_mg),
    thiaminMg: coerceNutritionNumber(row.vitamin_b1_mg),
    riboflavinMg: coerceNutritionNumber(row.vitamin_b2_mg),
    niacinMg: coerceNutritionNumber(row.vitamin_b3_mg),
    vitaminB6Mg: coerceNutritionNumber(row.vitamin_b6_mg),
    vitaminB12Mcg: coerceNutritionNumber(row.vitamin_b12_mcg),
    folateMcg: coerceNutritionNumber(row.folate_mcg),
    cholesterolMg: coerceNutritionNumber(row.cholesterol_mg),
  };
}

function loadCandidates(db, source, limit) {
  if (source === "USDA") return loadUsdaCandidates(db, limit);
  const sqlLimit = limit === null ? "" : " LIMIT ?";
  const sourceWhere = source === "USDA" ? "source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')" : "source = ?";
  const foodRows = db
    .prepare(
      `SELECT id, display_name_pt, original_name, normalized_name, source, source_id, source_url, source_version, food_group, data_quality
              , is_branded, is_recipe, food_type, brand
       FROM foods
       WHERE ${sourceWhere}
       ORDER BY source_id${sqlLimit}`,
    )
    .all(...(source === "USDA" ? (limit === null ? [] : [limit]) : (limit === null ? [source] : [source, limit])));

  const nutrientStmt = db.prepare("SELECT * FROM food_nutrients WHERE food_id = ? LIMIT 1");
  const aliasStmt = db.prepare("SELECT alias, alias_type, source FROM food_aliases WHERE food_id = ? ORDER BY alias");
  const portionStmt = db.prepare("SELECT description, quantity, unit, gram_weight, source, source_id, confidence FROM food_portions WHERE food_id = ? ORDER BY gram_weight");
  const provenanceStmt = db.prepare(
    `SELECT source, source_id, source_url, source_version
     FROM provenance
     WHERE entity_type = 'food' AND entity_id = ?
     ORDER BY retrieved_at DESC
     LIMIT 1`,
  );
  const canonicalAuditStmt = db.prepare(
    `SELECT a.risk_level, a.audit_status, a.source_record_count
       FROM canonical_food_source_links l
       JOIN canonical_group_audits a ON a.canonical_food_id = l.canonical_food_id
      WHERE l.food_id = ?
      ORDER BY CASE a.risk_level WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END
      LIMIT 1`,
  );

  return foodRows.map((food) => {
    const name = food.display_name_pt ?? food.original_name;
    const sourceId = source === "USDA" ? `${food.source}:${food.source_id}` : String(food.source_id ?? "");
    const nutrientRow = nutrientStmt.get(food.id);
    return {
      id: food.id,
      source,
      upstreamSource: food.source,
      sourceId,
      normalizedSourceId: normalizeSourceId(food.source, sourceId),
      name,
      originalName: food.original_name ?? name,
      normalizedName: normalizeText(name),
      group: food.food_group ?? null,
      dataQuality: food.data_quality ?? null,
      isBranded: Boolean(food.is_branded),
      isRecipe: Boolean(food.is_recipe),
      basis: nutrientRow?.basis ?? null,
      sourceUrl: food.source_url ?? null,
      sourceVersion: food.source_version ?? null,
      nutrients: normalizeNutrients(nutrientRow),
      aliases: aliasStmt.all(food.id),
      portions: portionStmt.all(food.id),
      provenance: provenanceStmt.get(food.id) ?? null,
      canonicalAudit: canonicalAuditStmt.get(food.id) ?? null,
    };
  });
}

function loadUsdaCandidates(db, limit) {
  const sqlLimit = limit === null ? "" : " LIMIT ?";
  const rows = db.prepare(
    `SELECT
       f.id,
       f.display_name_pt,
       f.original_name,
       f.normalized_name,
       f.source AS upstream_source,
       f.source_id AS upstream_source_id,
       f.source_url,
       f.source_version,
       f.food_group,
       f.data_quality,
       f.is_branded,
       f.is_recipe,
       n.basis,
       n.energy_kcal,
       n.energy_kj,
       n.protein_g,
       n.carbohydrate_g,
       n.sugars_g,
       n.fat_g,
       n.saturated_fat_g,
       n.monounsaturated_fat_g,
       n.polyunsaturated_fat_g,
       n.trans_fat_g,
       n.fiber_g,
       n.sodium_mg,
       n.calcium_mg,
       n.iron_mg,
       n.magnesium_mg,
       n.phosphorus_mg,
       n.potassium_mg,
       n.zinc_mg,
       n.copper_mg,
       n.manganese_mg,
       n.selenium_mcg,
       n.vitamin_a_mcg,
       n.vitamin_c_mg,
       n.vitamin_d_mcg,
       n.vitamin_e_mg,
       n.vitamin_b1_mg,
       n.vitamin_b2_mg,
       n.vitamin_b3_mg,
       n.vitamin_b6_mg,
       n.vitamin_b12_mcg,
       n.folate_mcg,
       n.cholesterol_mg,
       a.risk_level,
       a.audit_status,
       a.source_record_count
     FROM foods f
     LEFT JOIN food_nutrients n ON n.food_id = f.id
     LEFT JOIN canonical_food_source_links l ON l.food_id = f.id
     LEFT JOIN canonical_group_audits a ON a.canonical_food_id = l.canonical_food_id
     WHERE f.source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')
     ORDER BY f.source, f.source_id${sqlLimit}`,
  ).all(...(limit === null ? [] : [limit]));

  return rows.map((food) => {
    const name = food.display_name_pt ?? food.original_name;
    const sourceId = `${food.upstream_source}:${food.upstream_source_id}`;
    return {
      id: food.id,
      source: "USDA",
      upstreamSource: food.upstream_source,
      sourceId,
      normalizedSourceId: normalizeSourceId("USDA", sourceId),
      name,
      originalName: food.original_name ?? name,
      normalizedName: normalizeText(name),
      group: food.food_group ?? null,
      dataQuality: food.data_quality ?? null,
      isBranded: Boolean(food.is_branded),
      isRecipe: Boolean(food.is_recipe),
      basis: food.basis ?? null,
      sourceUrl: food.source_url ?? null,
      sourceVersion: food.source_version ?? null,
      nutrients: food.basis ? normalizeNutrients(food) : null,
      aliases: [],
      portions: [],
      provenance: { source: food.upstream_source, source_id: food.upstream_source_id, source_url: food.source_url ?? null, source_version: food.source_version ?? null },
      canonicalAudit: food.risk_level ? { risk_level: food.risk_level, audit_status: food.audit_status, source_record_count: food.source_record_count } : null,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new sqlite.DatabaseSync(args.db, { readOnly: true });
  try {
    const candidates = loadCandidates(db, args.source, args.limit);
    const existingFoods = await loadExistingCatalog(args.source);
    const plan = buildImportPlan({
      source: args.source,
      candidates,
      existingFoods,
      limit: args.limit,
      batchSize: args.batchSize,
    });
    plan.input = {
      db: resolve(args.db),
      source: args.source,
      limit: args.limit,
      dryRun: args.dryRun,
      batchSize: args.batchSize,
    };
    plan.generatedAt = new Date().toISOString();
    if (args.source === "TBCA") {
      plan.licensing = {
        status: "BLOCKED_FOR_REAL_IMPORT",
        reason: "A fase atual valida somente o dry-run tecnico; a licenca TBCA ainda precisa de confirmacao antes de qualquer importacao real.",
      };
    }

    if (args.report) {
      const reportPath = resolve(ROOT_DIR, args.report);
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      plan.report = reportPath;
    }

    console.log(JSON.stringify({ input: plan.input, summary: plan.summary, reconciliation: plan.reconciliation.counts, report: plan.report ?? null }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
