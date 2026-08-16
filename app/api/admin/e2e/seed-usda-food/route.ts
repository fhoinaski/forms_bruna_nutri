import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { d1Batch } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  }

  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const foodId = "e2e-usda-rice";
  const sourceId = "USDA_SR_LEGACY:E2E_RICE";
  try {
    await d1Batch([
      {
        sql: `INSERT OR IGNORE INTO food_catalog_usda_foods
          (id, source, source_id, upstream_source, upstream_source_id, original_name, normalized_name, food_group, data_quality, source_url, source_version, import_run_id, created_at)
          VALUES (?1, 'USDA', ?2, 'USDA_SR_LEGACY', 'E2E_RICE', 'Rice pilot e2e cooked', 'rice pilot e2e cooked', 'Cereal Grains and Pasta', 'COMPLETE', 'e2e', 'e2e', 'USDA_PILOT_E2E', CURRENT_TIMESTAMP)`,
        params: [foodId, sourceId],
      },
      {
        sql: `INSERT INTO food_catalog_usda_foods_fts (food_id, normalized_name, original_name)
          SELECT ?1, 'rice pilot e2e cooked', 'Rice pilot e2e cooked'
          WHERE NOT EXISTS (SELECT 1 FROM food_catalog_usda_foods_fts WHERE food_id = ?1)`,
        params: [foodId],
      },
      ...[
        ["ENERGY_KCAL", 130, "kcal"],
        ["PROTEIN", 2.69, "g"],
        ["CARBOHYDRATE", 28.17, "g"],
        ["TOTAL_FAT", 0.28, "g"],
        ["CALCIUM", 10, "mg"],
        ["IRON", 1.2, "mg"],
        ["MAGNESIUM", 12, "mg"],
        ["SELENIUM", 7.5, "mcg"],
        ["VITAMIN_B12", 0, "mcg"],
      ].map(([code, value, unit]) => ({
        sql: `INSERT OR IGNORE INTO food_catalog_usda_nutrients
          (id, food_id, nutrient_code, value, unit, basis_amount, basis_unit, source, provenance, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, 100, 'g', 'USDA', ?6, CURRENT_TIMESTAMP)`,
        params: [`${foodId}_${code}`, foodId, code, value, unit, JSON.stringify({ source: "E2E" })],
      })),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao semear alimento USDA.";
    return NextResponse.json({ message }, { status: 500 });
  }

  return NextResponse.json({ id: foodId, sourceId, name: "Rice pilot e2e cooked" });
}
