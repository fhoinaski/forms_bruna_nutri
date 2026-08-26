import { afterEach, describe, expect, it, vi } from "vitest";

const session = "f91_search_session_0001";
let closeShim: (() => Promise<void>) | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await closeShim?.();
  closeShim = undefined;
});

async function localD1() {
  const { startD1Shim } = await import("../e2e/helpers/d1-shim.mjs");
  const shim = await startD1Shim();
  closeShim = shim.close;
  vi.stubEnv("CLOUDFLARE_D1_API_BASE_URL", shim.baseUrl);
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "test-database");
  vi.stubEnv("CLOUDFLARE_D1_API_TOKEN", "test-token");
  return shim;
}

function performed(query = "banana", sessionSearchId = session) {
  return { schemaVersion: 1 as const, type: "FOOD_SEARCH_PERFORMED" as const, sessionSearchId, timestampBucket: "2026-08-26T12:00Z", query: { kind: "RAW_ELIGIBLE" as const, normalizedQuery: query }, queryLengthBucket: "1_16" as const, resultCount: 4, durationMs: 12, hasExactMatch: true, topResultSource: "TBCA" as const, platform: "web" as const, viewportClass: "regular" as const };
}

describe("F9.1 persistent food search telemetry", () => {
  it("uses local D1 only in PERSIST, stores sanitized data, and keeps OFF/NOOP at zero writes", async () => {
    const shim = await localD1();
    const { getFoodSearchTelemetryAdapter } = await import("@/lib/nutrition/food-search-telemetry-runtime");
    const { recordFoodSearchTelemetry } = await import("@/lib/nutrition/food-search-telemetry");

    expect(getFoodSearchTelemetryAdapter("OFF")).toBeNull();
    await recordFoodSearchTelemetry(getFoodSearchTelemetryAdapter("NOOP")!, performed());
    expect(shim.db.prepare("SELECT COUNT(*) AS count FROM food_search_events").get()).toEqual({ count: 0 });

    await recordFoodSearchTelemetry(getFoodSearchTelemetryAdapter("PERSIST")!, performed());
    await recordFoodSearchTelemetry(getFoodSearchTelemetryAdapter("PERSIST")!, { schemaVersion: 1, type: "FOOD_SEARCH_RESULT_SELECTED", sessionSearchId: session, selectedRank: 4, canonicalFoodId: "ibge:banana", source: "IBGE_POF", preparationCode: "COZIDO", resultCount: 4 });
    await recordFoodSearchTelemetry(getFoodSearchTelemetryAdapter("PERSIST")!, { schemaVersion: 1, type: "FOOD_SEARCH_ZERO_RESULTS", sessionSearchId: "f91_search_session_0002", query: { kind: "REDACTED", reason: "EMAIL_LIKE" }, queryLengthBucket: "1_16" });

    const rows = shim.db.prepare("SELECT event_type, query_normalized_sanitized, query_status, selected_rank, canonical_food_id FROM food_search_events ORDER BY event_type").all();
    expect(rows).toEqual([
      { event_type: "FOOD_SEARCH_PERFORMED", query_normalized_sanitized: "banana", query_status: "STORED", selected_rank: null, canonical_food_id: null },
      { event_type: "FOOD_SEARCH_RESULT_SELECTED", query_normalized_sanitized: null, query_status: "REDACTED", selected_rank: 4, canonical_food_id: "ibge:banana" },
      { event_type: "FOOD_SEARCH_ZERO_RESULTS", query_normalized_sanitized: null, query_status: "REDACTED", selected_rank: null, canonical_food_id: null },
    ]);
    expect(JSON.stringify(rows)).not.toContain("email");
  });

  it("aggregates by ephemeral search session idempotently and enforces raw/aggregate retention", async () => {
    const shim = await localD1();
    const { D1SearchTelemetryAdapter, aggregateFoodSearchTelemetry, cleanupFoodSearchTelemetry } = await import("@/lib/repositories/food-search-telemetry");
    const adapter = new D1SearchTelemetryAdapter();
    await adapter.record(performed("arroz integral", "f91_search_session_0003"));
    await adapter.record({ schemaVersion: 1, type: "FOOD_SEARCH_RESULT_SELECTED", sessionSearchId: "f91_search_session_0003", selectedRank: 4, canonicalFoodId: "tbca:arroz", source: "TBCA", preparationCode: null, resultCount: 4 });
    await adapter.record(performed("ovo cozido", "f91_search_session_0005"));
    await adapter.record({ schemaVersion: 1, type: "FOOD_SEARCH_ZERO_RESULTS", sessionSearchId: "f91_search_session_0006", query: { kind: "RAW_ELIGIBLE", normalizedQuery: "alimento inexistente" }, queryLengthBucket: "17_32" });
    await adapter.record(performed("banana", "f91_search_session_0004"));
    shim.db.prepare("UPDATE food_search_events SET occurred_at = ?1 WHERE search_session_id = ?2").run("2026-07-26T12:00:00.000Z", "f91_search_session_0004");
    shim.db.prepare("INSERT INTO food_search_daily_metrics (metric_date, query_key, query_status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)").run("2026-02-25", "old", "STORED", "2026-02-25T00:00:00.000Z", "2026-02-25T00:00:00.000Z");

    await aggregateFoodSearchTelemetry(new Date("2026-08-26T12:00:00.000Z"));
    const first = shim.db.prepare("SELECT search_count, selection_count, top1_selection_count, top3_selection_count, selected_rank_sum, selected_rank_count, source_selection_counts_json FROM food_search_daily_metrics WHERE query_key = 'arroz integral'").get();
    await aggregateFoodSearchTelemetry(new Date("2026-08-26T12:00:00.000Z"));
    const second = shim.db.prepare("SELECT search_count, selection_count, top1_selection_count, top3_selection_count, selected_rank_sum, selected_rank_count, source_selection_counts_json FROM food_search_daily_metrics WHERE query_key = 'arroz integral'").get();
    expect(first).toEqual({ search_count: 1, selection_count: 1, top1_selection_count: 0, top3_selection_count: 0, selected_rank_sum: 4, selected_rank_count: 1, source_selection_counts_json: '{"TBCA":1}' });
    expect(second).toEqual(first);

    const cleanup = await cleanupFoodSearchTelemetry(new Date("2026-08-26T12:00:00.000Z"));
    expect(cleanup.rawDeleted).toBe(1);
    expect(cleanup.aggregatesDeleted).toBe(1);
    expect(shim.db.prepare("SELECT COUNT(*) AS count FROM food_search_events WHERE search_session_id = ?1").get("f91_search_session_0003")).toEqual({ count: 2 });
    expect(shim.db.prepare("SELECT COUNT(*) AS count FROM food_search_events WHERE search_session_id = ?1").get("f91_search_session_0004")).toEqual({ count: 0 });
  });
});
