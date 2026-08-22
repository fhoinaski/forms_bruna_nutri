#!/usr/bin/env node
import { resolve } from "node:path";
import { iterateTbcaCollectionRecords, parseTbcaRawRecord } from "@/lib/nutrition-import/tbca-json-stream";
import { openLocalCanonicalDb } from "./local-db";
import { parseTbcaMainLikeFood, parseTbcaStatsFood, type TbcaMainFood, type TbcaStatsFood } from "./tbca-parse";
import {
  fileHashOf,
  finishImportBatch,
  insertCanonicalFood,
  insertFoodNutrientValue,
  insertFtsRow,
  insertNutrientStatistics,
  insertPortion,
  newCounters,
  startImportBatch,
  withTransaction,
  type ImportCounters,
} from "./common";

const TBCA_VERSION = "7.3";

// FASE 5: composicao_alimentos_medidas_caseiras_personalizadas e duplicata
// exata confirmada pela auditoria (5875/5875 EXACT_DUPLICATE) — nunca
// incluida aqui.
const MAIN_COLLECTION = "composicao_alimentos_medidas_caseiras";
const STATS_COLLECTION = "composicao_informacao_estatistica";
const PRODUCTS_COLLECTION = "composicao_informacao_estatistica_produtos";
const BIODIVERSITY_COLLECTION = "biodiversidade_e_alimentos_regionais";
const TARGET_COLLECTIONS = [MAIN_COLLECTION, STATS_COLLECTION, PRODUCTS_COLLECTION, BIODIVERSITY_COLLECTION] as const;

export interface TbcaImportResult {
  counters: ImportCounters;
  collectionCounts: Record<string, number>;
  statisticsOrphans: number; // registros de "estatistica" sem food correspondente na principal (esperado: 0, ver auditoria)
}

const BATCH_SIZE = 500;

export async function importTbca(filePath: string, db: ReturnType<typeof openLocalCanonicalDb>, importBatchId: string): Promise<TbcaImportResult> {
  const { sha256, bytes } = fileHashOf(filePath);
  startImportBatch(db, { id: importBatchId, source: "TBCA", datasetVersion: TBCA_VERSION, sourceFile: { path: filePath, sha256, bytes } });

  const counters = newCounters();
  const collectionCounts: Record<string, number> = Object.fromEntries(TARGET_COLLECTIONS.map((c) => [c, 0]));
  // Mapa (source_food_id -> canonical_food_id) construido enquanto a
  // colecao principal e processada, usado para ligar composicao_informacao_
  // estatistica ao food certo por identidade EXATA de source_food_id
  // (confirmado por leitura direta do arquivo real: os IDs sao literalmente
  // os mesmos nas duas colecoes — nao e um match assistido/heuristico).
  const mainFoodIdBySourceId = new Map<string, string>();
  let statisticsOrphans = 0;

  let pendingOps: Array<() => void> = [];
  function flush() {
    if (pendingOps.length === 0) return;
    withTransaction(db, () => {
      for (const op of pendingOps) op();
    });
    pendingOps = [];
  }
  function queue(op: () => void) {
    pendingOps.push(op);
    if (pendingOps.length >= BATCH_SIZE) flush();
  }

  for await (const rawRecord of iterateTbcaCollectionRecords(filePath, TARGET_COLLECTIONS)) {
    collectionCounts[rawRecord.collection] += 1;

    if (rawRecord.collection === MAIN_COLLECTION || rawRecord.collection === BIODIVERSITY_COLLECTION) {
      const raw = parseTbcaRawRecord<TbcaMainFood>(rawRecord);
      const parsed = parseTbcaMainLikeFood(raw, rawRecord.collection, counters);
      if (rawRecord.collection === MAIN_COLLECTION) mainFoodIdBySourceId.set(raw.source_food_id, parsed.food.id);
      queue(() => {
        const created = insertCanonicalFood(db, parsed.food, importBatchId);
        if (created) {
          counters.foodsCreated += 1;
          insertFtsRow(db, {
            foodId: parsed.food.id,
            name: parsed.food.name,
            normalizedName: parsed.food.normalizedName,
            scientificName: parsed.food.scientificName,
            classification: [parsed.food.classificationGroup, parsed.food.classificationFoodType].filter(Boolean).join(" | ") || null,
            preparation: parsed.food.preparationMethod,
            sourceFoodId: parsed.food.sourceFoodId,
          });
        } else {
          counters.foodsNoop += 1;
        }
        for (const portion of parsed.portions) {
          if (insertPortion(db, portion, importBatchId)) counters.portionsCreated += 1;
          else counters.portionsNoop += 1;
        }
        for (const nutrientValue of parsed.nutrientValues) {
          if (insertFoodNutrientValue(db, nutrientValue, importBatchId)) counters.nutrientValuesCreated += 1;
          else counters.nutrientValuesNoop += 1;
        }
      });
      continue;
    }

    if (rawRecord.collection === STATS_COLLECTION) {
      const raw = parseTbcaRawRecord<TbcaStatsFood>(rawRecord);
      const targetFoodId = mainFoodIdBySourceId.get(raw.source_food_id) ?? null;
      if (!targetFoodId) {
        statisticsOrphans += 1;
        continue; // nunca inventa um food novo so pra pendurar estatistica — fica fora do relatorio de foods, contado a parte
      }
      const parsed = parseTbcaStatsFood(raw, rawRecord.collection, targetFoodId, counters);
      queue(() => {
        for (const stat of parsed.statistics) {
          if (insertNutrientStatistics(db, stat, importBatchId)) counters.statisticsCreated += 1;
          else counters.statisticsNoop += 1;
        }
      });
      continue;
    }

    if (rawRecord.collection === PRODUCTS_COLLECTION) {
      const raw = parseTbcaRawRecord<TbcaStatsFood>(rawRecord);
      const parsed = parseTbcaStatsFood(raw, rawRecord.collection, null, counters);
      queue(() => {
        if (parsed.food) {
          const created = insertCanonicalFood(db, parsed.food, importBatchId);
          if (created) {
            counters.foodsCreated += 1;
            insertFtsRow(db, {
              foodId: parsed.food.id,
              name: parsed.food.name,
              normalizedName: parsed.food.normalizedName,
              scientificName: parsed.food.scientificName,
              classification: [parsed.food.classificationGroup, parsed.food.classificationFoodType].filter(Boolean).join(" | ") || null,
              preparation: parsed.food.preparationMethod,
              sourceFoodId: parsed.food.sourceFoodId,
            });
          } else {
            counters.foodsNoop += 1;
          }
        }
        for (const stat of parsed.statistics) {
          if (insertNutrientStatistics(db, stat, importBatchId)) counters.statisticsCreated += 1;
          else counters.statisticsNoop += 1;
        }
        for (const nutrientValue of parsed.standaloneNutrientValues) {
          if (insertFoodNutrientValue(db, nutrientValue, importBatchId)) counters.nutrientValuesCreated += 1;
          else counters.nutrientValuesNoop += 1;
        }
      });
    }
  }

  flush();

  finishImportBatch(db, importBatchId, {
    status: "completed",
    plannedFoods: collectionCounts[MAIN_COLLECTION] + collectionCounts[PRODUCTS_COLLECTION] + collectionCounts[BIODIVERSITY_COLLECTION],
    createdFoods: counters.foodsCreated,
    createdNutrients: counters.nutrientValuesCreated,
    noopFoods: counters.foodsNoop,
    failures: counters.failures,
  });

  return { counters, collectionCounts, statisticsOrphans };
}

async function main() {
  // FASE 3: caminho oficial passa a ser data-local/ (gitignored, fora do
  // bundle). Mantido configuravel por argv para nao quebrar quem ainda
  // aponta pro caminho antigo/uma copia local diferente.
  const filePath = resolve(process.argv[2] ?? "data-local/tbca_completa.json");
  const dbPath = resolve(process.argv[3] ?? "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);
  const importBatchId = `TBCA_${Date.now()}`;
  const start = Date.now();
  const result = await importTbca(filePath, db, importBatchId);
  const elapsedSec = (Date.now() - start) / 1000;
  db.close();
  console.log(
    JSON.stringify(
      {
        source: "TBCA",
        elapsedSec,
        collectionCounts: result.collectionCounts,
        statisticsOrphans: result.statisticsOrphans,
        counters: { ...result.counters, unmapped: Array.from(result.counters.unmapped.values()) },
      },
      null,
      2
    )
  );
}

if (process.argv[1] && process.argv[1].endsWith("run-tbca.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
