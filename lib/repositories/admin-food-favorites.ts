import { d1Execute, d1Query } from "@/lib/d1/client";
import type { FoodCatalogSource } from "@/lib/nutrition/food-catalog";

/**
 * Alimentos favoritados por um profissional (R4, seções 8-9) — identidade
 * canônica, reversível a qualquer momento. Nunca compartilhado entre
 * profissionais (admin_id sempre no WHERE), nunca um ranking clínico.
 */
export interface AdminFoodFavorite {
  id: string;
  admin_id: string;
  food_source: FoodCatalogSource;
  food_ref_id: string;
  created_at: string;
}

export async function addFoodFavorite(input: {
  adminId: string;
  foodSource: FoodCatalogSource;
  foodRefId: string;
}): Promise<void> {
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO admin_food_favorites (id, admin_id, food_source, food_ref_id)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (admin_id, food_source, food_ref_id) DO NOTHING`,
    [id, input.adminId, input.foodSource, input.foodRefId]
  );
}

export async function removeFoodFavorite(input: {
  adminId: string;
  foodSource: FoodCatalogSource;
  foodRefId: string;
}): Promise<void> {
  await d1Execute(
    `DELETE FROM admin_food_favorites WHERE admin_id = ?1 AND food_source = ?2 AND food_ref_id = ?3`,
    [input.adminId, input.foodSource, input.foodRefId]
  );
}

export async function listFoodFavorites(adminId: string, limit = 50): Promise<AdminFoodFavorite[]> {
  return d1Query<AdminFoodFavorite>(
    `SELECT * FROM admin_food_favorites WHERE admin_id = ?1 ORDER BY created_at DESC LIMIT ?2`,
    [adminId, Math.max(1, Math.min(200, limit))]
  );
}
