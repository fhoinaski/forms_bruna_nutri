import type { ToolSet } from "ai";
import type { z } from "zod";
import type { ToolRisk } from "@/lib/ai/policies/action-policy";
import type { AssistantCapabilityProfile } from "@/lib/ai/policies/permissions";
import { isProfileAllowed } from "@/lib/ai/policies/permissions";
import type { AgentDomain, ToolEntityType } from "@/lib/ai/tools/capability-types";

import {
  FIND_CLIENT_TOOL_NAME,
  NAVIGATE_TOOL_NAME,
  executeFindClient,
  findClientInputSchema,
  navigateInputSchema,
} from "@/lib/ai/agents/navigation/navigation-agent";
import {
  GET_SYSTEM_OVERVIEW_TOOL_NAME,
  LIST_OPPORTUNITIES_TOOL_NAME,
  executeGetSystemOverview,
  executeListOpportunities,
  getSystemOverviewInputSchema,
  listOpportunitiesInputSchema,
} from "@/lib/ai/agents/system/system-overview-agent";
import {
  PROPOSE_NEW_APPOINTMENT_TOOL_NAME,
  proposeNewAppointmentInputSchema,
} from "@/lib/ai/agents/appointments/appointment-agent";
import {
  PROPOSE_NEW_TASK_TOOL_NAME,
  proposeNewClientTaskInputSchema,
} from "@/lib/ai/agents/appointments/task-agent";
import {
  PROPOSE_NUTRITION_RECORD_TOOL_NAME,
  proposeNutritionRecordInputSchema,
} from "@/lib/ai/agents/clinical/prontuario-agent";
import {
  PROPOSE_PRE_ANALYSIS_TOOL_NAME,
  proposePreAnalysisInputSchema,
} from "@/lib/ai/pre-analysis-assistant";
import {
  PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME,
  proposeClientProtocolNotesInputSchema,
} from "@/lib/ai/client-protocol-assistant";
import {
  PROPOSE_NEW_CLIENT_TOOL_NAME,
  executeProposeNewClient,
  proposeNewClientInputSchema,
} from "@/lib/ai/agents/clients/client-creation-agent";
import {
  PROPOSE_NEW_RECIPE_TOOL_NAME,
  executeProposeNewRecipe,
  proposeNewRecipeInputSchema,
} from "@/lib/ai/agents/nutrition/recipe-creation-agent";
import {
  PROPOSE_NEW_PROTOCOL_TOOL_NAME,
  proposeNewClientProtocolInputSchema,
} from "@/lib/ai/agents/clinical/protocol-creation-agent";
import {
  PROPOSE_NEW_BLOG_POST_TOOL_NAME,
  proposeNewBlogPostInputSchema,
} from "@/lib/ai/agents/content/blog-creation-agent";
import {
  SEARCH_EDITORIAL_SOURCES_TOOL_NAME,
  searchEditorialSourcesInputSchema,
  executeSearchEditorialSources,
} from "@/lib/ai/research/editorial-sources";
import {
  GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME,
  executeGetPatientsWithPendenciesForDate,
  getPatientsWithPendenciesInputSchema,
} from "@/lib/ai/agents/appointments/schedule-lookup-agent";
import {
  GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME,
  executeGetClientEvolutionSummary,
  getClientEvolutionSummaryInputSchema,
} from "@/lib/ai/agents/clinical/evolution-summary-agent";
import {
  GET_AVAILABLE_SLOTS_TOOL_NAME,
  executeGetAvailableSlots,
  getAvailableSlotsInputSchema,
} from "@/lib/ai/agents/appointments/availability-lookup-agent";
import {
  SEARCH_MEAL_PLAN_FOODS_TOOL_NAME,
  PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME,
  GET_MEAL_PLAN_NUTRITION_TOOL_NAME,
  FIND_FOOD_EQUIVALENTS_TOOL_NAME,
  executeSearchMealPlanFoods,
  executeProposeMealPlanChange,
  executeGetMealPlanNutrition,
  executeFindFoodEquivalents,
  searchMealPlanFoodsInputSchema,
  proposeMealPlanChangeInputSchema,
  getMealPlanNutritionInputSchema,
  findFoodEquivalentsInputSchema,
} from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import {
  GET_MY_MEAL_PLAN_TOOL_NAME,
  GET_MY_MEAL_DETAILS_TOOL_NAME,
  GET_MY_APPOINTMENTS_TOOL_NAME,
  GET_MY_TASKS_TOOL_NAME,
  SEARCH_ALLOWED_FOOD_ALTERNATIVES_TOOL_NAME,
  NAVIGATE_PATIENT_PORTAL_TOOL_NAME,
  getMyMealPlanInputSchema,
  getMyMealDetailsInputSchema,
  getMyAppointmentsInputSchema,
  getMyTasksInputSchema,
  searchAllowedFoodAlternativesInputSchema,
  navigatePatientPortalInputSchema,
  executeNavigatePatientPortal,
} from "@/lib/ai/agents/patient/patient-portal-agent";
import {
  GET_MY_AVAILABLE_SLOTS_TOOL_NAME,
  REQUEST_APPOINTMENT_TOOL_NAME,
  getAvailableSlotsForSchedulingInputSchema,
  requestAppointmentInputSchema,
  executeGetAvailableSlotsForScheduling,
} from "@/lib/ai/agents/patient/patient-scheduling-agent";
import {
  REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME,
  GET_MY_REQUESTS_TOOL_NAME,
  requestProfessionalReviewInputSchema,
  getMyRequestsInputSchema,
} from "@/lib/ai/agents/patient/patient-request-agent";
import {
  GET_PATIENT_REQUESTS_TOOL_NAME,
  GET_PATIENT_REQUEST_DETAILS_TOOL_NAME,
  GET_PENDING_AI_PROPOSALS_TOOL_NAME,
  executeGetPatientRequests,
  executeGetPatientRequestDetails,
  executeGetPendingAiProposals,
  getPatientRequestsInputSchema,
  getPatientRequestDetailsInputSchema,
  getPendingAiProposalsInputSchema,
} from "@/lib/ai/agents/clients/patient-requests-agent";
import {
  GET_TODAY_APPOINTMENTS_TOOL_NAME,
  GET_NEXT_APPOINTMENT_TOOL_NAME,
  GET_APPOINTMENT_DETAILS_TOOL_NAME,
  GET_UPCOMING_APPOINTMENTS_TOOL_NAME,
  executeGetTodayAppointments,
  executeGetNextAppointment,
  executeGetAppointmentDetails,
  executeGetUpcomingAppointments,
  getTodayAppointmentsInputSchema,
  getNextAppointmentInputSchema,
  getAppointmentDetailsInputSchema,
  getUpcomingAppointmentsInputSchema,
} from "@/lib/ai/agents/appointments/appointment-lookup-agent";
import {
  GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME,
  GET_URGENT_ITEMS_TOOL_NAME,
  GET_RECENT_ACTIVITY_TOOL_NAME,
  executeGetDashboardActionItems,
  executeGetUrgentItems,
  executeGetRecentActivity,
  getDashboardActionItemsInputSchema,
  getUrgentItemsInputSchema,
  getRecentActivityInputSchema,
} from "@/lib/ai/agents/dashboard/dashboard-agent";
import {
  GET_PAYMENT_DETAILS_TOOL_NAME,
  GET_OVERDUE_PAYMENTS_TOOL_NAME,
  GET_PENDING_PAYMENTS_TOOL_NAME,
  GET_FINANCIAL_SUMMARY_TOOL_NAME,
  executeGetPaymentDetails,
  executeGetOverduePayments,
  executeGetPendingPayments,
  executeGetFinancialSummary,
  getPaymentDetailsInputSchema,
  getOverduePaymentsInputSchema,
  getPendingPaymentsInputSchema,
  getFinancialSummaryInputSchema,
} from "@/lib/ai/agents/finance/finance-lookup-agent";
import {
  SEARCH_FOODS_TOOL_NAME,
  GET_FOOD_DETAILS_TOOL_NAME,
  GET_FOOD_PORTIONS_TOOL_NAME,
  CALCULATE_FOOD_NUTRIENTS_TOOL_NAME,
  executeSearchFoods,
  executeGetFoodDetails,
  executeGetFoodPortions,
  executeCalculateFoodNutrients,
  searchFoodsInputSchema,
  getFoodDetailsInputSchema,
  getFoodPortionsInputSchema,
  calculateFoodNutrientsInputSchema,
} from "@/lib/ai/agents/food/food-catalog-agent";
import {
  GET_PATIENT_SUMMARY_TOOL_NAME,
  GET_PATIENT_ACTIVE_PLAN_TOOL_NAME,
  GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME,
  executeGetPatientSummary,
  executeGetPatientActivePlan,
  executeGetPatientClinicalMarkers,
  getPatientSummaryInputSchema,
  getPatientActivePlanInputSchema,
  getPatientClinicalMarkersInputSchema,
} from "@/lib/ai/agents/clients/patient-lookup-agent";
import {
  GET_CONSULTATION_BRIEF_TOOL_NAME,
  GET_ACTIVE_MEAL_PLAN_TOOL_NAME,
  GET_ACTIVE_PROTOCOL_TOOL_NAME,
  GET_PENDING_PATIENT_ITEMS_TOOL_NAME,
  COMPARE_ANTHROPOMETRY_TOOL_NAME,
  PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME,
  PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME,
  getConsultationBriefInputSchema,
  getActiveMealPlanForConsultationInputSchema,
  getActiveProtocolForConsultationInputSchema,
  getPendingPatientItemsInputSchema,
  compareAnthropometryInputSchema,
  proposeConsultationTasksBatchInputSchema,
  proposeConsultationSummaryInputSchema,
  executeGetConsultationBrief,
  executeGetActiveMealPlanForConsultation,
  executeGetActiveProtocolForConsultation,
  executeGetPendingPatientItems,
  executeCompareAnthropometry,
} from "@/lib/ai/agents/clinical/consultation-agent";

/**
 * Requisito de contexto para uma tool poder ser oferecida ao LLM na
 * requisicao atual. "none" = sempre disponivel; "client" = so quando ha um
 * cliente aberto no contexto; "submission" = so quando ha um formulario de
 * pre-consulta aberto no contexto.
 */
export type ToolContextRequirement = "none" | "client" | "submission";

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  risk: ToolRisk;
  profiles: readonly AssistantCapabilityProfile[];
  contextRequirement: ToolContextRequirement;
  /** Assunto do CRM que a tool cobre — usado so para descoberta/manifest, nunca autorizacao. */
  domain: AgentDomain;
  /** Tipos de entidade que a tool le/afeta — usado so para descoberta/manifest, nunca autorizacao. */
  entityTypes: readonly ToolEntityType[];
  execute: (input: TInput) => Promise<TOutput>;
}

// O registro interno precisa apagar o tipo generico especifico de cada tool
// para poder guardar todas num unico Map — cada `defineTool` abaixo ainda e
// checado com seu tipo real no ponto de definicao.
const registry = new Map<string, ToolDefinition<any, unknown>>();

function defineTool<TInput, TOutput>(def: ToolDefinition<TInput, TOutput>): ToolDefinition<TInput, TOutput> {
  registry.set(def.name, def as unknown as ToolDefinition<any, unknown>);
  return def;
}

const ADMIN = ["ADMIN_ASSISTANT"] as const;
const PATIENT = ["PATIENT_ASSISTANT"] as const;

/**
 * As tools de leitura do PATIENT_ASSISTANT que dependem de "de quem sao os
 * dados" (plano, consultas, tarefas, alimentos do plano) NUNCA recebem
 * clientId do modelo — o `execute` registrado aqui e so um placeholder de
 * schema/risco; a execucao real e sempre um fechamento vinculado ao clientId
 * da sessao do portal, montado por `resolvePatientTools()` em
 * lib/ai/core/patient-orchestrator.ts (que le `inputSchema`/`description`
 * daqui, mas SUBSTITUI `execute`). Isso mantem risco/perfil centralizados
 * aqui, sem abrir uma brecha de "clientId escolhido pelo modelo".
 */
async function unboundPatientToolStub(): Promise<never> {
  throw new Error("Esta tool exige contexto de sessao do paciente — use resolvePatientTools(), nunca o registry diretamente.");
}

defineTool({
  name: FIND_CLIENT_TOOL_NAME,
  description: "Busca clientes pelo nome para descobrir o id antes de navegar ate a ficha dele.",
  inputSchema: findClientInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "patient",
  entityTypes: ["patient"],
  execute: executeFindClient,
});

defineTool({
  name: NAVIGATE_TOOL_NAME,
  description: "Navega o sistema ate a tela pedida (ficha de um cliente, lista de clientes, agenda, biblioteca de protocolos/modelos/receitas, tarefas, financeiro ou oportunidades).",
  inputSchema: navigateInputSchema,
  risk: "low",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "navigation",
  entityTypes: [],
  execute: async (input) => input,
});

defineTool({
  name: GET_SYSTEM_OVERVIEW_TOOL_NAME,
  description: "Le numeros gerais e atuais do consultorio (clientes, protocolos, tarefas, consultas hoje, financeiro, blog, oportunidades) para responder perguntas com dados reais.",
  inputSchema: getSystemOverviewInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: [],
  execute: executeGetSystemOverview,
});

defineTool({
  name: LIST_OPPORTUNITIES_TOOL_NAME,
  description: "Lista as oportunidades comerciais (funil de pre-consulta ate agendamento), com etapa, temperatura e proxima acao combinada.",
  inputSchema: listOpportunitiesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: ["opportunity"],
  execute: executeListOpportunities,
});

defineTool({
  name: PROPOSE_NEW_CLIENT_TOOL_NAME,
  description: "Registra uma proposta de cadastro de um novo cliente/paciente com os dados informados, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "patient",
  entityTypes: ["patient"],
  execute: executeProposeNewClient,
});

defineTool({
  name: PROPOSE_NEW_RECIPE_TOOL_NAME,
  description: "Busca ingredientes reais na TACO e monta uma proposta de receita nova (titulo, grupo, porcoes, ingredientes e modo de preparo) para revisao humana antes de salvar na biblioteca.",
  inputSchema: proposeNewRecipeInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "food",
  entityTypes: ["recipe", "food"],
  execute: executeProposeNewRecipe,
});

defineTool({
  name: PROPOSE_NEW_BLOG_POST_TOOL_NAME,
  description: "Registra uma proposta de rascunho de post novo para o blog do site (titulo, resumo, conteudo em markdown, categoria, tags, dominio editorial e referencias), para revisao humana antes de salvar. Cobre nutricao, saude materno-infantil, condicoes clinicas, medicamentos e demais temas de educacao em saude — nunca so 'nutricao geral'.",
  inputSchema: proposeNewBlogPostInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "content",
  entityTypes: ["blog_post"],
  execute: async (input) => input,
});

defineTool({
  name: SEARCH_EDITORIAL_SOURCES_TOOL_NAME,
  description: "Busca fontes editoriais confiaveis (ANVISA, Ministerio da Saude, FDA, EMA, OMS, sociedades cientificas, guidelines) sobre um assunto de saude/medicamento para embasar um post do blog. So consulta, nunca grava nada. Se nenhum provedor de busca estiver configurado, devolve available:false e results:[] — nunca invente uma fonte quando isso acontecer.",
  inputSchema: searchEditorialSourcesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "content",
  entityTypes: ["blog_post"],
  execute: executeSearchEditorialSources,
});

defineTool({
  name: PROPOSE_NUTRITION_RECORD_TOOL_NAME,
  description: "Registra uma proposta de preenchimento/atualizacao de campos do prontuario nutricional do cliente atual, para revisao humana antes de salvar.",
  inputSchema: proposeNutritionRecordInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "nutrition_record"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_PROTOCOL_TOOL_NAME,
  description: "Registra uma proposta de criacao de um protocolo personalizado simples (titulo, categoria, descricao, notas) para o cliente atual, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientProtocolInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "protocol"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME,
  description: "Registra uma proposta de atualizacao das notas profissionais de um protocolo ja atribuido ao cliente atual, para revisao humana antes de salvar.",
  inputSchema: proposeClientProtocolNotesInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "protocol"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_APPOINTMENT_TOOL_NAME,
  description: "Registra uma proposta de nova consulta na agenda (cliente atual ou client_id informado), para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewAppointmentInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["patient", "appointment"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_TASK_TOOL_NAME,
  description: "Registra uma proposta de tarefa de acompanhamento para o cliente atual, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientTaskInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "task"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_PRE_ANALYSIS_TOOL_NAME,
  description: "Registra uma proposta de pre-analise (resumo, pontos de atencao, objetivo, restricoes e notas) para o formulario de pre-consulta atual, para revisao humana antes de salvar.",
  inputSchema: proposePreAnalysisInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "submission",
  domain: "clinical",
  entityTypes: ["patient", "pre_analysis"],
  execute: async (input) => input,
});

defineTool({
  name: GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME,
  description: "Cruza a agenda de uma data com as tarefas pendentes de cada paciente com consulta nesse dia — ja limitado em tamanho.",
  inputSchema: getPatientsWithPendenciesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: ["appointment", "task"],
  execute: executeGetPatientsWithPendenciesForDate,
});

defineTool({
  name: GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME,
  description: "Le a evolucao de peso/IMC de um cliente (identificado pelo id) desde a ultima consulta realizada, com todos os numeros ja calculados.",
  inputSchema: getClientEvolutionSummaryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "clinical",
  entityTypes: ["patient"],
  execute: executeGetClientEvolutionSummary,
});

defineTool({
  name: GET_AVAILABLE_SLOTS_TOOL_NAME,
  description: "Le os horarios realmente disponiveis na agenda num intervalo de datas (ate 30 dias), com filtro opcional por periodo do dia — a IA nunca inventa horario, so usa o que esta ferramenta retorna.",
  inputSchema: getAvailableSlotsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: executeGetAvailableSlots,
});

defineTool({
  name: SEARCH_MEAL_PLAN_FOODS_TOOL_NAME,
  description: "Busca alimentos reais na base TACO pelo nome, para resolver o numero TACO correto antes de propor uma alteracao de plano alimentar — nunca confiar em nome de alimento sem buscar primeiro.",
  inputSchema: searchMealPlanFoodsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "food",
  entityTypes: ["food"],
  execute: executeSearchMealPlanFoods,
});

defineTool({
  name: GET_PATIENT_REQUESTS_TOOL_NAME,
  description: "Le as solicitacoes que pacientes enviaram para revisao (substituicao de alimento, dificuldade no plano, sintoma/queixa relatado, pedido sobre consulta, dificuldade com tarefa, duvida geral) — filtra por cliente/status/hoje. Somente leitura; nunca decide nem aplica nada a partir de um pedido.",
  inputSchema: getPatientRequestsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "request",
  entityTypes: ["patient", "request"],
  execute: executeGetPatientRequests,
});

defineTool({
  name: PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME,
  description: "Monta uma proposta estruturada de alteracao do plano alimentar ativo do cliente atual (adicionar/remover/renomear refeicao, adicionar/remover/substituir item, mudar quantidade/medida/horario), com preview de impacto nos macros calculado deterministicamente, para revisao humana antes de aplicar.",
  inputSchema: proposeMealPlanChangeInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan", "food"],
  execute: executeProposeMealPlanChange,
});

defineTool({
  name: GET_MEAL_PLAN_NUTRITION_TOOL_NAME,
  description: "Calcula deterministicamente (nunca a IA de cabeca) os totais nutricionais do plano alimentar ativo por refeicao e por dia, e compara com a meta definida pela nutricionista (kcal/proteina/carboidrato/gordura) — use para qualquer pergunta sobre calorias, macros ou aderencia a meta.",
  inputSchema: getMealPlanNutritionInputSchema,
  risk: "read",
  profiles: ADMIN,
  // FASE 1 (operador interno): recebe mealPlanId como parametro, entao nao
  // depende mais de cliente pre-selecionado — pode ser encadeada no mesmo
  // turno depois de getPatientActivePlan resolver o id do plano.
  contextRequirement: "none",
  domain: "nutrition_analysis",
  entityTypes: ["meal_plan"],
  execute: executeGetMealPlanNutrition,
});

defineTool({
  name: FIND_FOOD_EQUIVALENTS_TOOL_NAME,
  description: "Encontra alimentos da base TACO nutricionalmente equivalentes a um alimento e quantidade dados, dentro de uma tolerancia e priorizando a mesma categoria alimentar — calculo 100% deterministico, use antes de propor uma substituicao por motivo nutricional.",
  inputSchema: findFoodEquivalentsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "food",
  entityTypes: ["food"],
  execute: executeFindFoodEquivalents,
});

// ── Catalogo de alimentos (FASE 1, operador interno) — sempre disponivel,
// nunca depende de cliente/formulario em contexto (docs/AI-OPERATOR-AUDIT-ROADMAP.md).

defineTool({
  name: SEARCH_FOODS_TOOL_NAME,
  description: "Busca alimentos no catalogo real (TACO/TBCA + alimentos personalizados cadastrados) pelo nome, com fonte identificavel. Use antes de responder qualquer pergunta sobre um alimento especifico — nunca responda so pelo nome digitado sem buscar primeiro.",
  inputSchema: searchFoodsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "food",
  entityTypes: ["food"],
  execute: executeSearchFoods,
});

defineTool({
  name: GET_FOOD_DETAILS_TOOL_NAME,
  description: "Le a tabela nutricional completa por 100g de um alimento (source/refId vindos de searchFoods) — todos os macros e micronutrientes disponiveis na fonte.",
  inputSchema: getFoodDetailsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "food",
  entityTypes: ["food"],
  execute: executeGetFoodDetails,
});

defineTool({
  name: GET_FOOD_PORTIONS_TOOL_NAME,
  description: "Le as medidas caseiras especificas ja cadastradas para um alimento (ex.: '1 colher de sopa = 15g') — use antes de calcular uma quantidade em medida caseira, para nao cair numa conversao generica menos precisa.",
  inputSchema: getFoodPortionsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "food",
  entityTypes: ["food"],
  execute: executeGetFoodPortions,
});

defineTool({
  name: CALCULATE_FOOD_NUTRIENTS_TOOL_NAME,
  description: "Calcula deterministicamente (nunca a IA de cabeca) os nutrientes de uma quantidade especifica de um alimento (ex.: '100g de arroz', '2 colheres de feijao') — use sempre que a pergunta envolver uma quantidade concreta de um alimento fora do plano de um cliente.",
  inputSchema: calculateFoodNutrientsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "food",
  entityTypes: ["food"],
  execute: executeCalculateFoodNutrients,
});

// ── Leitura de paciente por id (FASE 1, operador interno) — encadeavel com
// findClient no mesmo turno, sem depender de cliente pre-selecionado na tela.

defineTool({
  name: GET_PATIENT_SUMMARY_TOOL_NAME,
  description: "Le um resumo rapido de um paciente pelo id (plano ativo, quantidade de protocolos, tarefas pendentes, proxima e ultima consulta) — use depois de resolver o id com findClient.",
  inputSchema: getPatientSummaryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "patient",
  entityTypes: ["patient"],
  execute: executeGetPatientSummary,
});

defineTool({
  name: GET_PATIENT_ACTIVE_PLAN_TOOL_NAME,
  description: "Le o plano alimentar ativo completo de um paciente pelo id (refeicoes, itens, metas) — use depois de resolver o id com findClient. Para totais nutricionais, encadeie com getMealPlanNutrition usando o mealPlanId devolvido.",
  inputSchema: getPatientActivePlanInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan"],
  execute: executeGetPatientActivePlan,
});

defineTool({
  name: GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME,
  description: "Le as alergias, intolerancias, restricoes alimentares e sinalizacoes clinicas oficialmente cadastradas de um paciente pelo id — use depois de resolver o id com findClient. Nunca infira uma restricao que nao esteja aqui.",
  inputSchema: getPatientClinicalMarkersInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "clinical",
  entityTypes: ["patient"],
  execute: executeGetPatientClinicalMarkers,
});

// ── Agenda (FASE 1B, operador interno) — sempre disponivel, nunca inventa horario.

defineTool({
  name: GET_TODAY_APPOINTMENTS_TOOL_NAME,
  description: "Le as consultas reais de um dia (hoje por padrao, ou uma data especifica em AAAA-MM-DD) — nunca inclui consultas canceladas.",
  inputSchema: getTodayAppointmentsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: executeGetTodayAppointments,
});

defineTool({
  name: GET_NEXT_APPOINTMENT_TOOL_NAME,
  description: "Le a proxima consulta futura — geral (sem clientId) ou de um paciente especifico (com clientId, resolvido antes com findClient se so tiver o nome).",
  inputSchema: getNextAppointmentInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment", "patient"],
  execute: executeGetNextAppointment,
});

defineTool({
  name: GET_APPOINTMENT_DETAILS_TOOL_NAME,
  description: "Le o detalhe completo de uma consulta especifica pelo id (local, observacoes, confirmacao do paciente, motivo de cancelamento).",
  inputSchema: getAppointmentDetailsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: executeGetAppointmentDetails,
});

defineTool({
  name: GET_UPCOMING_APPOINTMENTS_TOOL_NAME,
  description: "Le as consultas futuras num intervalo de dias (padrao 7, ate 30) — geral ou filtrado por um paciente especifico.",
  inputSchema: getUpcomingAppointmentsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment", "patient"],
  execute: executeGetUpcomingAppointments,
});

// ── Dashboard (FASE 1B) — mesmo feed deterministico da tela inicial, nunca um score novo.

defineTool({
  name: GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME,
  description: "Le o feed real de pendencias do dashboard (consultas proximas/em andamento, solicitacoes de paciente, propostas da IA aguardando revisao, pagamentos vencidos, mensagens de atendimento pendentes), ja priorizado.",
  inputSchema: getDashboardActionItemsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: [],
  execute: executeGetDashboardActionItems,
});

defineTool({
  name: GET_URGENT_ITEMS_TOOL_NAME,
  description: "Le so os itens de prioridade URGENT/HIGH do feed do dashboard.",
  inputSchema: getUrgentItemsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: [],
  execute: executeGetUrgentItems,
});

defineTool({
  name: GET_RECENT_ACTIVITY_TOOL_NAME,
  description: "Le a atividade recente do sistema (ex.: substituicoes alimentares seguras respondidas automaticamente pela IA).",
  inputSchema: getRecentActivityInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "dashboard",
  entityTypes: [],
  execute: executeGetRecentActivity,
});

// ── Solicitacoes (FASE 1B, complemento) ───────────────────────────────────

defineTool({
  name: GET_PATIENT_REQUEST_DETAILS_TOOL_NAME,
  description: "Le o detalhe completo de UMA solicitacao de paciente especifica pelo id (texto do pedido, resumo da IA, status, notas da nutricionista).",
  inputSchema: getPatientRequestDetailsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "request",
  entityTypes: ["patient", "request"],
  execute: executeGetPatientRequestDetails,
});

defineTool({
  name: GET_PENDING_AI_PROPOSALS_TOOL_NAME,
  description: "Le as propostas da propria IA que ainda aguardam confirmacao humana (ou estao presas em execucao) — nunca aprova nem executa nada, so lista.",
  inputSchema: getPendingAiProposalsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "request",
  entityTypes: ["request"],
  execute: executeGetPendingAiProposals,
});

// ── Financeiro (FASE 1B) — 100% leitura, registro manual, sem gateway de pagamento.

defineTool({
  name: GET_PAYMENT_DETAILS_TOOL_NAME,
  description: "Le o detalhe completo de UM pagamento especifico pelo id (forma de pagamento, parcela, notas).",
  inputSchema: getPaymentDetailsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "finance",
  entityTypes: ["payment"],
  execute: executeGetPaymentDetails,
});

defineTool({
  name: GET_OVERDUE_PAYMENTS_TOOL_NAME,
  description: "Le os pagamentos vencidos (status vencido, ou pendente com vencimento no passado) — geral ou de um paciente especifico.",
  inputSchema: getOverduePaymentsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "finance",
  entityTypes: ["payment", "patient"],
  execute: executeGetOverduePayments,
});

defineTool({
  name: GET_PENDING_PAYMENTS_TOOL_NAME,
  description: "Le os pagamentos pendentes (ainda nao pagos, vencidos ou nao) — geral ou de um paciente especifico.",
  inputSchema: getPendingPaymentsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "finance",
  entityTypes: ["payment", "patient"],
  execute: executeGetPendingPayments,
});

defineTool({
  name: GET_FINANCIAL_SUMMARY_TOOL_NAME,
  description: "Le o resumo financeiro real (recebido no mes, em aberto, vencido) — nunca calcule esses totais de cabeca, sempre use esta ferramenta.",
  inputSchema: getFinancialSummaryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "finance",
  entityTypes: ["payment"],
  execute: executeGetFinancialSummary,
});

// ── Modo Consulta (FASE 1) — workspace clinico dedicado ──────────────────
// So ativas quando o admin-orchestrator detecta consultationSessionId no
// contexto (lib/ai/core/ai-orchestrator.ts) — nunca oferecidas fora do
// Modo Consulta. Perfil continua ADMIN_ASSISTANT (mesmo tool registry,
// mesma risk policy) — nao e um terceiro perfil de capacidade.

defineTool({
  name: GET_CONSULTATION_BRIEF_TOOL_NAME,
  description: "Monta o briefing de preparacao para a consulta do cliente atual: dados deterministicos do sistema (ultima visita, evolucao, pendencias, plano, protocolo) e, quando a IA estiver configurada, uma interpretacao estruturada desses fatos. Nunca inventa numero nem decisao clinica.",
  inputSchema: getConsultationBriefInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient"],
  execute: (input) => executeGetConsultationBrief(input),
});

defineTool({
  name: GET_ACTIVE_MEAL_PLAN_TOOL_NAME,
  description: "Le o plano alimentar ativo do cliente atual (refeicoes, itens, ids reais) dentro do Modo Consulta, sem precisar sair da tela de consulta.",
  inputSchema: getActiveMealPlanForConsultationInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan"],
  execute: executeGetActiveMealPlanForConsultation,
});

defineTool({
  name: GET_ACTIVE_PROTOCOL_TOOL_NAME,
  description: "Le o protocolo ativo/pausado do cliente atual (titulo, status, fases, progresso de tarefas) dentro do Modo Consulta.",
  inputSchema: getActiveProtocolForConsultationInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "protocol"],
  execute: executeGetActiveProtocolForConsultation,
});

defineTool({
  name: GET_PENDING_PATIENT_ITEMS_TOOL_NAME,
  description: "Le tarefas pendentes e solicitacoes da paciente aguardando revisao, para o resumo de pendencias do Modo Consulta.",
  inputSchema: getPendingPatientItemsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "request",
  entityTypes: ["patient", "task", "request"],
  execute: executeGetPendingPatientItems,
});

defineTool({
  name: COMPARE_ANTHROPOMETRY_TOOL_NAME,
  description: "Compara as duas medidas antropometricas mais recentes do cliente atual (peso, cintura, gordura corporal, IMC) — Atual/Anterior/Diferenca, sempre calculado deterministicamente, nunca pela IA.",
  inputSchema: compareAnthropometryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient"],
  execute: executeCompareAnthropometry,
});

defineTool({
  name: PROPOSE_CONSULTATION_TASKS_BATCH_TOOL_NAME,
  description: "Registra uma proposta de criacao de varias tarefas de uma vez (pacote de acoes pos-consulta) para o cliente atual, para revisao humana antes de criar de verdade — nunca cria as tarefas sozinha.",
  inputSchema: proposeConsultationTasksBatchInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "task"],
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_CONSULTATION_SUMMARY_TOOL_NAME,
  description: "Registra uma proposta de resumo estruturado da consulta atual (resumo, evolucao, conduta, plano, metas, proximos passos) baseado SOMENTE no que foi discutido/decidido nesta consulta, para revisao humana antes de salvar na sessao. Acao clinica — nunca aplicada automaticamente.",
  inputSchema: proposeConsultationSummaryInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "appointment"],
  execute: async (input) => input,
});

// ── PATIENT_ASSISTANT — copiloto do portal do paciente ──────────────────
// Nenhuma destas tools jamais recebe "ADMIN_ASSISTANT" em profiles, e
// nenhuma tool administrativa jamais recebe "PATIENT_ASSISTANT" — os dois
// perfis nunca compartilham capability por acidente (secao 2/17 do pedido).

defineTool({
  name: GET_MY_MEAL_PLAN_TOOL_NAME,
  description: "Le o plano alimentar ativo da propria paciente autenticada (refeicoes e itens), sem carregar prontuario nem historico.",
  inputSchema: getMyMealPlanInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["meal_plan"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_MEAL_DETAILS_TOOL_NAME,
  description: "Le so UMA refeicao especifica do plano ativo da propria paciente (ex.: cafe da manha, almoco, lanche da tarde), sem carregar o plano inteiro.",
  inputSchema: getMyMealDetailsInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["meal_plan"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_APPOINTMENTS_TOOL_NAME,
  description: "Le as proprias consultas futuras da paciente autenticada (data, tipo, local), nunca notas internas da nutricionista.",
  inputSchema: getMyAppointmentsInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_TASKS_TOOL_NAME,
  description: "Le as proprias tarefas pendentes da paciente autenticada.",
  inputSchema: getMyTasksInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["task"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: SEARCH_ALLOWED_FOOD_ALTERNATIVES_TOOL_NAME,
  description: "Localiza um alimento no proprio plano ativo da paciente e busca alternativas reais na TACO — nunca aprova uma troca, so mostra opcoes para revisao com a nutricionista.",
  inputSchema: searchAllowedFoodAlternativesInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "food",
  entityTypes: ["food"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: NAVIGATE_PATIENT_PORTAL_TOOL_NAME,
  description: "Indica qual secao do portal (plano alimentar, consultas ou tarefas) o frontend deve rolar/abrir — allow-list fechada, nunca uma URL livre.",
  inputSchema: navigatePatientPortalInputSchema,
  risk: "low",
  profiles: PATIENT,
  contextRequirement: "none",
  domain: "navigation",
  entityTypes: [],
  execute: executeNavigatePatientPortal,
});

defineTool({
  name: GET_MY_AVAILABLE_SLOTS_TOOL_NAME,
  description: "Le os horarios realmente disponiveis para autoagendamento (ate 14 dias) — a IA nunca inventa horario, so usa o que esta ferramenta retorna.",
  inputSchema: getAvailableSlotsForSchedulingInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: executeGetAvailableSlotsForScheduling,
});

defineTool({
  name: REQUEST_APPOINTMENT_TOOL_NAME,
  description: "Registra um pedido de agendamento da propria paciente para um horario ja confirmado como disponivel, para revisao/confirmacao dela antes de marcar de verdade.",
  inputSchema: requestAppointmentInputSchema,
  risk: "sensitive",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "appointment",
  entityTypes: ["appointment"],
  execute: async (input) => input,
});

defineTool({
  name: REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME,
  description: "Monta um PEDIDO DE REVISAO da propria paciente para a nutricionista analisar (troca de alimento, dificuldade no plano, sintoma/queixa, pedido sobre consulta, dificuldade com tarefa, duvida geral) — nunca altera plano/prontuario, so cria um pedido pendente apos confirmacao.",
  inputSchema: requestProfessionalReviewInputSchema,
  risk: "sensitive",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "request",
  entityTypes: ["request"],
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_REQUESTS_TOOL_NAME,
  description: "Le os proprios pedidos de revisao que a paciente ja enviou (tipo, texto, status) — nunca as notas internas da nutricionista.",
  inputSchema: getMyRequestsInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  domain: "request",
  entityTypes: ["request"],
  execute: unboundPatientToolStub,
});

export function getToolDefinition(name: string): ToolDefinition<any, unknown> | undefined {
  return registry.get(name);
}

export function getToolRisk(name: string): ToolRisk | undefined {
  return registry.get(name)?.risk;
}

export function listRegisteredTools(): ToolDefinition<any, unknown>[] {
  return Array.from(registry.values());
}

/**
 * Monta o ToolSet do AI SDK a partir dos nomes de tool aplicaveis ao
 * contexto atual, filtrando por perfil de capacidade — uma tool que nao
 * esteja na allow-list do perfil nunca chega a ser oferecida ao LLM, mesmo
 * que o nome exista no registry.
 */
export function buildToolSet(toolNames: string[], profile: AssistantCapabilityProfile): ToolSet {
  const tools: ToolSet = {};
  for (const name of toolNames) {
    const def = registry.get(name);
    if (!def) continue;
    if (!isProfileAllowed(def.profiles, profile)) continue;
    tools[name] = {
      description: def.description,
      inputSchema: def.inputSchema,
      execute: def.execute,
    };
  }
  return tools;
}
