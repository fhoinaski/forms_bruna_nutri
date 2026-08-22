import type { NutrientCode } from "@/lib/nutrition/nutrient-vocabulary";

/**
 * Tipos da Canonical Nutrition Data Layer (FASE 1 — Data Foundation).
 * Este modulo e SEPARADO de lib/nutrition/* (o Nutrition Engine em
 * producao) de proposito: nada aqui e importado pelo Food Resolver ou pelo
 * calculo de plano alimentar nesta rodada. E infraestrutura de importacao
 * apenas — ver docs/canonical-nutrition-model.md.
 */

export type CanonicalFoodSource = "TBCA" | "TACO" | "IBGE_POF";

export type NutrientValueStatus = "reported" | "trace" | "missing" | "not_applicable" | "unparsed";

export type FoodBasis = "per_100g_food" | "per_100g_edible_portion" | "per_100g_fatty_acids" | "per_100ml";

export type PortionWeightSource = "structured_quantity" | "parsed_from_label" | "unknown";

export interface CanonicalFoodRecord {
  id: string;
  source: CanonicalFoodSource;
  sourceVersion: string;
  sourceFoodId: string;
  sourceCollection: string | null;
  name: string;
  scientificName: string | null;
  normalizedName: string;
  basis: FoodBasis;
  classificationGroup: string | null;
  classificationFoodType: string | null;
  preparationMethod: string | null;
  preparationCode: string | null;
  preparationName: string | null;
  sourceDetailUrl: string | null;
}

export interface FoodNutrientValueRecord {
  id: string;
  canonicalFoodId: string;
  nutrientCode: NutrientCode | null;
  sourceNutrientId: string;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  sourceRecordId: string | null;
  value: number | null;
  unit: string;
  rawUnit: string | null;
  basis: FoodBasis;
  status: NutrientValueStatus;
  rawValue: string | null;
  portionId: string | null;
}

export interface CanonicalFoodPortionRecord {
  id: string;
  canonicalFoodId: string;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  sourcePortionId: string | null;
  label: string;
  sourceMeasureQuantity: number | null;
  sourceMeasureUnit: string | null;
  sourceMeasureRaw: string | null;
  parsedLabelGrams: number | null;
  gramWeight: number | null;
  mlWeight: number | null;
  weightSource: PortionWeightSource;
  confidence: "high" | "medium" | "low";
}

export interface NutrientStatisticsRecord {
  id: string;
  canonicalFoodId: string;
  nutrientCode: NutrientCode | null;
  sourceNutrientId: string;
  sourceTagname: string | null;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  meanValue: number | null;
  meanStatus: NutrientValueStatus;
  standardDeviation: number | null;
  minimum: number | null;
  maximum: number | null;
  numberOfObservations: number | null;
  dataType: string | null;
  referencesText: string | null;
}

/** Relatorio de mapeamento — nunca descartado silenciosamente (FASE 3). */
export interface UnmappedNutrientReportEntry {
  source: CanonicalFoodSource;
  sourceNutrientId: string;
  sourceName: string | null;
  unit: string | null;
  occurrences: number;
  reason: string;
}
