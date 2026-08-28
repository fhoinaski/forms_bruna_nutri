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
  // Meal Flex (estruturas flexíveis) — metadados transitórios do item que o
  // wizard já produz (lib/nutrition/draft-types.ts#DraftMealItem), ausentes
  // deste schema desde a introdução de OPTIONS/COMBINATION: sem eles, o
  // .strict() abaixo rejeitava qualquer round-trip (recalculate/refine/
  // optimize/regenerate-meal) de um draft flexível ou com preparo/opcional,
  // e o cliente caía silenciosamente em "mantém a nutrição anterior".
  preparation: z.string().max(100).nullable().optional(),
  is_optional: z.boolean().optional(),
}).strict();

export const draftNeedsReviewSchema = z.object({
  path: z.string().max(200).optional(),
  query: z.string().min(1).max(300),
  quantity: z.string().max(80),
  unit: z.string().max(40),
  status: z.enum(["AMBIGUOUS", "NOT_FOUND", "CLINICAL_CONFLICT", "PREPARATION_NEEDS_REVIEW"]),
  reason: z.string().max(500),
  candidates: z.array(z.object({
    ref: z.object({ source: z.enum(["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA", "OPEN_FOOD_FACTS"]), sourceId: z.string(), canonicalId: z.string().nullable().optional() }),
    name: z.string(),
    displayName: z.string(),
    sourceLabel: z.string(),
  })).max(10),
  preparation: z.string().max(100).nullable().optional(),
  recipeCandidates: z.array(z.object({ id: z.string(), title: z.string(), servings: z.number() })).max(10).optional(),
}).strict();

export const draftMealSchema = z.object({
  mealKey: z.enum(MEAL_KEYS),
  name: z.string().min(1).max(200),
  suggested_time: z.string().max(20).nullable(),
  source_recipe_id: z.string().max(80).nullable(),
  meal_structure: z.enum(["SIMPLE", "OPTIONS", "COMBINATION"]).nullable().optional(),
  items: z.array(draftItemSchema).max(30),
  options: z.array(z.object({
    label: z.string().min(1).max(200),
    description: z.string().max(500).nullable().optional(),
    items: z.array(draftItemSchema).max(30),
  }).strict()).max(10).optional(),
  choice_groups: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(500).nullable().optional(),
    min_selections: z.number().int().min(0),
    max_selections: z.number().int().min(1),
    items: z.array(draftItemSchema).max(30),
  }).strict()).max(10).optional(),
  needsReview: z.array(draftNeedsReviewSchema).max(30),
}).strict();

export const draftTargetSchema = z.object({
  targetEnergyKcal: z.number().positive().max(20000).nullable(),
  targetProteinG: z.number().positive().max(2000).nullable(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable(),
  targetFatG: z.number().positive().max(2000).nullable(),
});
