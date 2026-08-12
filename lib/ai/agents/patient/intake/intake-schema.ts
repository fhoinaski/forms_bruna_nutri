import { z } from "zod";
import { INTAKE_SECTION_IDS } from "@/lib/clinical/pre-consultation-fields";

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

export const IntakeSessionStateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "review", "completed", "expired", "fallback"]),
  currentSection: z.enum(INTAKE_SECTION_IDS as unknown as [string, ...string[]]).nullable(),
  currentField: z.string().max(80).nullable(),
  answers: z.record(z.string(), z.unknown()),
  completedFields: z.array(z.string()),
  missingRequiredFields: z.array(z.string()),
  clarification: z.object({ field: z.string(), reason: z.string() }).nullable(),
  editField: z.string().max(80).nullable(),
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