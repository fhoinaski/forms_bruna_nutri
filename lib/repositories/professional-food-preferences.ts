import { d1Execute, d1Query } from "@/lib/d1/client";
import { normalize } from "@/lib/nutrition/normalize";
import type { FoodCatalogSource } from "@/lib/nutrition/food-catalog";

/**
 * Preferência profissional de resolução de alimento (Food Terminology &
 * Catalog Coverage V1, seção 8) — "query normalizada → source + refId",
 * isolada por profissional (admin_id). NUNCA um alias global: só é
 * reaproveitada pelo mesmo profissional que confirmou explicitamente, e
 * sempre revalidada contra o catálogo real no momento do uso (ver
 * lib/nutrition/food-resolver.ts) — nunca um valor congelado que poderia
 * sobreviver a uma mudança no alimento referenciado.
 */
export interface ProfessionalFoodPreference {
  id: string;
  admin_id: string;
  query_normalized: string;
  food_source: FoodCatalogSource;
  food_ref_id: string;
  food_name_snapshot: string;
  created_at: string;
}

export async function getProfessionalFoodPreference(
  adminId: string,
  query: string
): Promise<ProfessionalFoodPreference | null> {
  const rows = await d1Query<ProfessionalFoodPreference>(
    `SELECT * FROM professional_food_preferences WHERE admin_id = ?1 AND query_normalized = ?2 LIMIT 1`,
    [adminId, normalize(query)]
  );
  return rows[0] ?? null;
}

export async function saveProfessionalFoodPreference(input: {
  adminId: string;
  query: string;
  foodSource: FoodCatalogSource;
  foodRefId: string;
  foodNameSnapshot: string;
}): Promise<ProfessionalFoodPreference> {
  const id = crypto.randomUUID();
  const queryNormalized = normalize(input.query);
  await d1Execute(
    `INSERT INTO professional_food_preferences (id, admin_id, query_normalized, food_source, food_ref_id, food_name_snapshot)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (admin_id, query_normalized) DO UPDATE SET
       food_source = excluded.food_source,
       food_ref_id = excluded.food_ref_id,
       food_name_snapshot = excluded.food_name_snapshot`,
    [id, input.adminId, queryNormalized, input.foodSource, input.foodRefId, input.foodNameSnapshot]
  );
  return (await getProfessionalFoodPreference(input.adminId, input.query))!;
}

/** Reversível — o profissional pode desfazer a preferência a qualquer momento. */
export async function deleteProfessionalFoodPreference(adminId: string, id: string): Promise<void> {
  await d1Execute(`DELETE FROM professional_food_preferences WHERE id = ?1 AND admin_id = ?2`, [id, adminId]);
}
