import { stepCountIs } from "ai";
import { z } from "zod";
import { generate } from "@/lib/ai/gateway/ai-gateway";
import {
  DEFAULT_MEAL_SUGGESTION_SYSTEM_PROMPT,
  getAISettings,
} from "@/lib/repositories/ai-settings";
import { getRecipeById, getRecipes } from "@/lib/repositories/recipes";
import { normalizeIngredientForRead } from "@/lib/nutrition/recipes";
import { searchTacoFoods, getTacoFoodByNumber } from "@/lib/nutrition/taco";
import {
  aiMealSuggestionContextSchema,
  parseAiMealSuggestionJson,
  type AiMealSuggestionContext,
  type AiMealSuggestionOutput,
} from "@/lib/validators/ai-meal-suggestion";

export type ResolvedMealSuggestion = AiMealSuggestionOutput & {
  resolvedMeals: Array<{
    mealName: string;
    notes: string | null;
    source_recipe_id: string | null;
    items: Array<{
      source: "taco" | "recipe";
      id: string | number;
      food: string;
      quantity: string;
      unit: string;
      notes: string | null;
      taco_number?: number | string;
      ai_suggested: true;
    }>;
  }>;
  aiModel: string;
};

function buildPrompt(input: AiMealSuggestionContext) {
  const requestedShape = `{
  "meals": [
    {
      "mealName": "string",
      "items": [
        { "source": "taco" | "recipe", "id": "id retornado pela ferramenta", "quantity": "string", "unit": "string" }
      ],
      "notes": "string opcional"
    }
  ]
}`;

  return [
    `Contexto: ${input.context}.`,
    input.targetGroup ? `Target group generico: ${input.targetGroup}.` : "",
    input.mealName ? `Nome da refeicao: ${input.mealName}.` : "",
    input.recipeTitle ? `Titulo da receita: ${input.recipeTitle}.` : "",
    input.mealGroup ? `Categoria/grupo da refeicao: ${input.mealGroup}.` : "",
    input.instructions ? `Pedido especifico da nutricionista: ${input.instructions}.` : "",
    input.context === "template"
      ? "Sugira um dia completo com 4 refeicoes: Cafe da manha, Almoco, Lanche e Jantar."
      : "Sugira uma unica refeicao.",
    input.context === "recipe"
      ? "Para receita nova, use apenas source taco nos ingredientes; nao use source recipe como ingrediente de receita."
      : "Pode usar source recipe quando uma receita da biblioteca for adequada.",
    input.context === "recipe"
      ? "No campo notes da refeicao, escreva o modo de preparo em passo a passo numerado, cobrindo pre-preparo, cozimento e montagem."
      : "",
    "Use as ferramentas para buscar alimentos/receitas antes de escolher IDs.",
    "Retorne somente JSON valido, sem markdown, no formato:",
    requestedShape,
  ].filter(Boolean).join("\n");
}

async function resolveAndValidate(output: AiMealSuggestionOutput, context: AiMealSuggestionContext): Promise<ResolvedMealSuggestion["resolvedMeals"]> {
  const resolvedMeals: ResolvedMealSuggestion["resolvedMeals"] = [];

  for (const meal of output.meals) {
    const resolvedItems: ResolvedMealSuggestion["resolvedMeals"][number]["items"] = [];
    let sourceRecipeId: string | null = null;

    for (const item of meal.items) {
      if (item.source === "taco") {
        const food = getTacoFoodByNumber(item.id);
        if (!food) throw new Error(`Item TACO invalido retornado pela IA: ${String(item.id)}.`);
        resolvedItems.push({
          source: "taco",
          id: item.id,
          taco_number: food.numero,
          food: food.descricao,
          quantity: item.quantity,
          unit: item.unit,
          notes: "Sugerido por IA com base na TACO. Revisar antes de salvar.",
          ai_suggested: true,
        });
        continue;
      }

      if (context.context === "recipe") {
        throw new Error("A sugestao de receita nova nao pode usar outra receita como ingrediente.");
      }

      const recipe = await getRecipeById(String(item.id));
      if (!recipe) throw new Error(`Receita invalida retornada pela IA: ${String(item.id)}.`);
      sourceRecipeId = recipe.id;
      for (const raw of recipe.ingredients) {
        const ingredient = normalizeIngredientForRead(raw);
        // Esta ferramenta só sabe expandir ingrediente TACO legado (mesmo
        // limite de antes desta fase) — ingredientes com outra fonte real
        // (R6) ficam de fora aqui, nunca uma identidade inventada.
        if (ingredient.food_source !== "TACO" || !ingredient.food_ref_id || !ingredient.quantity) continue;
        resolvedItems.push({
          source: "recipe",
          id: recipe.id,
          taco_number: Number(ingredient.food_ref_id),
          food: ingredient.food,
          quantity: ingredient.quantity,
          unit: ingredient.unit ?? "g",
          notes: `Sugerido por IA a partir da receita "${recipe.title}". Revisar antes de salvar.`,
          ai_suggested: true,
        });
      }
    }

    if (!resolvedItems.length) throw new Error(`A refeicao "${meal.mealName}" nao retornou itens validos.`);
    resolvedMeals.push({
      mealName: meal.mealName,
      notes: meal.notes ?? null,
      source_recipe_id: sourceRecipeId,
      items: resolvedItems,
    });
  }

  return resolvedMeals;
}

export async function suggestMealWithAI(input: AiMealSuggestionContext): Promise<ResolvedMealSuggestion> {
  const context = aiMealSuggestionContextSchema.parse(input);
  const settings = await getAISettings();
  const isFullDayTemplate = context.context === "template";

  const result = await generate({
    agent: "meal-suggestion",
    system: DEFAULT_MEAL_SUGGESTION_SYSTEM_PROMPT,
    prompt: buildPrompt(context),
    stopWhen: stepCountIs(isFullDayTemplate ? 12 : 5),
    maxOutputTokens: isFullDayTemplate ? 6000 : 2500,
    tools: {
      searchTacoFoods: {
        description: "Busca alimentos reais na tabela TACO. Use os numeros retornados como id quando escolher source taco.",
        inputSchema: z.object({ query: z.string().min(2).max(120) }),
        execute: async ({ query }: { query: string }) => ({
          items: searchTacoFoods(query, 10).map((food) => ({
            id: food.numero,
            descricao: food.descricao,
            grupo: food.grupo,
            kcal_100g: food.energia_kcal,
            proteina_100g: food.proteina_g,
            carboidrato_100g: food.carboidrato_g,
            gordura_100g: food.lipidios_g,
          })),
        }),
      },
      searchRecipes: {
        description: "Busca receitas existentes na biblioteca. Use o id retornado quando escolher source recipe.",
        inputSchema: z.object({ query: z.string().min(2).max(120), mealGroup: z.string().max(80).optional() }),
        execute: async ({ query, mealGroup }: { query: string; mealGroup?: string }) => {
          const recipes = await getRecipes({ q: query, mealGroup: mealGroup as never });
          return {
            items: recipes.slice(0, 8).map((recipe) => ({
              id: recipe.id,
              title: recipe.title,
              meal_group: recipe.meal_group,
              tags: recipe.tags,
              kcal: recipe.per_portion_kcal,
              ingredients: recipe.ingredients.map((ingredient) => ({
                taco_number: ingredient.taco_number,
                food_name: ingredient.food_name,
                grams: ingredient.grams,
              })),
            })),
          };
        },
      },
    },
  });

  let output: AiMealSuggestionOutput;
  try {
    output = parseAiMealSuggestionJson(result.text);
  } catch {
    throw new Error(
      isFullDayTemplate
        ? "A IA nao conseguiu gerar o modelo completo dessa vez. Tente novamente ou peca menos refeicoes por vez."
        : "A IA nao conseguiu gerar uma sugestao dessa vez. Tente novamente ou simplifique o pedido."
    );
  }

  return {
    ...output,
    resolvedMeals: await resolveAndValidate(output, context),
    aiModel: `${settings.provider}:${settings.model}`,
  };
}
