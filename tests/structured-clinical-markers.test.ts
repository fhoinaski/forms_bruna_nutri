import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
const admin = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };

function mockCryptoFields() {
  vi.doMock("@/lib/security/encrypted-fields", () => ({
    encryptNullableText: (value: string | null | undefined) => value ?? null,
    decryptNullableText: (value: string | null | undefined) => value ?? null,
    encryptJsonValue: (value: unknown) => JSON.stringify(value),
    decryptJsonValue: (value: string | null, fallback: unknown) => value ? JSON.parse(value) : fallback,
  }));
}

function marker(overrides: Record<string, unknown> = {}) {
  return {
    id: "marker-1",
    client_id: "client-1",
    type: "ALLERGY",
    normalized_code: "MILK",
    label_encrypted: "Leite",
    severity: "severe",
    status: "ACTIVE",
    source: "manual",
    evidence_text_encrypted: "Alergia confirmada.",
    created_by_admin_id: "admin-1",
    updated_by_admin_id: "admin-1",
    resolved_by_admin_id: null,
    resolved_at: null,
    created_at: "2026-08-16T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("patient clinical markers repository — storage/audit", () => {
  it("cria, lê e descriptografa marcador estruturado sem alterar texto livre", async () => {
    mockCryptoFields();
    const rows = new Map<string, Record<string, unknown>>();
    const d1Batch = vi.fn(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
      const insert = statements[0];
      const params = insert.params!;
      rows.set(params[0] as string, marker({
        id: params[0],
        client_id: params[1],
        type: params[2],
        normalized_code: params[3],
        label_encrypted: params[4],
        severity: params[5],
        status: params[6],
        source: params[7],
        evidence_text_encrypted: params[8],
        created_by_admin_id: params[9],
        updated_by_admin_id: params[10],
        created_at: params[11],
        updated_at: params[12],
      }));
    });
    const d1Query = vi.fn(async (_sql: string, params: unknown[] = []) =>
      Array.from(rows.values()).filter((row) => row.client_id === params[0])
    );
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    const { createPatientClinicalMarker, listPatientClinicalMarkers } = await import("../lib/repositories/patient-clinical-markers");

    await createPatientClinicalMarker({
      clientId: "client-1",
      type: "ALLERGY",
      normalizedCode: "MILK",
      label: "Leite",
      severity: "severe",
      evidenceText: "Alergia confirmada.",
      adminId: "admin-1",
    });

    const list = await listPatientClinicalMarkers("client-1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ client_id: "client-1", type: "ALLERGY", normalized_code: "MILK", label: "Leite" });
    expect(d1Batch.mock.calls[0][0]).toHaveLength(2); // row + evento historico
  });

  it("get por id sempre filtra client_id, bloqueando leitura cross-tenant/cross-paciente", async () => {
    mockCryptoFields();
    const d1Query = vi.fn(async (_sql: string, params: unknown[] = []) => {
      const [clientId, markerId] = params;
      if (clientId === "client-1" && markerId === "marker-1") return [marker()];
      return [];
    });
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Batch: vi.fn(), d1Execute: vi.fn() }));
    const { getPatientClinicalMarker } = await import("../lib/repositories/patient-clinical-markers");
    expect(await getPatientClinicalMarker("client-1", "marker-1")).not.toBeNull();
    expect(await getPatientClinicalMarker("client-2", "marker-1")).toBeNull();
  });

  it("resolve marcador preservando historico anterior e proximo", async () => {
    mockCryptoFields();
    const d1Query = vi.fn().mockResolvedValue([marker()]);
    const d1Batch = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Batch, d1Execute: vi.fn() }));
    const { updatePatientClinicalMarker } = await import("../lib/repositories/patient-clinical-markers");
    const result = await updatePatientClinicalMarker("client-1", "marker-1", { status: "RESOLVED", adminId: "admin-1" });
    expect(result?.status).toBe("RESOLVED");
    expect(d1Batch.mock.calls[0][0][1].sql).toContain("patient_clinical_marker_events");
    expect(d1Batch.mock.calls[0][0][1].params).toContain("resolved");
  });
});

describe("checkFoodAgainstPatientRestrictions", () => {
  const milk: MacroReferenceFood = {
    numero: 458,
    descricao: "Leite de vaca, integral",
    grupo: "Leites e derivados",
    fonte: "taco",
    energia_kcal: 60,
    proteina_g: 3,
    carboidrato_g: 5,
    lipidios_g: 3,
  };
  const rice: MacroReferenceFood = {
    numero: 3,
    descricao: "Arroz, tipo 1, cozido",
    grupo: "Cereais e derivados",
    fonte: "taco",
    energia_kcal: 128,
    proteina_g: 2.5,
    carboidrato_g: 28,
    lipidios_g: 0.2,
  };
  const cake: MacroReferenceFood = {
    numero: "custom-cake",
    descricao: "Bolo de chocolate",
    fonte: "custom",
    energia_kcal: 300,
    proteina_g: 5,
    carboidrato_g: 45,
    lipidios_g: 12,
  };

  it("MILK allergy + alimento mapeado para leite => conflict", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: milk,
      markers: [marker({ id: "m1", normalized_code: "MILK", type: "ALLERGY" }) as never],
    });
    expect(result.status).toBe("conflict");
  });

  it("LACTOSE intolerance + alimento simples conhecido sem lactose => compatible", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: rice,
      markers: [marker({ id: "m1", normalized_code: "LACTOSE", type: "INTOLERANCE" }) as never],
    });
    expect(result).toEqual({ status: "compatible", checks: ["food_trait_free_from:LACTOSE"] });
  });

  it("alimento sem ingredientes/perfil conhecido nunca vira seguro", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: cake,
      markers: [marker({ id: "m1", normalized_code: "MILK", type: "ALLERGY" }) as never],
    });
    expect(result.status).toBe("unknown");
  });

  it("restricao suspeita resulta unknown, nao compatible", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: rice,
      markers: [marker({ id: "m1", normalized_code: "LACTOSE", type: "INTOLERANCE", status: "SUSPECTED" }) as never],
    });
    expect(result.status).toBe("unknown");
  });
});

describe("AI-assisted extraction suggestions", () => {
  it("texto sugestivo gera proposta, mas nao persiste automaticamente", async () => {
    const { suggestStructuredRestrictionsFromText } = await import("../lib/ai/agents/clinical/structured-restriction-suggestions");
    const suggestions = suggestStructuredRestrictionsFromText("Paciente relata desconforto após leite.");
    expect(suggestions[0]).toMatchObject({ type: "INTOLERANCE", normalizedCode: "MILK", status: "SUSPECTED" });
  });

  it("rejeicao de sugestao registra evento/audit sem criar marcador", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1" }) }));
    const recordRejectedClinicalMarkerSuggestion = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({ recordRejectedClinicalMarkerSuggestion }));
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip" }) }));
    const { POST } = await import("../app/api/admin/clients/[id]/nutrition-record/structured-restrictions/suggestions/route");
    const res = await POST(
      new NextRequest(new URL("/api/admin/clients/client-1/nutrition-record/structured-restrictions/suggestions", BASE_URL), {
        method: "POST",
        body: JSON.stringify({ suggestion: { type: "INTOLERANCE", normalizedCode: "MILK" } }),
      }),
      { params: Promise.resolve({ id: "client-1" }) }
    );
    expect(res.status).toBe(200);
    expect(recordRejectedClinicalMarkerSuggestion).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "patient_clinical_marker_suggestion_rejected" }));
  });
});
