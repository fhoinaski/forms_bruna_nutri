import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";

function mockRateLimit(allowed = true) {
  vi.doMock("@/lib/security/rate-limit", () => ({
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed, retryAfter: 0, ipHash: "ip" }),
  }));
}

function mockAuditFingerprint() {
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip", userAgentHash: "ua" }) }));
}

function request(path: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), init as ConstructorParameters<typeof NextRequest>[1]);
}

describe("POST /api/public/pre-consultation/intake/session", () => {
  it("503 quando a IA está desativada", async () => {
    mockRateLimit();
    mockAuditFingerprint();
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => ({
      getIntakeAvailability: vi.fn().mockResolvedValue({ available: false, mode: "optional" }),
      startIntake: vi.fn(),
    }));
    mockToken({ sign: vi.fn().mockResolvedValue("token") });

    const { POST } = await import("../app/api/public/pre-consultation/intake/session/route");
    const res = await POST(request("/api/public/pre-consultation/intake/session", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("cria sessão quando disponível e seta cookie", async () => {
    mockRateLimit();
    mockAuditFingerprint();
    const state = { id: "s1", status: "active", progress: 0, answers: {} };
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => ({
      getIntakeAvailability: vi.fn().mockResolvedValue({ available: true, mode: "optional" }),
      startIntake: vi.fn().mockResolvedValue({ sessionId: "s1", state }),
    }));
    vi.doMock("@/lib/ai/agents/patient/intake/intake-rules", () => ({
      selectNextField: vi.fn().mockReturnValue(null),
      computeProgress: vi.fn().mockReturnValue(0),
      computeMissingRequired: vi.fn().mockReturnValue([]),
    }));
    vi.doMock("@/lib/ai/agents/patient/intake/intake-flow", () => ({
      getNextInteraction: vi.fn(() => ({ interaction: null, transitionMessage: null, reviewReady: false })),
      getTopicStepProgress: vi.fn(() => []),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-fields", () => ({
      getIntakeField: vi.fn().mockReturnValue(undefined),
      getSintomasOptions: vi.fn().mockReturnValue([]),
      toFieldView: vi.fn(),
      INTAKE_SECTION_IDS: ["tipo_atendimento", "sobre_voce"],
    }));
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn().mockResolvedValue(null),
    }));
    mockToken({ sign: vi.fn().mockResolvedValue("jwt") });

    const { POST } = await import("../app/api/public/pre-consultation/intake/session/route");
    const res = await POST(request("/api/public/pre-consultation/intake/session", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("s1");
  });
});

describe("POST /api/public/pre-consultation/intake/message", () => {
  function mockToken(sid?: string | null) {
    const resolved = sid === undefined ? "s1" : sid;
    vi.doMock("@/lib/security/intake-session-token", () => ({
      readIntakeSessionToken: vi.fn().mockReturnValue("jwt"),
      verifyIntakeSessionToken: vi.fn().mockResolvedValue(resolved),
    }));
  }

  it("400 para payload inválido", async () => {
    mockRateLimit();
    mockToken();
    mockAuditFingerprint();
    const { POST } = await import("../app/api/public/pre-consultation/intake/message/route");
    const res = await POST(request("/api/public/pre-consultation/intake/message", {
      method: "POST",
      body: JSON.stringify({ message: "", sessionVersion: 0 }),
    }));
    expect(res.status).toBe(400);
  });

  it("404 quando não há token de sessão", async () => {
    mockRateLimit();
    mockToken(null);
    mockAuditFingerprint();
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => {
      class IntakeNotFoundError extends Error {}
      class IntakeExpiredError extends Error {}
      class IntakeConcurrencyError extends Error {}
      class IntakeTurnLimitError extends Error {}
      return {
        runIntakeMessage: vi.fn(),
        IntakeNotFoundError,
        IntakeExpiredError,
        IntakeConcurrencyError,
        IntakeTurnLimitError,
      };
    });
    const { POST } = await import("../app/api/public/pre-consultation/intake/message/route");
    const res = await POST(request("/api/public/pre-consultation/intake/message", {
      method: "POST",
      body: JSON.stringify({ message: "olá", sessionVersion: 1 }),
    }));
    expect(res.status).toBe(404);
  });

  it("cai em fallback e preserva respostas quando o provedor falha", async () => {
    mockRateLimit();
    mockToken();
    mockAuditFingerprint();
    const fallbackResult = {
      state: { id: "s1", status: "active", answers: { nome: "Maria" }, completedFields: ["nome"], progress: 5 },
      assistantMessage: "Continuaremos pelo formulário convencional.",
      nextField: null,
      sessionVersion: 1,
      completed: false,
      fallback: true,
      fallbackReason: "Provider down",
    };
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => {
      class IntakeNotFoundError extends Error {}
      class IntakeExpiredError extends Error {}
      class IntakeConcurrencyError extends Error {}
      class IntakeTurnLimitError extends Error {}
      return {
        runIntakeMessage: vi.fn().mockResolvedValue(fallbackResult),
        IntakeNotFoundError,
        IntakeExpiredError,
        IntakeConcurrencyError,
        IntakeTurnLimitError,
      };
    });
    vi.doMock("@/lib/ai/agents/patient/intake/intake-rules", () => ({
      selectNextField: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-fields", () => ({
      getIntakeField: vi.fn().mockReturnValue(undefined),
      getSintomasOptions: vi.fn().mockReturnValue([]),
      toFieldView: vi.fn(),
    }));

    const { POST } = await import("../app/api/public/pre-consultation/intake/message/route");
    const res = await POST(request("/api/public/pre-consultation/intake/message", {
      method: "POST",
      body: JSON.stringify({ message: "olá", sessionVersion: 1, topic: "current_moment", stepKey: "motivo_inicial" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.answers.nome).toBe("Maria");
  });

  it("429 quando limite de turnos é atingido", async () => {
    mockRateLimit();
    mockToken();
    mockAuditFingerprint();
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => {
      class IntakeNotFoundError extends Error {}
      class IntakeExpiredError extends Error {}
      class IntakeConcurrencyError extends Error {}
      class IntakeTurnLimitError extends Error {}
      return {
        runIntakeMessage: vi.fn().mockRejectedValue(new IntakeTurnLimitError()),
        IntakeNotFoundError,
        IntakeExpiredError,
        IntakeConcurrencyError,
        IntakeTurnLimitError,
      };
    });

    const { POST } = await import("../app/api/public/pre-consultation/intake/message/route");
    const res = await POST(request("/api/public/pre-consultation/intake/message", {
      method: "POST",
      body: JSON.stringify({ message: "olá", sessionVersion: 1, topic: "current_moment", stepKey: "motivo_inicial" }),
    }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/public/pre-consultation/intake/complete", () => {
  function mockToken(sid: string | null = "s1") {
    vi.doMock("@/lib/security/intake-session-token", () => ({
      readIntakeSessionToken: vi.fn().mockReturnValue("jwt"),
      verifyIntakeSessionToken: vi.fn().mockResolvedValue(sid),
    }));
  }

  it("409 quando faltam campos obrigatórios", async () => {
    mockToken();
    mockAuditFingerprint();
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn().mockResolvedValue({
        row: { status: "active", completed_submission_id: null },
        state: { answers: {}, missingRequiredFields: ["nome"] },
      }),
    }));
    vi.doMock("@/lib/ai/agents/patient/intake/intake-rules", () => ({
      computeMissingRequired: vi.fn().mockReturnValue(["nome"]),
    }));

    const { POST } = await import("../app/api/public/pre-consultation/intake/complete/route");
    const res = await POST(request("/api/public/pre-consultation/intake/complete", {
      method: "POST",
      body: JSON.stringify({ sessionVersion: 1 }),
    }));
    expect(res.status).toBe(409);
  });

  it("idempotente — retorna o mesmo id em double-submit", async () => {
    mockToken();
    mockAuditFingerprint();
    vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
      getIntakeSession: vi.fn().mockResolvedValue({
        row: { status: "completed", completed_submission_id: "sub-1" },
        state: { answers: { nome: "Maria" } },
      }),
    }));
    vi.doMock("@/lib/ai/agents/patient/intake/intake-rules", () => ({
      computeMissingRequired: vi.fn().mockReturnValue([]),
    }));
    vi.doMock("@/lib/ai/agents/patient/intake/intake-service", () => {
      class IntakeNotFoundError extends Error {}
      return {
        completeIntake: vi.fn().mockResolvedValue({ submissionId: "sub-1" }),
        IntakeNotFoundError,
      };
    });

    const { POST } = await import("../app/api/public/pre-consultation/intake/complete/route");
    const res = await POST(request("/api/public/pre-consultation/intake/complete", {
      method: "POST",
      body: JSON.stringify({ sessionVersion: 1 }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissionId).toBe("sub-1");
  });
});

function mockToken(opts?: { sign?: unknown }) {
  vi.doMock("@/lib/security/intake-session-token", () => ({
    createIntakeSessionToken: opts?.sign ?? vi.fn().mockResolvedValue("jwt"),
    setIntakeSessionCookie: vi.fn(),
    readIntakeSessionToken: vi.fn().mockReturnValue(null),
    verifyIntakeSessionToken: vi.fn().mockResolvedValue(null),
  }));
}