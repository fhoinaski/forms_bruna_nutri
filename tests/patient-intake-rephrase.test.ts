import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1", status: "active", state_json: "x", provider: null, model: null,
    turn_count: 0, completed_submission_id: null, version: 1,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function baseState() {
  return {
    id: "s1", status: "active", currentSection: null, currentField: null, currentTopic: "current_moment",
    answers: {}, completedFields: [], completedSteps: [], skippedSteps: [],
    missingRequiredFields: [], clarification: null, editField: null,
    interactionCount: 0, progress: 0, createdAt: "", updatedAt: "",
  };
}

function mockSession(agentMock: Record<string, unknown>) {
  vi.doMock("@/lib/repositories/patient-intake-sessions", () => ({
    getIntakeSession: vi.fn(async () => ({ state: baseState(), row: sessionRow() })),
    updateIntakeSession: vi.fn(async () => sessionRow({ version: 2 })),
    markIntakeSessionFallback: vi.fn(async () => null),
    completeIntakeSessionOnce: vi.fn(),
    createIntakeSession: vi.fn(),
  }));
  vi.doMock("@/lib/ai/agents/patient/intake/intake-agent", () => agentMock);
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip", userAgentHash: "ua" }) }));
}

describe("runIntakeMessage — rephrase vs fallback", () => {
  it("AiValidationError NÃO causa fallback: pede reformulação e continua smart", async () => {
    const { AiValidationError } = await import("@/lib/ai/core/ai-errors");
    mockSession({
      INTAKE_MAX_TURNS: 60,
      isDeterministicTestProvider: () => false,
      isDeterministicFailTrigger: () => false,
      runIntakeTurn: vi.fn(),
      runIntakeTopicExtraction: vi.fn().mockRejectedValue(new AiValidationError("bad", [], "structured_invalid", false)),
    });

    const { runIntakeMessage } = await import("@/lib/ai/agents/patient/intake/intake-service");
    const result = await runIntakeMessage({ sessionId: "s1", message: "oi", sessionVersion: 1, topic: "current_moment", stepKey: "motivo_inicial" });

    expect(result.fallback).toBeFalsy();
    expect(result.needsRephrase).toBe(true);
    expect(result.keepSmart).toBe(true);
    expect(result.rephrasePrompt).toBeTruthy();
  });

  it("AiProviderError causa fallback tradicional", async () => {
    const { AiProviderError } = await import("@/lib/ai/core/ai-errors");
    mockSession({
      INTAKE_MAX_TURNS: 60,
      isDeterministicTestProvider: () => false,
      isDeterministicFailTrigger: () => false,
      runIntakeTurn: vi.fn(),
      runIntakeTopicExtraction: vi.fn().mockRejectedValue(new AiProviderError("boom")),
    });

    const { runIntakeMessage } = await import("@/lib/ai/agents/patient/intake/intake-service");
    const result = await runIntakeMessage({ sessionId: "s1", message: "oi", sessionVersion: 1, topic: "current_moment", stepKey: "motivo_inicial" });

    expect(result.fallback).toBe(true);
    expect(result.needsRephrase).toBeFalsy();
  });
});
