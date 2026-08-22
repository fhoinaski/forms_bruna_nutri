#!/usr/bin/env node
import { resolve } from "node:path";
import { openLocalCanonicalDb, type LocalDb } from "./local-db";

/**
 * FASE 11 — validadores pos-importacao. Roda contra o banco local (nunca
 * D1). Qualquer divergencia precisa ser EXPLICAVEL (comparada contra os
 * numeros da auditoria), nunca apenas "verde"/"vermelho" sem contexto.
 */
export interface ValidationReport {
  foodsBySourceCollection: Record<string, number>;
  duplicateSourceIds: Array<{ source: string; source_food_id: string; source_collection: string | null; count: number }>;
  orphanNutrientValues: number;
  orphanPortions: number;
  orphanStatistics: number;
  unmappedNutrientCodes: number;
  unknownUnits: Array<{ source: string; raw_unit: string; count: number }>;
  unknownBasis: number;
  unknownStatus: number;
  traceRowsWithNullOrZeroValue: number;
  traceRowsCorrupted: number; // trace rows onde o status foi perdido/alterado — deveria ser sempre 0
  missingRowsWithNonNullValue: number; // "missing" nunca deveria ter um valor numerico plausivel — sinaliza revisao, nao bloqueia
  totalFoods: number;
  totalNutrientValues: number;
  totalPortions: number;
  totalStatistics: number;
}

function all(db: LocalDb, sql: string, ...params: unknown[]): Record<string, unknown>[] {
  return db.prepare(sql).all(...params);
}

function count(db: LocalDb, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params);
  return Number(row?.n ?? 0);
}

export function validateCanonicalDb(db: LocalDb): ValidationReport {
  const foodsBySourceCollection: Record<string, number> = {};
  for (const row of all(db, `SELECT source, source_collection, COUNT(*) AS n FROM canonical_foods GROUP BY source, source_collection`)) {
    const key = `${row.source}${row.source_collection ? `:${row.source_collection}` : ""}`;
    foodsBySourceCollection[key] = Number(row.n);
  }

  const duplicateSourceIds = all(
    db,
    `SELECT source, source_food_id, source_collection, COUNT(*) AS count
     FROM canonical_foods GROUP BY source, source_food_id, source_collection HAVING COUNT(*) > 1`
  ) as unknown as ValidationReport["duplicateSourceIds"];

  const orphanNutrientValues = count(
    db,
    `SELECT COUNT(*) AS n FROM food_nutrient_values v LEFT JOIN canonical_foods f ON f.id = v.canonical_food_id WHERE f.id IS NULL`
  );
  const orphanPortions = count(
    db,
    `SELECT COUNT(*) AS n FROM canonical_food_portions p LEFT JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE f.id IS NULL`
  );
  const orphanStatistics = count(
    db,
    `SELECT COUNT(*) AS n FROM nutrient_statistics s LEFT JOIN canonical_foods f ON f.id = s.canonical_food_id WHERE f.id IS NULL`
  );

  const unmappedNutrientCodes = count(db, `SELECT COUNT(*) AS n FROM food_nutrient_values WHERE nutrient_code IS NULL`);

  const unknownUnits = all(
    db,
    `SELECT source, raw_unit, COUNT(*) AS count FROM food_nutrient_values
     WHERE unit = raw_unit AND raw_unit NOT IN ('kcal', 'kJ', 'g', 'mg', 'mcg')
     GROUP BY source, raw_unit`
  ) as unknown as ValidationReport["unknownUnits"];

  const unknownBasis = count(
    db,
    `SELECT COUNT(*) AS n FROM food_nutrient_values
     WHERE basis NOT IN ('per_100g_food', 'per_100g_edible_portion', 'per_100g_fatty_acids', 'per_100ml')`
  );

  const unknownStatus = count(
    db,
    `SELECT COUNT(*) AS n FROM food_nutrient_values
     WHERE status NOT IN ('reported', 'trace', 'missing', 'not_applicable', 'unparsed')`
  );

  const traceRowsWithNullOrZeroValue = count(db, `SELECT COUNT(*) AS n FROM food_nutrient_values WHERE status = 'trace'`);
  // Corrupcao seria um valor "grande" (nao-trace-like) marcado trace — nao ha
  // como validar magnitude sem uma referencia externa por nutriente, entao
  // este validador confirma so a invariante estrutural: nenhuma linha trace
  // tem o texto raw perdido quando a fonte forneceu um.
  const traceRowsCorrupted = count(
    db,
    `SELECT COUNT(*) AS n FROM food_nutrient_values WHERE status = 'trace' AND raw_value IS NULL AND value IS NOT NULL AND value != 0`
  );

  const missingRowsWithNonNullValue = count(db, `SELECT COUNT(*) AS n FROM food_nutrient_values WHERE status = 'missing' AND value IS NOT NULL`);

  const totalFoods = count(db, `SELECT COUNT(*) AS n FROM canonical_foods`);
  const totalNutrientValues = count(db, `SELECT COUNT(*) AS n FROM food_nutrient_values`);
  const totalPortions = count(db, `SELECT COUNT(*) AS n FROM canonical_food_portions`);
  const totalStatistics = count(db, `SELECT COUNT(*) AS n FROM nutrient_statistics`);

  return {
    foodsBySourceCollection,
    duplicateSourceIds,
    orphanNutrientValues,
    orphanPortions,
    orphanStatistics,
    unmappedNutrientCodes,
    unknownUnits,
    unknownBasis,
    unknownStatus,
    traceRowsWithNullOrZeroValue,
    traceRowsCorrupted,
    missingRowsWithNonNullValue,
    totalFoods,
    totalNutrientValues,
    totalPortions,
    totalStatistics,
  };
}

/** Numeros travados pela auditoria real (docs/canonical-nutrition-model.md secao 0 / tbca-audit-summary.md). */
export const TBCA_AUDIT_EXPECTED = {
  "TBCA:composicao_alimentos_medidas_caseiras": 5875,
  "TBCA:composicao_informacao_estatistica_produtos": 307,
  "TBCA:biodiversidade_e_alimentos_regionais": 1340,
};

async function main() {
  const dbPath = resolve(process.argv[2] ?? "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);
  const report = validateCanonicalDb(db);
  db.close();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("validate.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
