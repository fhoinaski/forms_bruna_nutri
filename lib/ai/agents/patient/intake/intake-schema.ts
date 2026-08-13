import { z } from "zod";
import { INTAKE_SECTION_IDS } from "@/lib/clinical/pre-consultation-fields";

export const INTAKE_TOPIC_IDS = [
  "welcome",
  "current_moment",
  "service_type",
  "identity",
  "health",
  "gestational",
  "postpartum",
  "pediatric",
  "bariatric",
  "routine",
  "nutrition",
  "expectations",
  "review",
] as const;

export const INTAKE_CONFIDENCE_VALUES = ["high", "medium", "low"] as const;

/**
 * Structured output do turno de intake. Este é o ÚNICO contrato que o
 * servidor aceita vindo da IA — nunca parsing de texto livre.
 *
 * `normalizedValue` é `unknown` de propósito: após o parse, o backend
 * re-valida contra o schema Zod do campo correspondente (intake-rules.ts),
 * então mesmo um valor "bem intencionado" do LLM só é persistido se passar
 * pela validação determinística do sistema.
 */
export const IntakeTurnSchema = z.object({
  assistantMessage: z.string().min(1).max(5000),
  field: z.string().min(1).max(80),
  outcome: z.enum(["answered", "needs_clarification", "skipped", "invalid", "request_edit"]),
  normalizedValue: z.unknown().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  clarificationQuestion: z.string().max(500).optional(),
  requestedEditField: z.string().max(80).optional(),
}).strict();

export type IntakeTurnParsed = z.infer<typeof IntakeTurnSchema>;

/**
 * Contrato de extração MULTI-CAMPO para UM tópico (§7). A chave `field` de
 * cada resposta extraída deve estar na allow-list fornecida pelo servidor;
 * o servidor re-valida cada campo contra o schema real e aplica a barreira
 * de confiança para campos sensíveis. A IA nunca escolhe chave arbitrária.
 */
export const IntakeTopicExtractionSchema = z.object({
  assistantText: z.string().min(1).max(800),
  extractedAnswers: z
    .array(
      z.object({
        field: z.string().min(1).max(80),
        value: z.unknown(),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .max(8)
    .default([]),
  clarification: z
    .object({
      required: z.boolean(),
      question: z.string().max(300).optional(),
    })
    .optional(),
}).strict();

export type IntakeTopicExtractionParsed = z.infer<typeof IntakeTopicExtractionSchema>;

export const IntakeSessionStateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "review", "completed", "expired", "fallback"]),
  currentSection: z.enum(INTAKE_SECTION_IDS as unknown as [string, ...string[]]).nullable(),
  currentField: z.string().max(80).nullable(),
  // `currentTopic` tolera ausência (sessões antigas) e normaliza para null
  // durante a hidratação no repositório — sem migração.
  currentTopic: z.enum(INTAKE_TOPIC_IDS as unknown as [string, ...string[]]).nullable().default(null),
  answers: z.record(z.string(), z.unknown()),
  completedFields: z.array(z.string()).default([]),
  completedSteps: z.array(z.string()).default([]),
  skippedSteps: z.array(z.string()).default([]),
  missingRequiredFields: z.array(z.string()).default([]),
  clarification: z.object({ field: z.string(), reason: z.string() }).nullable().default(null),
  editField: z.string().max(80).nullable().default(null),
  interactionCount: z.number().int().min(0).default(0),
  progress: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntakeSessionStateParsed = z.infer<typeof IntakeSessionStateSchema>;

/** Payload mínimo enviado ao provedor: campo atual + contexto restrito. */
export interface IntakePromptContext {
  fieldKey: string;
  fieldLabel: string;
  conversationalPrompt: string;
  fieldType: string;
  options: { value: string; label: string }[];
  required: boolean;
  sensitive: boolean;
  unit?: string | null;
  editField?: string | null;
  lastUserMessage?: string | null;
  /** Valores já coletados de campos que influenciam a exibição/validação. */
  relevantAnswers: Record<string, unknown>;
}