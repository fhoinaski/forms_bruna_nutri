import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => { vi.resetModules(); vi.clearAllMocks(); });

const url = "https://example.test/api/admin/clients/c1/meal-plans/clinical-copilot";
function setup({ authed = true, client = { id: "c1", source_submission_id: "s1" } as { id: string; source_submission_id: string | null } } = {}) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? { sub: "admin-1" } : null) }));
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(client) }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue({ goals: "Emagrecer" }) }));
  vi.doMock("@/lib/repositories/submissions", () => ({ getSubmissionById: vi.fn().mockResolvedValue({ answers: { objetivo: "Emagrecer" } }) }));
  vi.doMock("@/lib/clinical/meal-plan-copilot", () => ({ buildMealPlanCopilotAnalysis: vi.fn().mockReturnValue({ facts: [], questions: [], completion: { known: 0, required: 0, percent: 100 }, canGenerateDraft: true, brief: {} }) }));
}

describe("GET clinical-copilot analysis", () => {
  it("requires an authenticated admin", async () => {
    setup({ authed: false });
    const { GET } = await import("@/app/api/admin/clients/[id]/meal-plans/clinical-copilot/route");
    expect((await GET(new NextRequest(url), { params: Promise.resolve({ id: "c1" }) })).status).toBe(401);
  });

  it("does not disclose a patient that is outside the resolved client scope", async () => {
    setup({ client: null as never });
    const { GET } = await import("@/app/api/admin/clients/[id]/meal-plans/clinical-copilot/route");
    expect((await GET(new NextRequest(url), { params: Promise.resolve({ id: "other-client" }) })).status).toBe(404);
  });

  it("returns the deterministic analysis for an authorised existing patient", async () => {
    setup();
    const { GET } = await import("@/app/api/admin/clients/[id]/meal-plans/clinical-copilot/route");
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ id: "c1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canGenerateDraft: true });
  });
});
