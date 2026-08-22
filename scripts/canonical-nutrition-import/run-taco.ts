#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalFoodId, buildNutrientValueId } from "@/lib/nutrition-import/ids";
import { normalizeBasis, normalizeUnit } from "@/lib/nutrition-import/normalize-units";
import { normalizeStatus } from "@/lib/nutrition-import/normalize-status";
import { TACO_NUTRIENT_MAP } from "@/lib/nutrition-import/nutrient-mapping";
import type { CanonicalFoodRecord, FoodNutrientValueRecord } from "@/lib/nutrition-import/types";
import { openLocalCanonicalDb } from "./local-db";
import {
  buildNormalizedName,
  derivePreparationMethod,
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

interface TacoNutrientDefinition {
  id: string;
  name: string;
  unit: string;
  basis: string;
}

interface TacoNutrient {
  nutrient_id: string;
  name?: string | null;
  unit: string;
  basis?: string | null;
  value: number | null;
  status: string;
  raw: string | null;
}

interface TacoFood {
  id: string;
  source_food_id: string;
  name: string;
  basis: string;
  nutrients: TacoNutrient[];
}

interface TacoDocument {
  source: { version: string };
  nutrient_definitions: TacoNutrientDefinition[];
  foods: TacoFood[];
}

export function importTaco(filePath: string, db: ReturnType<typeof openLocalCanonicalDb>, importBatchId: string) {
  const { sha256, bytes } = fileHashOf(filePath);
  const doc = JSON.parse(readFileSync(filePath, "utf8")) as TacoDocument;
  startImportBatch(db, { id: importBatchId, source: "TACO", datasetVersion: doc.source.version, sourceFile: { path: filePath, sha256, bytes } });

  const counters = newCounters();
  const knownNutrientIds = new Set(doc.nutrient_definitions.map((d) => d.id));

  withTransaction(db, () => {
    for (const rawFood of doc.foods) {
      const canonicalFoodId = buildCanonicalFoodId("TACO", rawFood.source_food_id, null);
      const basis = normalizeBasis(rawFood.basis).basis ?? "per_100g_edible_portion";
      const food: CanonicalFoodRecord = {
        id: canonicalFoodId,
        source: "TACO",
        sourceVersion: doc.source.version,
        sourceFoodId: rawFood.source_food_id,
        sourceCollection: null,
        name: rawFood.name,
        scientificName: null,
        normalizedName: buildNormalizedName(rawFood.name),
        basis,
        classificationGroup: null,
        classificationFoodType: null,
        preparationMethod: derivePreparationMethod(rawFood.name),
        preparationCode: null,
        preparationName: null,
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
          preparation: food.preparationMethod,
          sourceFoodId: food.sourceFoodId,
        });
      } else {
        counters.foodsNoop += 1;
      }

      for (const nutrient of rawFood.nutrients) {
        if (!knownNutrientIds.has(nutrient.nutrient_id)) {
          recordUnmapped(counters, {
            source: "TACO",
            sourceNutrientId: nutrient.nutrient_id,
            sourceName: nutrient.name ?? null,
            unit: nutrient.unit,
            reason: "nutrient_id fora de nutrient_definitions do proprio arquivo",
          });
          continue;
        }
        const nutrientCode = TACO_NUTRIENT_MAP[nutrient.nutrient_id] ?? null;
        if (!nutrientCode) {
          recordUnmapped(counters, {
            source: "TACO",
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
          source: "TACO",
          sourceFoodId: rawFood.source_food_id,
          sourceRecordId: null,
          value: nutrient.value,
          unit: unitResult.unit ?? nutrient.unit,
          rawUnit: nutrient.unit,
          basis: normalizeBasis(nutrient.basis ?? rawFood.basis).basis ?? basis,
          status,
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
  const filePath = resolve(process.argv[2] ?? "F:/Downloads/nutritional_bases_json_package/package/json/taco.json");
  const dbPath = resolve(process.argv[3] ?? "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);
  const importBatchId = `TACO_${Date.now()}`;
  const { counters, totalFoods } = importTaco(filePath, db, importBatchId);
  db.close();
  console.log(JSON.stringify({ source: "TACO", totalFoods, counters: { ...counters, unmapped: Array.from(counters.unmapped.values()) } }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("run-taco.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
