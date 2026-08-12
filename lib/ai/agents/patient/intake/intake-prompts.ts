import { wrapUntrustedData } from "@/lib/ai/privacy/sanitize-context";
import {
  getIntakeField,
  getSintomasOptions,
} from "@/lib/clinical/pre-consultation-fields";
import type { IntakePromptContext } from "@/lib/ai/agents/patient/intake/intake-schema";
import type { IntakeSessionState } from "@/lib/ai/agents/patient/intake/intake-types";

/** Versão do prompt de intake — usada para rastreabilidade/auditoria. */
export const INTAKE_PROMPT_VERSION = "v1";

export const INTAKE_SYSTEM_PROMPT = `
Você é o assistente de preenchimento da pré-consulta nutricional.

Sua única função é ajudar a pessoa a fornecer as informações previstas no questionário estruturado que o sistema entrega a você. Você é apenas a INTERFACE de coleta.

Você não é nutricionista, médico nem profissional responsável por conduta clínica.

Você nunca pode:
- diagnosticar ou sugerir diagnóstico;
- prescrever ou alterar qualquer tratamento;
- orientar iniciar/parar/aumentar/reduzir medicamentos;
- recomendar dose;
- substituir avaliação médica;
- dar conduta clínica;
- gerar plano alimentar;
- alterar prontuário ou qualquer outra área do sistema;
- decidir que um sintoma representa uma doença;
- inventar resposta que a pessoa não deu;
- preencher um campo com base em inferência incerta.

Se a pessoa mencionar sintomas ou condições não solicitadas, registre fielmente somente quando o sistema tiver fornecido um campo apropriado para isso. Nunca interprete sintomas como diagnóstico.

Se a pessoa relatar algo potencialmente grave, NÃO conduza atendimento médico. Diga apenas: "Essa informação é importante para a profissional responsável. Se você estiver apresentando sintomas intensos, piora importante ou considerar que precisa de atendimento imediato, procure um serviço de saúde."

Você recebe do sistema UM campo autorizado (ou um pedido de edição de campo) + a resposta imediatamente anterior da pessoa.

Você deve:
1. Perguntar de forma clara e acolhedora, em linguagem simples;
2. Aceitar linguagem natural;
3. Transformar a resposta em valor estruturado APENAS quando houver informação suficiente;
4. Pedir esclarecimento se necessário;
5. Nunca inventar dados;
6. Nunca preencher campos por suposição;
7. Respeitar estritamente as opções e o tipo fornecidos;
8. Devolver SOMENTE o JSON no formato solicitado, sem texto fora dele.

REGRA DE CONFIANÇA:
- Se o campo for marcado como sensível (sensitive = true) e sua confiança NÃO for "high", devolva outcome "needs_clarification" em vez de "answered". Nunca preencha silenciosamente um campo sensível com confiança baixa ou média.

Se a pessoa pedir para corrigir um campo anterior (ex.: "errei minha altura", "quero corrigir o medicamento"), devolva outcome "request_edit" com "requestedEditField" igual ao campo que ela quer corrigir. Se não ficar claro qual campo, use o campo atual.
`.trim();

// Frase de política médica sensível, determinística, usada quando aplicável.
export const INTAKE_MEDICAL_SAFETY_NOTICE =
  "Essa informação é importante para a profissional responsável. Se você estiver apresentando sintomas intensos, piora importante ou considerar que precisa de atendimento imediato, procure um serviço de saúde.";

/**
 * Monta o prompt de UM turno. Envia apenas o necessário (minimização de
 * dados): instrução + campo atual + regras do campo + resposta anterior +
 * valores relevantes para exibição/validação. Nunca o formulário inteiro,
 * nunca IDs de CRM, nunca dados administrativos.
 */
export function buildIntakePrompt(ctx: IntakePromptContext): string {
  const field = getIntakeField(ctx.fieldKey);
  const lines: string[] = [];

  lines.push("CAMPO ATUAL AUTORIZADO");
  lines.push(`- chave: ${ctx.fieldKey}`);
  lines.push(`- label: ${ctx.fieldLabel}`);
  lines.push(`- pergunta conversacional: ${ctx.conversationalPrompt}`);
  lines.push(`- tipo: ${ctx.fieldType}`);
  lines.push(`- obrigatorio: ${ctx.required ? "sim" : "nao"}`);
  lines.push(`- sensivel: ${ctx.sensitive ? "sim" : "nao"}`);
  if (ctx.unit) lines.push(`- unidade: ${ctx.unit}`);
  if (ctx.fieldKey === "sintomas") {
    const pedOptions = getSintomasOptions(ctx.relevantAnswers);
    lines.push(`- opcoes validas (exatas): ${pedOptions.map((option) => option.value).join(" | ")}`);
  } else if (field?.options?.length) {
    lines.push(`- opcoes validas (exatas): ${field.options.map((option) => option.value).join(" | ")}`);
  }

  if (ctx.editField) {
    lines.push("");
    lines.push(`A pessoa pediu para CORRIGIR o campo: ${ctx.editField}`);
  }

  if (ctx.lastUserMessage) {
    lines.push("");
    lines.push(
      wrapUntrustedData("RESPOSTA_DA_PESSOA", ctx.lastUserMessage)
    );
  }

  lines.push("");
  lines.push(
    "Devolva SOMENTE um JSON valido com: assistantMessage, field, outcome, normalizedValue (quando answered), confidence, clarificationQuestion (quando needs_clarification) e requestedEditField (quando request_edit)."
  );

  return lines.join("\n");
}

/**
 * Contexto mínimo relevante para o campo atual (respostas que influenciam
 * exibição/validação). Mantém o volume de dados enviado ao provedor mínimo.
 */
export function buildMinimalRelevantAnswers(state: IntakeSessionState, fieldKey: string): Record<string, unknown> {
  const keys = new Set<string>(["tipoAtendimento"]);
  if (["anticoncepcional", "gestante", "sintomas", "medicacao", "diagnostico"].includes(fieldKey)) {
    keys.add("tipoAtendimento");
  }
  const relevant: Record<string, unknown> = {};
  for (const key of keys) {
    if (state.answers[key] !== undefined) relevant[key] = state.answers[key];
  }
  return relevant;
}