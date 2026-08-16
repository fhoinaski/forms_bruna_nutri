import { z } from "zod";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { searchAllFoods, type FoodSource } from "@/lib/nutrition/food-search";
import { getFoodNutrientsFromReference, calculateItemNutrients, roundedNutrients } from "@/lib/nutrition/nutrients";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import { getCustomFoodById, listCustomFoods, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import { listFoodPortions, getFoodPortionById, toHouseholdMeasureOption } from "@/lib/repositories/food-portions";

/**
 * Tools de leitura do CATALOGO de alimentos (FASE 1 do roadmap de operador
 * interno — docs/AI-OPERATOR-AUDIT-ROADMAP.md), sempre disponiveis mesmo
 * sem cliente/formulario em contexto — ao contrario de
 * `searchMealPlanFoods`/`findFoodEquivalents` (meal-plan-change-agent.ts),
 * que continuam existindo para o fluxo de edicao de plano e exigem cliente
 * aberto. Estas aqui resolvem o caso "quantas calorias tem 100g de arroz?"
 * perguntado fora de qualquer ficha de paciente — o bug real que motivou
 * esta fase. Nunca calcula nutriente "de cabeca": tudo aqui e wrapper fino
 * sobre lib/nutrition/* (motor determinístico ja existente).
 */

const foodSourceSchema = z.enum(["TACO", "CUSTOM", "MANUFACTURER"]);

async function resolveFoodByRef(source: FoodSource, refId: string): Promise<MacroReferenceFood | null> {
  if (source === "TACO") return getTacoFoodByNumber(refId);
  const custom = await getCustomFoodById(refId);
  if (!custom || custom.source !== source) return null;
  return toMacroReferenceFood(custom);
}

// ── search_foods (READ) ───────────────────────────────────────────────────

export const SEARCH_FOODS_TOOL_NAME = "searchFoods";
export const searchFoodsInputSchema = z.object({
  query: z.string().min(2).max(120),
}).strict();
export type SearchFoodsInput = z.infer<typeof searchFoodsInputSchema>;

export async function executeSearchFoods(input: SearchFoodsInput) {
  const customFoods = (await listCustomFoods()).map(toMacroReferenceFood);
  const results = searchAllFoods(input.query, { limit: 10, customFoods });
  return {
    items: results.map(({ food, source }) => ({
      source,
      refId: String(food.numero),
      descricao: food.descricao,
      grupo: food.grupo ?? null,
      kcal_100g: food.energia_kcal,
      protein_100g: food.proteina_g,
      carbs_100g: food.carboidrato_g,
      fat_100g: food.lipidios_g,
    })),
  };
}

// ── get_food_details (READ) ───────────────────────────────────────────────

export const GET_FOOD_DETAILS_TOOL_NAME = "getFoodDetails";
export const getFoodDetailsInputSchema = z.object({
  source: foodSourceSchema,
  refId: z.string().min(1).max(120),
}).strict();
export type GetFoodDetailsInput = z.infer<typeof getFoodDetailsInputSchema>;

export async function executeGetFoodDetails(input: GetFoodDetailsInput) {
  const reference = await resolveFoodByRef(input.source, input.refId);
  if (!reference) return { found: false as const };
  return {
    found: true as const,
    source: input.source,
    refId: input.refId,
    descricao: reference.descricao,
    grupo: reference.grupo ?? null,
    nutrientsPer100g: getFoodNutrientsFromReference(reference),
  };
}

// ── get_food_portions (READ) ──────────────────────────────────────────────

export const GET_FOOD_PORTIONS_TOOL_NAME = "getFoodPortions";
export const getFoodPortionsInputSchema = getFoodDetailsInputSchema;
export type GetFoodPortionsInput = GetFoodDetailsInput;

export async function executeGetFoodPortions(input: GetFoodPortionsInput) {
  const reference = await resolveFoodByRef(input.source, input.refId);
  if (!reference) return { found: false as const };
  const portions = await listFoodPortions(input.source, input.refId);
  return {
    found: true as const,
    descricao: reference.descricao,
    portions: portions.map((portion) => ({
      id: portion.id,
      description: portion.description,
      gramEquivalent: portion.gram_equivalent,
      confidence: portion.confidence,
    })),
  };
}

// ── calculate_food_nutrients (READ) ───────────────────────────────────────

export const CALCULATE_FOOD_NUTRIENTS_TOOL_NAME = "calculateFoodNutrients";
export const calculateFoodNutrientsInputSchema = z.object({
  source: foodSourceSchema,
  refId: z.string().min(1).max(120),
  quantity: z.number().positive().max(10000),
  unit: z.string().min(1).max(40).optional(),
  /** Id de uma medida caseira especifica retornada por getFoodPortions — opcional. */
  portionId: z.string().min(1).max(120).optional(),
}).strict();
export type CalculateFoodNutrientsInput = z.infer<typeof calculateFoodNutrientsInputSchema>;

export async function executeCalculateFoodNutrients(input: CalculateFoodNutrientsInput) {
  const reference = await resolveFoodByRef(input.source, input.refId);
  if (!reference) return { found: false as const };

  let householdMeasure: HouseholdMeasureOption | null = null;
  if (input.portionId) {
    const portion = await getFoodPortionById(input.portionId);
    if (portion && portion.food_source === input.source && portion.food_ref_id === input.refId) {
      householdMeasure = toHouseholdMeasureOption(portion);
    }
  }

  const { values, grams, resolution } = calculateItemNutrients(input.quantity, input.unit ?? "g", reference, householdMeasure);
  return {
    found: true as const,
    descricao: reference.descricao,
    grams,
    resolutionMethod: resolution.method,
    confidence: resolution.confidence,
    warning: resolution.warning ?? null,
    nutrients: roundedNutrients(values),
  };
}

export const FOOD_CATALOG_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode responder perguntas gerais sobre alimentos (calorias, macros, micronutrientes, medidas caseiras) mesmo sem nenhum cliente aberto — nunca calcule ou estime esses numeros de cabeca, sempre use as ferramentas abaixo, que consultam o catalogo real (TACO/TBCA + alimentos personalizados cadastrados).
Como fazer isso:
- Para achar o alimento certo, use ${SEARCH_FOODS_TOOL_NAME} primeiro. Se vier um resultado claramente dominante (nome digitado bate quase exatamente com a descricao), pode seguir com ele, mas diga de forma transparente qual registro esta usando (ex.: "Considerando Arroz, tipo 1, cozido..."). Se houver ambiguidade real entre alimentos diferentes (ex.: "frango" podendo ser peito, coxa, com ou sem pele), pergunte qual antes de calcular — nunca escolha sozinha nesse caso.
- Para os valores por 100g (tabela completa de nutrientes), use ${GET_FOOD_DETAILS_TOOL_NAME} com o source/refId que veio da busca.
- Para saber quantas gramas equivalem a uma medida caseira ja cadastrada para aquele alimento especifico (ex.: "uma colher de arroz"), use ${GET_FOOD_PORTIONS_TOOL_NAME} antes de calcular — se existir uma medida cadastrada, use o portionId dela em ${CALCULATE_FOOD_NUTRIENTS_TOOL_NAME}.
- Para responder "quantas calorias/proteina/ferro/etc tem X gramas (ou X medida) de Y", sempre use ${CALCULATE_FOOD_NUTRIENTS_TOOL_NAME} — nunca faca a conta voce mesma. Se a ferramenta devolver confidence diferente de "high" (ex.: conversao generica de colher/xicara sem medida cadastrada), avise honestamente que o valor e uma estimativa, usando o warning devolvido.
- Se ${SEARCH_FOODS_TOOL_NAME} nao encontrar nada ou o alimento pedido nao existir no catalogo, diga isso claramente — nunca invente um valor nutricional.
`.trim();
