import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 5 (document/configuration/admin) — domínio "admin". Somente leitura;
 * sistema de admin único (sem RBAC). Nunca expõe password_hash,
 * mfa_secret_encrypted, recovery_codes_json, api_key, metadata_json bruta
 * ou ip_hash.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("executeGetSystemHealth — read only", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("ok:true quando todas as env vars obrigatórias estão presentes", async () => {
    process.env.AUTH_SECRET = "secret";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "db";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    const { executeGetSystemHealth } = await import("../lib/ai/agents/system/admin-agent");
    const result = await executeGetSystemHealth();
    expect(result.ok).toBe(true);
    expect(result.missingEnvironmentVariables).toEqual([]);
  });

  it("ok:false e lista as chaves faltando quando alguma env var obrigatória está ausente", async () => {
    delete process.env.AUTH_SECRET;
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "db";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    const { executeGetSystemHealth } = await import("../lib/ai/agents/system/admin-agent");
    const result = await executeGetSystemHealth();
    expect(result.ok).toBe(false);
    expect(result.missingEnvironmentVariables).toContain("AUTH_SECRET");
  });

  it("nunca inclui o valor de nenhuma env var no resultado, só o nome da chave faltando", async () => {
    process.env.AUTH_SECRET = "super-secret-value-should-not-leak";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "db";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    const { executeGetSystemHealth } = await import("../lib/ai/agents/system/admin-agent");
    const result = await executeGetSystemHealth();
    expect(JSON.stringify(result)).not.toContain("super-secret-value-should-not-leak");
  });
});

describe("executeGetAuditLogSummary — read only, no secrets", () => {
  function logRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "log-1",
      action: "client.update",
      entity_type: "client",
      entity_id: "client-1",
      admin_id: "admin-1",
      outcome: "success",
      metadata_json: JSON.stringify({ password_hash: "should-never-appear", field: "name" }),
      ip_hash: "abc123hash",
      created_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("resume as entradas do audit log só com campos seguros (action/entityType/outcome/createdAt)", async () => {
    vi.doMock("@/lib/security/audit", () => ({ listAuditLogs: vi.fn().mockResolvedValue([logRow()]) }));
    const { executeGetAuditLogSummary } = await import("../lib/ai/agents/system/admin-agent");
    const result = await executeGetAuditLogSummary({});
    expect(result.entries).toEqual([{ action: "client.update", entityType: "client", outcome: "success", createdAt: "2026-01-01T00:00:00.000Z" }]);
    expect(result.totalFound).toBe(1);
  });

  it("nunca inclui metadata_json, ip_hash ou admin_id no resultado", async () => {
    vi.doMock("@/lib/security/audit", () => ({ listAuditLogs: vi.fn().mockResolvedValue([logRow()]) }));
    const { executeGetAuditLogSummary } = await import("../lib/ai/agents/system/admin-agent");
    const result = await executeGetAuditLogSummary({});
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("ip_hash");
    expect(serialized).not.toContain("abc123hash");
    expect(serialized).not.toContain("admin-1");
  });

  it("respeita o limit passado, com fallback para 20", async () => {
    const listAuditLogs = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/security/audit", () => ({ listAuditLogs }));
    const { executeGetAuditLogSummary } = await import("../lib/ai/agents/system/admin-agent");
    await executeGetAuditLogSummary({ limit: 5 });
    expect(listAuditLogs).toHaveBeenCalledWith(5);
    await executeGetAuditLogSummary({});
    expect(listAuditLogs).toHaveBeenCalledWith(20);
  });
});

describe("admin-agent — schemas de input rejeitam parâmetros não previstos (unauthorized-shape)", () => {
  it("getSystemHealthInputSchema rejeita campos extras (.strict())", async () => {
    const { getSystemHealthInputSchema } = await import("../lib/ai/agents/system/admin-agent");
    const result = getSystemHealthInputSchema.safeParse({ unexpected: "field" });
    expect(result.success).toBe(false);
  });

  it("getAuditLogSummaryInputSchema rejeita limit acima do teto (50)", async () => {
    const { getAuditLogSummaryInputSchema } = await import("../lib/ai/agents/system/admin-agent");
    const result = getAuditLogSummaryInputSchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });
});
