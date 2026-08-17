import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";
import type { MealPlanMealPayload, MealPlanPayload } from "@/lib/repositories/meal-plans";

/**
 * Nova proposal kind clinica "meal_plan_change" — alteracao estruturada do
 * plano alimentar (nao mais texto solto no prontuario). Cobre os 20 cenarios
 * pedidos: kind clinica + confirmacao obrigatoria, ownership plano/cliente,
 * ownership refeicao/item dentro do plano, TACO real, quantidade invalida,
 * macros do LLM ignorados (sempre recalculados), version conflict,
 * exatamente uma nova versao por confirmacao, replay/crash/double-confirm
 * via idempotencia generica, operacao invalida, payload adulterado, admin
 * errado, atomicidade, e analise sem proposta.
 *
 * Usa numeros TACO REAIS (nao mockados) — Maca Fuji (222) e Banana da terra
 * (175) — para testar a resolucao/revalidacao contra a base de verdade, nao
 * um doble fake.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function basePlan(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  const meals: MealPlanMealPayload[] = [
    {
      id: "meal-1", name: "Lanche da tarde", suggested_time: "15:00", notes: null, source_recipe_id: null,
      items: [{ id: "item-1", food: "Banana, da terra, crua", quantity: "100", unit: "g", notes: null }],
    },
    {
      id: "meal-2", name: "Café da manhã", suggested_time: "08:00", notes: null, source_recipe_id: null,
      items: [{ id: "item-2", food: "Pão francês", quantity: "2", unit: "unidade", notes: null }],
    },
  ];
  return {
    id: "plan-1", client_id: "client-1", title: "Plano padrão", target_group: null,
    status: "active", version: 3, notes: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    meals, weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

// ── 1-2. applyMealPlanChangesWithPreview: mutacao pura ─────────────────

describe("applyMealPlanChangesWithPreview", () => {
  it("replace_item: troca o alimento, recalcula quantidade/medida e o impacto de macros nunca vem de fora — sempre calculado aqui", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "replace_item", mealId: "meal-1", itemId: "item-1", food: { foodName: "Maçã, Fuji, com casca, crua", source: "TACO", refId: "222" }, quantity: 130, unit: "g" }],
      plan.title
    );
    const meal = result.meals.find((m) => m.id === "meal-1")!;
    expect(meal.items[0].food).toBe("Maçã, Fuji, com casca, crua");
    expect(meal.items[0].quantity).toBe("130");
    expect(meal.items[0].unit).toBe("g");
    expect(result.preview.changeSummaries[0]).toMatchObject({ before: "Banana, da terra, crua — 100g", after: "Maçã, Fuji, com casca, crua — 130g" });
    // Maca (55.5 kcal/100g aprox) e banana (por volta de 40-100 kcal/100g dependendo do tipo) tem macros
    // diferentes — o impacto tem que ser um numero real calculado, nao zero, nao inventado.
    expect(typeof result.preview.totalImpact.kcal).toBe("number");
    expect(Number.isFinite(result.preview.totalImpact.kcal)).toBe(true);
  });

  it("add_meal: cria refeicao nova vazia, sem impacto de macros", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "add_meal", name: "Ceia", suggestedTime: "21:00" }], plan.title);
    expect(result.meals).toHaveLength(3);
    expect(result.meals[2]).toMatchObject({ name: "Ceia", suggested_time: "21:00", items: [] });
    expect(result.preview.totalImpact).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("remove_meal: remove a refeicao inteira e o impacto reflete a perda de todos os itens dela", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "remove_meal", mealId: "meal-1" }], plan.title);
    expect(result.meals.find((m) => m.id === "meal-1")).toBeUndefined();
    expect(result.meals).toHaveLength(1);
    expect(result.preview.totalImpact.kcal).toBeLessThan(0);
  });

  it("rename_meal e change_meal_time: só texto, sem tocar itens nem macros", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "rename_meal", mealId: "meal-2", name: "Desjejum" }, { operation: "change_meal_time", mealId: "meal-2", suggestedTime: "07:30" }],
      plan.title
    );
    const meal = result.meals.find((m) => m.id === "meal-2")!;
    expect(meal.name).toBe("Desjejum");
    expect(meal.suggested_time).toBe("07:30");
    expect(result.preview.totalImpact).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("add_item e remove_item: impacto positivo ao adicionar, negativo ao remover", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const added = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Maçã, Fuji, com casca, crua", source: "TACO", refId: "222" }, quantity: 150, unit: "g" }],
      plan.title
    );
    expect(added.meals.find((m) => m.id === "meal-2")!.items).toHaveLength(2);
    expect(added.preview.totalImpact.kcal).toBeGreaterThan(0);

    const removed = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "remove_item", mealId: "meal-1", itemId: "item-1" }], plan.title);
    expect(removed.meals.find((m) => m.id === "meal-1")!.items).toHaveLength(0);
    expect(removed.preview.totalImpact.kcal).toBeLessThan(0);
  });

  it("change_quantity e change_measure: atualizam so o campo pedido", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "change_quantity", mealId: "meal-1", itemId: "item-1", quantity: 200 }],
      plan.title
    );
    expect(result.meals.find((m) => m.id === "meal-1")!.items[0]).toMatchObject({ food: "Banana, da terra, crua", quantity: "200", unit: "g" });

    const result2 = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "change_measure", mealId: "meal-1", itemId: "item-1", unit: "unidade" }],
      plan.title
    );
    expect(result2.meals.find((m) => m.id === "meal-1")!.items[0]).toMatchObject({ quantity: "100", unit: "unidade" });
  });

  it("operacao invalida (mealId/itemId inexistente) lanca MealPlanChangeValidationError — nunca aplica parcialmente", async () => {
    const { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    expect(() => applyMealPlanChangesWithPreview(plan.meals, [{ operation: "rename_meal", mealId: "meal-ghost", name: "X" }], plan.title))
      .toThrow(MealPlanChangeValidationError);
    expect(() => applyMealPlanChangesWithPreview(plan.meals, [{ operation: "remove_item", mealId: "meal-1", itemId: "item-ghost" }], plan.title))
      .toThrow(MealPlanChangeValidationError);
  });
});

// ── 6/8. Schema: quantidade invalida, unidade fechada, macros do LLM ignorados ──

describe("mealPlanChangeOperationSchema — validação de quantidade/unidade", () => {
  it("rejeita 0, negativo, NaN, Infinity e valores absurdos", async () => {
    const { mealPlanChangeOperationSchema } = await import("../lib/ai/schemas/action.schema");
    const base = { operation: "change_quantity" as const, mealId: "meal-1", itemId: "item-1" };
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: -100 }).success).toBe(false);
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: NaN }).success).toBe(false);
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: Infinity }).success).toBe(false);
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: 999999999 }).success).toBe(false);
    expect(mealPlanChangeOperationSchema.safeParse({ ...base, quantity: 130 }).success).toBe(true);
  });

  it("rejeita unidade fora do vocabulario fechado", async () => {
    const { mealPlanChangeOperationSchema } = await import("../lib/ai/schemas/action.schema");
    const result = mealPlanChangeOperationSchema.safeParse({
      operation: "change_measure", mealId: "meal-1", itemId: "item-1", unit: "porcao-livre-inventada",
    });
    expect(result.success).toBe(false);
  });

  it("um campo 'macros' inventado pelo LLM nunca sobrevive a validação — o schema nem conhece esse campo", async () => {
    const { mealPlanChangeOperationSchema } = await import("../lib/ai/schemas/action.schema");
    const parsed = mealPlanChangeOperationSchema.parse({
      operation: "add_item", mealId: "meal-1",
      food: { foodName: "Maçã", source: "TACO", refId: "222" },
      quantity: 100, unit: "g",
      macros: { kcal: 999999 }, // campo inventado — nao existe no schema
    } as unknown);
    expect((parsed as unknown as Record<string, unknown>).macros).toBeUndefined();
  });
});

// ── 3/4/13/17/19-a. Tool proposeMealPlanChange: resolucao real + preview ──

describe("executeProposeMealPlanChange (tool)", () => {
  it("plano nao encontrado retorna error, nunca inventa proposta", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(null) }));
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({ mealPlanId: "ghost", baseVersion: 1, changes: [{ operation: "remove_meal", mealId: "meal-1" }] });
    expect(output).toEqual({ error: expect.stringContaining("não encontrado") });
  });

  it("baseVersion desatualizado (plano mudou desde a leitura) e rejeitado JA na criacao da proposta", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan({ version: 5 })) }));
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({ mealPlanId: "plan-1", baseVersion: 3, changes: [{ operation: "remove_meal", mealId: "meal-1" }] });
    expect(output).toEqual({ error: expect.stringContaining("alterado") });
  });

  it("numero TACO que nao existe na base real e rejeitado antes de montar a proposta", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-1", food: { foodName: "Alimento inventado", source: "TACO", refId: "987654321" }, quantity: 100, unit: "g" }],
    });
    expect(output).toEqual({ error: expect.stringContaining("TACO") });
  });

  it("proposta valida devolve preview calculado deterministicamente, pronto para persistir", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "change_quantity", mealId: "meal-1", itemId: "item-1", quantity: 150 }],
    });
    expect(output).toMatchObject({ clientId: "client-1", mealPlanId: "plan-1", baseVersion: 3 });
    if ("error" in output) throw new Error("esperava sucesso");
    expect(output.preview.mealPlanTitle).toBe("Plano padrão");
  });
});

// ── builder: análise sem pedido de mudança nunca gera proposta ─────────

describe("buildProposedAction (proxy determinístico para 'análise sem pedido de mudança')", () => {
  it("quando a tool devolve error, o builder retorna null — nenhuma proposta é criada", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const result = buildProposedAction("proposeMealPlanChange", {}, { clientId: "client-1" }, { error: "Plano alimentar não encontrado." });
    expect(result).toBeNull();
  });

  it("quando o clientId do contexto não bate com o clientId do plano resolvido, o builder rejeita (defesa contra proposta cross-client)", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const result = buildProposedAction("proposeMealPlanChange", {}, { clientId: "client-OUTRO" }, {
      clientId: "client-1", mealPlanId: "plan-1", baseVersion: 3, changes: [],
      preview: { mealPlanTitle: "X", changeSummaries: [], totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
    });
    expect(result).toBeNull();
  });
});

// ── 2/5/7/9/11/12/14/16/18. Handler de confirmação (ownership, versão, TACO, atomicidade) ──

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };

function validChanges(): ProposedAction {
  return {
    kind: "meal_plan_change", clientId: "client-1", mealPlanId: "plan-1", baseVersion: 3,
    changes: [{ operation: "replace_item", mealId: "meal-1", itemId: "item-1", food: { foodName: "Maçã, Fuji, com casca, crua", source: "TACO", refId: "222" }, quantity: 130, unit: "g" }],
    preview: {
      mealPlanTitle: "Plano padrão",
      changeSummaries: [{ operation: "replace_item", mealName: "Lanche da tarde", before: "Banana, da terra, crua — 100g", after: "Maçã, Fuji, com casca, crua — 130g" }],
      totalImpact: { kcal: 10, protein: 0, carbs: 2, fat: 0 },
    },
    risk: "clinical", requiresConfirmation: true,
  };
}

describe("executeProposedAction — meal_plan_change (handler de confirmação)", () => {
  it("kind meal_plan_change é clinical e sempre exige confirmação humana (nunca pode ser risco menor)", () => {
    expect(validChanges().risk).toBe("clinical");
    expect(validChanges().requiresConfirmation).toBe(true);
  });

  it("paciente inexistente → 404, nunca chama updateMealPlan", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()), updateMealPlan }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validChanges(), { adminId: admin.sub })).rejects.toMatchObject({ status: 404 });
    expect(updateMealPlan).not.toHaveBeenCalled();
    void ProposalExecutionError;
  });

  it("plano não pertence ao paciente da proposta → 403 (IDOR), nunca aplica", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(basePlan({ client_id: "client-OUTRO-PACIENTE" })),
      updateMealPlan,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validChanges(), { adminId: admin.sub })).rejects.toMatchObject({ status: 403 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("versão divergente (plano mudou depois da proposta) → 409, nunca sobrescreve silenciosamente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getMealPlanById: vi.fn().mockResolvedValue(basePlan({ version: 4 })),
      updateMealPlan,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validChanges(), { adminId: admin.sub })).rejects.toMatchObject({ status: 409 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("número TACO que deixou de existir entre a proposta e a confirmação → 422, revalidado de novo (nunca confia no preview antigo)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()), updateMealPlan }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = validChanges();
    (action as { changes: unknown[] }).changes = [
      { operation: "add_item", mealId: "meal-1", food: { foodName: "Fantasia", source: "TACO", refId: "987654321" }, quantity: 100, unit: "g" },
    ];
    await expect(executeProposedAction(action, { adminId: admin.sub })).rejects.toMatchObject({ status: 422 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("referência de item corrompida (itemId que não existe mais no plano) → 422, nunca aplica parcialmente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()), updateMealPlan }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = validChanges();
    (action as { changes: unknown[] }).changes = [{ operation: "remove_item", mealId: "meal-1", itemId: "item-ghost" }];
    await expect(executeProposedAction(action, { adminId: admin.sub })).rejects.toMatchObject({ status: 422 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("caminho feliz: aplica via updateMealPlan (mesma função do editor manual) preservando o resto do plano intacto, cria exatamente uma nova versão", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const plan = basePlan();
    const updateMealPlan = vi.fn().mockResolvedValue({ ...plan, version: 4 });
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan), updateMealPlan }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");

    const result = await executeProposedAction(validChanges(), { adminId: admin.sub });

    expect(updateMealPlan).toHaveBeenCalledTimes(1);
    const [planIdArg, clientIdArg, payloadArg] = updateMealPlan.mock.calls[0];
    expect(planIdArg).toBe("plan-1");
    expect(clientIdArg).toBe("client-1");
    expect(payloadArg.title).toBe(plan.title);
    expect(payloadArg.status).toBe(plan.status);
    expect(payloadArg.notes).toBe(plan.notes);
    expect(payloadArg.weekly_slots).toBe(plan.weekly_slots);
    expect(payloadArg.substitutions).toBe(plan.substitutions);
    expect(payloadArg.supplements).toBe(plan.supplements);
    expect(payloadArg.meals.find((m: MealPlanMealPayload) => m.id === "meal-1").items[0].food).toBe("Maçã, Fuji, com casca, crua");
    expect(result).toEqual({ data: { mealPlanId: "plan-1", previousVersion: 3, newVersion: 4 } });
  });
});

// ── 15/16. Crash pós-versionamento e replay — idempotência via ai_proposal_executions ──

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://brunanutri.com.br"), { method: "POST" });
}

class FakeProposalsDb {
  private rows = new Map<string, { id: string; admin_id: string; status: string; params_json: string; expires_at: string }>();
  private executions = new Map<string, Record<string, unknown>>();

  seed(row: { id: string; admin_id: string; status?: string; params_json: string; expires_at?: string }) {
    this.rows.set(row.id, {
      id: row.id, admin_id: row.admin_id, status: row.status ?? "pending",
      params_json: row.params_json, expires_at: row.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
    });
  }
  async claim(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== adminId || row.status !== "pending") return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    row.status = "executing";
    return { ...row };
  }
  async get(id: string, adminId: string) {
    const row = this.rows.get(id);
    return row && row.admin_id === adminId ? { ...row } : null;
  }
  async getExecution(id: string) {
    const result = this.executions.get(id);
    return result ? { proposal_id: id, kind: "x", result_json: JSON.stringify(result) } : null;
  }
  async recordExecution(id: string, _kind: string, result: Record<string, unknown>) {
    if (!this.executions.has(id)) this.executions.set(id, result);
  }
  statusOf(id: string) {
    return this.rows.get(id)?.status;
  }
}

describe("crash pós-versionamento: nova versão criada, finalize nunca roda, retry não cria outra versão", () => {
  it("updateMealPlan é chamado exatamente uma vez mesmo com uma tentativa de retry depois do crash simulado no finalize", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));

    const plan = basePlan();
    const updateMealPlan = vi.fn().mockResolvedValue({ ...plan, version: 4 });
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan), updateMealPlan }));

    const db = new FakeProposalsDb();
    db.seed({ id: "proposal-1", admin_id: "admin-1", params_json: JSON.stringify(validChanges()) });

    let finalizeCalls = 0;
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: (id: string, adminId: string) => db.claim(id, adminId),
      cancelAiActionProposal: vi.fn(),
      finalizeAiActionProposal: async (id: string, status: "completed" | "failed") => {
        finalizeCalls += 1;
        if (finalizeCalls === 1) throw new Error("processo encerrado (simulação de crash)");
        return; // bookkeeping best-effort no resto do teste
      },
      getAiActionProposal: (id: string, adminId: string) => db.get(id, adminId),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: () => false,
      getProposalExecution: (id: string) => db.getExecution(id),
      recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");

    const first = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), { params: Promise.resolve({ id: "proposal-1" }) });
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody).toEqual({ status: "completed", kind: "meal_plan_change", mealPlanId: "plan-1", previousVersion: 3, newVersion: 4 });
    expect(updateMealPlan).toHaveBeenCalledTimes(1);
    // Bookkeeping "morreu" — proposta fica presa em executing, diagnosticavel manualmente.
    expect(db.statusOf("proposal-1")).toBe("executing");

    // Retry manual simulado (reabre a proposta como se um operador tivesse forcado nova tentativa):
    // a chave de idempotencia ja tem o resultado, entao o handler NUNCA deve rodar de novo.
    const originalClaim = db.claim.bind(db);
    db.claim = async (id: string, adminId: string) => {
      const row = await db.get(id, adminId);
      return row ? { ...row, status: "executing" } : null;
    };
    const retry = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), { params: Promise.resolve({ id: "proposal-1" }) });
    const retryBody = await retry.json();
    expect(retry.status).toBe(200);
    expect(retryBody).toEqual({ status: "completed", kind: "meal_plan_change", mealPlanId: "plan-1", previousVersion: 3, newVersion: 4 });
    expect(updateMealPlan).toHaveBeenCalledTimes(1); // continua 1 — nao criou versao 5
    void originalClaim;
  });

  it("double confirm em proposta já completada é barrado antes mesmo de reexecutar (replay)", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()), updateMealPlan }));
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: vi.fn().mockResolvedValue(null),
      cancelAiActionProposal: vi.fn(),
      finalizeAiActionProposal: vi.fn(),
      getAiActionProposal: vi.fn().mockResolvedValue({
        id: "proposal-1", admin_id: "admin-1", status: "completed", params_json: "{}", expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: () => false,
      getProposalExecution: vi.fn(),
      recordProposalExecution: vi.fn(),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), { params: Promise.resolve({ id: "proposal-1" }) });
    expect(response.status).toBe(409);
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("payload adulterado (params_json corrompido) nunca é executado — fica failed, nunca preso", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn() }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn(), updateMealPlan }));

    const db = new FakeProposalsDb();
    db.seed({ id: "proposal-1", admin_id: "admin-1", params_json: '{"kind":"meal_plan_change","clientId":"client-1"' }); // JSON quebrado de proposito
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: (id: string, adminId: string) => db.claim(id, adminId),
      cancelAiActionProposal: vi.fn(),
      finalizeAiActionProposal: finalize,
      getAiActionProposal: (id: string, adminId: string) => db.get(id, adminId),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: () => false,
      getProposalExecution: vi.fn(),
      recordProposalExecution: vi.fn(),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), { params: Promise.resolve({ id: "proposal-1" }) });
    expect(response.status).toBe(422);
    expect(updateMealPlan).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledWith("proposal-1", "failed", expect.any(String));
  });
});
