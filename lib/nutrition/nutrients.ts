import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { resolveQuantity, type HouseholdMeasureOption, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";

/**
 * Motor nutricional central da FASE 2. `null` sempre significa "sem dado
 * na fonte" — nunca e coagido para 0, para nao confundir "zero de verdade"
 * com "nao calculado" (secao 4 do pedido). Os 4 macros classicos
 * (kcal/proteina/carboidrato/gordura) sao sempre numero quando ha
 * referencia, porque `MacroReferenceFood` ja garante isso hoje; os 6
 * nutrientes adicionais podem ser `null`.
 */
export interface NutrientValues {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  potassiumMg: number | null;
  vitaminCMg: number | null;
}

export type NutrientKey = keyof NutrientValues;

export const NUTRIENT_KEYS: NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "potassiumMg",
  "vitaminCMg",
];

export interface NutrientCoverage {
  known: number;
  total: number;
}

const EMPTY_NUTRIENTS: NutrientValues = {
  energyKcal: null,
  proteinG: null,
  carbohydrateG: null,
  fatG: null,
  fiberG: null,
  sodiumMg: null,
  calciumMg: null,
  ironMg: null,
  potassiumMg: null,
  vitaminCMg: null,
};

function scale(value: number | null | undefined, factor: number): number | null {
  return typeof value === "number" ? value * factor : null;
}

/**
 * Calcula os nutrientes de UM item (alimento + quantidade + medida) a
 * partir de uma referencia ja resolvida (TACO ou personalizada). Reaproveita
 * `quantityInGrams` de macros.ts — a mesma conversao de unidade usada em
 * todo o app, nunca uma segunda logica de conversao.
 */
export function calculateItemNutrients(
  quantity: string | number | null | undefined,
  unit: string | null | undefined,
  reference: MacroReferenceFood | null,
  householdMeasure?: HouseholdMeasureOption | null
): { values: NutrientValues; grams: number; resolution: QuantityResolution } {
  const resolution = resolveQuantity({ quantity, unit, householdMeasure });
  const grams = resolution.grams ?? 0;
  if (!reference || !grams) return { values: { ...EMPTY_NUTRIENTS }, grams, resolution };
  const factor = grams / 100;
  return {
    grams,
    resolution,
    values: {
      energyKcal: scale(reference.energia_kcal, factor),
      proteinG: scale(reference.proteina_g, factor),
      carbohydrateG: scale(reference.carboidrato_g, factor),
      fatG: scale(reference.lipidios_g, factor),
      fiberG: scale(reference.fibra_g, factor),
      sodiumMg: scale(reference.sodio_mg, factor),
      calciumMg: scale(reference.calcio_mg, factor),
      ironMg: scale(reference.ferro_mg, factor),
      potassiumMg: scale(reference.potassio_mg, factor),
      vitaminCMg: scale(reference.vitamina_c_mg, factor),
    },
  };
}

/**
 * Soma uma lista de nutrientes ja calculados, com COBERTURA por nutriente
 * (quantos itens tinham o dado vs total de itens) — secao 19 do pedido:
 * "Ferro: cobertura 72%" em vez de fingir precisao total.
 */
export function sumNutrients(items: NutrientValues[]): { values: NutrientValues; coverage: Record<NutrientKey, NutrientCoverage> } {
  const values: NutrientValues = { ...EMPTY_NUTRIENTS };
  const coverage = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, { known: 0, total: items.length }])
  ) as Record<NutrientKey, NutrientCoverage>;

  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const value = item[key];
      if (value === null) continue;
      coverage[key].known += 1;
      values[key] = (values[key] ?? 0) + value;
    }
  }
  return { values, coverage };
}

/** Arredondamento so na apresentacao (secao 49) — nunca em somas intermediarias. */
export function roundedNutrients(values: NutrientValues): NutrientValues {
  const roundInt = (value: number | null) => (value === null ? null : Math.round(value));
  const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
  return {
    energyKcal: roundInt(values.energyKcal),
    proteinG: round1(values.proteinG),
    carbohydrateG: round1(values.carbohydrateG),
    fatG: round1(values.fatG),
    fiberG: round1(values.fiberG),
    sodiumMg: roundInt(values.sodiumMg),
    calciumMg: roundInt(values.calciumMg),
    ironMg: round1(values.ironMg),
    potassiumMg: roundInt(values.potassiumMg),
    vitaminCMg: round1(values.vitaminCMg),
  };
}

export interface MealPlanItemLike {
  food: string;
  quantity?: string | null;
  unit?: string | null;
  food_source?: string | null;
  food_ref_id?: string | null;
  household_measure_id?: string | null;
}

/**
 * Resolve a referencia nutricional de um item: tenta o vinculo estruturado
 * primeiro (food_ref_id/food_source), e so cai para o match aproximado por
 * texto (`fuzzyMatch`, ja existente via findBestFoodReference) quando nao
 * ha vinculo — exatamente o comportamento de hoje para itens legados
 * (secao 47 do pedido: nunca inventa vinculo, so usa o que foi explicitamente
 * associado). As funcoes de lookup sao injetadas para manter este modulo
 * puro/testavel — quem monta a lookup real (TACO em memoria + alimentos
 * personalizados do banco) e o chamador.
 */
export interface FoodReferenceLookup {
  byTacoNumber(numero: string): MacroReferenceFood | null;
  byCustomId(id: string): MacroReferenceFood | null;
  fuzzyMatch(food: string): MacroReferenceFood | null;
  /**
   * Opcional para nao quebrar lookups existentes que ainda nao sabem
   * resolver medida caseira (ex.: testes, TACO_ONLY_LOOKUP do agente de
   * IA). Quando ausente, o item simplesmente nunca tem household measure
   * disponivel — cai para a conversao generica/estimada, nunca quebra.
   */
  byMeasureId?(id: string): HouseholdMeasureOption | null;
}

export function resolveItemReference(item: MealPlanItemLike, lookup: FoodReferenceLookup): MacroReferenceFood | null {
  if (item.food_ref_id) {
    if (item.food_source === "TACO") return lookup.byTacoNumber(item.food_ref_id);
    if (item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") return lookup.byCustomId(item.food_ref_id);
  }
  return lookup.fuzzyMatch(item.food);
}

export interface MealNutrition {
  mealId: string | undefined;
  name: string;
  values: NutrientValues;
  coverage: Record<NutrientKey, NutrientCoverage>;
}

/** Contagem de itens por confianca do calculo (secao 9 do pedido: "12/14 itens calculados com alta confianca"). Itens sem alimento preenchido nao entram na contagem. */
export interface QuantityQualitySummary {
  total: number;
  highConfidence: number;
  estimated: number;
  unresolved: number;
}

export interface MealPlanNutritionResult {
  perMeal: MealNutrition[];
  total: { values: NutrientValues; coverage: Record<NutrientKey, NutrientCoverage> };
  quality: QuantityQualitySummary;
}

/** Totais por refeicao e por dia (secoes 13-15 do pedido), sempre derivados — nunca confia num total enviado pronto. */
export function calculatePlanNutrients(
  plan: Pick<MealPlanPayload, "meals">,
  lookup: FoodReferenceLookup
): MealPlanNutritionResult {
  const allItemValues: NutrientValues[] = [];
  const quality: QuantityQualitySummary = { total: 0, highConfidence: 0, estimated: 0, unresolved: 0 };
  const perMeal = plan.meals.map((meal) => {
    const itemValues = meal.items
      .filter((item) => item.food.trim())
      .map((item) => {
        const householdMeasure = item.household_measure_id ? lookup.byMeasureId?.(item.household_measure_id) ?? null : null;
        const { values, resolution } = calculateItemNutrients(item.quantity, item.unit, resolveItemReference(item, lookup), householdMeasure);
        quality.total += 1;
        // Mesmo criterio do badge por item (MealItemsEditor): gramas explicitas,
        // conversao generica seguran (kg) e medida caseira especifica contam
        // como "alta confianca" mesmo quando a confidence da MEDIDA e "medium"
        // (ex.: referencia de mercado, nao dado oficial) — isso ainda e uma
        // medida especifica, categoria distinta de "estimado" (secao 9 do pedido).
        if (resolution.method === "unresolved") quality.unresolved += 1;
        else if (resolution.method === "estimated") quality.estimated += 1;
        else quality.highConfidence += 1;
        return values;
      });
    allItemValues.push(...itemValues);
    const { values, coverage } = sumNutrients(itemValues);
    return { mealId: meal.id, name: meal.name, values, coverage };
  });
  const { values, coverage } = sumNutrients(allItemValues);
  return { perMeal, total: { values, coverage }, quality };
}
