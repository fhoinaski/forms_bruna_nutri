import { z } from "zod";
import { MEAL_KEYS } from "@/lib/nutrition/draft-types";

/**
 * Validação do shape de DraftMeal[] reenviado pelo cliente (nada é
 * persistido ainda — o rascunho volta e vai entre wizard/API a cada
 * refinamento/otimização/regeneração). Compartilhado entre
 * app/api/admin/clients/[id]/meal-plans/draft/{refine,optimize,regenerate-meal}
 * pra não duplicar o mesmo schema em 3 arquivos.
 */
export const draftItemSchema = z.object({
  food: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  quantity: z.string().max(80),
  unit: z.string().max(40),
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]).nullable(),
  food_ref_id: z.string().max(120).nullable(),
  ai_suggested: z.literal(true),
  needsSafetyReview: z.boolean().optional(),
}).strict();

export const draftNeedsReviewSchema = z.object({
  query: z.string().min(1).max(300),
  quantity: z.string().max(80),
  unit: z.string().max(40),
  status: z.enum(["AMBIGUOUS", "NOT_FOUND", "CLINICAL_CONFLICT"]),
  reason: z.string().max(500),
  candidates: z.array(z.object({
    ref: z.object({ source: z.enum(["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA", "OPEN_FOOD_FACTS"]), sourceId: z.string(), canonicalId: z.string().nullable().optional() }),
    name: z.string(),
    displayName: z.string(),
    sourceLabel: z.string(),
  })).max(10),
}).strict();

export const draftMealSchema = z.object({
  mealKey: z.enum(MEAL_KEYS),
  name: z.string().min(1).max(200),
  suggested_time: z.string().max(20).nullable(),
  source_recipe_id: z.string().max(80).nullable(),
  items: z.array(draftItemSchema).max(30),
  needsReview: z.array(draftNeedsReviewSchema).max(30),
}).strict();

export const draftTargetSchema = z.object({
  targetEnergyKcal: z.number().positive().max(20000).nullable(),
  targetProteinG: z.number().positive().max(2000).nullable(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable(),
  targetFatG: z.number().positive().max(2000).nullable(),
});
