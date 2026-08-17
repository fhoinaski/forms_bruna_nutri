import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * FASE 6 (writes clínicos controlados) — activate_meal_plan: ativação/
 * publicação clínica de um plano alimentar, distinta de editar conteúdo
 * (meal_plan_change, já coberto em ai-meal-plan-change.test.ts). Reusa
 * updateMealPlan/optimistic concurrency/versionamento idênticos — nunca um
 * caminho paralelo. Cobre: confirmação (builder), stale version, unauthorized
 * e race condition (MealPlanVersionConflictError).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const ctx = { adminId: "admin-1" };

function planPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1", client_id: "client-1", title: "Plano de verão", status: "draft", version: 2,
    notes: null, target_energy_kcal: 2000, target_protein_g: 120, target_carbohydrate_g: 200, target_fat_g: 60,
    meals: [], weekly_slots: null, substitutions: null, supplements: null,
    ...overrides,
  };
}

describe("executeProposeActivateMealPlan (tool) — resolve o plano real, nunca confia no que o modelo afirmou", () => {
  it("plano não encontrado → error, nunca monta proposta em cima de dado inexistente", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(null), getClientMealPlans: vi.fn() }));
    const { executeProposeActivateMealPlan } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeProposeActivateMealPlan({ mealPlanId: "plan-x", baseVersion: 1 });
    expect(result).toEqual({ error: "Plano alimentar não encontrado. Peça para eu reler os planos do cliente." });
  });

  it("versão informada não bate com a atual → error (stale), nunca propõe ativação em cima de versão velha", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(planPayload({ version: 5 })), getClientMealPlans: vi.fn() }));
    const { executeProposeActivateMealPlan } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeProposeActivateMealPlan({ mealPlanId: "plan-1", baseVersion: 2 });
    expect(result).toMatchObject({ error: expect.stringContaining("alterado desde a última leitura") });
  });

  it("plano já ativo → error, nunca propõe reativar um plano já ativo", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(planPayload({ status: "active" })), getClientMealPlans: vi.fn() }));
    const { executeProposeActivateMealPlan } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeProposeActivateMealPlan({ mealPlanId: "plan-1", baseVersion: 2 });
    expect(result).toEqual({ error: "Esse plano já está ativo." });
  });

  it("plano draft na versão correta: devolve os dados para a proposta (clientId derivado do plano, nunca do modelo)", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(planPayload()), getClientMealPlans: vi.fn() }));
    const { executeProposeActivateMealPlan } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeProposeActivateMealPlan({ mealPlanId: "plan-1", baseVersion: 2 });
    expect(result).toEqual({ clientId: "client-1", mealPlanId: "plan-1", baseVersion: 2, mealPlanTitle: "Plano de verão" });
  });
});

describe("buildProposedAction — activate_meal_plan (confirmação)", () => {
  it("monta a proposta quando o clientId do output bate com o cliente aberto na tela", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction(
      "proposeActivateMealPlan",
      { mealPlanId: "plan-1", baseVersion: 2 },
      { clientId: "client-1" },
      { clientId: "client-1", mealPlanId: "plan-1", baseVersion: 2, mealPlanTitle: "Plano de verão" }
    );
    expect(proposal).toMatchObject({ kind: "activate_meal_plan", clientId: "client-1", mealPlanId: "plan-1", baseVersion: 2, mealPlanTitle: "Plano de verão", risk: "clinical", requiresConfirmation: true });
  });

  it("IDOR: plano resolvido pertence a outro cliente que não o aberto na tela → não monta proposta", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction(
      "proposeActivateMealPlan",
      { mealPlanId: "plan-1", baseVersion: 2 },
      { clientId: "client-1" },
      { clientId: "OUTRO-CLIENTE", mealPlanId: "plan-1", baseVersion: 2, mealPlanTitle: "Plano de verão" }
    );
    expect(proposal).toBeNull();
  });

  it("tool devolveu error: não monta proposta nenhuma", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction("proposeActivateMealPlan", { mealPlanId: "plan-1", baseVersion: 2 }, { clientId: "client-1" }, { error: "já está ativo" });
    expect(proposal).toBeNull();
  });
});

describe("executeProposedAction — activate_meal_plan (write/race condition)", () => {
  const baseAction: ProposedAction = {
    kind: "activate_meal_plan", clientId: "client-1", mealPlanId: "plan-1", baseVersion: 2, mealPlanTitle: "Plano de verão",
    risk: "clinical", requiresConfirmation: true,
  };

  it("ativa o plano com sucesso, passando expectedVersion/source ai_proposal", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn().mockResolvedValue({ id: "plan-1", version: 3 });
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(planPayload()),
      updateMealPlan,
      MealPlanVersionConflictError: class MealPlanVersionConflictError extends Error {},
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ mealPlanId: "plan-1", previousStatus: "draft", newStatus: "active", newVersion: 3 });
    expect(updateMealPlan).toHaveBeenCalledWith(
      "plan-1", "client-1",
      expect.objectContaining({ status: "active", title: "Plano de verão" }),
      { expectedVersion: 2, changedByAdminId: "admin-1", source: "ai_proposal" }
    );
  });

  it("stale: versão mudou desde a proposta → 409, nunca ativa por cima", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(planPayload({ version: 5 })),
      updateMealPlan: vi.fn(),
      MealPlanVersionConflictError: class MealPlanVersionConflictError extends Error {},
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("race condition: updateMealPlan lança MealPlanVersionConflictError (mudou entre a re-checagem e o write) → 409", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    class MealPlanVersionConflictError extends Error {}
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(planPayload()),
      updateMealPlan: vi.fn().mockRejectedValue(new MealPlanVersionConflictError("conflict")),
      MealPlanVersionConflictError,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("já ativo (replay) → 409, nunca reativa/reaplica", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(planPayload({ status: "active" })),
      updateMealPlan,
      MealPlanVersionConflictError: class MealPlanVersionConflictError extends Error {},
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("plano não pertence ao paciente da proposta (IDOR/unauthorized) → 403", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(planPayload({ client_id: "OUTRO-CLIENTE" })),
      updateMealPlan: vi.fn(),
      MealPlanVersionConflictError: class MealPlanVersionConflictError extends Error {},
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 403 });
  });

  it("plano não encontrado → 404", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(null),
      updateMealPlan: vi.fn(),
      MealPlanVersionConflictError: class MealPlanVersionConflictError extends Error {},
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("paciente não encontrado → 404", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn(), updateMealPlan: vi.fn(), MealPlanVersionConflictError: class extends Error {} }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });
});

describe("FASE 6 — autorização das tools de ativação de plano", () => {
  it("proposeActivateMealPlan: risk clinical, perfil ADMIN apenas; getClientMealPlans: risk read", async () => {
    const { listRegisteredTools } = await import("../lib/ai/tools/registry");
    const { PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME, GET_CLIENT_MEAL_PLANS_TOOL_NAME } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const activate = listRegisteredTools().find((t) => t.name === PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME);
    const list = listRegisteredTools().find((t) => t.name === GET_CLIENT_MEAL_PLANS_TOOL_NAME);
    expect(activate?.risk).toBe("clinical");
    expect(activate?.dataSensitivity).toBe("clinical");
    expect(activate?.profiles).toEqual(["ADMIN_ASSISTANT"]);
    expect(list?.risk).toBe("read");
  });
});
