import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    status: "active",
    state_json: "x",
    provider: null,
    model: null,
    turn_count: 0,
    completed_submission_id: null,
    version: 1,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("expiração de sessão", () => {
  it("message rejeita sessão expirada", async () => {
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn(async () => ({
        state: { id: "s1", status: "active", answers: {}, completedFields: [], missingRequiredFields: [], clarification: null, editField: null, progress: 0, createdAt: "", updatedAt: "", currentSection: null, currentField: null },
        row: sessionRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      })),
    }));

    const { runIntakeMessage, IntakeExpiredError } = await import("@/lib/ai/agents/patient/intake/intake-service");
    await expect(runIntakeMessage({ sessionId: "s1", message: "oi", sessionVersion: 1 })).rejects.toBeInstanceOf(IntakeExpiredError);
  });

  it("edit rejeita sessão expirada", async () => {
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn(async () => ({
        state: { id: "s1", status: "active", answers: {}, completedFields: [], missingRequiredFields: [], clarification: null, editField: null, progress: 0, createdAt: "", updatedAt: "", currentSection: null, currentField: null },
        row: sessionRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      })),
      updateIntakeSession: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-fields", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/clinical/pre-consultation-fields")>();
      return actual;
    });

    const { editIntakeField, IntakeExpiredError } = await import("@/lib/ai/agents/patient/intake/intake-service");
    await expect(editIntakeField("s1", 1, "nome")).rejects.toBeInstanceOf(IntakeExpiredError);
  });

  it("complete rejeita sessão expirada", async () => {
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn(async () => ({
        state: { id: "s1", status: "active", answers: {}, completedFields: [], missingRequiredFields: [], clarification: null, editField: null, progress: 0, createdAt: "", updatedAt: "", currentSection: null, currentField: null },
        row: sessionRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      })),
    }));

    const { completeIntake, IntakeExpiredError } = await import("@/lib/ai/agents/patient/intake/intake-service");
    await expect(completeIntake("s1", 1)).rejects.toBeInstanceOf(IntakeExpiredError);
  });
});

describe("corrida message/edit/complete — versão otimista", () => {
  function mockMessagePath(updateResult: unknown | null) {
    // Agente determinístico evita chamada externa ao provedor.
    vi.doMock("@/lib/ai/agents/patient/intake/intake-agent", () => ({
      INTAKE_MAX_TURNS: 60,
      runIntakeTurn: vi.fn(async () => ({
        turn: {
          assistantMessage: "ok",
          field: "tipoAtendimento",
          outcome: "answered",
          normalizedValue: "Emagrecimento",
          confidence: "high",
        },
        assistantMessage: "ok",
        provider: "test",
        model: "test",
      })),
    }));
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn(async () => ({
        state: { id: "s1", status: "active", answers: {}, completedFields: [], missingRequiredFields: [], clarification: null, editField: null, progress: 0, createdAt: "", updatedAt: "", currentSection: null, currentField: null },
        row: sessionRow({ version: 1 }),
      })),
      updateIntakeSession: vi.fn(async () => updateResult),
      markIntakeSessionFallback: vi.fn(async () => null),
    }));
  }

  it("mensagem: perda de atualização (row null) vira ConcurrencyError, nunca sobrescreve", async () => {
    mockMessagePath(null);
    const { runIntakeMessage, IntakeConcurrencyError } = await import("@/lib/ai/agents/patient/intake/intake-service");
    await expect(runIntakeMessage({ sessionId: "s1", message: "ok", sessionVersion: 1 }))
      .rejects.toBeInstanceOf(IntakeConcurrencyError);
  });

  it("mensagem: gravação bem-sucedida retorna o estado e a nova versão", async () => {
    mockMessagePath({ version: 2 });
    const { runIntakeMessage } = await import("@/lib/ai/agents/patient/intake/intake-service");
    const result = await runIntakeMessage({ sessionId: "s1", message: "ok", sessionVersion: 1 });
    expect(result.sessionVersion).toBe(2);
    expect(result.state.answers.tipoAtendimento).toBe("Emagrecimento");
  });
});
