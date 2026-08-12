import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

/**
 * Simula o repositório com uma variável compartilhada, reproduzindo o
 * comportamento real do banco: `completeIntakeSessionOnce` grava o vínculo
 * UMA vez e `getIntakeSession` relê o valor gravado a cada chamada.
 */
function mockDeps(opts: { existingSubmissionId?: string | null } = {}) {
  let completedSubmissionId: string | null = opts.existingSubmissionId ?? null;
  const submissionIds = new Set<string>();

  vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
    getIntakeSession: vi.fn(async () => ({
      state: {
        id: "s1",
        status: "review",
        answers: { nome: "Maria", whatsapp: "11999990000", email: "m@example.com", privacyAccepted: true },
      },
      row: {
        id: "s1",
        status: "review",
        state_json: "x",
        provider: null,
        model: null,
        turn_count: 0,
        completed_submission_id: completedSubmissionId,
        version: 3,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })),
    completeIntakeSessionOnce: vi.fn(async (_id: string, _v: number, submissionId: string) => {
      if (completedSubmissionId === submissionId) return { row: null, already: true };
      if (completedSubmissionId) return { row: null, already: false };
      completedSubmissionId = submissionId;
      return { row: null, already: false };
    }),
  }));

  vi.doMock("@/lib/repositories/submissions", () => ({
    getSubmissionById: vi.fn(async (id: string) => ({ id })),
  }));

  vi.doMock("@/lib/clinical/submit-pre-consultation", () => ({
    submitPreConsultation: vi.fn(async (_p: unknown, opts: { submissionId?: string }) => {
      submissionIds.add(opts.submissionId ?? "");
      return { id: opts.submissionId ?? "sub-1" };
    }),
    SubmissionValidationError: class extends Error {},
  }));

  return { submissionIds };
}

describe("completeIntake — idempotência sob concorrência", () => {
  it("Promise.all de 3 completes gera UMA submissão e o MESMO id", async () => {
    const { submissionIds } = mockDeps();
    const { completeIntake } = await import("@/lib/ai/agents/patient/intake/intake-service");

    const [a, b, c] = await Promise.all([
      completeIntake("s1", 3),
      completeIntake("s1", 3),
      completeIntake("s1", 3),
    ]);

    expect(a.submissionId).toBe(b.submissionId);
    expect(b.submissionId).toBe(c.submissionId);
    // Mesmo payload → um único id determinístico de submissão.
    expect(submissionIds.size).toBe(1);
  });

  it("retorna o vínculo existente sem criar nova submissão", async () => {
    mockDeps({ existingSubmissionId: "sub-existing" });
    const { completeIntake } = await import("@/lib/ai/agents/patient/intake/intake-service");
    const { submitPreConsultation } = await import("@/lib/clinical/submit-pre-consultation");

    const result = await completeIntake("s1", 3);
    expect(result.submissionId).toBe("sub-existing");
    expect(submitPreConsultation).not.toHaveBeenCalled();
  });

  it("conflito de dados distintos lança erro (nunca sucesso silencioso)", async () => {
    // Já concluído com um id DIFERENTE do que este payload geraria → a rota
    // revalida a submissão referenciada e devolve conflito, não sucesso.
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn(async () => ({
        state: { id: "s1", status: "completed", answers: { nome: "Maria" } },
        row: {
          id: "s1",
          status: "completed",
          state_json: "x",
          provider: null,
          model: null,
          turn_count: 0,
          completed_submission_id: "sub-other",
          version: 3,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })),
      completeIntakeSessionOnce: vi.fn(async () => ({ row: null, already: false })),
    }));
    // Submissão referenciada NÃO existe → deve falhar, não inventar sucesso.
    vi.doMock("@/lib/repositories/submissions", () => ({
      getSubmissionById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/clinical/submit-pre-consultation", () => ({
      submitPreConsultation: vi.fn(async () => ({ id: "sub-new" })),
    }));

    const { completeIntake, IntakeCompletionConflictError } = await import("@/lib/ai/agents/patient/intake/intake-service");
    await expect(completeIntake("s1", 3)).rejects.toBeInstanceOf(IntakeCompletionConflictError);
  });
});