import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptValue, decryptValue, DataDecryptionError } from "@/lib/security/crypto";

/**
 * Regressão do erro 502 "Unsupported state or unable to authenticate data":
 * uma falha de decryption AES-GCM (chave rotacionada/ambiente divergente)
 * não pode vazar o erro cru do Node nem o ciphertext para o cliente — nem na
 * primitiva de crypto, nem na borda HTTP (/api/admin/ai/chat).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.CLINICAL_DATA_ENCRYPTION_KEY;
  delete process.env.MFA_ENCRYPTION_KEY;
  delete process.env.AUTH_SECRET;
});

function makeChatRequest(body: unknown): NextRequest {
  return new NextRequest("https://brunanutri.com.br/api/admin/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DataDecryptionError — primitiva sanitizada", () => {
  it("decrypt com chave errada lança DataDecryptionError, nunca o erro cru do Node", () => {
    // Cifra com a "chave antiga".
    process.env.CLINICAL_DATA_ENCRYPTION_KEY = "chave-antiga-que-cifrou-o-dado";
    const encrypted = encryptValue("dado clinico sensivel", "clinical");

    // A chave foi rotacionada: a cadeia atual não tem mais a chave antiga.
    process.env.CLINICAL_DATA_ENCRYPTION_KEY = "chave-nova-completamente-diferente";
    delete process.env.MFA_ENCRYPTION_KEY;
    delete process.env.AUTH_SECRET;

    let thrown: unknown;
    try {
      decryptValue(encrypted, "clinical");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DataDecryptionError);
    const err = thrown as DataDecryptionError;
    expect(err.errorCode).toBe("data_decryption_failed");
    expect(err.purpose).toBe("clinical");
    expect(err.message).toBe("Falha interna ao carregar dados protegidos.");
    expect(err.message).not.toMatch(/unsupported state|unable to authenticate|base64url|iv|tag/i);
  });

  it("payload malformado lança DataDecryptionError sanitizado (não vaza 'Invalid encrypted payload')", () => {
    process.env.CLINICAL_DATA_ENCRYPTION_KEY = "qualquer-chave";
    let thrown: unknown;
    try {
      decryptValue("não-é-um-payload-válido", "clinical");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DataDecryptionError);
    expect((thrown as Error).message).toBe("Falha interna ao carregar dados protegidos.");
  });

  it("roundtrip continua funcionando com a chave atual", () => {
    process.env.CLINICAL_DATA_ENCRYPTION_KEY = "chave-atual";
    const encrypted = encryptValue("dado clinico", "clinical");
    expect(decryptValue(encrypted, "clinical")).toBe("dado clinico");
  });
});

describe("POST /api/admin/ai/chat — não vaza erro interno de decryption", () => {
  it("DataDecryptionError vindo do orquestrador → 500 sanitizado", async () => {
    // Importa na MESMA janela de módulos (após resetModules) que a rota usará,
    // para que `instanceof` no catch da rota reconheça a classe lançada aqui.
    const { DataDecryptionError: DecryptionErrorClass } = await import("@/lib/security/crypto");

    vi.doMock("@/lib/auth/session", () => ({
      getAdminFromRequest: vi.fn().mockResolvedValue({
        sub: "admin-1", email: "admin@test.local", name: "Admin", mustChangePassword: false, sessionVersion: 1,
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0, ipHash: "hash" }),
    }));
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getAISettings: vi.fn().mockResolvedValue({ api_key: "configured", provider: "openai", model: "gpt-4o" }),
    }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({
      getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash", userAgentHash: "ua" }),
    }));
    vi.doMock("@/lib/ai/core/ai-context", () => ({
      resolveAssistantContext: vi.fn().mockResolvedValue({
        adminUser: { sub: "admin-1" }, profile: "ADMIN_ASSISTANT", client: null, submission: null,
      }),
    }));
    vi.doMock("@/lib/observability/logger", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("@/lib/ai/core/ai-orchestrator", () => ({
      runAssistantTurn: vi.fn().mockRejectedValue(new DecryptionErrorClass("clinical")),
    }));

    const { POST } = await import("../app/api/admin/ai/chat/route");
    const response = await POST(makeChatRequest({
      messages: [{ role: "user", content: "abrir a ficha do cliente" }],
      context: { clientId: "client-1" },
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).toBe("Falha interna ao carregar dados protegidos. Tente novamente em instantes.");
    expect(JSON.stringify(body)).not.toMatch(/unsupported state|unable to authenticate/i);
  });
});
