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
  // R5.1 — item opcional dentro de COMBINATION (mesmo campo do domínio real).
  is_optional: z.boolean().optional(),
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
  // R5.1 (seção 16) — caminho estável até a posição original nested; opcional pra não quebrar chamadores anteriores a esta fase.
  path: z.string().max(200).optional(),
}).strict();

// R5.1 — OPTIONS/COMBINATION reaproveitam exatamente o shape de
// MealOptionPayload/MealChoiceGroupPayload (lib/meal-plans/flexible-structure.ts).
export const draftOptionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  items: z.array(draftItemSchema).max(30),
  needsReview: z.array(draftNeedsReviewSchema).max(30),
}).strict();

export const draftChoiceGroupSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  min_selections: z.number().int().min(0).max(10),
  max_selections: z.number().int().min(1).max(10),
  items: z.array(draftItemSchema).max(30),
  needsReview: z.array(draftNeedsReviewSchema).max(30),
}).strict();

export const draftMealSchema = z.object({
  mealKey: z.enum(MEAL_KEYS),
  name: z.string().min(1).max(200),
  suggested_time: z.string().max(20).nullable(),
  source_recipe_id: z.string().max(80).nullable(),
  // R5.1 — ausente/null é equivalente a "SIMPLE" (mesma convenção do domínio real).
  meal_structure: z.enum(["SIMPLE", "OPTIONS", "COMBINATION"]).nullable().optional(),
  items: z.array(draftItemSchema).max(30),
  needsReview: z.array(draftNeedsReviewSchema).max(30),
  options: z.array(draftOptionSchema).max(6).optional(),
  choice_groups: z.array(draftChoiceGroupSchema).max(6).optional(),
}).strict();

export const draftTargetSchema = z.object({
  targetEnergyKcal: z.number().positive().max(20000).nullable(),
  targetProteinG: z.number().positive().max(2000).nullable(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable(),
  targetFatG: z.number().positive().max(2000).nullable(),
});
