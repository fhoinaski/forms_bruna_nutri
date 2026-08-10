import { z } from "zod";
import { RECIPE_MEAL_GROUPS } from "@/lib/nutrition/recipe-constants";
import { suggestMealWithAI } from "@/lib/ai/agents/nutrition/meal-suggestion-agent";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";

export const PROPOSE_NEW_RECIPE_TOOL_NAME = "proposeNewRecipe";

export const proposeNewRecipeInputSchema = z.object({
  title: z.string().min(2).max(200),
  meal_group: z.enum(RECIPE_MEAL_GROUPS),
  servings: z.number().int().positive().max(20).default(1),
  instructions: z.string().max(500).optional(),
}).strict();

export type ProposeNewRecipeInput = z.infer<typeof proposeNewRecipeInputSchema>;

export type ProposedRecipeIngredient = { food_name: string; grams: number; taco_number: number | null };

export type ProposeNewRecipeOutput =
  | { error: string }
  | {
      title: string;
      meal_group: string;
      servings: number;
      preparation_steps: string;
      ingredients: ProposedRecipeIngredient[];
    };

function parseGrams(quantity: string, unit: string): number {
  const numeric = Number(String(quantity ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 100;
}

export async function executeProposeNewRecipe(input: ProposeNewRecipeInput): Promise<ProposeNewRecipeOutput> {
  try {
    const suggestion = await suggestMealWithAI({
      context: "recipe",
      recipeTitle: input.title,
      mealGroup: input.meal_group,
      instructions: input.instructions ?? null,
    });
    const meal = suggestion.resolvedMeals[0];
    if (!meal || !meal.items.length) return { error: "Nao foi possivel montar ingredientes validos para essa receita." };

    return {
      title: meal.mealName || input.title,
      meal_group: input.meal_group,
      servings: input.servings,
      preparation_steps: meal.notes ?? "",
      ingredients: meal.items.map((item) => ({
        food_name: item.food,
        grams: parseGrams(item.quantity, item.unit),
        taco_number: item.taco_number ? Number(item.taco_number) : null,
      })),
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Nao foi possivel gerar a receita." };
  }
}

export const RECIPE_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode criar um rascunho de receita nova na biblioteca quando a nutricionista pedir (ex.: "cria uma receita baixa caloria para quem quer emagrecer", "monta uma receita de lanche com mais proteina").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_RECIPE_TOOL_NAME} com um titulo (invente um titulo claro se a nutricionista nao der um), o grupo de refeicao (${RECIPE_MEAL_GROUPS.join(", ")}) e o numero de porcoes (padrao 1).
- Coloque em "instructions" qualquer orientacao adicional dada na conversa (ex.: "baixa caloria", "sem lactose", "rica em proteina") para guiar a escolha dos alimentos.
- A ferramenta busca ingredientes reais na base TACO e ja monta o modo de preparo. ${PROPOSAL_DISCLAIMER}
- Se a ferramenta retornar erro, explique em texto o que aconteceu e sugira tentar de novo com um pedido mais simples.
- Depois de propor, lembre que "baixa caloria" ou qualquer adequacao clinica especifica e uma decisao da nutricionista — o sistema so busca os alimentos e calcula os valores a partir do que for escolhido.
`.trim();
