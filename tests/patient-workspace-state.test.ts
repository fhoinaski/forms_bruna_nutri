import { describe, expect, it } from "vitest";
import { getPatientWorkspaceState } from "@/lib/patient-record/workspace-state";
import type { PatientRecordSummaryViewModel } from "@/lib/repositories/patient-record-summary";

function summary(overrides: Partial<PatientRecordSummaryViewModel> = {}): PatientRecordSummaryViewModel {
  return {
    patient: { id: "p1", name: "Paciente", birthDate: null, ageYears: null, status: "ativo", statusLabel: "Acompanhamento ativo", primaryGoal: null },
    latestConsultation: null, activeConsultation: null, nextAppointment: null,
    latestAnthropometry: null, previousAnthropometry: null, weightTrend: null, weightSeries: [],
    activeMealPlan: null, draftMealPlan: null, keyRestrictions: [], activeProtocols: [], activeSupplements: [], pendingActions: [],
    ...overrides,
  };
}

describe("getPatientWorkspaceState", () => {
  const consultation = { id: "c", date: "2026-08-01", type: null, status: "completed", href: "/consulta" };
  const assessment = { date: "2026-08-01", weightKg: 68, bmi: 24, waistCm: null, bodyFatPercent: null };
  const draft = { planId: "d", versionId: "d:v1", version: 1, title: "Rascunho", versionedAt: null };
  const active = { planId: "a", versionId: "a:v2", version: 2, title: "Ativo", publishedAt: null };

  it.each([
    ["A: paciente novo", {}, "consultation", "Iniciar primeira consulta", "Criar plano"],
    ["B: primeira consulta disponível", {}, "consultation", "Iniciar primeira consulta", "Criar plano"],
    ["C: consulta em andamento", { activeConsultation: { id: "c1", startedAt: "2026-08-01", href: "/consulta" } }, "consultation", "Continuar consulta", "Criar plano"],
    ["D: consulta concluída sem avaliação", { latestConsultation: consultation }, "assessment", "Nova avaliação", "Criar plano"],
    ["E/F: avaliação existente sem plano", { latestConsultation: consultation, latestAnthropometry: assessment }, "appointment", "Agendar retorno", "Criar plano"],
    ["G: plano em rascunho", { latestConsultation: consultation, latestAnthropometry: assessment, draftMealPlan: draft }, "meal-plan", "Continuar plano", "Continuar plano"],
    ["H: plano ativo", { latestConsultation: consultation, latestAnthropometry: assessment, activeMealPlan: active }, "appointment", "Agendar retorno", "Abrir plano"],
    ["I: retorno não agendado", { latestConsultation: consultation, latestAnthropometry: assessment }, "appointment", "Agendar retorno", "Criar plano"],
    ["J: retorno agendado", { latestConsultation: consultation, latestAnthropometry: assessment, nextAppointment: { id: "a", title: "Retorno", date: "2026-09-01", type: null, status: "agendado", href: "/agenda" } }, "consultation", "Iniciar consulta", "Criar plano"],
    ["K: restrição ativa", { keyRestrictions: [{ id: "r", type: "ALLERGY", label: "Leite", severity: "severe", source: "manual" }] }, "consultation", "Iniciar primeira consulta", "Criar plano"],
    ["L: protocolo ativo", { activeProtocols: [{ id: "p", protocolId: "p", title: "Protocolo", status: "ativo", startedAt: "2026-08-01", reviewDate: null, phaseCount: 1 }] }, "consultation", "Iniciar primeira consulta", "Criar plano"],
    ["M: suplementação ativa", { activeSupplements: [{ id: "s", name: "D", dosage: null, unit: null }] }, "consultation", "Iniciar primeira consulta", "Criar plano"],
    ["N: plano, retorno e avaliação", { latestConsultation: consultation, latestAnthropometry: assessment, activeMealPlan: active, nextAppointment: { id: "a", title: "Retorno", date: "2026-09-01", type: null, status: "agendado", href: "/agenda" } }, "consultation", "Iniciar consulta", "Abrir plano"],
  ])("%s", (_name, overrides, primaryKind, primaryLabel, mealPlanLabel) => {
    const state = getPatientWorkspaceState(summary(overrides));
    expect(state.nextBestAction).toMatchObject({ kind: primaryKind, label: primaryLabel });
    expect(state.mealPlan.label).toBe(mealPlanLabel);

    // Render contract: one primary and no secondary action with the same intent.
    expect(state.secondaryActions.filter((action) => action.kind === state.nextBestAction.kind)).toHaveLength(0);
    expect(new Set([state.nextBestAction.kind, ...state.secondaryActions.map((action) => action.kind)]).size)
      .toBe(1 + state.secondaryActions.length);
  });
});
