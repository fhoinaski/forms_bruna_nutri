import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Medidas caseiras por alimento (FASE 3 — precisão nutricional): repositório
 * (food_portions, já criada em 0034/estendida em 0036) e rota REST admin de
 * criação/listagem/desativação.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}
function mockAudit() {
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
}

describe("repository — lib/repositories/food-portions.ts", () => {
  it("createFoodPortion insere com confidence padrão 'medium' quando não informado, e listFoodPortions só devolve linhas ativas", async () => {
    const rows: Record<string, unknown>[] = [];
    const d1Execute = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO food_portions")) {
        const [id, foodSource, foodRefId, description, gramEquivalent, source, sourceVersion, confidence, createdAt] = params;
        rows.push({ id, food_source: foodSource, food_ref_id: foodRefId, description, gram_equivalent: gramEquivalent, source, source_version: sourceVersion, confidence, is_active: 1, created_at: createdAt });
      }
      if (sql.startsWith("UPDATE food_portions SET is_active = 0")) {
        const row = rows.find((item) => item.id === params[0]);
        if (row) row.is_active = 0;
      }
    });
    const d1Query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("WHERE id = ?1 LIMIT 1")) {
        const row = rows.find((item) => item.id === params[0]);
        return row ? [row] : [];
      }
      if (sql.includes("WHERE food_source = ?1 AND food_ref_id = ?2 AND is_active = 1")) {
        return rows.filter((item) => item.food_source === params[0] && item.food_ref_id === params[1] && item.is_active === 1);
      }
      return [];
    });
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { createFoodPortion, listFoodPortions, deactivateFoodPortion } = await import("../lib/repositories/food-portions");

    const portion = await createFoodPortion({ food_source: "TACO", food_ref_id: "179", description: "1 unidade média", gram_equivalent: 86 });
    expect(portion.confidence).toBe("medium");
    expect(portion.is_active).toBe(1);

    const listed = await listFoodPortions("TACO", "179");
    expect(listed).toHaveLength(1);
    expect(listed[0].description).toBe("1 unidade média");

    const deactivated = await deactivateFoodPortion(portion.id);
    expect(deactivated).toBe(true);
    const listedAfter = await listFoodPortions("TACO", "179");
    expect(listedAfter).toHaveLength(0); // desativada nunca mais aparece na listagem — mas a linha continua existindo (nunca DELETE)
  });

  it("deactivateFoodPortion devolve false para id inexistente, sem lançar erro", async () => {
    vi.doMock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn() }));
    const { deactivateFoodPortion } = await import("../lib/repositories/food-portions");
    expect(await deactivateFoodPortion("does-not-exist")).toBe(false);
  });
});

describe("API — POST /api/admin/foods/portions", () => {
  function makeRequest(body: unknown) {
    return new NextRequest(`${BASE_URL}/api/admin/foods/portions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejeita quando o alimento (food_ref_id) não existe", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn().mockReturnValue(null) }));
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn() }));
    vi.doMock("@/lib/repositories/food-portions", () => ({ listFoodPortions: vi.fn(), createFoodPortion: vi.fn() }));
    const { POST } = await import("../app/api/admin/foods/portions/route");

    const response = await POST(makeRequest({ food_source: "TACO", food_ref_id: "999999", description: "1 unidade", gram_equivalent: 50 }));
    expect(response.status).toBe(404);
  });

  it("rejeita duplicidade de descrição para o mesmo alimento", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn().mockReturnValue({ numero: 179, descricao: "Banana" }) }));
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn() }));
    vi.doMock("@/lib/repositories/food-portions", () => ({
      listFoodPortions: vi.fn().mockResolvedValue([{ id: "existing", description: "1 unidade média", food_source: "TACO", food_ref_id: "179" }]),
      createFoodPortion: vi.fn(),
    }));
    const { POST } = await import("../app/api/admin/foods/portions/route");

    const response = await POST(makeRequest({ food_source: "TACO", food_ref_id: "179", description: "1 UNIDADE MÉDIA", gram_equivalent: 90 }));
    expect(response.status).toBe(409);
  });

  it("cria a medida quando o alimento existe e não há duplicidade", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn().mockReturnValue({ numero: 179, descricao: "Banana" }) }));
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn() }));
    const createFoodPortion = vi.fn().mockResolvedValue({ id: "new-1", food_source: "TACO", food_ref_id: "179", description: "1 unidade média", gram_equivalent: 86, confidence: "medium", is_active: 1 });
    vi.doMock("@/lib/repositories/food-portions", () => ({ listFoodPortions: vi.fn().mockResolvedValue([]), createFoodPortion }));
    const { POST } = await import("../app/api/admin/foods/portions/route");

    const response = await POST(makeRequest({ food_source: "TACO", food_ref_id: "179", description: "1 unidade média", gram_equivalent: 86 }));
    expect(response.status).toBe(201);
    expect(createFoodPortion).toHaveBeenCalledWith(expect.objectContaining({ gram_equivalent: 86, confidence: "medium" }));
  });

  it("rejeita gram_equivalent não positivo (validação de gramas > 0)", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn() }));
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn() }));
    vi.doMock("@/lib/repositories/food-portions", () => ({ listFoodPortions: vi.fn(), createFoodPortion: vi.fn() }));
    const { POST } = await import("../app/api/admin/foods/portions/route");

    const response = await POST(makeRequest({ food_source: "TACO", food_ref_id: "179", description: "medida inválida", gram_equivalent: 0 }));
    expect(response.status).toBe(400);
  });

  it("recusa requisição sem sessão admin", async () => {
    mockAuth(false);
    const { POST } = await import("../app/api/admin/foods/portions/route");
    const response = await POST(makeRequest({ food_source: "TACO", food_ref_id: "179", description: "x", gram_equivalent: 10 }));
    expect(response.status).toBe(401);
  });
});
