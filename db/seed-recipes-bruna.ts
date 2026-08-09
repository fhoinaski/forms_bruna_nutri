import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type BrunaRecipeSeed = {
  id: string;
  titulo: string;
  meal_group: string;
  kcal_aprox: number;
  tempo_min: number | string;
  rendimento: string;
  ingredientes: string[];
  modo_preparo: string[];
  source_note: string;
  is_active: boolean;
  created_by: string;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const seedPath = join(root, "lib", "nutrition", "data", "receitas-bruna-seed.json");
const recipes = JSON.parse(readFileSync(seedPath, "utf8")) as BrunaRecipeSeed[];

function parseServings(value: string): number {
  const match = value.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

function formatPreparationSteps(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

async function main() {
  const { normalizeRecipeMealGroup, upsertRecipe } = await import("../lib/repositories/recipes");

  for (const recipe of recipes) {
    const kcal = Number(recipe.kcal_aprox) || 0;
    await upsertRecipe(`bruna-recipe-${recipe.id}`, {
      title: recipe.titulo,
      description: `Receita do bonus Receitas e Cardapios Prontos para Prescrever. Tempo de preparo: ${recipe.tempo_min} min. Rendimento: ${recipe.rendimento}.`,
      meal_group: normalizeRecipeMealGroup(recipe.meal_group),
      servings: parseServings(recipe.rendimento),
      portion_grams: null,
      preparation_steps: formatPreparationSteps(recipe.modo_preparo),
      ingredients: recipe.ingredientes.map((ingredient) => ({
        taco_number: null,
        food_name: ingredient,
        grams: null,
        free_text: ingredient,
      })),
      tags: ["receitas prontas", "bonus bruna", recipe.meal_group],
      source_note: recipe.source_note,
      nutrition_override: {
        total_kcal: kcal,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        per_portion_kcal: kcal,
        per_portion_protein_g: 0,
        per_portion_carbs_g: 0,
        per_portion_fat_g: 0,
      },
      is_active: recipe.is_active,
      created_by: recipe.created_by,
    });
  }

  console.log(`${recipes.length} receita(s) do bonus Bruna inserida(s)/atualizada(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
