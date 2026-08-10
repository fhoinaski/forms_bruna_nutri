import { z } from "zod";

/**
 * Valida a saida do protocol-agent (rascunho de conduta nutricional gerado
 * por IA). Antes desta migracao, o codigo fazia
 * `JSON.parse(jsonStr) as ProtocolDraftOutput` sem nenhuma validacao — uma
 * resposta malformada do LLM criava um draft corrompido em produção sem
 * nenhum aviso. Agora, `safeParse` decide se o rascunho e usavel antes de
 * ele ser persistido em ai_protocol_drafts.
 */
export const protocolPhaseSchema = z.object({
  title: z.string().min(1),
  days: z.string().min(1),
  objective: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1),
  notes: z.string(),
});

export const protocolTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  dueInDays: z.number().int(),
});

export const protocolDraftOutputSchema = z.object({
  title: z.string().min(1),
  caseSummary: z.string().min(1),
  mainGoals: z.array(z.string().min(1)).min(1),
  attentionPoints: z.array(z.string().min(1)).min(1),
  suggestedProtocol: z.object({
    durationDays: z.number().int().positive(),
    phases: z.array(protocolPhaseSchema).min(1),
  }),
  tasks: z.array(protocolTaskSchema),
  followUpQuestions: z.array(z.string()),
  educationalMaterials: z.array(z.string()),
  safetyNotes: z.array(z.string()).min(1),
  professionalReviewNotes: z.string(),
  generatedWithoutExternalAi: z.boolean().optional(),
});

export type ProtocolDraftOutput = z.infer<typeof protocolDraftOutputSchema>;
