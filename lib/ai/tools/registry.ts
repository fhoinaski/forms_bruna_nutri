import type { ToolSet } from "ai";
import type { z } from "zod";
import type { ToolRisk } from "@/lib/ai/policies/action-policy";
import type { AssistantCapabilityProfile } from "@/lib/ai/policies/permissions";
import { isProfileAllowed } from "@/lib/ai/policies/permissions";
import type { AgentDomain, DataSensitivity, ToolEntityType } from "@/lib/ai/tools/capability-types";
import { withToolCallObservability } from "@/lib/ai/tools/tool-call-observability";

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
  GET_CLIENT_MEAL_PLANS_TOOL_NAME,
  PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME,
  executeGetClientMealPlans,
  executeProposeActivateMealPlan,
  getClientMealPlansInputSchema,
  proposeActivateMealPlanInputSchema,
} from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import {
  GENERATE_MEAL_PLAN_DRAFT_TOOL_NAME,
  executeGenerateMealPlanDraft,
  generateMealPlanDraftToolInputSchema,
} from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";
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
  GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME,
  GET_TOP_TRAFFIC_SOURCES_TOOL_NAME,
  GET_TOP_PAGES_TOOL_NAME,
  GET_CONVERSION_FUNNEL_TOOL_NAME,
  GET_CAMPAIGN_PERFORMANCE_TOOL_NAME,
  executeGetSiteAnalyticsOverview,
  executeGetTopTrafficSources,
  executeGetTopPages,
  executeGetConversionFunnel,
  executeGetCampaignPerformance,
  getSiteAnalyticsOverviewInputSchema,
  getTopTrafficSourcesInputSchema,
  getTopPagesInputSchema,
  getConversionFunnelInputSchema,
  getCampaignPerformanceInputSchema,
} from "@/lib/ai/agents/analytics/analytics-agent";
import {
  PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME,
  PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME,
  executeProposeRescheduleAppointment,
  executeProposeCancelAppointment,
  proposeRescheduleAppointmentInputSchema,
  proposeCancelAppointmentInputSchema,
} from "@/lib/ai/agents/appointments/appointment-write-agent";
import {
  PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME,
  executeProposeResolvePatientRequest,
  proposeResolvePatientRequestInputSchema,
} from "@/lib/ai/agents/clients/patient-request-write-agent";
import {
  GET_DOCUMENT_TEMPLATES_TOOL_NAME,
  GET_PATIENT_DOCUMENT_LINKS_TOOL_NAME,
  executeGetDocumentTemplates,
  executeGetPatientDocumentLinks,
  getDocumentTemplatesInputSchema,
  getPatientDocumentLinksInputSchema,
} from "@/lib/ai/agents/documents/document-agent";
import {
  GET_AI_SETTINGS_TOOL_NAME,
  PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME,
  executeGetAiSettings,
  executeProposeUpdateSafeSubstitutionsSetting,
  getAiSettingsInputSchema,
  proposeUpdateSafeSubstitutionsSettingInputSchema,
} from "@/lib/ai/agents/system/configuration-agent";
import {
  GET_SYSTEM_HEALTH_TOOL_NAME,
  GET_AUDIT_LOG_SUMMARY_TOOL_NAME,
  executeGetSystemHealth,
  executeGetAuditLogSummary,
  getSystemHealthInputSchema,
  getAuditLogSummaryInputSchema,
} from "@/lib/ai/agents/system/admin-agent";
import {
  PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME,
  executeProposeMarkPaymentReceived,
  proposeMarkPaymentReceivedInputSchema,
} from "@/lib/ai/agents/finance/finance-write-agent";
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
  PROPOSE_CONSULTATION_NOTE_TOOL_NAME,
  proposeConsultationNoteInputSchema,
} from "@/lib/ai/agents/clinical/consultation-agent";
import {
  PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME,
  PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME,
  proposeClinicalMarkerUpsertInputSchema,
  proposeResolveClinicalMarkerInputSchema,
} from "@/lib/ai/agents/clinical/clinical-markers-agent";

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
  /** Sensibilidade do dado (safe/sensitive/clinical) — ortogonal a `risk`, ver capability-types.ts. */
  dataSensitivity: DataSensitivity;
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
  dataSensitivity: "safe",
  execute: executeFindClient,
});

defineTool({
  name: NAVIGATE_TOOL_NAME,
  description: "Navega o sistema ate a tela pedida (ficha de um cliente, lista de clientes, agenda, biblioteca de protocolos/modelos/receitas, tarefas, financeiro, oportunidades ou solicitacoes de pacientes).",
  inputSchema: navigateInputSchema,
  risk: "low",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "navigation",
  entityTypes: [],
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
  execute: executeGetPatientRequests,
});

defineTool({
  name: PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME,
  description: "Monta uma proposta estruturada de alteracao do plano alimentar ativo do cliente atual (adicionar/remover/renomear/duplicar/reordenar refeicao, adicionar/remover/substituir/duplicar/reordenar item, mudar quantidade/medida/horario), com preview de impacto nos macros calculado deterministicamente, para revisao humana antes de aplicar. Todo alimento precisa vir de searchFoods (source/refId reais) — nunca so o nome.",
  inputSchema: proposeMealPlanChangeInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan", "food"],
  dataSensitivity: "clinical",
  execute: executeProposeMealPlanChange,
});

defineTool({
  name: GET_CLIENT_MEAL_PLANS_TOOL_NAME,
  description: "Lista TODOS os planos alimentares de um paciente (rascunho/ativo/arquivado) com id/titulo/status/versao — use para descobrir o id de um plano rascunho antes de propor ativa-lo (o plano rascunho nunca aparece como 'plano ativo' no contexto).",
  inputSchema: getClientMealPlansInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan"],
  dataSensitivity: "sensitive",
  execute: executeGetClientMealPlans,
});

defineTool({
  name: PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME,
  description: "Registra uma proposta de ATIVAR um plano alimentar (torna-lo o plano vigente do cliente atual, arquivando o que estava ativo antes), para revisao humana antes de aplicar. Acao clinica distinta de editar conteudo — nunca aplicada automaticamente apos criar/editar um plano.",
  inputSchema: proposeActivateMealPlanInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan"],
  dataSensitivity: "clinical",
  execute: executeProposeActivateMealPlan,
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "safe",
  execute: executeFindFoodEquivalents,
});

defineTool({
  name: GENERATE_MEAL_PLAN_DRAFT_TOOL_NAME,
  description: "Gera um PRE-PLANO alimentar guiado (estrutura de refeicoes + alimentos resolvidos no catalogo real + checagem de seguranca clinica contra alergias/restricoes) para revisao humana — NUNCA persiste nem ativa nada sozinha. Peca objetivo/meta/refeicoes solicitadas quando o usuario nao informar; nunca invente meta energetica. Todo alimento retornado ja vem com fonte real (source/refId) quando encontrado no catalogo; itens sem correspondencia ou em conflito clinico vêm sinalizados, nunca escondidos. FOOD-FIRST: por padrao (useRecipes omitido ou false) cada refeicao vira alimentos individuais simples (ex.: '2 ovos, pao integral, mamao'), nunca uma receita elaborada — so passe useRecipes:true quando a propria nutricionista pedir explicitamente uma receita/preparacao pra refeicao (ex.: 'crie uma receita', 'sugira uma receita', 'quero uma opcao de panqueca'). Depois de gerar, explique o resultado — aplicar ao plano de verdade exige a nutricionista clicar em 'Aplicar ao editor' na tela do plano, nunca a partir do chat.",
  inputSchema: generateMealPlanDraftToolInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "meal_plan",
  entityTypes: ["patient", "meal_plan", "food"],
  dataSensitivity: "clinical",
  execute: executeGenerateMealPlanDraft,
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
  execute: executeGetRecentActivity,
});

// ── Analytics do site (admin only) — mesmas queries deterministicas da tela /dashboard/analytics.

defineTool({
  name: GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME,
  description: "Le a visao geral de analytics do site publico (sessoes, pageviews, conversoes, taxa de conversao) para um periodo.",
  inputSchema: getSiteAnalyticsOverviewInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "analytics",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetSiteAnalyticsOverview,
});

defineTool({
  name: GET_TOP_TRAFFIC_SOURCES_TOOL_NAME,
  description: "Le a origem do trafego do site (Google, Instagram, WhatsApp, direto, pago, etc.) com sessoes e conversoes por origem, num periodo.",
  inputSchema: getTopTrafficSourcesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "analytics",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetTopTrafficSources,
});

defineTool({
  name: GET_TOP_PAGES_TOOL_NAME,
  description: "Le as paginas mais visitadas do site (views, sessoes, entradas, saidas), num periodo.",
  inputSchema: getTopPagesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "analytics",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetTopPages,
});

defineTool({
  name: GET_CONVERSION_FUNNEL_TOOL_NAME,
  description: "Le o funil de pre-consulta (visitantes -> visitaram servicos -> abriram -> iniciaram -> concluiram), num periodo.",
  inputSchema: getConversionFunnelInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "analytics",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetConversionFunnel,
});

defineTool({
  name: GET_CAMPAIGN_PERFORMANCE_TOOL_NAME,
  description: "Le o desempenho de campanhas UTM (sessoes e conversoes por campanha/source/medium), num periodo.",
  inputSchema: getCampaignPerformanceInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "analytics",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetCampaignPerformance,
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "safe",
  execute: executeGetFinancialSummary,
});

// ── Safe writes operacionais (FASE 3) — sempre propostas (risk "sensitive"),
// nunca aplicadas sozinhas; revalidadas de novo no confirm (proposal-handlers.ts).

defineTool({
  name: PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME,
  description: "Registra uma proposta de reagendar uma consulta existente para uma nova data/hora, para revisao humana antes de aplicar de verdade.",
  inputSchema: proposeRescheduleAppointmentInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment", "patient"],
  dataSensitivity: "sensitive",
  execute: executeProposeRescheduleAppointment,
});

defineTool({
  name: PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME,
  description: "Registra uma proposta de cancelar uma consulta existente, para revisao humana antes de aplicar de verdade.",
  inputSchema: proposeCancelAppointmentInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "appointment",
  entityTypes: ["appointment", "patient"],
  dataSensitivity: "sensitive",
  execute: executeProposeCancelAppointment,
});

defineTool({
  name: PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME,
  description: "Registra uma proposta de marcar uma solicitacao de paciente como revisada/resolvida/descartada, para revisao humana antes de aplicar de verdade.",
  inputSchema: proposeResolvePatientRequestInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "request",
  entityTypes: ["patient", "request"],
  dataSensitivity: "sensitive",
  execute: executeProposeResolvePatientRequest,
});

defineTool({
  name: PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME,
  description: "Registra uma proposta de marcar um pagamento manual existente como recebido, para revisao humana antes de aplicar de verdade. Nunca cria cobranca nem altera valor.",
  inputSchema: proposeMarkPaymentReceivedInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "finance",
  entityTypes: ["payment", "patient"],
  dataSensitivity: "sensitive",
  execute: executeProposeMarkPaymentReceived,
});

// ── Documentos (FASE 5) — sem entidade "documento" persistida no sistema;
// tools cobrem so o que existe de verdade: biblioteca de templates e links
// reais de impressao (nunca PDF/documento inventado).

defineTool({
  name: GET_DOCUMENT_TEMPLATES_TOOL_NAME,
  description: "Le a biblioteca de templates de dieta/suplementacao/substituicao (nao existe um 'template padrao' unico — varios podem estar ativos ao mesmo tempo).",
  inputSchema: getDocumentTemplatesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "document",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetDocumentTemplates,
});

defineTool({
  name: GET_PATIENT_DOCUMENT_LINKS_TOOL_NAME,
  description: "Le os links reais das paginas de impressao de um paciente (ficha do paciente, formulario de pre-consulta se existir) — este sistema nao gera PDF automaticamente, a nutricionista precisa abrir o link e imprimir/salvar pelo navegador.",
  inputSchema: getPatientDocumentLinksInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "document",
  entityTypes: ["patient"],
  dataSensitivity: "sensitive",
  execute: executeGetPatientDocumentLinks,
});

// ── Configuracao (FASE 5) — unica configuracao real do sistema e ai_settings.

defineTool({
  name: GET_AI_SETTINGS_TOOL_NAME,
  description: "Le a configuracao real de IA do sistema (provedor, modelo, modo de pre-consulta, se as substituicoes seguras estao habilitadas) — a api_key nunca vem em claro, sempre mascarada.",
  inputSchema: getAiSettingsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "configuration",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetAiSettings,
});

defineTool({
  name: PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME,
  description: "Registra uma proposta de ativar/desativar a feature flag de substituicoes seguras no portal do paciente, para revisao humana antes de aplicar. Nunca altera provider/modelo/api_key/system prompts.",
  inputSchema: proposeUpdateSafeSubstitutionsSettingInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "configuration",
  entityTypes: [],
  dataSensitivity: "sensitive",
  execute: executeProposeUpdateSafeSubstitutionsSetting,
});

// ── Admin (FASE 5) — somente leitura; sistema de admin unico, sem RBAC.

defineTool({
  name: GET_SYSTEM_HEALTH_TOOL_NAME,
  description: "Le o status de saude do sistema (mesma checagem de app/api/health) — nunca afirme que o sistema esta ok sem chamar esta ferramenta.",
  inputSchema: getSystemHealthInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "admin",
  entityTypes: [],
  dataSensitivity: "safe",
  execute: executeGetSystemHealth,
});

defineTool({
  name: GET_AUDIT_LOG_SUMMARY_TOOL_NAME,
  description: "Le um resumo do audit log administrativo recente (acao, tipo de entidade, resultado, quando) — nunca inclui metadata bruta nem hash de IP.",
  inputSchema: getAuditLogSummaryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  domain: "admin",
  entityTypes: [],
  dataSensitivity: "sensitive",
  execute: executeGetAuditLogSummary,
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
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
  dataSensitivity: "clinical",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_CONSULTATION_NOTE_TOOL_NAME,
  description: "Registra uma proposta de observacao de texto livre para anexar as notas da consulta em andamento (distinto do resumo estruturado de fim de consulta), para revisao humana antes de salvar. Acao clinica — nunca aplicada automaticamente.",
  inputSchema: proposeConsultationNoteInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient", "appointment"],
  dataSensitivity: "clinical",
  execute: async (input) => input,
});

// ── Marcadores clinicos estruturados (FASE 6) — alergia/intolerancia/
// restricao/sinalizacao. Vocabulario fechado (structured-markers.ts), nunca
// texto livre — ver clinical-markers-agent.ts para o raciocinio completo.

defineTool({
  name: PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME,
  description: "Registra uma proposta de criacao de um marcador clinico estruturado (alergia/intolerancia/restricao alimentar/sinalizacao clinica) do cliente atual, com tipo/codigo do vocabulario fechado, para revisao humana antes de salvar. Acao clinica — nunca aplicada automaticamente.",
  inputSchema: proposeClinicalMarkerUpsertInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient"],
  dataSensitivity: "clinical",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME,
  description: "Registra uma proposta de marcar como RESOLVIDO um marcador clinico estruturado ja existente do cliente atual (identificado por tipo+codigo, nunca por id interno), para revisao humana antes de salvar. Acao clinica — nunca aplicada automaticamente.",
  inputSchema: proposeResolveClinicalMarkerInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  domain: "clinical",
  entityTypes: ["patient"],
  dataSensitivity: "clinical",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "safe",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
  dataSensitivity: "sensitive",
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
      execute: withToolCallObservability(name, def.domain, def.execute),
    };
  }
  return tools;
}
