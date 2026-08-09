import { d1Execute, d1Query } from "@/lib/d1/client";
import {
  calculateRecipeNutrition,
  normalizeRecipeMealGroup,
  type RecipeIngredient,
} from "@/lib/nutrition/recipes";
import { RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

export { RECIPE_MEAL_GROUPS, normalizeRecipeMealGroup };
export type { RecipeIngredient, RecipeMealGroup };

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
  preparation_steps?: string | null;
  ingredients: RecipeIngredient[];
  tags?: string[];
  source_note?: string | null;
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

function sanitizeIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  return ingredients
    .map((ingredient) => {
      const tacoNumber = Number(ingredient.taco_number);
      const grams = Number(ingredient.grams);
      const foodName = String(ingredient.food_name ?? ingredient.free_text ?? "").trim();
      const hasTaco = Number.isFinite(tacoNumber) && tacoNumber > 0;
      const hasGrams = Number.isFinite(grams) && grams > 0;
      return {
        taco_number: hasTaco ? tacoNumber : null,
        food_name: foodName,
        grams: hasGrams ? grams : null,
        free_text: hasTaco ? null : foodName,
      };
    })
    .filter((ingredient) => ingredient.food_name && ((ingredient.taco_number && ingredient.grams) || ingredient.free_text));
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
}

function nutritionParams(input: Pick<RecipeInput, "ingredients" | "servings" | "nutrition_override">) {
  const nutrition = calculateRecipeNutrition(input.ingredients, input.servings);
  const override = input.nutrition_override ?? {};
  const numericOrFallback = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const totalKcal = Number(override.total_kcal ?? override.per_portion_kcal ?? nutrition.total.kcal);
  const totalProtein = Number(override.total_protein_g ?? override.per_portion_protein_g ?? nutrition.total.protein);
  const totalCarbs = Number(override.total_carbs_g ?? override.per_portion_carbs_g ?? nutrition.total.carbs);
  const totalFat = Number(override.total_fat_g ?? override.per_portion_fat_g ?? nutrition.total.fat);
  return [
    Number.isFinite(totalKcal) ? totalKcal : nutrition.total.kcal,
    Number.isFinite(totalProtein) ? totalProtein : nutrition.total.protein,
    Number.isFinite(totalCarbs) ? totalCarbs : nutrition.total.carbs,
    Number.isFinite(totalFat) ? totalFat : nutrition.total.fat,
    numericOrFallback(override.per_portion_kcal, nutrition.perPortion.kcal),
    numericOrFallback(override.per_portion_protein_g, nutrition.perPortion.protein),
    numericOrFallback(override.per_portion_carbs_g, nutrition.perPortion.carbs),
    numericOrFallback(override.per_portion_fat_g, nutrition.perPortion.fat),
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
    params.push(`%${filters.tag}%`);
  }
  if (filters.q?.trim()) {
    conditions.push(`(title LIKE ?${idx} OR description LIKE ?${idx} OR tags_json LIKE ?${idx})`);
    params.push(`%${filters.q.trim()}%`);
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

export async function createRecipe(input: RecipeInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = nutritionParams({ ingredients, servings, nutrition_override: input.nutrition_override });

  await d1Execute(
    `INSERT INTO recipes
      (id, title, description, meal_group, servings, portion_grams, preparation_steps,
       ingredients_json, tags_json, source_note,
       total_kcal, total_protein_g, total_carbs_g, total_fat_g,
       per_portion_kcal, per_portion_protein_g, per_portion_carbs_g, per_portion_fat_g,
       is_active, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)`,
    [
      id,
      input.title,
      input.description ?? null,
      input.meal_group,
      servings,
      input.portion_grams ?? null,
      input.preparation_steps ?? null,
      JSON.stringify(ingredients),
      JSON.stringify(tags),
      input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1,
      input.created_by ?? null,
      now,
      now,
    ]
  );
  return id;
}

export async function upsertRecipe(id: string, input: RecipeInput): Promise<void> {
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = nutritionParams({ ingredients, servings, nutrition_override: input.nutrition_override });

  await d1Execute(
    `INSERT INTO recipes
      (id, title, description, meal_group, servings, portion_grams, preparation_steps,
       ingredients_json, tags_json, source_note,
       total_kcal, total_protein_g, total_carbs_g, total_fat_g,
       per_portion_kcal, per_portion_protein_g, per_portion_carbs_g, per_portion_fat_g,
       is_active, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, COALESCE((SELECT created_at FROM recipes WHERE id = ?1), ?21), ?22)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       meal_group = excluded.meal_group,
       servings = excluded.servings,
       portion_grams = excluded.portion_grams,
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
      id,
      input.title,
      input.description ?? null,
      input.meal_group,
      servings,
      input.portion_grams ?? null,
      input.preparation_steps ?? null,
      JSON.stringify(ingredients),
      JSON.stringify(tags),
      input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1,
      input.created_by ?? null,
      now,
      now,
    ]
  );
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  const now = new Date().toISOString();
  const ingredients = sanitizeIngredients(input.ingredients);
  const tags = sanitizeTags(input.tags);
  const servings = Math.max(1, Math.round(Number(input.servings) || 1));
  const macros = nutritionParams({ ingredients, servings, nutrition_override: input.nutrition_override });

  await d1Execute(
    `UPDATE recipes SET
      title = ?1,
      description = ?2,
      meal_group = ?3,
      servings = ?4,
      portion_grams = ?5,
      preparation_steps = ?6,
      ingredients_json = ?7,
      tags_json = ?8,
      source_note = ?9,
      total_kcal = ?10,
      total_protein_g = ?11,
      total_carbs_g = ?12,
      total_fat_g = ?13,
      per_portion_kcal = ?14,
      per_portion_protein_g = ?15,
      per_portion_carbs_g = ?16,
      per_portion_fat_g = ?17,
      is_active = ?18,
      updated_at = ?19
     WHERE id = ?20`,
    [
      input.title,
      input.description ?? null,
      input.meal_group,
      servings,
      input.portion_grams ?? null,
      input.preparation_steps ?? null,
      JSON.stringify(ingredients),
      JSON.stringify(tags),
      input.source_note ?? null,
      ...macros,
      input.is_active === false ? 0 : 1,
      now,
      id,
    ]
  );
}

export async function archiveRecipe(id: string): Promise<void> {
  await d1Execute("UPDATE recipes SET is_active = 0, updated_at = ?1 WHERE id = ?2", [new Date().toISOString(), id]);
}
