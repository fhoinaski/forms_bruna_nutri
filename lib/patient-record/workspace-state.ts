import type { PatientRecordSummaryViewModel } from "@/lib/repositories/patient-record-summary";

export type PatientWorkspaceActionKind = "consultation" | "assessment" | "meal-plan" | "appointment";

export interface PatientWorkspaceAction {
  kind: PatientWorkspaceActionKind;
  label: string;
  description: string;
}

export interface PatientWorkspaceState {
  consultation: PatientWorkspaceAction;
  assessment: PatientWorkspaceAction;
  mealPlan: PatientWorkspaceAction;
  nextBestAction: PatientWorkspaceAction;
  secondaryActions: PatientWorkspaceAction[];
}

/**
 * Pure, deterministic presentation state for the patient workspace. Keeping
 * this decision here prevents competing CTAs from reappearing in each card.
 */
export function getPatientWorkspaceState(summary: PatientRecordSummaryViewModel): PatientWorkspaceState {
  const consultation: PatientWorkspaceAction = summary.activeConsultation
    ? { kind: "consultation", label: "Continuar consulta", description: "Há uma consulta clínica em andamento." }
    : summary.latestConsultation
      ? { kind: "consultation", label: "Iniciar consulta", description: "Inicie um novo atendimento clínico." }
      : { kind: "consultation", label: "Iniciar primeira consulta", description: "O paciente ainda não possui consultas registradas." };

  const mealPlan: PatientWorkspaceAction = summary.draftMealPlan
    ? { kind: "meal-plan", label: "Continuar plano", description: `Rascunho v${summary.draftMealPlan.version} em andamento.` }
    : summary.activeMealPlan
      ? { kind: "meal-plan", label: "Abrir plano", description: `Plano ativo · v${summary.activeMealPlan.version}.` }
      : { kind: "meal-plan", label: "Criar plano", description: "Nenhum plano alimentar ativo." };

  const assessment: PatientWorkspaceAction = {
    kind: "assessment",
    label: "Nova avaliação",
    description: summary.latestAnthropometry ? "Registre uma nova avaliação antropométrica." : "Ainda não há avaliação antropométrica registrada.",
  };
  const appointment: PatientWorkspaceAction = {
    kind: "appointment",
    label: "Agendar retorno",
    description: "Ainda não há retorno agendado.",
  };

  // Priority: unfinished work > first consultation > missing assessment > draft plan > missing return.
  const nextBestAction = summary.activeConsultation
    ? consultation
    : !summary.latestConsultation
      ? consultation
      : !summary.latestAnthropometry
        ? assessment
        : summary.draftMealPlan
          ? mealPlan
          : !summary.nextAppointment
            ? appointment
            : consultation;

  const secondaryActions = [mealPlan, assessment].filter((action) => action.kind !== nextBestAction.kind);
  return { consultation, assessment, mealPlan, nextBestAction, secondaryActions };
}
