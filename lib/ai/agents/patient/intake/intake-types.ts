import type { IntakeFieldOption, IntakeSectionId } from "@/lib/clinical/pre-consultation-fields";

export type IntakeSessionStatus = "active" | "review" | "completed" | "expired" | "fallback";

export type IntakeConfidence = "high" | "medium" | "low";

export type IntakeOutcome = "answered" | "needs_clarification" | "skipped" | "invalid" | "request_edit";

/**
 * Grande tópico da entrevista. A unidade principal da experiência passou de
 * "campo" para "tópico/intenção de coleta" (§3 do produto). O servidor decide
 * o tópico atual; a IA apenas interpreta UM turno dentro do tópico autorizado.
 */
export type IntakeTopicId =
  | "welcome"
  | "current_moment"
  | "service_type"
  | "identity"
  | "health"
  | "gestational"
  | "postpartum"
  | "pediatric"
  | "bariatric"
  | "routine"
  | "nutrition"
  | "expectations"
  | "review";

/** Tipo de interação apresentada ao paciente (a UI apenas renderiza). */
export type IntakeInteractionKind =
  | "message"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "text"
  | "textarea"
  | "number"
  | "date";

/**
 * Estrutura tipada de UMA interação. A UI nunca decide "qual pergunta vem
 * agora" — ela apenas renderiza este objeto (§44/§45).
 */
export interface IntakeInteraction {
  kind: IntakeInteractionKind;
  topic: IntakeTopicId;
  /** Chave única do passo dentro do tópico (ex.: "motivo_inicial"). */
  stepKey: string;
  prompt: string;
  helperText?: string;
  unit?: string | null;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
  options?: IntakeFieldOption[];
  /** Opções de escape ("Não sei", "Prefiro conversar na consulta"...). */
  allowSkip?: boolean;
  skipLabel?: string;
  required?: boolean;
}

/** Saída do flow engine para o passo atual. `null` = nenhuma interação pendente. */
export interface IntakeNextInteraction {
  interaction: IntakeInteraction | null;
  /** Frase humana de transição entre tópicos (ex.: "Perfeito. Agora..."). */
  transitionMessage?: string | null;
  /** Completa quando todos os tópicos foram finalizados → revisão. */
  reviewReady: boolean;
}

/**
 * Estado estruturado da entrevista. O SERVIDOR é a fonte de verdade — a IA
 * nunca mantém memória de estado; ela apenas interpreta UM turno por vez.
 */
export interface IntakeSessionState {
  id: string;
  status: IntakeSessionStatus;
  currentSection: IntakeSectionId | null;
  currentField: string | null;
  /** Tópico atual da entrevista (nova unidade principal). */
  currentTopic: IntakeTopicId | null;
  answers: Record<string, unknown>;
  completedFields: string[];
  /** Passos já respondidos, no formato `${topicId}:${stepKey}`. */
  completedSteps: string[];
  /** Passos pulados pelo paciente (escape), formato `${topicId}:${stepKey}`. */
  skippedSteps: string[];
  missingRequiredFields: string[];
  clarification: { field: string; reason: string } | null;
  /** Campo que o paciente pediu para corrigir (allow-listed). */
  editField: string | null;
  /** Contador de interações principais (métrica §29). */
  interactionCount: number;
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

/**
 * Saída da extração multi-campo de UM tópico (§7). O servidor valida cada
 * `field` contra a allow-list do tópico E o schema real do campo antes de
 * persistir. A IA NUNCA escolhe uma chave arbitrária.
 */
export interface IntakeExtractedAnswer {
  field: string;
  value: unknown;
  confidence: IntakeConfidence;
}

export interface IntakeTopicExtractionResult {
  assistantText: string;
  extractedAnswers: IntakeExtractedAnswer[];
  clarification?: {
    required: boolean;
    question?: string;
  };
}