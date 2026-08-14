import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  batchImpl: (statements: Array<{ sql: string; params: unknown[] }>) =>
    statements.map(() => ({ results: [], success: true, meta: { changes: 1 } })),
  batchCalls: [] as Array<Array<{ sql: string; params: unknown[] }>>,
}));

vi.mock("@/lib/security/encrypted-fields", () => ({
  encryptNullableText: (v: unknown) => (v === null || v === undefined || v === "" ? null : `enc:${v}`),
  decryptNullableText: (v: unknown) => (v === null || v === undefined ? null : String(v).startsWith("enc:") ? String(v).slice(4) : String(v)),
  encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}`,
  decryptJsonValue: (v: unknown, fb: unknown) => {
    try {
      return v && String(v).startsWith("encj:") ? JSON.parse(String(v).slice(5)) : fb;
    } catch {
      return fb;
    }
  },
}));

vi.mock("@/lib/d1/client", () => ({
  d1Query: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM nutrition_records WHERE client_id")) {
      const rec = h.store.get(String(params[0]));
      return rec ? [{ ...rec }] : [];
    }
    return [];
  }),
  d1Execute: vi.fn(async () => {}),
  d1Batch: vi.fn(async (statements: Array<{ sql: string; params: unknown[] }>) => {
    h.batchCalls.push(statements);
    return h.batchImpl(statements);
  }),
}));

import { updateNutritionRecord, NutritionRecordVersionConflictError } from "@/lib/repositories/nutrition-records";

function seedRecord(overrides: Record<string, unknown> = {}) {
  const rec: Record<string, unknown> = {
    id: "rec-1",
    client_id: "client-1",
    version: 1,
    chief_complaint: "enc:dor",
    clinical_history: null,
    current_weight_kg: null,
    height_cm: null,
    bmi: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
  h.store.set("client-1", rec);
  return rec;
}

beforeEach(() => {
  h.store.clear();
  h.batchCalls.length = 0;
  h.batchImpl = (statements) => {
    const update = statements.find((s) => s.sql.startsWith("UPDATE nutrition_records"));
    if (update) {
      const clientId = update.params[update.params.length - 2] as string;
      const expected = update.params[update.params.length - 1] as number;
      const rec = h.store.get(clientId);
      if (rec && rec.version === expected) rec.version = (rec.version as number) + 1;
    }
    return statements.map(() => ({ results: [], success: true, meta: { changes: 1 } }));
  };
});

describe("updateNutritionRecord — versionamento", () => {
  it("no-op: salvar os mesmos dados não cria versão nem chama d1Batch", async () => {
    seedRecord();
    const result = await updateNutritionRecord("client-1", { chief_complaint: "dor" });
    expect(result.version).toBe(1);
    expect(h.batchCalls.length).toBe(0);
  });

  it("edição cria nova versão e captura source/autor do servidor", async () => {
    seedRecord();
    const result = await updateNutritionRecord("client-1", { chief_complaint: "dor nova" }, {
      source: "manual",
      changedByAdminId: "admin-1",
      reason: "Correção após consulta",
    });
    expect(result.version).toBe(2);
    expect(h.batchCalls.length).toBe(1);
    const insert = h.batchCalls[0].find((s) => s.sql.includes("INSERT INTO nutrition_record_versions"));
    expect(insert).toBeTruthy();
    expect(insert!.params).toContain("manual");
    expect(insert!.params).toContain("admin-1");
    expect(insert!.params).toContain("Correção após consulta");
  });

  it("snapshot é cifrado (encj:...) e decifra de volta ao valor novo", async () => {
    seedRecord();
    await updateNutritionRecord("client-1", { chief_complaint: "dor nova" }, { source: "manual" });
    const insert = h.batchCalls[0].find((s) => s.sql.includes("INSERT INTO nutrition_record_versions"));
    const snapshotParam = insert!.params.find((p) => typeof p === "string" && p.startsWith("encj:")) as string;
    expect(snapshotParam).toBeTruthy();
    const snapshot = JSON.parse(snapshotParam.slice(5));
    expect(snapshot.chief_complaint).toBe("dor nova");
  });

  it("conflito por expectedVersion obsoleto lança 409 sem escrever nada", async () => {
    seedRecord({ version: 5 });
    await expect(
      updateNutritionRecord("client-1", { chief_complaint: "dor nova" }, { source: "manual", expectedVersion: 1 })
    ).rejects.toBeInstanceOf(NutritionRecordVersionConflictError);
    // Checagem antecipada (JS) — nenhum batch chega a ser disparado.
    expect(h.batchCalls.length).toBe(0);
  });

  it("corrida concorrente (UNIQUE no snapshot) vira NutritionRecordVersionConflictError", async () => {
    seedRecord(); // version 1 — expectedVersion 1 confere na checagem antecipada
    h.batchImpl = () => {
      throw new Error("UNIQUE constraint failed: nutrition_record_versions.nutrition_record_id, nutrition_record_versions.version");
    };
    await expect(
      updateNutritionRecord("client-1", { chief_complaint: "dor nova" }, { source: "manual", expectedVersion: 1 })
    ).rejects.toBeInstanceOf(NutritionRecordVersionConflictError);
    expect(h.batchCalls.length).toBe(1);
  });

  it("IA não é autora: source=ai_proposal com autor = nutricionista que confirmou", async () => {
    seedRecord();
    await updateNutritionRecord("client-1", { clinical_history: "melhora" }, {
      source: "ai_proposal",
      changedByAdminId: "nutri-1",
    });
    const insert = h.batchCalls[0].find((s) => s.sql.includes("INSERT INTO nutrition_record_versions"));
    expect(insert!.params).toContain("ai_proposal");
    expect(insert!.params).toContain("nutri-1");
  });

  it("reason opcional e ausente vira null (não gera versão extra)", async () => {
    seedRecord();
    const result = await updateNutritionRecord("client-1", { chief_complaint: "dor nova" }, { source: "manual" });
    expect(result.version).toBe(2);
    const insert = h.batchCalls[0].find((s) => s.sql.includes("INSERT INTO nutrition_record_versions"));
    expect(insert!.params).toContain(null);
  });
});
