import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getClientMealPlans: vi.fn(),
  buildMealPlanViewModel: vi.fn(),
  listApprovedAlternativesForPlan: vi.fn(),
}));

vi.mock("@/lib/repositories/meal-plans", () => ({
  getClientMealPlans: deps.getClientMealPlans,
  getMealPlanVersionById: vi.fn(),
}));
vi.mock("@/lib/repositories/meal-plan-view-model", () => ({ buildMealPlanViewModel: deps.buildMealPlanViewModel }));
vi.mock("@/lib/repositories/exchange-groups", () => ({ listApprovedAlternativesForPlan: deps.listApprovedAlternativesForPlan }));

function activePlan(id: string, version: number) {
  return {
    id,
    client_id: "client-1",
    title: `Plano ${id}`,
    target_group: null,
    status: "active" as const,
    version,
    notes: null,
    created_at: "2026-08-23T10:00:00.000Z",
    updated_at: `2026-08-23T10:0${version}:00.000Z`,
    meals: [],
    weekly_slots: [],
    substitutions: [],
    supplements: [],
  };
}

describe("R7 final QA guards", () => {
  beforeEach(() => {
    deps.getClientMealPlans.mockReset();
    deps.buildMealPlanViewModel.mockReset();
    deps.listApprovedAlternativesForPlan.mockReset();
    deps.listApprovedAlternativesForPlan.mockResolvedValue([]);
  });

  it("falha fechado quando um cliente possui mais de um plano ACTIVE", async () => {
    deps.getClientMealPlans.mockResolvedValue([activePlan("active-old", 2), activePlan("active-new", 3)]);

    const { getActiveMealPlanDelivery } = await import("@/lib/repositories/meal-plan-delivery");
    const result = await getActiveMealPlanDelivery("client-1");

    expect(result).toEqual({
      status: "invalid",
      reason: "MULTIPLE_ACTIVE_PLANS",
      activeVersionId: null,
      delivery: null,
    });
    expect(deps.buildMealPlanViewModel).not.toHaveBeenCalled();
  });
});
