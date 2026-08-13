import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";

function request(path: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), init as ConstructorParameters<typeof NextRequest>[1]);
}

const writeAuditLog = vi.fn().mockResolvedValue(undefined);

function mockCommon() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip", userAgentHash: "ua" }) }));
}

function mockUnauthenticated() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn() }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip" }) }));
}

describe("GET /api/admin/settings/ai", () => {
  it("retorna o modo da pré-consulta + status de IA (sem expor chave)", async () => {
    mockCommon();
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getPublicAISettings: vi.fn().mockResolvedValue({
        id: "default",
        provider: "deepseek",
        api_key: "sk••••••••",
        has_api_key: true,
        model: "deepseek-chat",
        protocol_system_prompt: null,
        chat_system_prompt: null,
        patient_intake_mode: "smart",
        updated_at: "x",
      }),
      getAISettings: vi.fn(),
      updateAISettings: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-mode", () => ({
      resolvePublicPreConsultationMode: vi.fn().mockResolvedValue({ configuredMode: "smart", effectiveMode: "smart", aiAvailable: true }),
    }));

    const { GET } = await import("../app/api/admin/settings/ai/route");
    const res = await GET(request("/api/admin/settings/ai"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patient_intake_mode).toBe("smart");
    expect(body.pre_consultation.effectiveMode).toBe("smart");
    // A chave nunca é exposta em claro — apenas o flag has_api_key (e valor mascarado).
    expect(body.has_api_key).toBe(true);
    expect(body.api_key).not.toBe("sk-raw-secret");
  });

  it("401 sem sessão de admin", async () => {
    mockUnauthenticated();
    const { GET } = await import("../app/api/admin/settings/ai/route");
    const res = await GET(request("/api/admin/settings/ai"));
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/admin/settings/ai", () => {
  it("salva 'smart' e registra pre_consultation_mode_changed", async () => {
    mockCommon();
    const updateAISettings = vi.fn().mockResolvedValue({
      id: "default",
      provider: "openai",
      api_key: null,
      model: "gpt-4o",
      protocol_system_prompt: null,
      chat_system_prompt: null,
      patient_intake_mode: "smart",
      updated_at: "x",
    });
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getAISettings: vi.fn().mockResolvedValue({ patient_intake_mode: "traditional" }),
      updateAISettings,
      getPublicAISettings: vi.fn().mockResolvedValue({
        id: "default",
        provider: "openai",
        api_key: null,
        has_api_key: false,
        model: "gpt-4o",
        protocol_system_prompt: null,
        chat_system_prompt: null,
        patient_intake_mode: "smart",
        updated_at: "x",
      }),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-mode", () => ({
      resolvePublicPreConsultationMode: vi.fn().mockResolvedValue({ configuredMode: "smart", effectiveMode: "traditional", aiAvailable: false, reason: "ai_unavailable" }),
    }));

    const { PUT } = await import("../app/api/admin/settings/ai/route");
    const res = await PUT(request("/api/admin/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: "gpt-4o", patient_intake_mode: "smart" }),
    }));
    expect(res.status).toBe(200);

    expect(updateAISettings).toHaveBeenCalledWith(expect.objectContaining({ patient_intake_mode: "smart" }));

    const modeChanged = writeAuditLog.mock.calls.find(([opts]) => opts?.action === "pre_consultation_mode_changed");
    expect(modeChanged).toBeTruthy();
    expect(modeChanged?.[0]?.metadata).toEqual({ oldMode: "traditional", newMode: "smart" });
  });

  it("salva 'traditional'", async () => {
    mockCommon();
    const updateAISettings = vi.fn().mockResolvedValue({ patient_intake_mode: "traditional", provider: "openai", model: "gpt-4o" });
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getAISettings: vi.fn().mockResolvedValue({ patient_intake_mode: "smart" }),
      updateAISettings,
      getPublicAISettings: vi.fn().mockResolvedValue({ patient_intake_mode: "traditional", has_api_key: false, provider: "openai", model: "gpt-4o", api_key: null }),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-mode", () => ({
      resolvePublicPreConsultationMode: vi.fn().mockResolvedValue({ configuredMode: "traditional", effectiveMode: "traditional", aiAvailable: true }),
    }));

    const { PUT } = await import("../app/api/admin/settings/ai/route");
    const res = await PUT(request("/api/admin/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: "gpt-4o", patient_intake_mode: "traditional" }),
    }));
    expect(res.status).toBe(200);
  });

  it("400 para valor inválido de modo", async () => {
    mockCommon();
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getAISettings: vi.fn(),
      updateAISettings: vi.fn(),
      getPublicAISettings: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/pre-consultation-mode", () => ({
      resolvePublicPreConsultationMode: vi.fn(),
    }));

    const { PUT } = await import("../app/api/admin/settings/ai/route");
    const res = await PUT(request("/api/admin/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: "gpt-4o", patient_intake_mode: "bogus" }),
    }));
    expect(res.status).toBe(400);
  });

  it("401 sem sessão de admin", async () => {
    mockUnauthenticated();
    const { PUT } = await import("../app/api/admin/settings/ai/route");
    const res = await PUT(request("/api/admin/settings/ai", {
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: "gpt-4o", patient_intake_mode: "smart" }),
    }));
    expect(res.status).toBe(401);
  });
});
