import { z } from "zod";
import { getClientById } from "@/lib/repositories/clients";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getClientTasks, createClientTasksBatch } from "@/lib/repositories/client-tasks";
import { listPatientRequests } from "@/lib/repositories/patient-requests";
import { getClientEvolutions, type ClientEvolution } from "@/lib/repositories/client-evolutions";
import { calculateWeightDelta } from "@/lib/clinical/anthropometry";
import { buildConsultationSystemData, generateConsultationAiBrief, sanitizeConsultationSystemDataForAi } from "@/lib/ai/agents/clinical/consultation-briefing";
import { assertCategoryAllowed } from "@/lib/ai/policies/clinical-context-policy";
import { sanitizePatientFreeTextForToolOutput } from "@/lib/ai/privacy/sanitize-context";

/**
 * Tools novas do Modo Consulta (FASE 1). Seguem o MESMO padrao ja
 * estabelecido para tools de leitura do admin (ex.:
 * evolution-summary-agent.ts): `clientId` vem do proprio tool-call do
 * modelo (nunca de closure/ambient state) porque sao tools "read" — o admin
 * ja tem permissao ampla de consultar qualquer paciente seu, mesmo
 * principio de findClient/getClientEvolutionSummary. A garantia real de
 * autorizacao esta nas acoes CLINICAS (propose_*), cujo clientId nunca vem
 * do modelo — sempre do contexto ambiente resolvido pelo servidor
 * (ProposalBuilderContext.clientId, mesmo padrao de nutrition_record/
 * meal_plan_change/client_protocol).
 *
 * Reaproveitamento: substituicao de alimento e organizacao de notas em
 * campos do prontuario NAO ganham tool nova aqui — reusam
 * proposeMealPlanChangeInputSchema/PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME e
 * proposeNutritionRecordInputSchema/PROPOSE_NUTRITION_RECORD_TOOL_NAME ja
 * existentes (mesmo tool registry, mesmo builder, mesmo handler) — so
 * ganham instrucoes de prompt adicionais no modo consulta.
 */

const clientIdInputSchema = z.object({ clientId: z.string().min(1).max(120) }).strict();

// ── get_consultation_brief ───────────────────────────────────────────────

export const GET_CONSULTATION_BRIEF_TOOL_NAME = "getConsultationBrief";
export const getConsultationBriefInputSchema = clientIdInputSchema;
export type GetConsultationBriefInput = z.infer<typeof getConsultationBriefInputSchema>;

/**
 * FASE 2B: `systemData` (canonico, com texto livre cru) tambem alimenta a
 * rota REST que renderiza a UI do Modo Consulta
 * (app/api/admin/consultation-sessions/[id]/brief/route.ts) — nunca
 * alterado aqui. O que VAI para o LLM principal (resultado desta tool) e
 * `sanitizeConsultationSystemDataForAi(systemData)`, uma view separada com
 * os 3 campos de texto livre sem estrutura equivalente
 * (progressNotes/conductNotes/symptoms) truncados + PII redigida — nunca o
 * objeto UI. `aiBrief` ja passava por `sanitizeClinicalContext` internamente
 * (generateConsultationAiBrief), sem mudanca aqui.
 */
export async function executeGetConsultationBrief(input: GetConsultationBriefInput, adminId?: string | null) {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false as const };
  const systemData = await buildConsultationSystemData(client);
  const aiBrief = await generateConsultationAiBrief(client, systemData, adminId);
  return { found: true as const, systemData: sanitizeConsultationSystemDataForAi(systemData), aiBrief };
}

// ── get_active_meal_plan ─────────────────────────────────────────────────

export const GET_ACTIVE_MEAL_PLAN_TOOL_NAME = "getActiveMealPlanForConsultation";
export const getActiveMealPlanForConsultationInputSchema = clientIdInputSchema;
export type GetActiveMealPlanForConsultationInput = z.infer<typeof getActiveMealPlanForConsultationInputSchema>;

export async function executeGetActiveMealPlanForConsultation(input: GetActiveMealPlanForConsultationInput) {
  assertCategoryAllowed("meal_plan_review", "meal_plan");
  const plan = await getActiveMealPlan(input.clientId);
  if (!plan) return { found: false as const };
  return {
    found: true as const,
    mealPlanId: plan.id,
    title: plan.title,
    version: plan.version,
    status: plan.status,
    meals: plan.meals.map((meal) => ({
      mealId: meal.id,
      name: meal.name,
      suggestedTime: meal.suggested_time,
      items: meal.items.map((item) => ({ itemId: item.id, food: item.food, quantity: item.quantity, unit: item.unit })),
    })),
  };
}

// ── get_active_protocol ──────────────────────────────────────────────────

export const GET_ACTIVE_PROTOCOL_TOOL_NAME = "getActiveProtocolForConsultation";
export const getActiveProtocolForConsultationInputSchema = clientIdInputSchema;
export type GetActiveProtocolForConsultationInput = z.infer<typeof getActiveProtocolForConsultationInputSchema>;

export async function executeGetActiveProtocolForConsultation(input: GetActiveProtocolForConsultationInput) {
  assertCategoryAllowed("protocol_review", "protocol");
  const protocols = await getClientProtocols(input.clientId);
  const active = protocols.find((protocol) => protocol.status === "ativo" || protocol.status === "pausado");
  if (!active) return { found: false as const };
  return {
    found: true as const,
    clientProtocolId: active.id,
    title: active.protocol_title ?? null,
    status: active.status,
    phaseCount: active.phase_count ?? 0,
    taskCount: active.task_count ?? 0,
    completedTaskCount: active.completed_task_count ?? 0,
    reviewDate: active.review_date,
    // FASE 2B: notas do protocolo sao texto livre sem equivalente
    // estruturado — trunca + redige PII antes de virar resultado de tool.
    professionalNotes: active.professional_notes ? sanitizePatientFreeTextForToolOutput(active.professional_notes).text : null,
  };
}

// ── get_pending_patient_items ────────────────────────────────────────────

export const GET_PENDING_PATIENT_ITEMS_TOOL_NAME = "getPendingPatientItems";
export const getPendingPatientItemsInputSchema = clientIdInputSchema;
export type GetPendingPatientItemsInput = z.infer<typeof getPendingPatientItemsInputSchema>;

export async function executeGetPendingPatientItems(input: GetPendingPatientItemsInput) {
  const [tasks, patientRequests] = await Promise.all([
    getClientTasks(input.clientId, { status: "pendente" }),
    listPatientRequests({ clientId: input.clientId, status: "pending_review" }),
  ]);
  return {
    tasks: tasks.map((task) => ({ taskId: task.id, title: task.title, dueDate: task.due_date })),
    patientRequests: patientRequests.map((request) => ({
      requestId: request.id,
      requestType: request.request_type,
      summary: (request.ai_summary ?? request.patient_text).slice(0, 200),
    })),
  };
}

// ── compare_anthropometry ────────────────────────────────────────────────

export const COMPARE_ANTHROPOMETRY_TOOL_NAME = "compareAnthropometry";
export const compareAnthropometryInputSchema = clientIdInputSchema;
export type CompareAnthropometryInput = z.infer<typeof compareAnthropometryInputSchema>;

interface AnthropometryFieldComparison {
  current: number | null;
  previous: number | null;
  deltaAbsolute: number | null;
}

function compareNumericField(current: number | null, previous: number | null): AnthropometryFieldComparison {
  return {
    current,
    previous,
    deltaAbsolute: current !== null && previous !== null ? Math.round((current - previous) * 10) / 10 : null,
  };
}

/** Diff puramente determinístico entre as duas medidas mais recentes — nunca calculado pela IA (secao 9 do pedido). */
export async function executeCompareAnthropometry(input: CompareAnthropometryInput) {
  assertCategoryAllowed("weight_evolution", "anthropometry");
  const evolutions: ClientEvolution[] = await getClientEvolutions(input.clientId);
  const measured = evolutions
    .filter((evolution) => evolution.measured_at)
    .sort((a, b) => new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime());

  const current = measured[0] ?? null;
  const previous = measured[1] ?? null;
  if (!current) return { found: false as const };

  return {
    found: true as const,
    currentDate: current.measured_at,
    previousDate: previous?.measured_at ?? null,
    weightKg: {
      current: current.weight,
      previous: previous?.weight ?? null,
      deltaAbsolute: calculateWeightDelta(current.weight, previous?.weight),
    },
    waistCm: compareNumericField(current.waist_cm, previous?.waist_cm ?? null),
    bodyFatPercentage: compareNumericField(current.body_fat_percentage, previous?.body_fat_percentage ?? null),
    bmi: compareNumericField(current.bmi, previous?.bmi ?? null),
  };
}

// ── propose_consultation_tasks_batch (clinical) ──────────────────────────

export const PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME = "proposeConsultationTasksBatch";

export const consultationTaskItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});

export const proposeConsultationTasksBatchInputSchema = z.object({
  tasks: z.array(consultationTaskItemSchema).min(1).max(10),
}).strict();
export type ProposeConsultationTasksBatchInput = z.infer<typeof proposeConsultationTasksBatchInputSchema>;

// ── propose_consultation_summary (clinical) ──────────────────────────────

export const PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME = "proposeConsultationSummary";

export const consultationSummaryContentSchema = z.object({
  summary: z.string().min(1).max(1500),
  evolution: z.string().max(800).optional(),
  conduct: z.string().max(800).optional(),
  plan: z.string().max(800).optional(),
  goals: z.string().max(500).optional(),
  nextSteps: z.string().max(500).optional(),
});

export const proposeConsultationSummaryInputSchema = z.object({
  content: consultationSummaryContentSchema,
}).strict();
export type ProposeConsultationSummaryInput = z.infer<typeof proposeConsultationSummaryInputSchema>;

// ── instrucoes de prompt (modo consulta) ─────────────────────────────────

export const CONSULTATION_ASSISTANT_INSTRUCTIONS = `
Voce esta atuando dentro do Modo Consulta — um workspace clinico unico para a nutricionista atender sem sair da tela. O paciente atual ja esta identificado no contexto (id fornecido acima).
Ferramentas de leitura disponiveis (sempre passe o clientId do paciente atual, exatamente como informado no contexto):
- ${GET_CONSULTATION_BRIEF_TOOL_NAME}: resumo de preparação para a consulta (dados do sistema + interpretação da IA quando disponível). Use quando pedirem para "preparar a consulta", "resumir o histórico".
- ${GET_ACTIVE_MEAL_PLAN_TOOL_NAME}: plano alimentar ativo com ids reais de refeição/item.
- ${GET_ACTIVE_PROTOCOL_TOOL_NAME}: protocolo ativo e progresso.
- ${GET_PENDING_PATIENT_ITEMS_TOOL_NAME}: tarefas e solicitações pendentes da paciente.
- ${COMPARE_ANTHROPOMETRY_TOOL_NAME}: comparação Atual/Anterior/Diferença de peso, cintura, gordura corporal e IMC — SEMPRE use esta ferramenta para esse tipo de pergunta, nunca calcule a diferença você mesma.

Notas rápidas da consulta e prontuário:
- Quando a nutricionista escrever notas livres da consulta e pedir para "organizar as notas"/"estruturar isso", use a ferramenta de proposta de prontuário (a mesma já disponível para o prontuário) mapeando o conteúdo para os campos apropriados — sintomas/queixas para "Sinais gastrointestinais" ou "Sinais de atenção", alimentação/rotina para "Rotina alimentar", adesão/avaliação para "Avaliação nutricional", conduta/orientações para "Plano de cuidado e conduta", metas para "Metas antropométricas e clínicas". Preencha só os campos com informação clara na nota — nunca invente.
- Isso é sempre uma PROPOSTA — a nutricionista revisa e confirma cada campo antes de qualquer coisa ser salva no prontuário.

Plano alimentar: use a ferramenta de proposta de alteração de plano já disponível (a mesma da revisão de dieta) para qualquer troca/ajuste concreto pedido durante a consulta — sempre mostra antes/depois e exige confirmação.

Ações de fim de consulta:
- ${PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME}: quando a nutricionista pedir para criar várias tarefas de uma vez (ex.: pacote de ações pós-consulta), proponha a lista completa numa única chamada — isto é uma proposta, nunca cria as tarefas sozinha.
- ${PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME}: quando pedirem para "gerar o resumo da consulta", monte o resumo APENAS com o que foi de fato discutido/decidido nesta consulta (notas, alterações confirmadas, condutas). Nunca invente uma decisão que não foi tomada. Isto também é uma proposta — precisa de confirmação antes de ser salva na sessão de consulta.

Protocolo: você pode LER o protocolo ativo e comentar sobre fase/progresso, mas qualquer sugestão de revisão vira uma proposta de atualização de notas do protocolo (a mesma ferramenta já usada na aba de protocolos) — nunca avance uma fase clínica sozinha.
`.trim();
