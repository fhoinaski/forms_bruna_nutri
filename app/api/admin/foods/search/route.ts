import { after, NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { normalize } from "@/lib/nutrition/macros";
import { searchFoods, toLegacyFoodSearchResponseItem, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { annotateAdminFoodSearchWithCanonicalPilot } from "@/lib/nutrition/canonical-food-admin-search";
import { buildMultiSourceFoodSearch } from "@/lib/nutrition/food-search-view-model";
import { recordFoodSearchTelemetry, sanitizeFoodSearchQuery } from "@/lib/nutrition/food-search-telemetry";
import { getFoodSearchTelemetryAdapter } from "@/lib/nutrition/food-search-telemetry-runtime";

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
  const telemetryAdapter = getFoodSearchTelemetryAdapter();
  const telemetrySearchSessionId = telemetryAdapter ? crypto.randomUUID() : null;
  if (telemetryAdapter && telemetrySearchSessionId) {
    const sanitized = sanitizeFoodSearchQuery(query);
    const topResult = multiSourceItems[0] ?? null;
    const performed = {
      schemaVersion: 1,
      type: "FOOD_SEARCH_PERFORMED" as const,
      sessionSearchId: telemetrySearchSessionId,
      timestampBucket: new Date().toISOString().slice(0, 13) + ":00Z",
      query: sanitized.query,
      queryLengthBucket: sanitized.queryLengthBucket,
      resultCount: multiSourceItems.length,
      durationMs,
      hasExactMatch: topResult?.matchInfo.rank === 0,
      topResultSource: topResult?.sourceCode ?? null,
      platform: "web" as const,
      viewportClass: "regular" as const,
    };
    after(async () => {
      await recordFoodSearchTelemetry(telemetryAdapter, performed);
      if (!multiSourceItems.length) await recordFoodSearchTelemetry(telemetryAdapter, {
        schemaVersion: 1, type: "FOOD_SEARCH_ZERO_RESULTS", sessionSearchId: telemetrySearchSessionId,
        query: sanitized.query, queryLengthBucket: sanitized.queryLengthBucket,
      });
    });
  }
  return NextResponse.json({
    items,
    multiSourceItems,
    canonicalPilot: annotated.canonicalPilot,
    meta: { durationMs, limit, telemetrySearchSessionId },
  });
}
