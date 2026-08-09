import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SeedIngredient = {
  numero_taco: number;
  alimento: string;
  porcao_g: number;
};

type RecipeSeed = {
  id: number;
  grupo: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  rendimento_porcoes: number;
  porcao_g: number | null;
  modo_preparo: string | null;
  ingredientes: SeedIngredient[];
  tags: string[];
};

type RecipeSeedFile = {
  observacao?: string;
  receitas: RecipeSeed[];
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

const seedPath = join(root, "lib", "nutrition", "data", "receitas-taco-seed.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8")) as RecipeSeedFile;

function sourceNoteForRecipe(recipe: RecipeSeed): string | null {
  const notes: string[] = [];
  if (seed.observacao?.trim()) notes.push(seed.observacao.trim());
  if (recipe.titulo.toLowerCase().includes("merluza da taco")) {
    notes.push("Nesta receita, tilapia foi representada por merluza da TACO por ausencia de item especifico na tabela.");
  }
  return notes.length ? notes.join(" ") : null;
}

async function main() {
  const { normalizeRecipeMealGroup, upsertRecipe } = await import("../lib/repositories/recipes");

  for (const recipe of seed.receitas) {
    await upsertRecipe(`taco-recipe-${recipe.id}`, {
      title: recipe.titulo,
      description: recipe.descricao,
      meal_group: normalizeRecipeMealGroup(recipe.categoria || recipe.grupo),
      servings: recipe.rendimento_porcoes,
      portion_grams: recipe.porcao_g,
      preparation_steps: recipe.modo_preparo,
      ingredients: recipe.ingredientes.map((ingredient) => ({
        taco_number: ingredient.numero_taco,
        food_name: ingredient.alimento,
        grams: ingredient.porcao_g,
      })),
      tags: recipe.tags ?? [],
      source_note: sourceNoteForRecipe(recipe),
      is_active: true,
      created_by: "seed:receitas-taco",
    });
  }

  console.log(`${seed.receitas.length} receita(s) inserida(s)/atualizada(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
