#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalFoodId, buildNutrientValueId } from "@/lib/nutrition-import/ids";
import { normalizeBasis, normalizeUnit } from "@/lib/nutrition-import/normalize-units";
import { normalizeStatus } from "@/lib/nutrition-import/normalize-status";
import { POF_NUTRIENT_MAP } from "@/lib/nutrition-import/nutrient-mapping";
import type { CanonicalFoodRecord, FoodNutrientValueRecord } from "@/lib/nutrition-import/types";
import { openLocalCanonicalDb } from "./local-db";
import {
  buildNormalizedName,
  fileHashOf,
  finishImportBatch,
  insertCanonicalFood,
  insertFoodNutrientValue,
  insertFtsRow,
  newCounters,
  recordUnmapped,
  startImportBatch,
  withTransaction,
} from "./common";

interface PofNutrientDefinition {
  id: string;
  name: string;
  unit: string;
}

interface PofNutrient {
  nutrient_id: string;
  name?: string | null;
  unit: string;
  basis?: string | null;
  value: number | null;
  status: string;
  raw: string | null;
}

interface PofFood {
  id: string;
  source_food_id: string;
  name: string;
  basis: string;
  preparation?: { code: number | string | null; name: string | null } | null;
  nutrients: PofNutrient[];
}

interface PofDocument {
  source: { version: string };
  nutrient_definitions: PofNutrientDefinition[];
  foods: PofFood[];
}

/**
 * FASE 8 — a mesma comida POF pode existir em varias preparacoes (cru,
 * cozido, assado...). A propria fonte ja distingue isso por preparation.code
 * dentro de um source_food_id compartilhado (confirmado: food.id real e
 * "ibge_pof_2008_2009:<codigo>:<preparation.code>") — a chave natural do
 * canonical_food usa essa composicao, entao registros de preparo diferente
 * NUNCA colidem/fundem, mesmo com o mesmo codigo de alimento base.
 */
function compositeSourceFoodId(food: PofFood): string {
  if (food.preparation?.code !== undefined && food.preparation?.code !== null) {
    return `${food.source_food_id}:${food.preparation.code}`;
  }
  return food.source_food_id;
}

export function importPof(filePath: string, db: ReturnType<typeof openLocalCanonicalDb>, importBatchId: string) {
  const { sha256, bytes } = fileHashOf(filePath);
  const doc = JSON.parse(readFileSync(filePath, "utf8")) as PofDocument;
  startImportBatch(db, { id: importBatchId, source: "IBGE_POF", datasetVersion: doc.source.version, sourceFile: { path: filePath, sha256, bytes } });

  const counters = newCounters();
  const knownNutrientIds = new Set(doc.nutrient_definitions.map((d) => d.id));

  withTransaction(db, () => {
    for (const rawFood of doc.foods) {
      const sourceFoodId = compositeSourceFoodId(rawFood);
      const canonicalFoodId = buildCanonicalFoodId("IBGE_POF", sourceFoodId, null);
      const basis = normalizeBasis(rawFood.basis).basis ?? "per_100g_edible_portion";
      const food: CanonicalFoodRecord = {
        id: canonicalFoodId,
        source: "IBGE_POF",
        sourceVersion: doc.source.version,
        sourceFoodId,
        sourceCollection: null,
        name: rawFood.name,
        scientificName: null,
        normalizedName: buildNormalizedName(rawFood.name),
        basis,
        classificationGroup: null,
        classificationFoodType: null,
        preparationMethod: null, // POF ja tem preparation.code/name estruturado — nao inferido do nome como TACO/TBCA
        preparationCode: rawFood.preparation?.code !== undefined && rawFood.preparation?.code !== null ? String(rawFood.preparation.code) : null,
        preparationName: rawFood.preparation?.name ?? null,
        sourceDetailUrl: null,
      };
      const created = insertCanonicalFood(db, food, importBatchId);
      if (created) {
        counters.foodsCreated += 1;
        insertFtsRow(db, {
          foodId: food.id,
          name: food.name,
          normalizedName: food.normalizedName,
          scientificName: null,
          classification: null,
          preparation: food.preparationName,
          sourceFoodId: food.sourceFoodId,
        });
      } else {
        counters.foodsNoop += 1;
      }

      for (const nutrient of rawFood.nutrients) {
        if (!knownNutrientIds.has(nutrient.nutrient_id)) {
          recordUnmapped(counters, {
            source: "IBGE_POF",
            sourceNutrientId: nutrient.nutrient_id,
            sourceName: nutrient.name ?? null,
            unit: nutrient.unit,
            reason: "nutrient_id fora de nutrient_definitions do proprio arquivo",
          });
          continue;
        }
        const nutrientCode = POF_NUTRIENT_MAP[nutrient.nutrient_id] ?? null;
        if (!nutrientCode) {
          recordUnmapped(counters, {
            source: "IBGE_POF",
            sourceNutrientId: nutrient.nutrient_id,
            sourceName: nutrient.name ?? null,
            unit: nutrient.unit,
            reason: "sem NutrientCode equivalente no vocabulario atual",
          });
        }
        const unitResult = normalizeUnit(nutrient.unit);
        const status = normalizeStatus(nutrient.status);
        const record: FoodNutrientValueRecord = {
          id: buildNutrientValueId(canonicalFoodId, nutrient.nutrient_id, null),
          canonicalFoodId,
          nutrientCode,
          sourceNutrientId: nutrient.nutrient_id,
          source: "IBGE_POF",
          sourceFoodId,
          sourceRecordId: null,
          value: nutrient.value,
          unit: unitResult.unit ?? nutrient.unit,
          rawUnit: nutrient.unit,
          basis: normalizeBasis(nutrient.basis ?? rawFood.basis).basis ?? basis,
          status,
          // FASE 9 do doc canonico: POF documenta que "0,00" do PDF pode
          // significar "abaixo do limite de quantificacao", nao zero real —
          // preservamos o raw original tal como veio (nunca reescrito),
          // e o caveat fica soh no relatorio de importacao (nao no dado).
          rawValue: nutrient.raw !== null && nutrient.raw !== undefined ? String(nutrient.raw) : null,
          portionId: null,
        };
        if (insertFoodNutrientValue(db, record, importBatchId)) counters.nutrientValuesCreated += 1;
        else counters.nutrientValuesNoop += 1;
      }
    }
  });

  finishImportBatch(db, importBatchId, {
    status: "completed",
    plannedFoods: doc.foods.length,
    createdFoods: counters.foodsCreated,
    createdNutrients: counters.nutrientValuesCreated,
    noopFoods: counters.foodsNoop,
    failures: counters.failures,
  });

  return { counters, totalFoods: doc.foods.length };
}

async function main() {
  const filePath = resolve(process.argv[2] ?? "F:/Downloads/nutritional_bases_json_package/package/json/ibge_pof_2008_2009.json");
  const dbPath = resolve(process.argv[3] ?? "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);
  const importBatchId = `IBGE_POF_${Date.now()}`;
  const { counters, totalFoods } = importPof(filePath, db, importBatchId);
  db.close();
  console.log(JSON.stringify({ source: "IBGE_POF", totalFoods, counters: { ...counters, unmapped: Array.from(counters.unmapped.values()) } }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("run-pof.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
