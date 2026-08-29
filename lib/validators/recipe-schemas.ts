import { z } from "zod";
import { RECIPE_MEAL_GROUPS } from "@/lib/nutrition/recipe-constants";

/**
 * R6 — schema compartilhado entre POST /api/admin/recipes e
 * PATCH /api/admin/recipes/[id] (seção 58: evitar endpoint gigante
 * duplicando validação). Ingrediente aceita o shape NOVO (food/food_source/
 * food_ref_id — qualquer fonte canônica real) OU o shape LEGADO
 * (taco_number/food_name/grams/free_text, receitas criadas antes do R6) —
 * nunca os dois inventados ao mesmo tempo; o editor novo sempre envia o
 * shape novo.
 */
export const recipeIngredientSchema = z.object({
  food: z.string().min(1).max(300).optional(),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
  food_ref_id: z.string().max(120).nullable().optional(),
  household_measure_id: z.string().max(120).nullable().optional(),
  preparation: z.string().max(200).nullable().optional(),
  is_optional: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  // Legado (pré-R6) — mantido só para não quebrar receitas antigas sendo reenviadas sem edição.
  taco_number: z.number().int().positive().nullable().optional(),
  food_name: z.string().max(300).optional(),
  grams: z.number().positive().nullable().optional(),
  free_text: z.string().max(300).nullable().optional(),
}).strict().refine(
  (ingredient) => Boolean(ingredient.food?.trim() || ingredient.food_name?.trim() || ingredient.free_text?.trim()),
  { message: "Todo ingrediente precisa de um nome (food)." }
);

export const recipeYieldModeSchema = z.enum(["RAW_TOTAL", "USER_REPORTED", "PORTION_COUNT"]);

export const recipeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  meal_group: z.enum(RECIPE_MEAL_GROUPS),
  servings: z.number().int().positive().max(100),
  portion_grams: z.number().positive().nullable().optional(),
  /** R6 (seções 15-21) — contrato de rendimento. Ausente/null é tratado como RAW_TOTAL. */
  yield_mode: recipeYieldModeSchema.nullable().optional(),
  /** Só relevante quando yield_mode = USER_REPORTED. */
  yield_grams: z.number().positive().nullable().optional(),
  preparation_steps: z.string().max(5000).nullable().optional(),
  ingredients: z.array(recipeIngredientSchema).min(1).max(80),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  source_note: z.string().max(2000).nullable().optional(),
  // Escape hatch legado (seed de conteúdo de terceiros sem ingredientes
  // resolvíveis) — nunca exposto no editor novo; mantido só pra não
  // quebrar db/seed-recipes-bruna.ts.
  nutrition_override: z.object({
    total_kcal: z.number().nonnegative().optional(),
    total_protein_g: z.number().nonnegative().optional(),
    total_carbs_g: z.number().nonnegative().optional(),
    total_fat_g: z.number().nonnegative().optional(),
    per_portion_kcal: z.number().nonnegative().optional(),
    per_portion_protein_g: z.number().nonnegative().optional(),
    per_portion_carbs_g: z.number().nonnegative().optional(),
    per_portion_fat_g: z.number().nonnegative().optional(),
  }).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();
