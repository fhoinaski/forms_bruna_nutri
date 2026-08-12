import { d1Execute, d1Query } from "@/lib/d1/client";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";

/**
 * Medidas caseiras por alimento (seção 5-7 do pedido de precisão
 * nutricional) — tabela `food_portions` já criada na migration 0034,
 * estendida em 0036 com source_version/confidence/is_active. Reutiliza a
 * tabela existente (não cria uma segunda) exatamente como o pedido pede.
 */
export type FoodPortionSource = "TACO" | "CUSTOM";
export type FoodPortionConfidence = "high" | "medium" | "low";

export interface FoodPortion {
  id: string;
  food_source: FoodPortionSource;
  food_ref_id: string;
  description: string;
  gram_equivalent: number;
  source: string | null;
  source_version: string | null;
  confidence: FoodPortionConfidence;
  is_active: number;
  created_at: string;
}

export interface FoodPortionInput {
  food_source: FoodPortionSource;
  food_ref_id: string;
  description: string;
  gram_equivalent: number;
  source?: string | null;
  source_version?: string | null;
  confidence?: FoodPortionConfidence;
}

/** Todas as medidas ATIVAS cadastradas para um alimento especifico, da menor para a maior gramatura. */
export async function listFoodPortions(foodSource: FoodPortionSource, foodRefId: string): Promise<FoodPortion[]> {
  return d1Query<FoodPortion>(
    `SELECT * FROM food_portions WHERE food_source = ?1 AND food_ref_id = ?2 AND is_active = 1 ORDER BY gram_equivalent ASC`,
    [foodSource, foodRefId]
  );
}

/**
 * Medidas de varios alimentos de uma vez (usado pelo editor de plano e pelo
 * motor de calculo do resumo nutricional, que precisam resolver N itens sem
 * N queries separadas).
 */
export async function listFoodPortionsForMany(
  refs: Array<{ food_source: FoodPortionSource; food_ref_id: string }>
): Promise<FoodPortion[]> {
  if (!refs.length) return [];
  const conditions = refs.map((_, index) => `(food_source = ?${index * 2 + 1} AND food_ref_id = ?${index * 2 + 2})`).join(" OR ");
  const params = refs.flatMap((ref) => [ref.food_source, ref.food_ref_id]);
  return d1Query<FoodPortion>(
    `SELECT * FROM food_portions WHERE is_active = 1 AND (${conditions}) ORDER BY food_source, food_ref_id, gram_equivalent ASC`,
    params
  );
}

export async function getFoodPortionById(id: string): Promise<FoodPortion | null> {
  const rows = await d1Query<FoodPortion>(`SELECT * FROM food_portions WHERE id = ?1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** Cadastro de medida personalizada pela nutricionista (seção 7 do pedido) — reutilizável em qualquer plano futuro para o mesmo alimento. */
export async function createFoodPortion(input: FoodPortionInput): Promise<FoodPortion> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO food_portions (id, food_source, food_ref_id, description, gram_equivalent, source, source_version, confidence, is_active, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)`,
    [
      id,
      input.food_source,
      input.food_ref_id,
      input.description.trim(),
      input.gram_equivalent,
      input.source?.trim() || null,
      input.source_version?.trim() || null,
      input.confidence ?? "medium",
      now,
    ]
  );
  return (await getFoodPortionById(id))!;
}

/** Converte para o formato que lib/nutrition/quantity-resolution.ts (resolveQuantity) consome — nao guarda I/O ali, so recebe o dado ja resolvido. */
export function toHouseholdMeasureOption(portion: FoodPortion): HouseholdMeasureOption {
  return {
    id: portion.id,
    description: portion.description,
    gramEquivalent: portion.gram_equivalent,
    source: portion.source,
    confidence: portion.confidence,
  };
}

/** Nunca DELETE — desativar preserva o historico de calculo de planos que ja referenciam esta medida via household_measure_id. */
export async function deactivateFoodPortion(id: string): Promise<boolean> {
  const existing = await getFoodPortionById(id);
  if (!existing) return false;
  await d1Execute(`UPDATE food_portions SET is_active = 0 WHERE id = ?1`, [id]);
  return true;
}
