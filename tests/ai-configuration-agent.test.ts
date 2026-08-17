import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 5 (document/configuration/admin) — domínio "configuration". Única
 * config real do sistema é `ai_settings`; leitura sempre mascarada
 * (getPublicAISettings), escrita restrita ao único campo reversível/não
 * secreto (patient_safe_substitutions_enabled), sempre via proposta.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function publicSettings(overrides: Record<string, unknown> = {}) {
  return {
    provider: "openai",
    model: "gpt-4o",
    has_api_key: true,
    api_key: "sk-...abcd",
    patient_intake_mode: "smart",
    patient_safe_substitutions_enabled: false,
    chat_system_prompt: "a".repeat(1000),
    protocol_system_prompt: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("executeGetAiSettings — read settings / feature flags", () => {
  it("nunca expõe a api_key em claro, só a versão já mascarada pelo repositório", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getPublicAISettings: vi.fn().mockResolvedValue(publicSettings()) }));
    const { executeGetAiSettings } = await import("../lib/ai/agents/system/configuration-agent");
    const result = await executeGetAiSettings();
    expect(result.apiKeyMasked).toBe("sk-...abcd");
    expect(result.hasApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sk-live");
  });

  it("reflete o feature flag patientSafeSubstitutionsEnabled corretamente", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getPublicAISettings: vi.fn().mockResolvedValue(publicSettings({ patient_safe_substitutions_enabled: true })) }));
    const { executeGetAiSettings } = await import("../lib/ai/agents/system/configuration-agent");
    const result = await executeGetAiSettings();
    expect(result.patientSafeSubstitutionsEnabled).toBe(true);
  });

  it("trunca o preview do system prompt defensivamente (nunca devolve o prompt inteiro)", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getPublicAISettings: vi.fn().mockResolvedValue(publicSettings()) }));
    const { executeGetAiSettings } = await import("../lib/ai/agents/system/configuration-agent");
    const result = await executeGetAiSettings();
    expect(result.chatSystemPromptPreview).not.toBeNull();
    expect((result.chatSystemPromptPreview as string).length).toBeLessThan(1000);
    expect(result.chatSystemPromptConfigured).toBe(true);
    expect(result.protocolSystemPromptConfigured).toBe(false);
  });
});

describe("executeProposeUpdateSafeSubstitutionsSetting — safe write com confirmação", () => {
  it("estado diferente do atual: devolve previous/new para virar proposta (nunca aplica direto)", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getPublicAISettings: vi.fn().mockResolvedValue(publicSettings({ patient_safe_substitutions_enabled: false })) }));
    const { executeProposeUpdateSafeSubstitutionsSetting } = await import("../lib/ai/agents/system/configuration-agent");
    const result = await executeProposeUpdateSafeSubstitutionsSetting({ enabled: true });
    expect(result).toEqual({ previousEnabled: false, newEnabled: true });
  });

  it("já está no valor pedido: devolve erro amigável em vez de propor uma no-op", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getPublicAISettings: vi.fn().mockResolvedValue(publicSettings({ patient_safe_substitutions_enabled: true })) }));
    const { executeProposeUpdateSafeSubstitutionsSetting } = await import("../lib/ai/agents/system/configuration-agent");
    const result = await executeProposeUpdateSafeSubstitutionsSetting({ enabled: true });
    expect(result).toEqual({ error: "A configuração de substituições seguras já está ativada." });
  });
});

describe("buildProposedAction — update_safe_substitutions_setting", () => {
  it("monta uma proposta a partir do output da tool, sem tocar no banco", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const { PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME } = await import("../lib/ai/agents/system/configuration-agent");
    const proposal = buildProposedAction(
      PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME,
      { enabled: true },
      {},
      { previousEnabled: false, newEnabled: true }
    );
    expect(proposal).toMatchObject({ kind: "update_safe_substitutions_setting", previousEnabled: false, newEnabled: true, risk: "sensitive", requiresConfirmation: true });
  });

  it("tool devolveu erro (já no valor pedido): não monta proposta nenhuma", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const { PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME } = await import("../lib/ai/agents/system/configuration-agent");
    const proposal = buildProposedAction(
      PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME,
      { enabled: true },
      {},
      { error: "já está ativada" }
    );
    expect(proposal).toBeNull();
  });
});
