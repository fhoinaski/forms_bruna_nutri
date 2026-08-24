import { describe, expect, it } from "vitest";
import {
  buildAnthropometryChangeSet,
  buildPatientAnthropometryProgressViewModel,
  type PatientAnthropometryAssessment,
} from "../lib/repositories/patient-anthropometry-progress";
import type { ClientEvolution } from "../lib/repositories/client-evolutions";

function evolution(overrides: Partial<ClientEvolution> & { id: string; measured_at: string | null }): ClientEvolution {
  const has = (key: keyof ClientEvolution) => Object.prototype.hasOwnProperty.call(overrides, key);
  return {
    id: overrides.id,
    client_id: overrides.client_id ?? "patient-p5",
    client_protocol_id: null,
    measured_at: overrides.measured_at,
    weight: overrides.weight ?? null,
    height: has("height") ? overrides.height ?? null : 168,
    bmi: overrides.bmi ?? null,
    waist_cm: overrides.waist_cm ?? null,
    hip_cm: overrides.hip_cm ?? null,
    arm_cm: overrides.arm_cm ?? null,
    abdomen_cm: overrides.abdomen_cm ?? null,
    thigh_cm: overrides.thigh_cm ?? null,
    body_fat_percentage: overrides.body_fat_percentage ?? null,
    skinfold_triceps_mm: overrides.skinfold_triceps_mm ?? null,
    skinfold_subscapular_mm: overrides.skinfold_subscapular_mm ?? null,
    skinfold_chest_mm: overrides.skinfold_chest_mm ?? null,
    skinfold_midaxillary_mm: overrides.skinfold_midaxillary_mm ?? null,
    skinfold_suprailiac_mm: overrides.skinfold_suprailiac_mm ?? null,
    skinfold_abdominal_mm: overrides.skinfold_abdominal_mm ?? null,
    skinfold_thigh_mm: overrides.skinfold_thigh_mm ?? null,
    body_density_g_ml: overrides.body_density_g_ml ?? null,
    fat_mass_kg: overrides.fat_mass_kg ?? null,
    lean_mass_kg: overrides.lean_mass_kg ?? null,
    blood_pressure: null,
    energy_level: null,
    appetite: null,
    bowel_pattern: null,
    sleep_quality: null,
    symptoms: overrides.symptoms ?? null,
    adherence_notes: null,
    adherence_score: null,
    progress_notes: null,
    conduct_notes: null,
    clinical_impression: null,
    next_steps: null,
    created_at: overrides.created_at ?? overrides.measured_at ?? "2026-08-23T12:00:00.000Z",
    updated_at: overrides.updated_at ?? overrides.created_at ?? overrides.measured_at ?? "2026-08-23T12:00:00.000Z",
  };
}

const golden = [
  evolution({ id: "jun", measured_at: "2026-06-01T12:00:00.000Z", weight: 72.0, bmi: 25.5, waist_cm: 88, body_fat_percentage: 30.0 }),
  evolution({ id: "jul", measured_at: "2026-07-15T12:00:00.000Z", weight: 70.0, bmi: 24.8, waist_cm: 85, body_fat_percentage: 29.2 }),
  evolution({ id: "aug", measured_at: "2026-08-23T12:00:00.000Z", weight: 68.4, bmi: 24.2, waist_cm: 82, body_fat_percentage: 27.4 }),
];

describe("PatientAnthropometryProgressViewModel", () => {
  it("identifica latest, previous, first e deltas golden", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [golden[1], golden[2], golden[0]]);

    expect(vm.latestAssessment?.id).toBe("aug");
    expect(vm.previousAssessment?.id).toBe("jul");
    expect(vm.firstAssessment?.id).toBe("jun");
    expect(vm.changes.currentVsPrevious).toMatchObject({
      weightChangeKg: -1.6,
      waistChangeCm: -3,
      bodyFatChangePercentagePoints: -1.8,
    });
    expect(vm.changes.currentVsFirst).toMatchObject({
      weightChangeKg: -3.6,
      waistChangeCm: -6,
      bodyFatChangePercentagePoints: -2.6,
    });
  });

  it("ordena a serie do grafico em ordem cronologica", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [golden[2], golden[0], golden[1]]);

    expect(vm.trendSeries.map((point) => point.assessmentId)).toEqual(["jun", "jul", "aug"]);
  });

  it("nao transforma missing data em zero", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [
      ...golden,
      evolution({ id: "missing-waist", measured_at: "2026-09-01T12:00:00.000Z", weight: 68, waist_cm: null }),
    ]);

    expect(vm.latestAssessment?.waistCm).toBeNull();
    expect(vm.trendSeries.at(-1)?.waistCm).toBeNull();
    expect(vm.changes.currentVsPrevious?.waistChangeCm).toBeNull();
  });

  it("nao cria delta falso para avaliacao unica", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [golden[0]]);

    expect(vm.latestAssessment?.id).toBe("jun");
    expect(vm.previousAssessment).toBeNull();
    expect(vm.changes.currentVsPrevious).toBeNull();
    expect(vm.changes.currentVsFirst).toBeNull();
  });

  it("retorna estado vazio sem assessment", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", []);

    expect(vm.latestAssessment).toBeNull();
    expect(vm.assessmentHistory).toEqual([]);
    expect(vm.availableMetrics).toEqual([]);
  });

  it("omite evolucoes sem medida antropometrica valida", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [
      evolution({ id: "notes-only", measured_at: "2026-08-01T12:00:00.000Z", height: null, symptoms: "Sem medida" }),
    ]);

    expect(vm.assessmentHistory).toEqual([]);
  });

  it("rotula protocolo somente quando as 7 dobras existem", () => {
    const vm = buildPatientAnthropometryProgressViewModel("patient-p5", [
      evolution({
        id: "skinfolds",
        measured_at: "2026-08-23T12:00:00.000Z",
        weight: 68.4,
        skinfold_triceps_mm: 20,
        skinfold_subscapular_mm: 18,
        skinfold_chest_mm: 15,
        skinfold_midaxillary_mm: 17,
        skinfold_suprailiac_mm: 22,
        skinfold_abdominal_mm: 25,
        skinfold_thigh_mm: 23,
      }),
    ]);

    expect(vm.latestAssessment?.protocolLabel).toBe("Jackson & Pollock 7 dobras + Siri");
  });

  it("calcula diferencas deterministicas sem interpretar melhor ou pior", () => {
    const current = { id: "current", weightKg: 68.4, waistCm: 82, bodyFatPercentage: 27.4, bmi: 24.2, leanMassKg: null } as PatientAnthropometryAssessment;
    const baseline = { id: "baseline", weightKg: 70, waistCm: 85, bodyFatPercentage: 29.2, bmi: 24.8, leanMassKg: null } as PatientAnthropometryAssessment;

    expect(buildAnthropometryChangeSet(current, baseline)).toEqual({
      fromAssessmentId: "baseline",
      toAssessmentId: "current",
      weightChangeKg: -1.6,
      waistChangeCm: -3,
      bodyFatChangePercentagePoints: -1.8,
      bmiChange: -0.6,
      leanMassChangeKg: null,
    });
  });
});
