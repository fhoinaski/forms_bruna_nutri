import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function batchResult(results: unknown[]) {
  return { results };
}

function mockSummaryBatch(results: unknown[][]) {
  vi.doMock("@/lib/d1/client", () => ({
    d1Batch: vi.fn(async () => results.map(batchResult)),
    d1Query: vi.fn(async () => []),
  }));
}

const completeBatch = [
  [{ id: "client-1", name: "Patient Record P1 Test", birth_date: "1990-12-10", status: "ativo" }],
  [{ goals: "Emagrecimento" }],
  [{ id: "consult-3", status: "completed", started_at: "2026-08-18T12:00:00.000Z", ended_at: "2026-08-18T13:00:00.000Z", appointment_id: "appt-old", appointment_type: "retorno" }],
  [],
  [
    { id: "appt-next", title: "Retorno P1", appointment_type: "retorno", starts_at: "2026-09-02T12:00:00.000Z", status: "agendado" },
  ],
  [
    { id: "ev-latest", measured_at: "2026-08-20T12:00:00.000Z", created_at: "2026-08-20T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 68.4, bmi: 24.1, waist_cm: 78, body_fat_percentage: 29 }) },
    { id: "ev-previous", measured_at: "2026-08-01T12:00:00.000Z", created_at: "2026-08-01T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 70.0, bmi: 24.7 }) },
  ],
  [{ id: "active-plan", title: "Plano atual", status: "active", version: 3, versioned_at: "2026-08-18T14:00:00.000Z" }],
  [{ id: "draft-plan", title: "Plano em ajuste", status: "draft", version: 4, versioned_at: "2026-08-22T14:00:00.000Z" }],
  [{ id: "marker-1", type: "ALLERGY", normalized_code: "MILK", label_encrypted: "Alergia ao leite", severity: "severe", source: "manual" }],
  [{ id: "cp-1", protocol_id: "protocol-1", status: "ativo", started_at: "2026-08-10", review_date: "2026-09-10", phase_count: 2, protocol_title: "Reeducação alimentar" }],
  [{ c: 2 }],
  [{ c: 1 }],
  [{ id: "supplement-1", name: "Vitamina D", dosage: "2000", unit: "UI/dia" }],
];

describe("PatientRecordSummaryViewModel", () => {
  it("monta o resumo completo sem confundir active e draft", async () => {
    mockSummaryBatch(completeBatch);
    const { getPatientRecordSummary } = await import("../lib/repositories/patient-record-summary");

    const summary = await getPatientRecordSummary("client-1");

    expect(summary?.patient.name).toBe("Patient Record P1 Test");
    expect(summary?.patient.primaryGoal).toBe("Emagrecimento");
    expect(summary?.latestConsultation?.id).toBe("consult-3");
    expect(summary?.nextAppointment?.id).toBe("appt-next");
    expect(summary?.latestAnthropometry?.weightKg).toBe(68.4);
    expect(summary?.weightTrend).toEqual({ absoluteChangeKg: -1.6, direction: "down" });
    expect(summary?.activeMealPlan?.versionId).toBe("active-plan:v3");
    expect(summary?.activeMealPlan?.publishedAt).toBe("2026-08-18T14:00:00.000Z");
    expect(summary?.draftMealPlan?.versionId).toBe("draft-plan:v4");
    expect(summary?.pendingActions.map((action) => action.kind)).toContain("DRAFT_MEAL_PLAN");
    expect(summary?.keyRestrictions[0].label).toBe("Alergia ao leite");
    expect(summary?.activeProtocols[0]).toMatchObject({ phaseCount: 2, reviewDate: "2026-09-10" });
    expect(summary?.activeSupplements).toEqual([{ id: "supplement-1", name: "Vitamina D", dosage: "2000", unit: "UI/dia" }]);
  });

  it("normaliza paciente vazio sem zeros falsos", async () => {
    mockSummaryBatch([
      [{ id: "empty-client", name: "Paciente vazio", birth_date: null, status: "ativo" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [{ c: 0 }],
      [{ c: 0 }],
    ]);
    const { getPatientRecordSummary } = await import("../lib/repositories/patient-record-summary");

    const summary = await getPatientRecordSummary("empty-client");

    expect(summary?.patient.ageYears).toBeNull();
    expect(summary?.latestAnthropometry).toBeNull();
    expect(summary?.weightTrend).toBeNull();
    expect(summary?.activeMealPlan).toBeNull();
    expect(summary?.draftMealPlan).toBeNull();
    expect(summary?.pendingActions).toEqual([]);
  });

  it("calcula idade respeitando aniversario ainda nao ocorrido", async () => {
    const { calculatePatientAgeYears } = await import("../lib/repositories/patient-record-summary");

    expect(calculatePatientAgeYears("1990-12-10", new Date("2026-08-23T12:00:00.000Z"))).toBe(35);
    expect(calculatePatientAgeYears("1990-05-10", new Date("2026-08-23T12:00:00.000Z"))).toBe(36);
    expect(calculatePatientAgeYears(null, new Date("2026-08-23T12:00:00.000Z"))).toBeNull();
  });

  it("retorna null quando o paciente nao existe", async () => {
    mockSummaryBatch([[], [], [], [], [], [], [], [], [], [], [{ c: 0 }], [{ c: 0 }]]);
    const { getPatientRecordSummary } = await import("../lib/repositories/patient-record-summary");

    await expect(getPatientRecordSummary("missing")).resolves.toBeNull();
  });
});
