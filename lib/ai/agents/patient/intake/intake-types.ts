import type { IntakeSectionId } from "@/lib/clinical/pre-consultation-fields";

export type IntakeSessionStatus = "active" | "review" | "completed" | "expired" | "fallback";

export type IntakeConfidence = "high" | "medium" | "low";

export type IntakeOutcome = "answered" | "needs_clarification" | "skipped" | "invalid" | "request_edit";

/**
 * Estado estruturado da entrevista. O SERVIDOR é a fonte de verdade — a IA
 * nunca mantém memória de estado; ela apenas interpreta UM turno por vez.
 */
export interface IntakeSessionState {
  id: string;
  status: IntakeSessionStatus;
  currentSection: IntakeSectionId | null;
  currentField: string | null;
  answers: Record<string, unknown>;
  completedFields: string[];
  missingRequiredFields: string[];
  clarification: { field: string; reason: string } | null;
  /** Campo que o paciente pediu para corrigir (allow-listed). */
  editField: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeContext {
  /** Campo autorizado que o sistema está perguntando neste turno. */
  field: string;
  /** Campo em edição (quando o paciente pediu correção). */
  editField?: string | null;
  /** Resposta imediatamente anterior do paciente (não confiável, apenas dado). */
  lastUserMessage?: string | null;
}

export interface IntakeTurnResult {
  assistantMessage: string;
  field: string | null;
  outcome: IntakeOutcome;
  normalizedValue: unknown;
  confidence: IntakeConfidence;
  clarificationQuestion?: string;
  requestedEditField?: string;
}