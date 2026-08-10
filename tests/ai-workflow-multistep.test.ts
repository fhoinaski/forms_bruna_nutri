import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("workflow 1: pacientes de amanha com pendencias (agenda -> tarefas -> resposta)", () => {
  it("cruza agenda do dia com tarefas pendentes de cada paciente, num unico resultado", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointments: vi.fn().mockResolvedValue([
        { id: "a1", client_id: "c1", client_name: "Maria Silva", title: "Consulta", starts_at: "2026-08-11T13:00:00.000Z", status: "agendado" },
        { id: "a2", client_id: "c2", client_name: "Joao Souza", title: "Retorno", starts_at: "2026-08-11T15:00:00.000Z", status: "confirmado" },
        { id: "a3", client_id: null, client_name: null, title: "Bloqueio", starts_at: "2026-08-11T17:00:00.000Z", status: "agendado" },
      ]),
    }));
    vi.doMock("@/lib/repositories/client-tasks", () => ({
      getClientTasks: vi.fn(async (clientId: string) =>
        clientId === "c1" ? [{ title: "Enviar exames" }, { title: "Confirmar presenca" }] : []
      ),
    }));

    const { executeGetPatientsWithPendenciesForDate } = await import("../lib/ai/agents/appointments/schedule-lookup-agent");
    const result = await executeGetPatientsWithPendenciesForDate({ date: "2026-08-11" });

    expect(result.patients).toHaveLength(2); // a3 nao tem client_id, e filtrado
    expect(result.patients[0]).toMatchObject({ clientId: "c1", clientName: "Maria Silva", pendingTasks: ["Enviar exames", "Confirmar presenca"] });
    expect(result.patients[1]).toMatchObject({ clientId: "c2", pendingTasks: [] });
    expect(result.truncated).toBe(false);
  });

  it("limita a lista a 20 pacientes e marca truncated quando o dia tem mais consultas que isso", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointments: vi.fn().mockResolvedValue(
        Array.from({ length: 30 }, (_, index) => ({
          id: `a${index}`,
          client_id: `c${index}`,
          client_name: `Paciente ${index}`,
          title: "Consulta",
          starts_at: "2026-08-11T13:00:00.000Z",
          status: "agendado",
        }))
      ),
    }));
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([]) }));

    const { executeGetPatientsWithPendenciesForDate } = await import("../lib/ai/agents/appointments/schedule-lookup-agent");
    const result = await executeGetPatientsWithPendenciesForDate({ date: "2026-08-11" });

    expect(result.patients).toHaveLength(20);
    expect(result.totalFound).toBe(30);
    expect(result.truncated).toBe(true);
  });
});

describe("workflow 2: como o paciente evoluiu desde a ultima consulta", () => {
  it("calcula variacao de peso e IMC a partir dos dados reais, sem a IA inventar numero", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria Silva" }),
    }));
    vi.doMock("@/lib/repositories/client-evolutions", () => ({
      getClientEvolutions: vi.fn().mockResolvedValue([
        { weight: 70.5, bmi: 24.1, measured_at: "2026-08-01T00:00:00.000Z" },
        { weight: 72.8, bmi: 25.0, measured_at: "2026-06-01T00:00:00.000Z" },
      ]),
    }));
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointments: vi.fn().mockResolvedValue([
        { starts_at: "2026-08-01T13:00:00.000Z", title: "Retorno", status: "realizado" },
        { starts_at: "2026-09-01T13:00:00.000Z", title: "Consulta futura", status: "agendado" },
      ]),
    }));

    const { executeGetClientEvolutionSummary } = await import("../lib/ai/agents/clinical/evolution-summary-agent");
    const result = await executeGetClientEvolutionSummary({ clientId: "client-1" });

    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found=true");
    expect(result.currentWeightKg).toBe(70.5);
    expect(result.previousWeightKg).toBe(72.8);
    expect(result.weightVariationKg).toBe(-2.3);
    expect(result.bmi).toBe(24.1);
    expect(result.lastAppointment).toEqual({ date: "2026-08-01T13:00:00.000Z", title: "Retorno" });
  });

  it("nunca inventa dado para um cliente inexistente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/client-evolutions", () => ({ getClientEvolutions: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn() }));

    const { executeGetClientEvolutionSummary } = await import("../lib/ai/agents/clinical/evolution-summary-agent");
    const result = await executeGetClientEvolutionSummary({ clientId: "nao-existe" });
    expect(result).toEqual({ found: false });
  });
});

describe("workflow 3 e teste 7: horarios disponiveis quinta a tarde, resultado grande limitado", () => {
  it("nunca inventa horario — so filtra por periodo do dia o que o repositorio ja retornou", async () => {
    vi.doMock("@/lib/repositories/availability", () => ({
      getAvailableSlots: vi.fn().mockResolvedValue([
        { date: "2026-08-13", slots: ["2026-08-13T11:00:00.000Z", "2026-08-13T17:00:00.000Z", "2026-08-13T22:00:00.000Z"] },
      ]),
    }));
    const { executeGetAvailableSlots } = await import("../lib/ai/agents/appointments/availability-lookup-agent");
    // 11:00 UTC = 08:00 em Sao Paulo (manha) | 17:00 UTC = 14:00 (tarde) | 22:00 UTC = 19:00 (noite)
    const result = await executeGetAvailableSlots({ fromDate: "2026-08-13", toDate: "2026-08-13", periodOfDay: "tarde" });

    expect(result.slots).toEqual(["2026-08-13T17:00:00.000Z"]);
    expect(result.totalFound).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("limita resultado enorme aos primeiros 20 horarios e marca truncated (teste 7)", async () => {
    const manySlots = Array.from({ length: 45 }, (_, index) => `2026-08-${13 + Math.floor(index / 8)}T${String(9 + (index % 8)).padStart(2, "0")}:00:00.000Z`);
    vi.doMock("@/lib/repositories/availability", () => ({
      getAvailableSlots: vi.fn().mockResolvedValue([{ date: "2026-08-13", slots: manySlots }]),
    }));
    const { executeGetAvailableSlots } = await import("../lib/ai/agents/appointments/availability-lookup-agent");
    const result = await executeGetAvailableSlots({ fromDate: "2026-08-13", toDate: "2026-08-20" });

    expect(result.slots).toHaveLength(20);
    expect(result.totalFound).toBe(45);
    expect(result.truncated).toBe(true);
  });
});

describe("teste 6: workflow entra em loop -> interrompido", () => {
  it("sameToolRepeatedTooOften interrompe quando a mesma tool passa do limite", async () => {
    const { sameToolRepeatedTooOften, countToolCallsByName, MAX_SAME_TOOL_CALLS } = await import("../lib/ai/core/ai-orchestrator");
    const steps = Array.from({ length: MAX_SAME_TOOL_CALLS + 1 }, () => ({ toolCalls: [{ toolName: "findClient" }] }));

    expect(countToolCallsByName(steps).get("findClient")).toBe(MAX_SAME_TOOL_CALLS + 1);
    expect(sameToolRepeatedTooOften({ steps } as Parameters<typeof sameToolRepeatedTooOften>[0])).toBe(true);
  });

  it("nao interrompe enquanto cada tool ficar dentro do limite permitido", async () => {
    const { sameToolRepeatedTooOften, MAX_SAME_TOOL_CALLS } = await import("../lib/ai/core/ai-orchestrator");
    const steps = Array.from({ length: MAX_SAME_TOOL_CALLS }, () => ({ toolCalls: [{ toolName: "findClient" }] }));
    expect(sameToolRepeatedTooOften({ steps } as Parameters<typeof sameToolRepeatedTooOften>[0])).toBe(false);
  });

  it("MAX_TOOL_STEPS e MAX_SAME_TOOL_CALLS sao valores pequenos e explicitos (nao ilimitados)", async () => {
    const { MAX_TOOL_STEPS, MAX_SAME_TOOL_CALLS, TURN_TIMEOUT_MS } = await import("../lib/ai/core/ai-orchestrator");
    expect(MAX_TOOL_STEPS).toBeGreaterThan(0);
    expect(MAX_TOOL_STEPS).toBeLessThanOrEqual(10);
    expect(MAX_SAME_TOOL_CALLS).toBeGreaterThan(0);
    expect(MAX_SAME_TOOL_CALLS).toBeLessThan(MAX_TOOL_STEPS);
    expect(TURN_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("teste 8: paciente ambiguo -> desambiguacao estruturada", () => {
  it("retorna opcoes so com id+nome (sem PII extra) quando ha mais de um resultado", async () => {
    const { resolveDisambiguationOptions } = await import("../lib/ai/core/ai-orchestrator");
    const options = resolveDisambiguationOptions(
      { found: true, items: [{ id: "c1", name: "Maria Silva" }, { id: "c2", name: "Maria Souza" }] },
      false,
      false
    );
    expect(options).toEqual([
      { id: "c1", label: "Maria Silva" },
      { id: "c2", label: "Maria Souza" },
    ]);
  });

  it("nao desambigua se o turno ja terminou em proposta ou navegacao", async () => {
    const { resolveDisambiguationOptions } = await import("../lib/ai/core/ai-orchestrator");
    const items = [{ id: "c1", name: "A" }, { id: "c2", name: "B" }];
    expect(resolveDisambiguationOptions({ found: true, items }, true, false)).toBeUndefined();
    expect(resolveDisambiguationOptions({ found: true, items }, false, true)).toBeUndefined();
  });

  it("nao desambigua quando so ha um resultado (escolha nao e ambigua)", async () => {
    const { resolveDisambiguationOptions } = await import("../lib/ai/core/ai-orchestrator");
    const options = resolveDisambiguationOptions({ found: true, items: [{ id: "c1", name: "Maria Silva" }] }, false, false);
    expect(options).toBeUndefined();
  });
});

describe("teste 5: alteracao clinica sempre gera proposta persistida com confirmacao obrigatoria", () => {
  it("persistProposedAction anexa proposalId/expiresAt reais; a tool nunca aplica a alteracao sozinha", async () => {
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      createAiActionProposal: vi.fn().mockResolvedValue({
        id: "proposal-1",
        admin_id: "admin-1",
        tool_name: "proposeNutritionRecordUpdate",
        kind: "nutrition_record",
        risk: "clinical",
        client_id: "client-1",
        submission_id: null,
        params_json: "{}",
        status: "pending",
        created_at: "2026-08-10T00:00:00.000Z",
        expires_at: "2026-08-10T00:15:00.000Z",
        completed_at: null,
      }),
    }));

    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const { persistProposedAction } = await import("../lib/ai/core/proposal-store");
    const { getToolDefinition } = await import("../lib/ai/tools/registry");

    const tool = getToolDefinition("proposeNutritionRecordUpdate");
    const executed = await tool!.execute({ clinical_history: "Paciente relata melhora." });
    expect(executed).toEqual({ clinical_history: "Paciente relata melhora." }); // so ecoa, nunca grava

    const built = buildProposedAction("proposeNutritionRecordUpdate", executed, { clientId: "client-1" });
    expect(built?.risk).toBe("clinical");
    expect(built?.requiresConfirmation).toBe(true);

    const persisted = await persistProposedAction("admin-1", "proposeNutritionRecordUpdate", built!, { clientId: "client-1" });
    expect(persisted.proposalId).toBe("proposal-1");
    expect(persisted.expiresAt).toBe("2026-08-10T00:15:00.000Z");
  });
});
