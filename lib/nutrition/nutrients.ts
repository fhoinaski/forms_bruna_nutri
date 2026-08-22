import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { resolveQuantity, type HouseholdMeasureOption, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import { referenceFromSnapshot } from "@/lib/nutrition/food-snapshot";
import { NUTRIENT_DEFINITIONS, type NutrientCode, type NutrientUnit } from "@/lib/nutrition/nutrient-vocabulary";

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
  energyKj?: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  sugarsG?: number | null;
  fatG: number | null;
  saturatedFatG?: number | null;
  monounsaturatedFatG?: number | null;
  polyunsaturatedFatG?: number | null;
  transFatG?: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  magnesiumMg?: number | null;
  phosphorusMg?: number | null;
  potassiumMg: number | null;
  zincMg?: number | null;
  copperMg?: number | null;
  manganeseMg?: number | null;
  seleniumMcg?: number | null;
  vitaminAMcg?: number | null;
  vitaminCMg: number | null;
  vitaminDMcg?: number | null;
  vitaminEMg?: number | null;
  vitaminKMcg?: number | null;
  thiaminMg?: number | null;
  riboflavinMg?: number | null;
  niacinMg?: number | null;
  pantothenicAcidMg?: number | null;
  vitaminB6Mg?: number | null;
  folateMcg?: number | null;
  vitaminB12Mcg?: number | null;
  cholesterolMg?: number | null;
  // Fase 2 da Canonical Nutrition Data Layer: campos opcionais adicionados
  // so para o union NutrientCode continuar exaustivo em Record<NutrientCode, ...>
  // (ver getFoodNutrientsFromReference abaixo). MacroReferenceFood NUNCA
  // popula estes campos hoje — ficam sempre null/undefined em qualquer
  // fluxo existente, comportamento identico a antes desta mudanca.
  addedSugarG?: number | null;
  addedSaltG?: number | null;
  addedFatG?: number | null;
  plantProteinG?: number | null;
  animalProteinG?: number | null;
  linoleicAcidG?: number | null;
  alphaLinolenicAcidG?: number | null;
  epaG?: number | null;
  dhaG?: number | null;
}

export type NutrientKey = keyof NutrientValues;

export const NUTRIENT_KEYS: NutrientKey[] = [
  "energyKcal",
  "energyKj",
  "proteinG",
  "carbohydrateG",
  "sugarsG",
  "fatG",
  "saturatedFatG",
  "monounsaturatedFatG",
  "polyunsaturatedFatG",
  "transFatG",
  "fiberG",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "phosphorusMg",
  "potassiumMg",
  "zincMg",
  "copperMg",
  "manganeseMg",
  "seleniumMcg",
  "vitaminAMcg",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminEMg",
  "vitaminKMcg",
  "thiaminMg",
  "riboflavinMg",
  "niacinMg",
  "pantothenicAcidMg",
  "vitaminB6Mg",
  "folateMcg",
  "vitaminB12Mcg",
  "cholesterolMg",
  "addedSugarG",
  "addedSaltG",
  "addedFatG",
  "plantProteinG",
  "animalProteinG",
  "linoleicAcidG",
  "alphaLinolenicAcidG",
  "epaG",
  "dhaG",
];

export interface NutrientCoverage {
  known: number;
  total: number;
}

const EMPTY_NUTRIENTS: NutrientValues = {
  energyKcal: null,
  energyKj: null,
  proteinG: null,
  carbohydrateG: null,
  sugarsG: null,
  fatG: null,
  saturatedFatG: null,
  monounsaturatedFatG: null,
  polyunsaturatedFatG: null,
  transFatG: null,
  fiberG: null,
  sodiumMg: null,
  calciumMg: null,
  ironMg: null,
  magnesiumMg: null,
  phosphorusMg: null,
  potassiumMg: null,
  zincMg: null,
  copperMg: null,
  manganeseMg: null,
  seleniumMcg: null,
  vitaminAMcg: null,
  vitaminCMg: null,
  vitaminDMcg: null,
  vitaminEMg: null,
  vitaminKMcg: null,
  thiaminMg: null,
  riboflavinMg: null,
  niacinMg: null,
  pantothenicAcidMg: null,
  vitaminB6Mg: null,
  folateMcg: null,
  vitaminB12Mcg: null,
  cholesterolMg: null,
};

function scale(value: number | null | undefined, factor: number): number | null {
  return typeof value === "number" ? value * factor : null;
}

export interface FoodNutrientValue {
  code: NutrientCode;
  value: number | null;
  unit: NutrientUnit;
  basis: { amount: number; unit: "g" | "ml" };
  source?: string | null;
}

export function getFoodNutrientsFromReference(reference: MacroReferenceFood | null, source?: string | null): FoodNutrientValue[] {
  if (!reference) return [];
  const valuesByCode: Record<NutrientCode, number | null | undefined> = {
    ENERGY_KCAL: reference.energia_kcal,
    ENERGY_KJ: reference.energy_kj,
    PROTEIN: reference.proteina_g,
    CARBOHYDRATE: reference.carboidrato_g,
    SUGARS: reference.sugars_g,
    TOTAL_FAT: reference.lipidios_g,
    SATURATED_FAT: reference.saturated_fat_g,
    MONOUNSATURATED_FAT: reference.monounsaturated_fat_g,
    POLYUNSATURATED_FAT: reference.polyunsaturated_fat_g,
    TRANS_FAT: reference.trans_fat_g,
    FIBER: reference.fibra_g,
    SODIUM: reference.sodio_mg,
    CALCIUM: reference.calcio_mg,
    IRON: reference.ferro_mg,
    MAGNESIUM: reference.magnesium_mg,
    PHOSPHORUS: reference.phosphorus_mg,
    POTASSIUM: reference.potassio_mg,
    ZINC: reference.zinc_mg,
    COPPER: reference.copper_mg,
    MANGANESE: reference.manganese_mg,
    SELENIUM: reference.selenium_mcg,
    VITAMIN_A: reference.vitamin_a_mcg,
    VITAMIN_C: reference.vitamina_c_mg,
    VITAMIN_D: reference.vitamin_d_mcg,
    VITAMIN_E: reference.vitamin_e_mg,
    VITAMIN_K: reference.vitamin_k_mcg,
    THIAMIN: reference.vitamin_b1_mg,
    RIBOFLAVIN: reference.vitamin_b2_mg,
    NIACIN: reference.vitamin_b3_mg,
    PANTOTHENIC_ACID: reference.pantothenic_acid_mg,
    VITAMIN_B6: reference.vitamin_b6_mg,
    FOLATE: reference.folate_mcg,
    VITAMIN_B12: reference.vitamin_b12_mcg,
    CHOLESTEROL: reference.cholesterol_mg,
    // Fase 2 — MacroReferenceFood (TACO/custom/USDA hoje) nao tem estes
    // campos; ficam sempre null ate uma fonte real popula-los.
    ADDED_SUGAR: null,
    ADDED_SALT: null,
    ADDED_FAT: null,
    PLANT_PROTEIN: null,
    ANIMAL_PROTEIN: null,
    LINOLEIC_ACID: null,
    ALPHA_LINOLENIC_ACID: null,
    EPA: null,
    DHA: null,
  };
  return NUTRIENT_DEFINITIONS.map((definition) => ({
    code: definition.code,
    value: valuesByCode[definition.code] ?? null,
    unit: definition.unit,
    basis: { amount: 100, unit: "g" as const },
    source,
  }));
}

export function calculateNutrientsForAmount(reference: MacroReferenceFood | null, grams: number): FoodNutrientValue[] {
  if (!reference || !Number.isFinite(grams) || grams <= 0) {
    return getFoodNutrientsFromReference(reference).map((nutrient) => ({ ...nutrient, value: null, basis: { amount: grams > 0 ? grams : 0, unit: "g" as const } }));
  }
  const factor = grams / 100;
  return getFoodNutrientsFromReference(reference).map((nutrient) => ({
    ...nutrient,
    value: scale(nutrient.value, factor),
    basis: { amount: grams, unit: "g" as const },
  }));
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
  householdMeasure?: HouseholdMeasureOption | null,
  snapshots?: { resolvedGramsSnapshot?: number | null; quantityResolutionSnapshot?: string | null }
): { values: NutrientValues; grams: number; resolution: QuantityResolution } {
  const resolution = resolveQuantity({
    quantity,
    unit,
    householdMeasure,
    resolvedGramsSnapshot: snapshots?.resolvedGramsSnapshot,
    quantityResolutionSnapshot: snapshots?.quantityResolutionSnapshot,
  });
  const grams = resolution.grams ?? 0;
  if (!reference || !grams) return { values: { ...EMPTY_NUTRIENTS }, grams, resolution };
  const factor = grams / 100;
  return {
    grams,
    resolution,
    values: {
      energyKcal: scale(reference.energia_kcal, factor),
      energyKj: scale(reference.energy_kj, factor),
      proteinG: scale(reference.proteina_g, factor),
      carbohydrateG: scale(reference.carboidrato_g, factor),
      sugarsG: scale(reference.sugars_g, factor),
      fatG: scale(reference.lipidios_g, factor),
      saturatedFatG: scale(reference.saturated_fat_g, factor),
      monounsaturatedFatG: scale(reference.monounsaturated_fat_g, factor),
      polyunsaturatedFatG: scale(reference.polyunsaturated_fat_g, factor),
      transFatG: scale(reference.trans_fat_g, factor),
      fiberG: scale(reference.fibra_g, factor),
      sodiumMg: scale(reference.sodio_mg, factor),
      calciumMg: scale(reference.calcio_mg, factor),
      ironMg: scale(reference.ferro_mg, factor),
      magnesiumMg: scale(reference.magnesium_mg, factor),
      phosphorusMg: scale(reference.phosphorus_mg, factor),
      potassiumMg: scale(reference.potassio_mg, factor),
      zincMg: scale(reference.zinc_mg, factor),
      copperMg: scale(reference.copper_mg, factor),
      manganeseMg: scale(reference.manganese_mg, factor),
      seleniumMcg: scale(reference.selenium_mcg, factor),
      vitaminAMcg: scale(reference.vitamin_a_mcg, factor),
      vitaminCMg: scale(reference.vitamina_c_mg, factor),
      vitaminDMcg: scale(reference.vitamin_d_mcg, factor),
      vitaminEMg: scale(reference.vitamin_e_mg, factor),
      vitaminKMcg: scale(reference.vitamin_k_mcg, factor),
      thiaminMg: scale(reference.vitamin_b1_mg, factor),
      riboflavinMg: scale(reference.vitamin_b2_mg, factor),
      niacinMg: scale(reference.vitamin_b3_mg, factor),
      pantothenicAcidMg: scale(reference.pantothenic_acid_mg, factor),
      vitaminB6Mg: scale(reference.vitamin_b6_mg, factor),
      folateMcg: scale(reference.folate_mcg, factor),
      vitaminB12Mcg: scale(reference.vitamin_b12_mcg, factor),
      cholesterolMg: scale(reference.cholesterol_mg, factor),
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
      if (value === null || value === undefined) continue;
      coverage[key].known += 1;
      values[key] = (values[key] ?? 0) + value;
    }
  }
  return { values, coverage };
}

/** Arredondamento so na apresentacao (secao 49) — nunca em somas intermediarias. */
export function roundedNutrients(values: NutrientValues): NutrientValues {
  const roundInt = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value));
  const round1 = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value * 10) / 10);
  return {
    energyKcal: roundInt(values.energyKcal),
    energyKj: roundInt(values.energyKj),
    proteinG: round1(values.proteinG),
    carbohydrateG: round1(values.carbohydrateG),
    sugarsG: round1(values.sugarsG),
    fatG: round1(values.fatG),
    saturatedFatG: round1(values.saturatedFatG),
    monounsaturatedFatG: round1(values.monounsaturatedFatG),
    polyunsaturatedFatG: round1(values.polyunsaturatedFatG),
    transFatG: round1(values.transFatG),
    fiberG: round1(values.fiberG),
    sodiumMg: roundInt(values.sodiumMg),
    calciumMg: roundInt(values.calciumMg),
    ironMg: round1(values.ironMg),
    magnesiumMg: roundInt(values.magnesiumMg),
    phosphorusMg: roundInt(values.phosphorusMg),
    potassiumMg: roundInt(values.potassiumMg),
    zincMg: round1(values.zincMg),
    copperMg: round1(values.copperMg),
    manganeseMg: round1(values.manganeseMg),
    seleniumMcg: round1(values.seleniumMcg),
    vitaminAMcg: roundInt(values.vitaminAMcg),
    vitaminCMg: round1(values.vitaminCMg),
    vitaminDMcg: round1(values.vitaminDMcg),
    vitaminEMg: round1(values.vitaminEMg),
    vitaminKMcg: round1(values.vitaminKMcg),
    thiaminMg: round1(values.thiaminMg),
    riboflavinMg: round1(values.riboflavinMg),
    niacinMg: round1(values.niacinMg),
    pantothenicAcidMg: round1(values.pantothenicAcidMg),
    vitaminB6Mg: round1(values.vitaminB6Mg),
    folateMcg: roundInt(values.folateMcg),
    vitaminB12Mcg: round1(values.vitaminB12Mcg),
    cholesterolMg: roundInt(values.cholesterolMg),
  };
}

export interface MealPlanItemLike {
  food: string;
  quantity?: string | null;
  unit?: string | null;
  food_source?: string | null;
  food_ref_id?: string | null;
  household_measure_id?: string | null;
  food_name_snapshot?: string | null;
  nutrition_snapshot?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
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
  byUsdaId?(id: string): MacroReferenceFood | null;
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
  // Snapshot historico (P1-A): quando o item foi prescrito com composicao
  // congelada, usa o snapshot em vez de re-vincular — plano antigo nao muda
  // retroativamente se a base (taco.json/custom_foods) mudar.
  const fromSnapshot = referenceFromSnapshot(item.food, item.food_name_snapshot, item.nutrition_snapshot);
  if (fromSnapshot) return fromSnapshot;
  if (item.food_ref_id) {
    if (item.food_source === "TACO") return lookup.byTacoNumber(item.food_ref_id);
    if (item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") return lookup.byCustomId(item.food_ref_id);
    if (item.food_source === "USDA") return lookup.byUsdaId?.(item.food_ref_id) ?? null;
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
        const { values, resolution } = calculateItemNutrients(item.quantity, item.unit, resolveItemReference(item, lookup), householdMeasure, {
          resolvedGramsSnapshot: item.resolved_grams_snapshot,
          quantityResolutionSnapshot: item.quantity_resolution_snapshot,
        });
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
