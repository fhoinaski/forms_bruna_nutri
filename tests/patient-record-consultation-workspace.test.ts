import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
  process.env.MFA_ENCRYPTION_KEY = "test-mfa-secret-with-at-least-thirty-two-characters";
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const draft = {
  evolution: "Evoluiu bem.",
  adherence: "Boa adesão.",
  symptoms: "Sem queixas.",
  conduct: "Manter estratégia.",
  goals: "Organizar lanches.",
  observations: "Texto livre preservado.",
};

function mockCrypto() {
  vi.doMock("@/lib/security/encrypted-fields", () => ({
    decryptNullableText: (value: string | null | undefined) => value ?? null,
    encryptNullableText: (value: string | null | undefined) => value ?? null,
    decryptJsonValue: <T,>(value: string | null | undefined, fallback: T) => {
      if (!value) return fallback;
      return JSON.parse(value) as T;
    },
    encryptJsonValue: (value: unknown) => JSON.stringify(value),
  }));
}

function batchRows(overrides: Partial<{ status: string; sessionPatient: string; emptyContext: boolean }> = {}) {
  const emptyContext = overrides.emptyContext ?? false;
  return [
    { results: [{ id: "patient-1", name: "Patient Consultation P3 Test", birth_date: "1990-05-15", status: "ativo", source_submission_id: "submission-1" }] },
    { results: [{ goals: "Reduzir gordura corporal" }] },
    {
      results: [{
        id: "session-1",
        client_id: overrides.sessionPatient ?? "patient-1",
        appointment_id: "appointment-1",
        status: overrides.status ?? "in_progress",
        started_at: "2026-08-23T12:00:00.000Z",
        ended_at: overrides.status === "completed" ? "2026-08-23T13:00:00.000Z" : null,
        notes: "Texto livre preservado.",
        summary_json: JSON.stringify({ workspaceDraft: draft, otherSummary: "keep" }),
        updated_at: "2026-08-23T12:10:00.000Z",
        appointment_title: "Consulta de retorno",
        appointment_type: "retorno",
        appointment_starts_at: "2026-08-23T12:00:00.000Z",
        appointment_status: "confirmado",
      }],
    },
    { results: [{ id: "previous-1", started_at: "2026-07-18T12:00:00.000Z", ended_at: "2026-07-18T13:00:00.000Z", appointment_type: "retorno" }] },
    {
      results: emptyContext ? [] : [
        { id: "evo-2", measured_at: "2026-08-20T12:00:00.000Z", created_at: "2026-08-20T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 68.4, bmi: 24.2, waist_cm: 78, body_fat_percentage: 29 }) },
        { id: "evo-1", measured_at: "2026-07-18T12:00:00.000Z", created_at: "2026-07-18T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 69.8, bmi: 24.7 }) },
      ],
    },
    { results: emptyContext ? [] : [{ id: "plan-active", title: "Plano P3 v3", version: 3, updated_at: "2026-08-20T12:00:00.000Z" }] },
    { results: emptyContext ? [] : [{ id: "plan-draft", title: "Plano P3 v4", version: 4, updated_at: "2026-08-22T12:00:00.000Z" }] },
    { results: emptyContext ? [] : [{ id: "marker-1", normalized_code: "LACTOSE", label_encrypted: "Lactose", severity: "moderate", source: "manual" }] },
    { results: emptyContext ? [] : [{ id: "client-protocol-1", protocol_id: "protocol-1", status: "ativo", started_at: "2026-08-01", protocol_title: "Reeducação alimentar" }] },
    { results: [{ id: "submission-1", submission_source: "traditional", answers_json: JSON.stringify({ objetivo: "Melhorar composição corporal", motivacao: "Saúde", tipoAtendimento: "Retorno" }), created_at: "2026-08-10T12:00:00.000Z" }] },
  ];
}

function mockD1(rows = batchRows()) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  vi.doMock("@/lib/d1/client", () => ({
    d1Batch: vi.fn(async () => rows),
    d1Query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT * FROM consultation_sessions")) {
        return [{
          id: "session-1",
          client_id: "patient-1",
          status: "in_progress",
          summary_json: JSON.stringify({ keep: true }),
        }];
      }
      if (sql.startsWith("UPDATE consultation_sessions")) return [{ id: "session-1" }];
      return [];
    }),
  }));
  return queries;
}

describe("getConsultationWorkspace", () => {
  it("composes the workspace context from canonical sources", async () => {
    mockCrypto();
    mockD1();
    const { getConsultationWorkspace } = await import("@/lib/repositories/patient-consultation-workspace");

    const workspace = await getConsultationWorkspace("patient-1", "session-1");

    expect(workspace?.patient.name).toBe("Patient Consultation P3 Test");
    expect(workspace?.consultation?.id).toBe("session-1");
    expect(workspace?.previousConsultation?.id).toBe("previous-1");
    expect(workspace?.latestAnthropometry?.weightKg).toBe(68.4);
    expect(workspace?.weightDelta?.kg).toBe(-1.4);
    expect(workspace?.activeMealPlan?.version).toBe(3);
    expect(workspace?.draftMealPlan?.version).toBe(4);
    expect(workspace?.keyRestrictions[0]?.label).toBe("Lactose");
    expect(workspace?.intakeSummary?.objective).toBe("Melhorar composição corporal");
    expect(workspace?.activeProtocols[0]?.title).toBe("Reeducação alimentar");
  });

  it("returns empty context without false zeroes", async () => {
    mockCrypto();
    mockD1(batchRows({ emptyContext: true }));
    const { getConsultationWorkspace } = await import("@/lib/repositories/patient-consultation-workspace");

    const workspace = await getConsultationWorkspace("patient-1", "session-1");

    expect(workspace?.latestAnthropometry).toBeNull();
    expect(workspace?.weightDelta).toBeNull();
    expect(workspace?.activeMealPlan).toBeNull();
    expect(workspace?.keyRestrictions).toEqual([]);
  });

  it("marks completed consultations as read-only", async () => {
    mockCrypto();
    mockD1(batchRows({ status: "completed" }));
    const { getConsultationWorkspace } = await import("@/lib/repositories/patient-consultation-workspace");

    const workspace = await getConsultationWorkspace("patient-1", "session-1");

    expect(workspace?.consultation?.canEdit).toBe(false);
    expect(workspace?.consultation?.readOnlyReason).toContain("finalizada");
  });

  it("does not return a consultation from another patient", async () => {
    mockCrypto();
    const rows = batchRows();
    rows[2] = { results: [] };
    mockD1(rows);
    const { getConsultationWorkspace } = await import("@/lib/repositories/patient-consultation-workspace");

    const workspace = await getConsultationWorkspace("patient-1", "session-from-patient-2");

    expect(workspace?.patient.id).toBe("patient-1");
    expect(workspace?.consultation).toBeNull();
  });
});

describe("saveConsultationWorkspaceDraft", () => {
  it("persists the structured draft only when the session belongs to the patient", async () => {
    mockCrypto();
    const queries = mockD1();
    const { saveConsultationWorkspaceDraft } = await import("@/lib/repositories/patient-consultation-workspace");

    await expect(saveConsultationWorkspaceDraft({ patientId: "patient-1", consultationId: "session-1", draft })).resolves.toBe(true);

    const update = queries.find((query) => query.sql.startsWith("UPDATE consultation_sessions"));
    expect(update?.params).toContain("patient-1");
    expect(String(update?.params[1])).toContain("workspaceDraft");
  });

  it("refuses to save completed consultations", async () => {
    mockCrypto();
    vi.doMock("@/lib/d1/client", () => ({
      d1Batch: vi.fn(),
      d1Query: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT * FROM consultation_sessions")) return [{ id: "session-1", client_id: "patient-1", status: "completed", summary_json: null }];
        return [];
      }),
    }));
    const { saveConsultationWorkspaceDraft } = await import("@/lib/repositories/patient-consultation-workspace");

    await expect(saveConsultationWorkspaceDraft({ patientId: "patient-1", consultationId: "session-1", draft })).resolves.toBe(false);
  });
});
