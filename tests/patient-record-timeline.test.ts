import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function batchResult(results: unknown[]) {
  return { results };
}

function mockTimelineBatch(results: unknown[][]) {
  vi.doMock("@/lib/d1/client", () => ({
    d1Batch: vi.fn(async () => results.map(batchResult)),
  }));
}

const goldenRows = {
  patient: [{ id: "patient-1" }],
  consultations: [
    { id: "consult-aug", client_id: "patient-1", status: "completed", started_at: "2026-08-18T12:00:00.000Z", ended_at: "2026-08-18T13:00:00.000Z", appointment_type: "retorno" },
    { id: "consult-jul", client_id: "patient-1", status: "completed", started_at: "2026-07-15T12:00:00.000Z", ended_at: "2026-07-15T13:00:00.000Z", appointment_type: "retorno" },
    { id: "consult-jun", client_id: "patient-1", status: "completed", started_at: "2026-06-01T10:00:00.000Z", ended_at: "2026-06-01T11:00:00.000Z", appointment_type: "inicial" },
  ],
  evolutions: [
    { id: "anthro-jul", client_id: "patient-1", measured_at: "2026-07-20T12:00:00.000Z", created_at: "2026-07-20T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 69.7, bmi: 24.1, waist_cm: 82 }), weight: null, height: null, bmi: null, waist_cm: null, body_fat_percentage: null },
    { id: "anthro-jun", client_id: "patient-1", measured_at: "2026-06-01T12:00:00.000Z", created_at: "2026-06-01T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 71.3, bmi: 24.7 }), weight: null, height: null, bmi: null, waist_cm: null, body_fat_percentage: null },
    { id: "anthro-future", client_id: "patient-1", measured_at: "2026-09-02T12:00:00.000Z", created_at: "2026-09-02T12:00:00.000Z", encrypted_payload: JSON.stringify({ weight: 68.0 }), weight: null, height: null, bmi: null, waist_cm: null, body_fat_percentage: null },
  ],
  mealPlans: [
    { id: "plan-v3", client_id: "patient-1", title: "Plano v3", status: "active", version: 3, updated_at: "2026-08-23T12:00:00.000Z", created_at: "2026-08-23T11:00:00.000Z" },
    { id: "plan-v2", client_id: "patient-1", title: "Plano v2", status: "archived", version: 2, updated_at: "2026-07-15T13:00:00.000Z", created_at: "2026-07-15T12:00:00.000Z" },
  ],
  protocols: [
    { id: "protocol-1", client_id: "patient-1", protocol_id: "proto-1", status: "ativo", started_at: "2026-06-10", completed_at: null, updated_at: "2026-06-10T12:00:00.000Z", protocol_title: "Reeducacao alimentar" },
  ],
};

function mockGolden() {
  mockTimelineBatch([
    goldenRows.patient,
    goldenRows.consultations,
    goldenRows.evolutions,
    goldenRows.mealPlans,
    goldenRows.protocols,
  ]);
}

describe("Patient clinical timeline", () => {
  it("ordena eventos clinicos em ordem cronologica descendente com desempate deterministico", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z") });

    expect(result?.events.map((event) => event.id)).toEqual([
      "meal-plan:plan-v3:v3",
      "consultation:consult-aug",
      "anthropometry:anthro-jul",
      "meal-plan:plan-v2:v2",
      "consultation:consult-jul",
      "protocol-started:protocol-1",
      "anthropometry:anthro-jun",
      "consultation:consult-jun",
    ]);
  });

  it("aplica limit e offset sem reordenar", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z"), limit: 3, offset: 2 });

    expect(result?.events.map((event) => event.id)).toEqual([
      "anthropometry:anthro-jul",
      "meal-plan:plan-v2:v2",
      "consultation:consult-jul",
    ]);
    expect(result?.hasMore).toBe(true);
  });

  it("filtra planos sem incluir rascunho", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z"), filter: "meal_plans" });

    expect(result?.events.map((event) => event.type)).toEqual(["MEAL_PLAN_PUBLISHED", "MEAL_PLAN_PUBLISHED"]);
    expect(result?.events.map((event) => event.summary.join(" "))).not.toContain("draft");
  });

  it("preserva eventos do mesmo dia sem duplicar o mesmo fato", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z") });
    const july15 = result?.events.filter((event) => event.occurredAt.startsWith("2026-07-15"));

    expect(july15?.map((event) => event.id)).toEqual(["meal-plan:plan-v2:v2", "consultation:consult-jul"]);
    expect(new Set(result?.events.map((event) => event.id)).size).toBe(result?.events.length);
  });

  it("nao deixa evento futuro vazar para a timeline historica", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z") });

    expect(result?.events.map((event) => event.id)).not.toContain("anthropometry:anthro-future");
  });

  it("retorna vazio para paciente sem eventos", async () => {
    mockTimelineBatch([[{ id: "empty" }], [], [], [], []]);
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("empty", { now: new Date("2026-08-23T23:00:00.000Z") });

    expect(result?.events).toEqual([]);
    expect(result?.total).toBe(0);
    expect(result?.hasMore).toBe(false);
  });

  it("retorna null quando o paciente nao existe", async () => {
    mockTimelineBatch([[], [], [], [], []]);
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    await expect(getPatientClinicalTimeline("missing")).resolves.toBeNull();
  });

  it("mantem ownership em todos os eventos pelo patientId solicitado", async () => {
    mockGolden();
    const { getPatientClinicalTimeline } = await import("../lib/repositories/patient-record-timeline");

    const result = await getPatientClinicalTimeline("patient-1", { now: new Date("2026-08-23T23:00:00.000Z") });

    expect(result?.events.every((event) => event.patientId === "patient-1")).toBe(true);
  });
});
