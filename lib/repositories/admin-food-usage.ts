import { d1Execute, d1Query } from "@/lib/d1/client";
import type { FoodCatalogSource } from "@/lib/nutrition/food-catalog";

/**
 * Alimentos recentemente usados por um profissional (R4, seções 6-7) —
 * identidade canônica (food_source/food_ref_id), NUNCA texto livre. Ordem é
 * puramente por `last_used_at` real — nenhum ranking clínico inventado.
 * Reaproveita a mesma fonte de identidade que o resto do app (nunca uma
 * segunda tabela de "nomes de alimentos").
 */
export interface AdminFoodUsage {
  id: string;
  admin_id: string;
  food_source: FoodCatalogSource;
  food_ref_id: string;
  use_count: number;
  last_used_at: string;
  created_at: string;
}

/** Chamado quando um alimento é EFETIVAMENTE selecionado (nunca a cada tecla digitada). */
export async function recordFoodUsage(input: {
  adminId: string;
  foodSource: FoodCatalogSource;
  foodRefId: string;
}): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO admin_food_usage (id, admin_id, food_source, food_ref_id, use_count, last_used_at, created_at)
     VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
     ON CONFLICT (admin_id, food_source, food_ref_id) DO UPDATE SET
       use_count = use_count + 1,
       last_used_at = excluded.last_used_at`,
    [id, input.adminId, input.foodSource, input.foodRefId, now]
  );
}

export async function listRecentFoodUsage(adminId: string, limit = 20): Promise<AdminFoodUsage[]> {
  return d1Query<AdminFoodUsage>(
    `SELECT * FROM admin_food_usage WHERE admin_id = ?1 ORDER BY last_used_at DESC LIMIT ?2`,
    [adminId, Math.max(1, Math.min(100, limit))]
  );
}
