import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { normalize } from "@/lib/nutrition/macros";
import { searchFoods, toLegacyFoodSearchResponseItem, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { annotateAdminFoodSearchWithCanonicalPilot } from "@/lib/nutrition/canonical-food-admin-search";

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
  // FASE 6 (item 3/15) — searchFoods (atual) e o piloto do resolver
  // canonico rodam em PARALELO (nunca em serie — medido: serie dobrava a
  // latencia, ~700ms vs ~350ms de cada lado). O piloto so precisa da
  // lista base no fim, pra reordenar; a resolucao canonica em si nao
  // depende dela.
  const baselineItemsPromise = searchFoods({ query, limit, sources: source ? [source] : undefined }).then((results) => results.map(toLegacyFoodSearchResponseItem));
  const { items, canonicalPilot } = await annotateAdminFoodSearchWithCanonicalPilot(query, baselineItemsPromise);
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  return NextResponse.json({
    items,
    canonicalPilot,
    meta: { durationMs, limit: Math.max(1, Math.min(50, Math.trunc(limit))) },
  });
}
