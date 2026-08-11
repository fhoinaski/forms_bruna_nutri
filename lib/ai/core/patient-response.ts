import type { ProposedAction } from "@/lib/ai/schemas/action.schema";
import type {
  GetMyMealPlanOutput,
  GetMyMealDetailsOutput,
  GetMyAppointmentsOutput,
  GetMyTasksOutput,
  SearchAllowedFoodAlternativesOutput,
  PatientPortalSection,
} from "@/lib/ai/agents/patient/patient-portal-agent";
import type { PatientAvailableSlotsResult } from "@/lib/ai/agents/patient/patient-scheduling-agent";
import type { GetMyRequestsOutput } from "@/lib/ai/agents/patient/patient-request-agent";

/**
 * Envelope de resposta do PATIENT_ASSISTANT — tipo PROPRIO, independente de
 * lib/ai/core/ai-response.ts (admin). Mesmo espírito (facts determinísticos
 * separados de texto livre), mas os tipos de fact são os do domínio do
 * paciente, não os do domínio administrativo.
 */
export interface PatientAssistantOption {
  id: string;
  label: string;
}

export interface PatientAssistantNavigationResult {
  section: PatientPortalSection;
}

export type PatientAssistantFactsPayload =
  | { type: "meal_plan"; data: GetMyMealPlanOutput }
  | { type: "meal_detail"; data: GetMyMealDetailsOutput }
  | { type: "appointments"; data: GetMyAppointmentsOutput }
  | { type: "tasks"; data: GetMyTasksOutput }
  | { type: "food_alternatives"; data: SearchAllowedFoodAlternativesOutput }
  | { type: "available_slots"; data: PatientAvailableSlotsResult }
  | { type: "my_requests"; data: GetMyRequestsOutput };

export interface PatientAssistantResponseEnvelope {
  message: string;
  proposedAction?: ProposedAction;
  navigation?: PatientAssistantNavigationResult;
  options?: PatientAssistantOption[];
  warnings?: string[];
  facts?: PatientAssistantFactsPayload;
}

export interface PatientChatHttpResponse {
  reply: string;
  proposedUpdate?: Record<string, unknown>;
  navigateAction?: PatientAssistantNavigationResult;
  options?: PatientAssistantOption[];
  warnings?: string[];
  facts?: PatientAssistantFactsPayload;
}

export function toPatientChatResponse(envelope: PatientAssistantResponseEnvelope): PatientChatHttpResponse {
  return {
    reply: envelope.message,
    proposedUpdate: envelope.proposedAction as unknown as Record<string, unknown> | undefined,
    navigateAction: envelope.navigation,
    options: envelope.options?.length ? envelope.options : undefined,
    warnings: envelope.warnings?.length ? envelope.warnings : undefined,
    facts: envelope.facts,
  };
}
