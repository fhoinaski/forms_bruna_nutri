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
