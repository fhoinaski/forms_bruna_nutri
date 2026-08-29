import { d1Execute, d1Query } from "@/lib/d1/client";
import { capForLikePattern } from "@/lib/d1/like-safety";
import {
  calculateRecipeNutrition,
  calculateRecipeIngredientTotals,
  resolveRecipeYieldGrams,
  buildRecipeReferenceEntry,
  normalizeRecipeMealGroup,
  normalizeIngredientForRead,
  type RecipeIngredient,
  type RecipeYieldMode,
} from "@/lib/nutrition/recipes";
import { RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/nutrition/food-reference-lookup";
import type { MealPlanItemPayload } from "@/lib/repositories/meal-plans";
import { roundedNutrients, type FoodReferenceLookup, type RecipeReferenceEntry } from "@/lib/nutrition/nutrients";

export { RECIPE_MEAL_GROUPS, normalizeRecipeMealGroup };
export type { RecipeIngredient, RecipeMealGroup, RecipeYieldMode };

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  meal_group: RecipeMealGroup;
  servings: number;
  portion_grams: number | null;
  preparation_steps: string | null;
  ingredients_json: string;
  tags_json: string;
  source_note: string | null;
  /** R6 (seções 15-21) — contrato de rendimento. NULL (receitas pré-R6) é tratado como RAW_TOTAL. */
  yield_mode: RecipeYieldMode | null;
  /** Só populado quando yield_mode = USER_REPORTED. */
  yield_grams: number | null;
  // Cache de exibição (lista de receitas) — recalculado a cada
  // create/update pelo motor real, mas nunca a fonte de verdade pra um
  // item de receita numa refeição (essa sempre recalcula ao vivo via
  // getRecipeReferenceEntry, preservando missing≠zero; este cache
  // coalesce null->0 só pra não quebrar a listagem rápida — ver
  // reports/meal-plan-recipes-r6-domain.md).
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  per_portion_kcal: number;
  per_portion_protein_g: number;
  per_portion_carbs_g: number;
  per_portion_fat_g: number;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipePayload extends Omit<Recipe, "ingredients_json" | "tags_json"> {
  ingredients: RecipeIngredient[];
  tags: string[];
}

export interface RecipeInput {
  title: string;
  description?: string | null;
  meal_group: RecipeMealGroup;
  servings: number;
  portion_grams?: number | null;
  yield_mode?: RecipeYieldMode | null;
  yield_grams?: number | null;
  preparation_steps?: string | null;
  ingredients: RecipeIngredient[];
  tags?: string[];
  source_note?: string | null;
  /**
   * Escape hatch legado — só usado por `db/seed-recipes-bruna.ts` (conteúdo
   * de terceiros com ingredientes 100% em texto livre, sem identidade
   * canônica possível). NUNCA usado pelo editor novo nem pela API a partir
   * do R6 (seção "nunca manual macros → truth") — mantido só pra não
   * quebrar o pacote já seedado.
   */
  nutrition_override?: Partial<{
    total_kcal: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    per_portion_kcal: number;
    per_portion_protein_g: number;
    per_portion_carbs_g: number;
    per_portion_fat_g: number;
  }> | null;
  is_active?: boolean;
  created_by?: string | null;
}

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function hydrateRecipe(row: Recipe): RecipePayload {
  return {
    ...row,
    ingredients: parseJsonArray<RecipeIngredient>(row.ingredients_json, []),
    tags: parseJsonArray<string>(row.tags_json, []),
  };
}

/** Grava sempre no shape canônico novo (seção 3) — order = posição no array, nunca reordenado. Ingrediente sem `food` (nem legado `food_name`/`free_text`) é descartado, igual ao comportamento anterior. */
function sanitizeIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  return ingredients
    .map((raw, index) => {
      const normalized = normalizeIngredientForRead(raw);
      return {
        food: normalized.food,
        quantity: normalized.quantity,
        unit: normalized.unit,
        food_source: normalized.food_source as RecipeIngredient["food_source"],
        food_ref_id: normalized.food_ref_id,
        household_measure_id: normalized.household_measure_id,
        preparation: normalized.preparation,
        is_optional: normalized.is_optional,
        order: index,
      };
    })
    .filter((ingredient) => ingredient.food.trim());
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
}

/** Constrói um FoodReferenceLookup real (TACO em memória + CUSTOM/MANUFACTURER do banco + porções) pros ingredientes de uma receita — reaproveita a MESMA função já usada pra planos alimentares (`meal-plan-change-agent.ts`), nunca uma segunda lógica de resolução. */
async function buildLookupForIngredients(ingredients: RecipeIngredient[]): Promise<FoodReferenceLookup> {
  // Ingredientes nunca têm o shape exato de MealPlanItemPayload (não são
  // itens persistidos de um plano) — só os campos de identidade que
  // resolveMealPlanChangeReferences realmente lê (food_source/food_ref_id/
  // household_measure_id) importam aqui, daí o cast.
  const items = ingredients.map(normalizeIngredientForRead) as unknown as MealPlanItemPayload[];
  const { references, measuresById } = await resolveMealPlanChangeReferences({
    meals: [{ name: "", items, options: [], choice_groups: [] }],
  });
  return buildFoodReferenceLookup(references, measuresById);
}

/**
 * Calcula os totais/por-porção de uma receita pelo motor REAL (seção 12) —
 * nunca `estimateFoodMacros`/um segundo calculador. Os 4 macros clássicos
 * são coalescidos pra 0 só nestes campos de CACHE de exibição (a tabela
 * `recipes` grava `REAL NOT NULL DEFAULT 0`) — a autoridade missing-safe
 * de verdade é `getRecipeReferenceEntry`/`calculateRecipeIngredientTotals`,
 * chamada ao vivo sempre que a receita é usada como item ou pré-visualizada.
 */
async function computeStoredNutrition(
  ingredients: RecipeIngredient[],
  servings: number,
  override?: RecipeInput["nutrition_override"]
): Promise<number[]> {
  const numericOrFallback = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  if (override && Object.keys(override).length) {
    const totalKcal = numericOrFallback(override.total_kcal ?? override.per_portion_kcal, 0);
    const totalProtein = numericOrFallback(override.total_protein_g ?? override.per_portion_protein_g, 0);
    const totalCarbs = numericOrFallback(override.total_carbs_g ?? override.per_portion_carbs_g, 0);
    const totalFat = numericOrFallback(override.total_fat_g ?? override.per_portion_fat_g, 0);
    const servingCount = servings > 0 ? servings : 1;
    return [
      totalKcal, totalProtein, totalCarbs, totalFat,
      numericOrFallback(override.per_portion_kcal, totalKcal / servingCount),
      numericOrFallback(override.per_portion_protein_g, totalProtein / servingCount),
      numericOrFallback(override.per_portion_carbs_g, totalCarbs / servingCount),
      numericOrFallback(override.per_portion_fat_g, totalFat / servingCount),
    ];
  }
  const lookup = await buildLookupForIngredients(ingredients);
  const { total } = calculateRecipeIngredientTotals(ingredients, lookup);
  const servingCount = servings > 0 ? servings : 1;
  const rounded = roundedNutrients(total);
  const c = (value: number | null) => value ?? 0;
  return [
    c(rounded.energyKcal), c(rounded.proteinG), c(rounded.carbohydrateG), c(rounded.fatG),
    c(rounded.energyKcal) / servingCount, c(rounded.proteinG) / servingCount,
    c(rounded.carbohydrateG) / servingCount, c(rounded.fatG) / servingCount,
  ];
}

export async function getRecipes(filters: {
  includeInactive?: boolean;
  mealGroup?: RecipeMealGroup;
  tag?: string;
  q?: string;
} = {}): Promise<RecipePayload[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (!filters.includeInactive) conditions.push("is_active = 1");
  if (filters.mealGroup) {
    conditions.push(`meal_group = ?${idx++}`);
    params.push(filters.mealGroup);
  }
  if (filters.tag) {
    conditions.push(`tags_json LIKE ?${idx++}`);
    params.push(`%${capForLikePattern(filters.tag)}%`);
  }
  if (filters.q?.trim()) {
    // Busca por nome/descrição/tag OU nome de ingrediente (seção 44) — o
    // ingrediente vive dentro do JSON, então cai pra LIKE sobre
    // ingredients_json também (mesmo limite de segurança de padrão LIKE
    // já usado em todo o app — capForLikePattern).
    conditions.push(`(title LIKE ?${idx} OR description LIKE ?${idx} OR tags_json LIKE ?${idx} OR ingredients_json LIKE ?${idx})`);
    params.push(`%${capForLikePattern(filters.q.trim())}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await d1Query<Recipe>(
    `SELECT * FROM recipes ${where} ORDER BY meal_group ASC, title ASC`,
    params
  );
  return rows.map(hydrateRecipe);
}

export async function getRecipeById(id: string): Promise<RecipePayload | null> {
  const rows = await d1Query<Recipe>("SELECT * FROM recipes WHERE id = ?1 LIMIT 1", [id]);
  return rows[0] ? hydrateRecipe(rows[0]) : null;
}

/**
 * R6 (seções 12, 22-23, 33) — entrada pronta pra `FoodReferenceLookup.
 * byRecipeId`, recalculada AO VIVO a partir dos ingredientes reais (nunca
 * lida das colunas de cache `total_kcal`/etc, que coalescem missing→0 só
 * pra exibição rápida da lista). É esta função que garante que um item de
 * receita numa refeição nunca herda um número gravado manualmente.
 */
export async function getRecipeReferenceEntry(id: string): Promise<RecipeReferenceEntry | null> {
  const recipe = await getRecipeById(id);
  if (!recipe) return null;
  const lookup = await buildLookupForIngredients(recipe.ingredients);
  const entry = buildRecipeReferenceEntry(recipe.ingredients, recipe.servings, recipe.yield_mode, recipe.yield_grams, lookup);
  return { total: entry.total, servings: entry.servings, yieldGrams: entry.yieldGrams };
}

/** Batch — todas as receitas referenciadas por um conjunto de ids, numa única passada (seções 29-30/100: nunca N+1 na hidratação do Composer). */
export async function getRecipeReferenceEntriesByIds(ids: string[] | undefined | null): Promise<Map<string, RecipeReferenceEntry>> {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
  const map = new Map<string, RecipeReferenceEntry>();
  if (!unique.length) return map;
  const recipes = await Promise.all(unique.map((id) => getRecipeById(id)));
  const allIngredients = recipes.flatMap((recipe) => recipe?.ingredients ?? []);
  const lookup = await buildLookupForIngredients(allIngredients);
  recipes.forEach((recipe, index) => {
    if (!recipe) return;
    const entry = buildRecipeReferenceEntry(recipe.ingredients, recipe.servings, recipe.yield_mode, recipe.yield_grams, lookup);
    map.set(unique[index], { total: entry.total, servings: entry.servings, yieldGrams: entry.yieldGrams });
  });
  return map;
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = await computeStoredNutrition(ingredients, servings, input.nutrition_override);

  await d1Execute(
    `INSERT INTO recipes
      (id, title, description, meal_group, servings, portion_grams, yield_mode, yield_grams, preparation_steps,
       ingredients_json, tags_json, source_note,
       total_kcal, total_protein_g, total_carbs_g, total_fat_g,
       per_portion_kcal, per_portion_protein_g, per_portion_carbs_g, per_portion_fat_g,
       is_active, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)`,
    [
      id, input.title, input.description ?? null, input.meal_group, servings,
      input.portion_grams ?? null, input.yield_mode ?? null, input.yield_grams ?? null,
      input.preparation_steps ?? null, JSON.stringify(ingredients), JSON.stringify(tags), input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1, input.created_by ?? null, now, now,
    ]
  );
  return id;
}

export async function upsertRecipe(id: string, input: RecipeInput): Promise<void> {
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = await computeStoredNutrition(ingredients, servings, input.nutrition_override);

  await d1Execute(
    `INSERT INTO recipes
      (id, title, description, meal_group, servings, portion_grams, yield_mode, yield_grams, preparation_steps,
       ingredients_json, tags_json, source_note,
       total_kcal, total_protein_g, total_carbs_g, total_fat_g,
       per_portion_kcal, per_portion_protein_g, per_portion_carbs_g, per_portion_fat_g,
       is_active, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, COALESCE((SELECT created_at FROM recipes WHERE id = ?1), ?23), ?24)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       meal_group = excluded.meal_group,
       servings = excluded.servings,
       portion_grams = excluded.portion_grams,
       yield_mode = excluded.yield_mode,
       yield_grams = excluded.yield_grams,
       preparation_steps = excluded.preparation_steps,
       ingredients_json = excluded.ingredients_json,
       tags_json = excluded.tags_json,
       source_note = excluded.source_note,
       total_kcal = excluded.total_kcal,
       total_protein_g = excluded.total_protein_g,
       total_carbs_g = excluded.total_carbs_g,
       total_fat_g = excluded.total_fat_g,
       per_portion_kcal = excluded.per_portion_kcal,
       per_portion_protein_g = excluded.per_portion_protein_g,
       per_portion_carbs_g = excluded.per_portion_carbs_g,
       per_portion_fat_g = excluded.per_portion_fat_g,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    [
      id, input.title, input.description ?? null, input.meal_group, servings,
      input.portion_grams ?? null, input.yield_mode ?? null, input.yield_grams ?? null,
      input.preparation_steps ?? null, JSON.stringify(ingredients), JSON.stringify(tags), input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1, input.created_by ?? null, now, now,
    ]
  );
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = await computeStoredNutrition(ingredients, servings, input.nutrition_override);

  await d1Execute(
    `UPDATE recipes SET
      title = ?1,
      description = ?2,
      meal_group = ?3,
      servings = ?4,
      portion_grams = ?5,
      yield_mode = ?6,
      yield_grams = ?7,
      preparation_steps = ?8,
      ingredients_json = ?9,
      tags_json = ?10,
      source_note = ?11,
      total_kcal = ?12,
      total_protein_g = ?13,
      total_carbs_g = ?14,
      total_fat_g = ?15,
      per_portion_kcal = ?16,
      per_portion_protein_g = ?17,
      per_portion_carbs_g = ?18,
      per_portion_fat_g = ?19,
      is_active = ?20,
      updated_at = ?21
     WHERE id = ?22`,
    [
      input.title, input.description ?? null, input.meal_group, servings,
      input.portion_grams ?? null, input.yield_mode ?? null, input.yield_grams ?? null,
      input.preparation_steps ?? null, JSON.stringify(ingredients), JSON.stringify(tags), input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1, now, id,
    ]
  );
}

export async function archiveRecipe(id: string): Promise<void> {
  await d1Execute("UPDATE recipes SET is_active = 0, updated_at = ?1 WHERE id = ?2", [new Date().toISOString(), id]);
}

export { calculateRecipeNutrition };
