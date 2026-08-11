import type { ToolSet } from "ai";
import type { z } from "zod";
import type { ToolRisk } from "@/lib/ai/policies/action-policy";
import type { AssistantCapabilityProfile } from "@/lib/ai/policies/permissions";
import { isProfileAllowed } from "@/lib/ai/policies/permissions";

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
  executeSearchMealPlanFoods,
  executeProposeMealPlanChange,
  searchMealPlanFoodsInputSchema,
  proposeMealPlanChangeInputSchema,
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
  execute: executeFindClient,
});

defineTool({
  name: NAVIGATE_TOOL_NAME,
  description: "Navega o sistema ate a tela pedida (ficha de um cliente, lista de clientes, agenda, biblioteca de protocolos/modelos/receitas, tarefas, financeiro ou oportunidades).",
  inputSchema: navigateInputSchema,
  risk: "low",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: async (input) => input,
});

defineTool({
  name: GET_SYSTEM_OVERVIEW_TOOL_NAME,
  description: "Le numeros gerais e atuais do consultorio (clientes, protocolos, tarefas, consultas hoje, financeiro, blog, oportunidades) para responder perguntas com dados reais.",
  inputSchema: getSystemOverviewInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeGetSystemOverview,
});

defineTool({
  name: LIST_OPPORTUNITIES_TOOL_NAME,
  description: "Lista as oportunidades comerciais (funil de pre-consulta ate agendamento), com etapa, temperatura e proxima acao combinada.",
  inputSchema: listOpportunitiesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeListOpportunities,
});

defineTool({
  name: PROPOSE_NEW_CLIENT_TOOL_NAME,
  description: "Registra uma proposta de cadastro de um novo cliente/paciente com os dados informados, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeProposeNewClient,
});

defineTool({
  name: PROPOSE_NEW_RECIPE_TOOL_NAME,
  description: "Busca ingredientes reais na TACO e monta uma proposta de receita nova (titulo, grupo, porcoes, ingredientes e modo de preparo) para revisao humana antes de salvar na biblioteca.",
  inputSchema: proposeNewRecipeInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeProposeNewRecipe,
});

defineTool({
  name: PROPOSE_NEW_BLOG_POST_TOOL_NAME,
  description: "Registra uma proposta de rascunho de post novo para o blog do site (titulo, resumo, conteudo em markdown, categoria e tags), para revisao humana antes de salvar.",
  inputSchema: proposeNewBlogPostInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NUTRITION_RECORD_TOOL_NAME,
  description: "Registra uma proposta de preenchimento/atualizacao de campos do prontuario nutricional do cliente atual, para revisao humana antes de salvar.",
  inputSchema: proposeNutritionRecordInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_PROTOCOL_TOOL_NAME,
  description: "Registra uma proposta de criacao de um protocolo personalizado simples (titulo, categoria, descricao, notas) para o cliente atual, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientProtocolInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME,
  description: "Registra uma proposta de atualizacao das notas profissionais de um protocolo ja atribuido ao cliente atual, para revisao humana antes de salvar.",
  inputSchema: proposeClientProtocolNotesInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_APPOINTMENT_TOOL_NAME,
  description: "Registra uma proposta de nova consulta na agenda (cliente atual ou client_id informado), para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewAppointmentInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_NEW_TASK_TOOL_NAME,
  description: "Registra uma proposta de tarefa de acompanhamento para o cliente atual, para revisao humana antes de criar de verdade.",
  inputSchema: proposeNewClientTaskInputSchema,
  risk: "sensitive",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: async (input) => input,
});

defineTool({
  name: PROPOSE_PRE_ANALYSIS_TOOL_NAME,
  description: "Registra uma proposta de pre-analise (resumo, pontos de atencao, objetivo, restricoes e notas) para o formulario de pre-consulta atual, para revisao humana antes de salvar.",
  inputSchema: proposePreAnalysisInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "submission",
  execute: async (input) => input,
});

defineTool({
  name: GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME,
  description: "Cruza a agenda de uma data com as tarefas pendentes de cada paciente com consulta nesse dia — ja limitado em tamanho.",
  inputSchema: getPatientsWithPendenciesInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeGetPatientsWithPendenciesForDate,
});

defineTool({
  name: GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME,
  description: "Le a evolucao de peso/IMC de um cliente (identificado pelo id) desde a ultima consulta realizada, com todos os numeros ja calculados.",
  inputSchema: getClientEvolutionSummaryInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeGetClientEvolutionSummary,
});

defineTool({
  name: GET_AVAILABLE_SLOTS_TOOL_NAME,
  description: "Le os horarios realmente disponiveis na agenda num intervalo de datas (ate 30 dias), com filtro opcional por periodo do dia — a IA nunca inventa horario, so usa o que esta ferramenta retorna.",
  inputSchema: getAvailableSlotsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "none",
  execute: executeGetAvailableSlots,
});

defineTool({
  name: SEARCH_MEAL_PLAN_FOODS_TOOL_NAME,
  description: "Busca alimentos reais na base TACO pelo nome, para resolver o numero TACO correto antes de propor uma alteracao de plano alimentar — nunca confiar em nome de alimento sem buscar primeiro.",
  inputSchema: searchMealPlanFoodsInputSchema,
  risk: "read",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: executeSearchMealPlanFoods,
});

defineTool({
  name: PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME,
  description: "Monta uma proposta estruturada de alteracao do plano alimentar ativo do cliente atual (adicionar/remover/renomear refeicao, adicionar/remover/substituir item, mudar quantidade/medida/horario), com preview de impacto nos macros calculado deterministicamente, para revisao humana antes de aplicar.",
  inputSchema: proposeMealPlanChangeInputSchema,
  risk: "clinical",
  profiles: ADMIN,
  contextRequirement: "client",
  execute: executeProposeMealPlanChange,
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
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_MEAL_DETAILS_TOOL_NAME,
  description: "Le so UMA refeicao especifica do plano ativo da propria paciente (ex.: cafe da manha, almoco, lanche da tarde), sem carregar o plano inteiro.",
  inputSchema: getMyMealDetailsInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_APPOINTMENTS_TOOL_NAME,
  description: "Le as proprias consultas futuras da paciente autenticada (data, tipo, local), nunca notas internas da nutricionista.",
  inputSchema: getMyAppointmentsInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  execute: unboundPatientToolStub,
});

defineTool({
  name: GET_MY_TASKS_TOOL_NAME,
  description: "Le as proprias tarefas pendentes da paciente autenticada.",
  inputSchema: getMyTasksInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  execute: unboundPatientToolStub,
});

defineTool({
  name: SEARCH_ALLOWED_FOOD_ALTERNATIVES_TOOL_NAME,
  description: "Localiza um alimento no proprio plano ativo da paciente e busca alternativas reais na TACO — nunca aprova uma troca, so mostra opcoes para revisao com a nutricionista.",
  inputSchema: searchAllowedFoodAlternativesInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "client",
  execute: unboundPatientToolStub,
});

defineTool({
  name: NAVIGATE_PATIENT_PORTAL_TOOL_NAME,
  description: "Indica qual secao do portal (plano alimentar, consultas ou tarefas) o frontend deve rolar/abrir — allow-list fechada, nunca uma URL livre.",
  inputSchema: navigatePatientPortalInputSchema,
  risk: "low",
  profiles: PATIENT,
  contextRequirement: "none",
  execute: executeNavigatePatientPortal,
});

defineTool({
  name: GET_MY_AVAILABLE_SLOTS_TOOL_NAME,
  description: "Le os horarios realmente disponiveis para autoagendamento (ate 14 dias) — a IA nunca inventa horario, so usa o que esta ferramenta retorna.",
  inputSchema: getAvailableSlotsForSchedulingInputSchema,
  risk: "read",
  profiles: PATIENT,
  contextRequirement: "none",
  execute: executeGetAvailableSlotsForScheduling,
});

defineTool({
  name: REQUEST_APPOINTMENT_TOOL_NAME,
  description: "Registra um pedido de agendamento da propria paciente para um horario ja confirmado como disponivel, para revisao/confirmacao dela antes de marcar de verdade.",
  inputSchema: requestAppointmentInputSchema,
  risk: "sensitive",
  profiles: PATIENT,
  contextRequirement: "client",
  execute: async (input) => input,
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
