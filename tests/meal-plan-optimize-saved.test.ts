import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Optimizer V2 sobre o plano SALVO (seção 4 do pedido de fechamento de
 * gaps) — reaproveita o mesmo lib/nutrition/draft-optimizer-v2.ts do
 * wizard. O que é novo aqui: derivar lockedItemKeys AUTOMATICAMENTE do
 * campo persistido `quantity_locked`, nunca exigir seleção manual.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
function request(body: unknown): NextRequest {
  return new NextRequest(new URL("/api/admin/clients/client-1/meal-plans/plan-1/optimize", BASE_URL), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const carbFood = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 20 && (f.proteina_g ?? 0) < 5)!;

function mockCommon(plan: unknown) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0, ipHash: "hash" }) }));
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Teste" }) }));
  vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
}

function buildPlan(overrides: { lockedGrams?: number; unlockedGrams?: number } = {}) {
  return {
    id: "plan-1",
    client_id: "client-1",
    meals: [
      {
        id: "meal-1",
        name: "Almoço",
        suggested_time: null,
        source_recipe_id: null,
        items: [
          { id: "item-locked", food: carbFood.descricao, quantity: String(overrides.lockedGrams ?? 100), unit: "g", food_source: "TACO", food_ref_id: String(carbFood.numero), quantity_locked: true },
          { id: "item-unlocked", food: carbFood.descricao, quantity: String(overrides.unlockedGrams ?? 100), unit: "g", food_source: "TACO", food_ref_id: String(carbFood.numero), quantity_locked: false },
        ],
      },
    ],
  };
}

describe("POST /api/admin/clients/[id]/meal-plans/[planId]/optimize", () => {
  it("item com quantity_locked=true NUNCA muda de quantidade, mesmo com meta que exigiria ajuste", async () => {
    const plan = buildPlan();
    mockCommon(plan);
    const { POST } = await import("../app/api/admin/clients/[id]/meal-plans/[planId]/optimize/route");

    const response = await POST(
      request({ targetEnergyKcal: 5000, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null }),
      { params: Promise.resolve({ id: "client-1", planId: "plan-1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const lockedItem = data.meals[0].items.find((i: { id: string }) => i.id === "item-locked");
    const unlockedItem = data.meals[0].items.find((i: { id: string }) => i.id === "item-unlocked");
    expect(lockedItem.quantity).toBe("100"); // nunca mudou
    // O item destravado deve ter recebido pelo menos parte do ajuste (score melhorou).
    expect(data.scoreAfter).toBeLessThanOrEqual(data.scoreBefore);
    expect(Number(unlockedItem.quantity)).toBeGreaterThanOrEqual(100);
  });

  it("nunca persiste nada — resposta é só o resultado calculado, sem chamar updateMealPlan", async () => {
    const plan = buildPlan();
    mockCommon(plan);
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan), updateMealPlan }));
    const { POST } = await import("../app/api/admin/clients/[id]/meal-plans/[planId]/optimize/route");

    await POST(
      request({ targetEnergyKcal: 1800, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null }),
      { params: Promise.resolve({ id: "client-1", planId: "plan-1" }) }
    );
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("plano de outro cliente (client_id não bate) → 404, nunca vaza dado de outro paciente", async () => {
    const plan = { ...buildPlan(), client_id: "outro-cliente" };
    mockCommon(plan);
    const { POST } = await import("../app/api/admin/clients/[id]/meal-plans/[planId]/optimize/route");

    const response = await POST(
      request({ targetEnergyKcal: 1800, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null }),
      { params: Promise.resolve({ id: "client-1", planId: "plan-1" }) }
    );
    expect(response.status).toBe(404);
  });
});
