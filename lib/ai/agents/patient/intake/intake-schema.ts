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
 *
 * Schema mantido compatível com JSON Schema para permitir structured output
 * nativo (`generateObject`). A "tolerância de formatação" (capitalização de
 * confidence, chaves extras, clarificação nula) fica em
 * `normalizeTopicExtractionJson`, aplicada apenas no caminho textual de
 * fallback — nunca no conteúdo clínico.
 */
export const INTAKE_EXTRACTION_SCHEMA_VERSION = "2";

export const IntakeTopicExtractionSchema = z.object({
  assistantText: z.string().max(800).default(""),
  extractedAnswers: z
    .array(
      z.object({
        field: z.string().min(1).max(80),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
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
    .nullish(),
});

export type IntakeTopicExtractionParsed = z.infer<typeof IntakeTopicExtractionSchema>;

/** Normalização técnica de enums (não transforma valores clínicos). */
export function normalizeConfidence(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase().trim();
  if (["alta", "alto", "high"].includes(normalized)) return "high";
  if (["media", "média", "medio", "medium"].includes(normalized)) return "medium";
  if (["baixa", "baixo", "low"].includes(normalized)) return "low";
  return normalized;
}

/**
 * Normaliza a saída crua do modelo (caminho textual) ANTES do `safeParse`:
 * remove chaves extras (ex.: `reasoning`), tolera `assistantText` vazio e
 * `clarification: null`, e normaliza confidence. NÃO persiste nada — só
 * prepara para validação.
 */
export function normalizeTopicExtractionJson(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;

  const out: Record<string, unknown> = {
    assistantText: typeof obj.assistantText === "string" ? obj.assistantText : "",
    extractedAnswers: Array.isArray(obj.extractedAnswers)
      ? obj.extractedAnswers
          .slice(0, 8)
          .map((answer) => {
            if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
            const item = answer as Record<string, unknown>;
            if (typeof item.field !== "string" || item.field.length === 0) return null;
            return {
              field: item.field.slice(0, 80),
              value: item.value ?? null,
              confidence: normalizeConfidence(item.confidence),
            };
          })
          .filter((item) => item !== null)
      : [],
  };

  const clarification = obj.clarification;
  if (clarification && typeof clarification === "object" && !Array.isArray(clarification)) {
    const c = clarification as Record<string, unknown>;
    out.clarification = {
      required: c.required === true || c.required === "true",
      question: typeof c.question === "string" ? c.question : undefined,
    };
  }

  return out;
}

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