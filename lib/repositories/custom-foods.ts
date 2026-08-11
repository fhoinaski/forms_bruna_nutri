import { d1Execute, d1Query } from "@/lib/d1/client";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

/**
 * Alimentos personalizados (secao 9 do pedido) — sem coluna de dono: clinica
 * de uma unica nutricionista, mesma decisao ja documentada para outras
 * tabelas administrativas no hardening anterior desta sessao.
 */
export type CustomFoodSource = "CUSTOM" | "MANUFACTURER";

export interface CustomFood {
  id: string;
  name: string;
  brand: string | null;
  source: CustomFoodSource;
  portion_base_grams: number;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sodium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  potassium_mg: number | null;
  vitamin_c_mg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomFoodInput {
  name: string;
  brand?: string | null;
  source: CustomFoodSource;
  portion_base_grams?: number;
  // Os 4 macros classicos sao obrigatorios: um alimento personalizado sem
  // eles nao serve para nenhum calculo (mesma exigencia implicita que a
  // base TACO ja satisfaz para todo alimento nela). So os 6 nutrientes
  // extras sao opcionais/`null` quando desconhecidos.
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  potassium_mg?: number | null;
  vitamin_c_mg?: number | null;
  notes?: string | null;
}

export async function listCustomFoods(query?: string): Promise<CustomFood[]> {
  const trimmed = query?.trim();
  if (trimmed) {
    return d1Query<CustomFood>(
      "SELECT * FROM custom_foods WHERE name LIKE ?1 OR brand LIKE ?1 ORDER BY name ASC",
      [`%${trimmed}%`]
    );
  }
  return d1Query<CustomFood>("SELECT * FROM custom_foods ORDER BY name ASC");
}

export async function getCustomFoodById(id: string): Promise<CustomFood | null> {
  const rows = await d1Query<CustomFood>("SELECT * FROM custom_foods WHERE id = ?1 LIMIT 1", [id]);
  return rows[0] ?? null;
}

export async function createCustomFood(input: CustomFoodInput): Promise<CustomFood> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO custom_foods
      (id, name, brand, source, portion_base_grams, energy_kcal, protein_g, carbohydrate_g, fat_g,
       fiber_g, sodium_mg, calcium_mg, iron_mg, potassium_mg, vitamin_c_mg, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    [
      id,
      input.name.trim(),
      input.brand?.trim() || null,
      input.source,
      input.portion_base_grams ?? 100,
      input.energy_kcal,
      input.protein_g,
      input.carbohydrate_g,
      input.fat_g,
      input.fiber_g ?? null,
      input.sodium_mg ?? null,
      input.calcium_mg ?? null,
      input.iron_mg ?? null,
      input.potassium_mg ?? null,
      input.vitamin_c_mg ?? null,
      input.notes?.trim() || null,
      now,
      now,
    ]
  );
  return (await getCustomFoodById(id))!;
}

export async function updateCustomFood(id: string, input: CustomFoodInput): Promise<CustomFood | null> {
  const existing = await getCustomFoodById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE custom_foods SET
       name = ?1, brand = ?2, source = ?3, portion_base_grams = ?4, energy_kcal = ?5, protein_g = ?6,
       carbohydrate_g = ?7, fat_g = ?8, fiber_g = ?9, sodium_mg = ?10, calcium_mg = ?11, iron_mg = ?12,
       potassium_mg = ?13, vitamin_c_mg = ?14, notes = ?15, updated_at = ?16
     WHERE id = ?17`,
    [
      input.name.trim(),
      input.brand?.trim() || null,
      input.source,
      input.portion_base_grams ?? 100,
      input.energy_kcal,
      input.protein_g,
      input.carbohydrate_g,
      input.fat_g,
      input.fiber_g ?? null,
      input.sodium_mg ?? null,
      input.calcium_mg ?? null,
      input.iron_mg ?? null,
      input.potassium_mg ?? null,
      input.vitamin_c_mg ?? null,
      input.notes?.trim() || null,
      now,
      id,
    ]
  );
  return getCustomFoodById(id);
}

export async function deleteCustomFood(id: string): Promise<boolean> {
  const existing = await getCustomFoodById(id);
  if (!existing) return false;
  await d1Execute("DELETE FROM custom_foods WHERE id = ?1", [id]);
  return true;
}

/**
 * Converte para a mesma "moeda" usada pelo motor nutricional (MacroReferenceFood,
 * a mesma interface que representa um alimento TACO) — normalizando para
 * "por 100g" quando `portion_base_grams` for diferente de 100, para que o
 * resto do motor (nutrients.ts/equivalence.ts/food-search.ts) trate TACO e
 * alimentos personalizados de forma identica, sem lógica especial.
 */
export function toMacroReferenceFood(row: CustomFood): MacroReferenceFood {
  const factor = row.portion_base_grams > 0 ? 100 / row.portion_base_grams : 1;
  const scale = (value: number | null): number | null => (value === null ? null : value * factor);
  return {
    numero: row.id,
    descricao: row.brand ? `${row.name} (${row.brand})` : row.name,
    fonte: row.source === "MANUFACTURER" ? "manufacturer" : "custom",
    energia_kcal: scale(row.energy_kcal) ?? 0,
    proteina_g: scale(row.protein_g) ?? 0,
    carboidrato_g: scale(row.carbohydrate_g) ?? 0,
    lipidios_g: scale(row.fat_g) ?? 0,
    fibra_g: scale(row.fiber_g),
    sodio_mg: scale(row.sodium_mg),
    calcio_mg: scale(row.calcium_mg),
    ferro_mg: scale(row.iron_mg),
    potassio_mg: scale(row.potassium_mg),
    vitamina_c_mg: scale(row.vitamin_c_mg),
  };
}
