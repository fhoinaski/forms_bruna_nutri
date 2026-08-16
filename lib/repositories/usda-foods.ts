import { d1Query } from "@/lib/d1/client";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { NUTRIENT_BY_CODE, type NutrientCode, type NutrientUnit } from "@/lib/nutrition/nutrient-vocabulary";

export interface UsdaFood {
  id: string;
  source: "USDA";
  source_id: string;
  upstream_source: "USDA_FOUNDATION" | "USDA_SR_LEGACY";
  upstream_source_id: string;
  original_name: string;
  normalized_name: string;
  food_group: string | null;
  data_quality: string | null;
  source_url: string | null;
  source_version: string | null;
  import_run_id: string | null;
  created_at: string;
}

export interface UsdaNutrientRow {
  nutrient_code: NutrientCode;
  value: number | null;
  unit: NutrientUnit;
  basis_amount: number;
  basis_unit: "g" | "ml";
  provenance: string | null;
}

export interface UsdaFoodSearchRow extends UsdaFood {
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ftsQuery(normalized: string): string {
  return normalized.split(/\s+/).filter(Boolean).map((token) => `${token}*`).join(" ");
}

export async function searchUsdaFoods(query: string, limit = 20): Promise<UsdaFoodSearchRow[]> {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) return [];
  const safeLimit = Math.max(1, Math.min(50, limit));
  return d1Query<UsdaFoodSearchRow>(
    `WITH ranked AS (
        SELECT id, 0 AS search_rank
          FROM food_catalog_usda_foods
         WHERE normalized_name = ?1
        UNION ALL
        SELECT id, 1 AS search_rank
          FROM food_catalog_usda_foods
         WHERE normalized_name LIKE ?2
        UNION ALL
        SELECT f.id, 2 AS search_rank
          FROM food_catalog_usda_foods_fts x
          JOIN food_catalog_usda_foods f ON f.id = x.food_id
         WHERE food_catalog_usda_foods_fts MATCH ?3
        UNION ALL
        SELECT id, 3 AS search_rank
          FROM food_catalog_usda_foods
         WHERE normalized_name LIKE ?4
      ),
      best AS (
        SELECT id, MIN(search_rank) AS search_rank
          FROM ranked
         GROUP BY id
      )
      SELECT f.*,
             MAX(CASE WHEN n.nutrient_code = 'ENERGY_KCAL' THEN n.value END) AS energy_kcal,
             MAX(CASE WHEN n.nutrient_code = 'PROTEIN' THEN n.value END) AS protein_g,
             MAX(CASE WHEN n.nutrient_code = 'CARBOHYDRATE' THEN n.value END) AS carbohydrate_g,
             MAX(CASE WHEN n.nutrient_code = 'TOTAL_FAT' THEN n.value END) AS fat_g,
             MAX(CASE WHEN n.nutrient_code = 'FIBER' THEN n.value END) AS fiber_g
        FROM best
        JOIN food_catalog_usda_foods f ON f.id = best.id
        LEFT JOIN food_catalog_usda_nutrients n
          ON n.food_id = f.id
         AND n.nutrient_code IN ('ENERGY_KCAL', 'PROTEIN', 'CARBOHYDRATE', 'TOTAL_FAT', 'FIBER')
       GROUP BY f.id
      ORDER BY
        best.search_rank ASC,
        CASE upstream_source WHEN 'USDA_SR_LEGACY' THEN 0 ELSE 1 END,
        length(original_name) ASC,
        original_name ASC
      LIMIT ?5`,
    [normalized, `${normalized}%`, ftsQuery(normalized), `%${normalized}%`, safeLimit]
  );
}

export async function getUsdaFoodBySourceId(sourceId: string): Promise<UsdaFood | null> {
  const rows = await d1Query<UsdaFood>("SELECT * FROM food_catalog_usda_foods WHERE source = 'USDA' AND source_id = ?1 LIMIT 1", [sourceId]);
  return rows[0] ?? null;
}

export async function listUsdaNutrients(foodId: string): Promise<UsdaNutrientRow[]> {
  return d1Query<UsdaNutrientRow>(
    `SELECT nutrient_code, value, unit, basis_amount, basis_unit, provenance
       FROM food_catalog_usda_nutrients
      WHERE food_id = ?1
      ORDER BY nutrient_code`,
    [foodId]
  );
}

function value(rows: UsdaNutrientRow[], code: NutrientCode): number | null {
  const row = rows.find((item) => item.nutrient_code === code);
  if (!row || row.value === null) return null;
  const definition = NUTRIENT_BY_CODE[code];
  if (row.unit !== definition.unit || row.basis_amount !== 100 || row.basis_unit !== "g") return null;
  return row.value;
}

export function toUsdaSearchMacroReference(food: UsdaFoodSearchRow): MacroReferenceFood | null {
  if (food.energy_kcal === null || food.protein_g === null || food.carbohydrate_g === null || food.fat_g === null) return null;
  return {
    numero: food.source_id,
    descricao: food.original_name,
    grupo: food.food_group ?? undefined,
    fonte: "usda",
    energia_kcal: food.energy_kcal,
    proteina_g: food.protein_g,
    carboidrato_g: food.carbohydrate_g,
    lipidios_g: food.fat_g,
    fibra_g: food.fiber_g,
  };
}

export async function toUsdaMacroReference(food: UsdaFood): Promise<MacroReferenceFood | null> {
  const rows = await listUsdaNutrients(food.id);
  const energy = value(rows, "ENERGY_KCAL");
  const protein = value(rows, "PROTEIN");
  const carbohydrate = value(rows, "CARBOHYDRATE");
  const fat = value(rows, "TOTAL_FAT");
  if (energy === null || protein === null || carbohydrate === null || fat === null) return null;
  return {
    numero: food.source_id,
    descricao: food.original_name,
    grupo: food.food_group ?? undefined,
    fonte: "usda",
    energia_kcal: energy,
    proteina_g: protein,
    carboidrato_g: carbohydrate,
    lipidios_g: fat,
    energy_kj: value(rows, "ENERGY_KJ"),
    sugars_g: value(rows, "SUGARS"),
    saturated_fat_g: value(rows, "SATURATED_FAT"),
    monounsaturated_fat_g: value(rows, "MONOUNSATURATED_FAT"),
    polyunsaturated_fat_g: value(rows, "POLYUNSATURATED_FAT"),
    trans_fat_g: value(rows, "TRANS_FAT"),
    fibra_g: value(rows, "FIBER"),
    sodio_mg: value(rows, "SODIUM"),
    calcio_mg: value(rows, "CALCIUM"),
    ferro_mg: value(rows, "IRON"),
    magnesium_mg: value(rows, "MAGNESIUM"),
    phosphorus_mg: value(rows, "PHOSPHORUS"),
    potassio_mg: value(rows, "POTASSIUM"),
    zinc_mg: value(rows, "ZINC"),
    copper_mg: value(rows, "COPPER"),
    manganese_mg: value(rows, "MANGANESE"),
    selenium_mcg: value(rows, "SELENIUM"),
    vitamin_a_mcg: value(rows, "VITAMIN_A"),
    vitamina_c_mg: value(rows, "VITAMIN_C"),
    vitamin_d_mcg: value(rows, "VITAMIN_D"),
    vitamin_e_mg: value(rows, "VITAMIN_E"),
    vitamin_k_mcg: value(rows, "VITAMIN_K"),
    vitamin_b1_mg: value(rows, "THIAMIN"),
    vitamin_b2_mg: value(rows, "RIBOFLAVIN"),
    vitamin_b3_mg: value(rows, "NIACIN"),
    pantothenic_acid_mg: value(rows, "PANTOTHENIC_ACID"),
    vitamin_b6_mg: value(rows, "VITAMIN_B6"),
    folate_mcg: value(rows, "FOLATE"),
    vitamin_b12_mcg: value(rows, "VITAMIN_B12"),
    cholesterol_mg: value(rows, "CHOLESTEROL"),
  };
}
