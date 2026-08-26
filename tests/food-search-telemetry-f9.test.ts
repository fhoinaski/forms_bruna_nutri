import { describe, expect, it, vi } from "vitest";
import { foodSearchTelemetry, FOOD_SEARCH_TELEMETRY_SCHEMA_VERSION, recordFoodSearchTelemetry, sanitizeFoodSearchQuery } from "@/lib/nutrition/food-search-telemetry";

const sessionSearchId = "f9_search_session_0001";

describe("F9 food search telemetry privacy boundary", () => {
  it("keeps the default adapter as a no-op", async () => {
    await expect(foodSearchTelemetry.record({ type: "FOOD_SEARCH_PERFORMED", schemaVersion: FOOD_SEARCH_TELEMETRY_SCHEMA_VERSION, sessionSearchId, timestampBucket: "2026-08-25T17:00Z", query: { kind: "RAW_ELIGIBLE", normalizedQuery: "arroz integral" }, queryLengthBucket: "1_16", resultCount: 4, durationMs: 12, hasExactMatch: true, topResultSource: "TBCA", platform: "web", viewportClass: "regular" })).resolves.toBeUndefined();
  });

  it.each([
    ["nome@example.com", "EMAIL_LIKE"],
    ["+55 (11) 99999-9999", "PHONE_LIKE"],
    ["paciente diabetico precisa de arroz integral sem gluten hoje", "FREE_TEXT_LIKE"],
    ["a".repeat(65), "TOO_LONG"],
  ])("redacts unsafe query %s", (query, reason) => {
    expect(sanitizeFoodSearchQuery(query).query).toEqual({ kind: "REDACTED", reason });
  });

  it("keeps a normal food query eligible after deterministic normalization", () => {
    expect(sanitizeFoodSearchQuery("Arroz Integral!").query).toEqual({ kind: "RAW_ELIGIBLE", normalizedQuery: "arroz integral" });
  });

  it("rejects forbidden patient and clinical properties before an adapter receives an event", async () => {
    const record = vi.fn();
    await recordFoodSearchTelemetry({ record }, { type: "FOOD_SEARCH_RESULT_SELECTED", schemaVersion: 1, sessionSearchId, selectedRank: 1, canonicalFoodId: "ibge:1", source: "IBGE_POF", preparationCode: "99", resultCount: 3, patientId: "123", consultationId: "abc", notes: "clinical" });
    expect(record).not.toHaveBeenCalled();
  });

  it("contains adapter failures without logging or blocking the caller", async () => {
    const adapter = { record: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(recordFoodSearchTelemetry(adapter, { type: "FOOD_SEARCH_ZERO_RESULTS", schemaVersion: 1, sessionSearchId, query: { kind: "REDACTED", reason: "FREE_TEXT_LIKE" }, queryLengthBucket: "33_64" })).resolves.toBeUndefined();
    expect(adapter.record).toHaveBeenCalledTimes(1);
  });
});
