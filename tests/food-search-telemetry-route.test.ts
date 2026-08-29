import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function setup(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? { sub: "admin" } : null) }));
  vi.doMock("@/lib/nutrition/food-search-telemetry-runtime", () => ({ getFoodSearchTelemetryAdapter: vi.fn(() => ({ record: vi.fn().mockResolvedValue(undefined) })) }));
}

describe("POST /api/admin/foods/search-telemetry", () => {
  it("requires an authenticated session", async () => {
    setup(false);
    const { POST } = await import("@/app/api/admin/foods/search-telemetry/route");
    const response = await POST(new NextRequest("https://brunanutri.com.br/api/admin/foods/search-telemetry", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("rejects prohibited and extra fields before any persistence adapter can receive them", async () => {
    setup();
    const { POST } = await import("@/app/api/admin/foods/search-telemetry/route");
    const response = await POST(new NextRequest("https://brunanutri.com.br/api/admin/foods/search-telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, type: "FOOD_SEARCH_RESULT_SELECTED", sessionSearchId: "f91_search_session_0001", selectedRank: 1, canonicalFoodId: "tbca:1", source: "TBCA", preparationCode: null, resultCount: 2, patientId: "patient-1" }) }));
    expect(response.status).toBe(400);
  });

  it("accepts only strict client selection event types", async () => {
    setup();
    const { POST } = await import("@/app/api/admin/foods/search-telemetry/route");
    const body = { schemaVersion: 1, type: "FOOD_SEARCH_RESULT_SELECTED", sessionSearchId: "f91_search_session_0001", selectedRank: 4, canonicalFoodId: "tbca:1", source: "TBCA", preparationCode: null, resultCount: 4 };
    expect((await POST(new NextRequest("https://brunanutri.com.br/api/admin/foods/search-telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))).status).toBe(204);
    expect((await POST(new NextRequest("https://brunanutri.com.br/api/admin/foods/search-telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, type: "FOOD_SEARCH_PERFORMED" }) }))).status).toBe(400);
  });
});
