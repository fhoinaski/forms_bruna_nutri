import { z } from "zod";
import { tryParseJsonFromText } from "@/lib/ai/schemas/json-extract";

export const aiMealSuggestionContextSchema = z.object({
  context: z.enum(["meal", "recipe", "template"]),
  targetGroup: z.string().max(80).optional().nullable(),
  mealName: z.string().max(200).optional().nullable(),
  recipeTitle: z.string().max(200).optional().nullable(),
  mealGroup: z.string().max(80).optional().nullable(),
  instructions: z.string().max(1000).optional().nullable(),
}).strict();

export type AiMealSuggestionContext = z.infer<typeof aiMealSuggestionContextSchema>;

export const aiMealSuggestionItemSchema = z.object({
  source: z.enum(["taco", "recipe"]),
  id: z.union([z.string().min(1), z.number().int().positive()]),
  quantity: z.string().min(1).max(80),
  unit: z.string().min(1).max(40),
}).strict();

export const aiMealSuggestionMealSchema = z.object({
  mealName: z.string().min(1).max(200),
  items: z.array(aiMealSuggestionItemSchema).min(1).max(20),
  notes: z.string().max(1000).optional().nullable(),
}).strict();

export const aiMealSuggestionOutputSchema = z.object({
  meals: z.array(aiMealSuggestionMealSchema).min(1).max(6),
}).strict();

export type AiMealSuggestionOutput = z.infer<typeof aiMealSuggestionOutputSchema>;

export function parseAiMealSuggestionJson(value: string): AiMealSuggestionOutput {
  return aiMealSuggestionOutputSchema.parse(tryParseJsonFromText(value));
}
