import {
  calculateItemNutrients,
  resolveItemReference,
  sumNutrients,
  type FoodReferenceLookup,
  type MealPlanItemLike,
  type NutrientValues,
  type QuantityQualitySummary,
  type RecipeReferenceEntry,
} from "@/lib/nutrition/nutrients";
import { estimateFoodMacros, roundedMacros, sumMacros, type MacroTotals } from "@/lib/nutrition/macros";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

/**
 * R6 — ingrediente de receita. Mesmo shape de identidade de um item de
 * refeição (`MealPlanItemLike`) — nunca um formato paralelo — pra poder
 * ser resolvido pelo MESMO motor (`resolveItemReference`/
 * `calculateItemNutrients`), com qualquer `food_source` real (TACO/CUSTOM/
 * MANUFACTURER/USDA/TBCA/IBGE_POF), preservando missing≠zero (ingrediente
 * não resolvido soma como null, nunca 0).
 *
 * Campos legados (`taco_number`/`food_name`/`grams`/`free_text`) continuam
 * aceitos em LEITURA (receitas criadas antes desta fase) — normalizados
 * pra este mesmo shape em `normalizeIngredientForRead`, nunca reescritos
 * silenciosamente no banco. Receitas novas gravam sempre no shape novo.
 */
export interface RecipeIngredient {
  /** Ausente em ingredientes legados (pré-R6) — normalizado a partir de food_name/free_text em normalizeIngredientForRead. */
  food?: string;
  quantity?: string | null;
  unit?: string | null;
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null;
  food_ref_id?: string | null;
  household_measure_id?: string | null;
  /** Preservação de preparo (seção 9) — informativo/display; a identidade nutricional real já vem do food_ref_id resolvido (mesma convenção do resto do app: o nome específico, ex. "Frango, peito, grelhado", já encerra o preparo). */
  preparation?: string | null;
  /** Seção 32 — não implementa range nutricional pra ingrediente opcional nesta fase (default seguro); o ingrediente ainda entra no total único da receita. */
  is_optional?: boolean;
  order?: number;
  // ── Campos legados (pré-R6) — só leitura, nunca gravados por código novo. ──
  taco_number?: number | null;
  food_name?: string;
  grams?: number | null;
  free_text?: string | null;
}

export interface RecipeNutrition {
  total: MacroTotals;
  perPortion: MacroTotals;
}

export function normalizeRecipeMealGroup(value: string | null | undefined): RecipeMealGroup {
  const normalized = (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (normalized.includes("cafe")) return "cafe_da_manha";
  if (normalized.includes("almoco")) return "almoco";
  if (normalized.includes("jantar")) return "jantar";
  if (normalized.includes("sobremesa")) return "sobremesa";
  if (normalized.includes("bebida") || normalized.includes("suco") || normalized.includes("vitamina")) return "bebida";
  return "lanche";
}

/**
 * Normaliza UM ingrediente (novo ou legado) pro shape canônico compatível
 * com `MealPlanItemLike` — ponto ÚNICO de leitura, reaproveitado por todo
 * cálculo/exibição de ingrediente. Nunca inventa identidade: um ingrediente
 * legado só com `free_text` (sem `taco_number`) continua sem
 * `food_source`/`food_ref_id` (não resolvido, missing≠zero preservado).
 */
export function normalizeIngredientForRead(raw: RecipeIngredient): Required<Pick<MealPlanItemLike, "food" | "quantity" | "unit" | "food_source" | "food_ref_id" | "household_measure_id">> & { is_optional: boolean; preparation: string | null; order: number } {
  const hasNewShape = raw.food !== undefined || raw.food_source !== undefined;
  if (hasNewShape) {
    return {
      food: raw.food ?? raw.food_name ?? raw.free_text ?? "",
      quantity: raw.quantity ?? (raw.grams != null ? String(raw.grams) : null),
      unit: raw.unit ?? (raw.grams != null ? "g" : null),
      food_source: raw.food_source ?? null,
      food_ref_id: raw.food_ref_id ?? null,
      household_measure_id: raw.household_measure_id ?? null,
      is_optional: Boolean(raw.is_optional),
      preparation: raw.preparation ?? null,
      order: raw.order ?? 0,
    };
  }
  const hasTaco = raw.taco_number !== null && raw.taco_number !== undefined;
  return {
    food: raw.food_name ?? raw.free_text ?? "",
    quantity: raw.grams != null ? String(raw.grams) : null,
    unit: raw.grams != null ? "g" : null,
    food_source: hasTaco ? "TACO" : null,
    food_ref_id: hasTaco ? String(raw.taco_number) : null,
    household_measure_id: null,
    is_optional: false,
    preparation: null,
    order: raw.order ?? 0,
  };
}

/**
 * Escala as quantidades dos ingredientes de uma receita para a quantidade
 * de PORÇÕES realmente prescritas ao paciente — `servings` sempre é o
 * rendimento total da receita. Usado só pelo Clinical Copilot (seção 42:
 * expandir a receita sugerida em itens reais, nunca produzir uma
 * referência viva de receita sozinho). Opera sobre o shape normalizado
 * (quantity/unit), preservando ingredientes sem quantidade conhecida
 * (`quantity: null` continua `null`, nunca 0).
 */
export function scaleRecipeIngredientsToPortions<T extends { grams?: number | null }>(
  ingredients: T[],
  servings: number,
  prescribedPortions: number
): T[] {
  const servingCount = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const portions = Number.isFinite(prescribedPortions) && prescribedPortions > 0 ? prescribedPortions : 1;
  const factor = portions / servingCount;
  return ingredients.map((ingredient) => ({
    ...ingredient,
    grams: ingredient.grams === null || ingredient.grams === undefined ? ingredient.grams : Math.round(ingredient.grams * factor * 10) / 10,
  }));
}

export interface RecipeIngredientTotals {
  /** Soma bruta (não arredondada) — autoridade é sempre o motor real, nunca um valor gravado manualmente. */
  total: NutrientValues;
  quality: QuantityQualitySummary;
  /** Soma das gramas dos ingredientes com quantidade resolvida em gramas — base técnica pro modo RAW_TOTAL (seção 19), `null` se nenhum ingrediente resolveu em gramas. */
  rawTotalGrams: number | null;
}

/**
 * Soma os ingredientes de uma receita usando o MESMO motor de qualquer
 * item de refeição (`resolveItemReference` + `calculateItemNutrients`) —
 * nunca um segundo calculador (seção 2/12 do pedido R6). missing≠zero
 * preservado: ingrediente sem identidade resolvida soma como `null`
 * (via `sumNutrients`), nunca 0 — correção do bug legado de
 * `estimateFoodMacros` (que tratava ingrediente não-TACO como 0).
 */
export function calculateRecipeIngredientTotals(
  ingredients: RecipeIngredient[],
  lookup: FoodReferenceLookup
): RecipeIngredientTotals {
  const quality: QuantityQualitySummary = { total: 0, highConfidence: 0, estimated: 0, unresolved: 0 };
  const values: NutrientValues[] = [];
  let rawTotalGrams = 0;
  let anyGramsKnown = false;

  for (const raw of ingredients) {
    const ingredient = normalizeIngredientForRead(raw);
    if (!ingredient.food.trim()) continue;
    const reference = resolveItemReference(ingredient, lookup);
    const householdMeasure = ingredient.household_measure_id ? lookup.byMeasureId?.(ingredient.household_measure_id) ?? null : null;
    const { values: itemValues, grams, resolution } = calculateItemNutrients(ingredient.quantity, ingredient.unit, reference, householdMeasure);
    quality.total += 1;
    if (resolution.method === "unresolved") quality.unresolved += 1;
    else if (resolution.method === "estimated") quality.estimated += 1;
    else quality.highConfidence += 1;
    values.push(itemValues);
    if (grams) { rawTotalGrams += grams; anyGramsKnown = true; }
  }

  const { values: total } = sumNutrients(values);
  return { total, quality, rawTotalGrams: anyGramsKnown ? Math.round(rawTotalGrams * 10) / 10 : null };
}

export type RecipeYieldMode = "RAW_TOTAL" | "USER_REPORTED" | "PORTION_COUNT";

/**
 * Resolve a massa final (gramas) usada como base pra ratear porção/
 * quantidade em gramas de um item de receita (seções 15-21). `null`
 * significa "só porções são calculáveis" (PORTION_COUNT) — nunca inventa
 * um fator de cocção/perda de água (seção 17).
 */
export function resolveRecipeYieldGrams(
  yieldMode: RecipeYieldMode | null,
  yieldGrams: number | null,
  rawTotalGrams: number | null
): number | null {
  const mode = yieldMode ?? "RAW_TOTAL";
  if (mode === "USER_REPORTED") return yieldGrams;
  if (mode === "PORTION_COUNT") return null;
  return rawTotalGrams;
}

/** Monta a entrada pronta pro `FoodReferenceLookup.byRecipeId` a partir de uma receita + lookup de ingredientes — reaproveitada tanto pelo preview do editor quanto pela resolução de um item de receita numa refeição. */
export function buildRecipeReferenceEntry(
  ingredients: RecipeIngredient[],
  servings: number,
  yieldMode: RecipeYieldMode | null,
  yieldGrams: number | null,
  lookup: FoodReferenceLookup
): RecipeReferenceEntry & { quality: QuantityQualitySummary } {
  const { total, quality, rawTotalGrams } = calculateRecipeIngredientTotals(ingredients, lookup);
  return { total, servings: servings > 0 ? servings : 1, yieldGrams: resolveRecipeYieldGrams(yieldMode, yieldGrams, rawTotalGrams), quality };
}

// ── Legado — mantido só pro seed script `db/seed-recipes-bruna.ts`, que
// depende de `nutrition_override` pra receitas com ingredientes 100%
// free-text (sem identidade canônica possível — conteúdo de terceiros já
// publicado). Nunca usado pelo editor novo nem pela API a partir desta
// fase (ver reports/meal-plan-recipes-r6-audit.md). ──────────────────────
export function calculateRecipeNutrition(ingredients: Array<{ taco_number?: number | null; food_name: string; grams?: number | null }>, servings: number): RecipeNutrition {
  const rawTotal = sumMacros(ingredients.map((ingredient) => {
    if (!ingredient.taco_number || !ingredient.grams) {
      return { kcal: 0, protein: 0, carbs: 0, fat: 0, recognizedItems: 0, totalItems: 1 };
    }
    const food = getTacoFoodByNumber(ingredient.taco_number) ?? {
      descricao: ingredient.food_name, energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0,
    };
    return estimateFoodMacros(food.descricao, ingredient.grams, "g", [food]);
  }));
  const servingCount = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    total: roundedMacros(rawTotal),
    perPortion: roundedMacros({
      kcal: rawTotal.kcal / servingCount, protein: rawTotal.protein / servingCount,
      carbs: rawTotal.carbs / servingCount, fat: rawTotal.fat / servingCount,
      recognizedItems: rawTotal.recognizedItems, totalItems: rawTotal.totalItems,
    }),
  };
}
