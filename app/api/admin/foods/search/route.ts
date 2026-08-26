import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { normalize } from "@/lib/nutrition/macros";
import { searchFoods, toLegacyFoodSearchResponseItem, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { annotateAdminFoodSearchWithCanonicalPilot } from "@/lib/nutrition/canonical-food-admin-search";
import { buildMultiSourceFoodSearch } from "@/lib/nutrition/food-search-view-model";

export const dynamic = "force-dynamic";

const VALID_SOURCES: RuntimeFoodCatalogSource[] = ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"];

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sourceParam = request.nextUrl.searchParams.get("source");
  const source = VALID_SOURCES.find((item) => item === sourceParam);
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitParam) ? Math.trunc(limitParam) : 20));

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
  const retrievalLimit = Math.min(50, Math.max(limit * 3, 40));
  const baselineItemsPromise = searchFoods({ query, limit: retrievalLimit, sources: source ? [source] : undefined }).then((results) => results.map(toLegacyFoodSearchResponseItem));
  const annotated = await annotateAdminFoodSearchWithCanonicalPilot(query, baselineItemsPromise);
  const items = annotated.items.slice(0, limit);
  const multiSourceItems = await buildMultiSourceFoodSearch(query, annotated.items, Math.min(24, limit));
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  return NextResponse.json({
    items,
    multiSourceItems,
    canonicalPilot: annotated.canonicalPilot,
    meta: { durationMs, limit },
  });
}
