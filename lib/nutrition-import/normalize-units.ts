import type { NutrientUnit } from "@/lib/nutrition/nutrient-vocabulary";
import type { FoodBasis } from "@/lib/nutrition-import/types";

/**
 * Normalizacao deterministica de unidade (FASE 4). Nunca converte valor
 * numerico entre unidades diferentes (mg<->g) — so reconhece grafias
 * distintas da MESMA unidade (ex.: "(kcal)", "Kcal", "kcal" -> "kcal").
 * Quando a unidade da fonte nao e reconhecida, devolve null e quem chama
 * decide o status ('unparsed') — nunca inventa uma conversao.
 */
const UNIT_SYNONYMS: Record<string, NutrientUnit> = {
  kcal: "kcal",
  "(kcal)": "kcal",
  kj: "kJ",
  "(kj)": "kJ",
  g: "g",
  "(g)": "g",
  mg: "mg",
  "(mg)": "mg",
  mcg: "mcg",
  "(mcg)": "mcg",
  ug: "mcg",
  "(ug)": "mcg",
  "µg": "mcg",
  "(µg)": "mcg",
  "μg": "mcg", // caractere grego mu (U+03BC), distinto do micro sign (U+00B5) acima — ambos aparecem em fontes reais
};

export interface UnitNormalizationResult {
  unit: NutrientUnit | null;
  recognized: boolean;
}

export function normalizeUnit(rawUnit: string | null | undefined): UnitNormalizationResult {
  if (!rawUnit) return { unit: null, recognized: false };
  const key = rawUnit.trim().toLowerCase();
  const unit = UNIT_SYNONYMS[key];
  if (!unit) return { unit: null, recognized: false };
  return { unit, recognized: true };
}

const KNOWN_BASES: readonly FoodBasis[] = [
  "per_100g_food",
  "per_100g_edible_portion",
  "per_100g_fatty_acids",
  "per_100ml",
];

export interface BasisNormalizationResult {
  basis: FoodBasis | null;
  recognized: boolean;
}

/**
 * So reconhece as 4 bases ja enumeradas em nutritional_schema.json. Uma
 * basis fora dessa lista NUNCA e mapeada para a mais proxima — o
 * importador registra o valor bruto e marca o alimento/nutriente para
 * revisao (ver buildBasisMismatchReport no importador), porque tratar
 * "per_100g_fatty_acids" como "per_100g_edible_portion" silenciosamente
 * inflaria/deflacionaria qualquer calculo posterior.
 */
export function normalizeBasis(rawBasis: string | null | undefined): BasisNormalizationResult {
  if (!rawBasis) return { basis: null, recognized: false };
  const trimmed = rawBasis.trim() as FoodBasis;
  if (KNOWN_BASES.includes(trimmed)) return { basis: trimmed, recognized: true };
  return { basis: null, recognized: false };
}
