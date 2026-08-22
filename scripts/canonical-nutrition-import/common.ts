import { readFileSync } from "node:fs";
import { normalize } from "@/lib/nutrition/normalize";
import { normalizeFoodText } from "@/lib/nutrition/food-terminology";
import { extractPreparation } from "@/lib/nutrition/food-preparation";
import { fileSha256 } from "@/lib/nutrition-import/ids";
import type { LocalDb } from "./local-db";
import type {
  CanonicalFoodPortionRecord,
  CanonicalFoodRecord,
  FoodNutrientValueRecord,
  NutrientStatisticsRecord,
  UnmappedNutrientReportEntry,
} from "@/lib/nutrition-import/types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function fileHashOf(path: string): { sha256: string; bytes: number } {
  const buffer = readFileSync(path);
  return { sha256: fileSha256(buffer), bytes: buffer.length };
}

/**
 * FASE 2 — Source Registry reaproveitando import_batches (0050) sem alterar
 * seu schema: hash/tamanho de arquivo e detalhes viram metadata_json, que a
 * tabela ja suporta. status='running' -> 'completed'|'failed' no fim.
 */
export function startImportBatch(
  db: LocalDb,
  args: { id: string; source: string; datasetVersion: string; sourceFile?: { path: string; sha256: string; bytes: number } }
): void {
  const metadata = args.sourceFile ? JSON.stringify({ sourceFile: args.sourceFile }) : null;
  db.prepare(
    `INSERT INTO import_batches (id, source, status, dataset_version, created_at, updated_at, metadata_json)
     VALUES (?, ?, 'running', ?, ?, ?, ?)`
  ).run(args.id, args.source, args.datasetVersion, nowIso(), nowIso(), metadata);
}

export function finishImportBatch(
  db: LocalDb,
  id: string,
  stats: { status: "completed" | "failed"; plannedFoods: number; createdFoods: number; createdNutrients: number; noopFoods: number; failures: number }
): void {
  db.prepare(
    `UPDATE import_batches SET status = ?, planned_foods = ?, created_foods = ?, created_nutrients = ?, noop_foods = ?, failures = ?, updated_at = ?
     WHERE id = ?`
  ).run(stats.status, stats.plannedFoods, stats.createdFoods, stats.createdNutrients, stats.noopFoods, stats.failures, nowIso(), id);
}

/** normalize() puro (sem stopwords) — preserva "cru"/"cozido"/"integral"/etc. (Fase 10). */
export function buildNormalizedName(name: string): string {
  return normalizeFoodText(name) || normalize(name);
}

export function derivePreparationMethod(name: string): string | null {
  const { preparation } = extractPreparation(name);
  return preparation ?? null;
}

export interface ImportCounters {
  foodsCreated: number;
  foodsNoop: number;
  nutrientValuesCreated: number;
  nutrientValuesNoop: number;
  portionsCreated: number;
  portionsNoop: number;
  statisticsCreated: number;
  statisticsNoop: number;
  failures: number;
  unmapped: Map<string, UnmappedNutrientReportEntry>;
}

export function newCounters(): ImportCounters {
  return {
    foodsCreated: 0,
    foodsNoop: 0,
    nutrientValuesCreated: 0,
    nutrientValuesNoop: 0,
    portionsCreated: 0,
    portionsNoop: 0,
    statisticsCreated: 0,
    statisticsNoop: 0,
    failures: 0,
    unmapped: new Map(),
  };
}

/**
 * Achado real da importacao completa da TBCA: em
 * composicao_informacao_estatistica/_produtos, alguns nutrientes sem
 * tagname reconhecido (tagname="—" na fonte) compartilham o MESMO
 * nutrient_id degenerado "tbca:unknown:<unidade>" para VARIOS nutrientes
 * DIFERENTES do mesmo alimento (ex.: "Sal de adição", "Açúcar de adição",
 * "Gordura de adição", "Proteína vegetal", "Proteína animal" todos com
 * nutrient_id="tbca:unknown:g" num mesmo alimento). Como source_nutrient_id
 * e parte da chave natural de armazenamento, usar o id cru nesse caso
 * causaria PERDA SILENCIOSA de dado (INSERT OR IGNORE descartando os
 * nutrientes seguintes com a mesma chave) — violaria a regra "nao descartar
 * silenciosamente".
 *
 * Correcao: identidade de armazenamento so usa o nutrient_id cru quando ele
 * e unico dentro do alimento; em colisao, desambigua anexando um slug do
 * `name` (nunca usado para MAPEAMENTO de NutrientCode — so para a CHAVE de
 * linha, que e um problema diferente). O nutrient_id original cru continua
 * 100% preservado como prefixo, nunca escondido.
 */
export function disambiguateSourceNutrientId(usedIds: Set<string>, rawNutrientId: string, name: string | null | undefined): string {
  if (!usedIds.has(rawNutrientId)) {
    usedIds.add(rawNutrientId);
    return rawNutrientId;
  }
  const nameSlug = normalize(name ?? "unnamed")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
  let candidate = `${rawNutrientId}#${nameSlug}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${rawNutrientId}#${nameSlug}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

export function recordUnmapped(counters: ImportCounters, entry: Omit<UnmappedNutrientReportEntry, "occurrences">): void {
  const key = `${entry.source}:${entry.sourceNutrientId}`;
  const existing = counters.unmapped.get(key);
  if (existing) {
    existing.occurrences += 1;
    return;
  }
  counters.unmapped.set(key, { ...entry, occurrences: 1 });
}

/**
 * Insercao idempotente: os IDs sao deterministicos (hash do conteudo
 * natural, ver lib/nutrition-import/ids.ts), entao rodar o importador duas
 * vezes sobre o mesmo arquivo produz exatamente as mesmas linhas — a
 * segunda rodada e um NOOP puro (INSERT OR IGNORE), nunca duplica nem
 * sobrescreve. Isso tambem cobre "retomar com seguranca": se o processo cair
 * no meio, rodar de novo do zero so re-insere o que faltava.
 */
export function insertCanonicalFood(db: LocalDb, record: CanonicalFoodRecord, importBatchId: string): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO canonical_foods
        (id, source, source_version, source_food_id, source_collection, name, scientific_name, normalized_name,
         basis, classification_group, classification_food_type, preparation_method, preparation_code,
         preparation_name, source_detail_url, import_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.source,
      record.sourceVersion,
      record.sourceFoodId,
      record.sourceCollection,
      record.name,
      record.scientificName,
      record.normalizedName,
      record.basis,
      record.classificationGroup,
      record.classificationFoodType,
      record.preparationMethod,
      record.preparationCode,
      record.preparationName,
      record.sourceDetailUrl,
      importBatchId,
      nowIso()
    );
  return result.changes > 0;
}

export function insertFoodNutrientValue(db: LocalDb, record: FoodNutrientValueRecord, importBatchId: string): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO food_nutrient_values
        (id, canonical_food_id, nutrient_code, source_nutrient_id, source, source_food_id, source_record_id,
         value, unit, raw_unit, basis, status, raw_value, portion_id, import_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.canonicalFoodId,
      record.nutrientCode,
      record.sourceNutrientId,
      record.source,
      record.sourceFoodId,
      record.sourceRecordId,
      record.value,
      record.unit,
      record.rawUnit,
      record.basis,
      record.status,
      record.rawValue,
      record.portionId,
      importBatchId,
      nowIso()
    );
  return result.changes > 0;
}

export function insertPortion(db: LocalDb, record: CanonicalFoodPortionRecord, importBatchId: string): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO canonical_food_portions
        (id, canonical_food_id, source, source_food_id, source_portion_id, label, source_measure_quantity,
         source_measure_unit, source_measure_raw, parsed_label_grams, gram_weight, ml_weight, weight_source,
         confidence, import_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.canonicalFoodId,
      record.source,
      record.sourceFoodId,
      record.sourcePortionId,
      record.label,
      record.sourceMeasureQuantity,
      record.sourceMeasureUnit,
      record.sourceMeasureRaw,
      record.parsedLabelGrams,
      record.gramWeight,
      record.mlWeight,
      record.weightSource,
      record.confidence,
      importBatchId,
      nowIso()
    );
  return result.changes > 0;
}

export function insertNutrientStatistics(db: LocalDb, record: NutrientStatisticsRecord, importBatchId: string): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO nutrient_statistics
        (id, canonical_food_id, nutrient_code, source_nutrient_id, source_tagname, source, source_food_id,
         mean_value, mean_status, standard_deviation, minimum, maximum, number_of_observations, data_type,
         references_text, import_batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.canonicalFoodId,
      record.nutrientCode,
      record.sourceNutrientId,
      record.sourceTagname,
      record.source,
      record.sourceFoodId,
      record.meanValue,
      record.meanStatus,
      record.standardDeviation,
      record.minimum,
      record.maximum,
      record.numberOfObservations,
      record.dataType,
      record.referencesText,
      importBatchId,
      nowIso()
    );
  return result.changes > 0;
}

export interface FoodAliasRecord {
  id: string;
  canonicalFoodId: string;
  alias: string;
  normalizedAlias: string;
  aliasType: "spelling" | "regional" | "abbreviation" | "search_synonym";
  source: "curated" | "derived_from_normalization";
  confidence: "EXACT_NORMALIZATION" | "SAFE_VARIANT" | "MANUAL_CURATED";
  reason: string;
}

/** FASE 3.5 — inserção idempotente de alias curado (INSERT OR IGNORE, mesma politica de idempotencia dos importadores). */
export function insertFoodAlias(db: LocalDb, record: FoodAliasRecord): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO food_aliases (id, canonical_food_id, alias, normalized_alias, alias_type, source, confidence, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(record.id, record.canonicalFoodId, record.alias, record.normalizedAlias, record.aliasType, record.source, record.confidence, record.reason, nowIso());
  return result.changes > 0;
}

export function insertFtsRow(
  db: LocalDb,
  args: {
    foodId: string;
    name: string;
    normalizedName: string;
    scientificName: string | null;
    classification: string | null;
    preparation: string | null;
    sourceFoodId: string;
  }
): void {
  db.prepare(
    `INSERT INTO canonical_foods_fts (food_id, name, normalized_name, scientific_name, classification, preparation, source_food_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(args.foodId, args.name, args.normalizedName, args.scientificName, args.classification, args.preparation, args.sourceFoodId);
}

export function withTransaction<T>(db: LocalDb, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
