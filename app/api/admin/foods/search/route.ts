import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { normalize } from "@/lib/nutrition/macros";
import { searchFoods, toLegacyFoodSearchResponseItem, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";

export const dynamic = "force-dynamic";

const VALID_SOURCES: RuntimeFoodCatalogSource[] = ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"];

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sourceParam = request.nextUrl.searchParams.get("source");
  const source = VALID_SOURCES.find((item) => item === sourceParam);
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitParam) ? limitParam : 20;

  // Evita consultar D1 para custom/manufacturer quando a busca e curta demais.
  if (normalize(query).length < 2) {
    return NextResponse.json({ items: [] });
  }

  const startedAt = performance.now();
  const results = await searchFoods({ query, limit, sources: source ? [source] : undefined });
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  return NextResponse.json({
    items: results.map(toLegacyFoodSearchResponseItem),
    meta: { durationMs, limit: Math.max(1, Math.min(50, Math.trunc(limit))) },
  });
}
