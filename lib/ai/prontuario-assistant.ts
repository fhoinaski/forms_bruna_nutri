import { z } from "zod";
import { NUTRITION_TEXT_FIELDS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";
import type { NutritionRecord } from "@/lib/repositories/nutrition-records";

export const PROPOSE_NUTRITION_RECORD_TOOL_NAME = "proposeNutritionRecordUpdate";

const proposalShape = Object.fromEntries(
  NUTRITION_TEXT_FIELDS.map((field) => [field.key, z.string().max(4000).optional()])
) as Record<NutritionRecordTextFieldKey, z.ZodOptional<z.ZodString>>;

export const proposeNutritionRecordInputSchema = z.object(proposalShape).strict();

export type ProposeNutritionRecordInput = z.infer<typeof proposeNutritionRecordInputSchema>;

/**
 * Contexto textual do prontuario atual, para a IA nao reescrever campos que
 * ja tem conteudo bom e para conseguir complementar em vez de duplicar.
 */
export function buildNutritionRecordContext(clientName: string, record: NutritionRecord | null): string {
  if (!record) return `Cliente: ${clientName}. Prontuario ainda sem registro nutricional criado.`;

  const filled = NUTRITION_TEXT_FIELDS
    .map((field) => {
      const value = record[field.key];
      return value?.trim() ? `- ${field.label}: ${value.trim()}` : null;
    })
    .filter(Boolean)
    .join("\n");

  return [
    `Cliente atual: ${clientName}.`,
    "Campos do prontuario ja preenchidos (nao repita nem contradiga sem necessidade, apenas complemente ou refine quando o relato trouxer informacao nova):",
    filled || "(nenhum campo de texto preenchido ainda)",
  ].join("\n");
}

export const PRONTUARIO_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode ajudar a preencher o prontuario nutricional do cliente que esta sendo visualizado no momento.
Quando a nutricionista descrever um caso, ditar observacoes ou pedir para organizar/atualizar o prontuario, use a ferramenta ${PROPOSE_NUTRITION_RECORD_TOOL_NAME} para propor valores.
Regras importantes:
- Preencha somente os campos para os quais o relato trouxe informacao clara. Nao invente dados clinicos, exames ou diagnosticos que nao foram mencionados.
- Nunca finalize a alteracao sozinha: a ferramenta apenas registra uma PROPOSTA. A propria interface vai mostrar cada campo para a nutricionista revisar, corrigir e confirmar antes de qualquer coisa ser salva.
- Quando um campo ja tiver conteudo, so proponha um novo valor se o relato acrescentar ou corrigir algo relevante; escreva o texto completo atualizado (o valor proposto substitui o campo, entao inclua o que deve ser mantido do conteudo anterior junto com o que for novo).
- Escreva em portugues, tom clinico e objetivo, como uma nutricionista registraria no proprio prontuario.
- Depois de chamar a ferramenta, responda tambem em texto avisando que preparou uma proposta e que ela pode revisar cada campo antes de aplicar.
`.trim();
