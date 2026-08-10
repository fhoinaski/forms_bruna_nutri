import { z } from "zod";
import { getClientMetrics } from "@/lib/repositories/clients";
import { getProtocolMetrics } from "@/lib/repositories/protocols";
import { getOverdueTasksCount } from "@/lib/repositories/client-tasks";
import { getActiveProtocolsCount } from "@/lib/repositories/client-protocols";
import { getTodayAppointmentsCount } from "@/lib/repositories/appointments";
import { getPaymentMetrics } from "@/lib/repositories/payments";
import { getBlogMetrics } from "@/lib/repositories/blog-posts";
import {
  getLeadOpportunityMetrics,
  listLeadOpportunities,
  type OpportunityStage,
  type OpportunityTemperature,
} from "@/lib/repositories/lead-opportunities";

export type { OpportunityStage, OpportunityTemperature };

export const GET_SYSTEM_OVERVIEW_TOOL_NAME = "getSystemOverview";

export const getSystemOverviewInputSchema = z.object({}).strict();

/**
 * "Copiloto do sistema": estas duas tools sao a metade dinamica (dados reais
 * agregados via repositories deterministicos — nunca calculados/inventados
 * pelo LLM) do assistente de perguntas sobre o consultorio (secao 18 do
 * pedido de arquitetura). A outra metade, estatica ("como fazer X"), e
 * lib/ai/agents/system/system-knowledge.ts.
 */
export async function executeGetSystemOverview() {
  const [clientMetrics, protocolMetrics, overdueTasks, activeProtocols, todayAppointments, paymentMetrics, blogMetrics, opportunityMetrics] = await Promise.all([
    getClientMetrics(),
    getProtocolMetrics(),
    getOverdueTasksCount(),
    getActiveProtocolsCount(),
    getTodayAppointmentsCount(),
    getPaymentMetrics(),
    getBlogMetrics(),
    getLeadOpportunityMetrics(),
  ]);
  return { clientMetrics, protocolMetrics, overdueTasks, activeProtocols, todayAppointments, paymentMetrics, blogMetrics, opportunityMetrics };
}

export const LIST_OPPORTUNITIES_TOOL_NAME = "listOpportunities";

export const OPPORTUNITY_STAGES = ["novo", "acolhimento", "aguardando_resposta", "agendado", "convertido", "perdido"] as const;
export const OPPORTUNITY_TEMPERATURES = ["frio", "morno", "quente"] as const;

export const listOpportunitiesInputSchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  temperature: z.enum(OPPORTUNITY_TEMPERATURES).optional(),
}).strict();

export async function executeListOpportunities(input: { stage?: OpportunityStage; temperature?: OpportunityTemperature }) {
  const items = await listLeadOpportunities(input);
  return {
    total: items.length,
    items: items.slice(0, 25).map((item) => ({
      patient_name: item.patient_name,
      stage: item.stage,
      temperature: item.temperature,
      objective: item.objective,
      next_action_at: item.next_action_at,
      contact_attempts: item.contact_attempts,
    })),
  };
}

export const SYSTEM_OVERVIEW_ASSISTANT_INSTRUCTIONS = `
Voce tem ferramentas de leitura para responder com dados reais em vez de so explicar onde encontrar a informacao:
- ${GET_SYSTEM_OVERVIEW_TOOL_NAME}: numeros gerais do consultorio (clientes ativos, protocolos ativos, tarefas atrasadas, consultas hoje, financeiro, blog, oportunidades). Use para perguntas como "como esta o financeiro", "quantos protocolos ativos eu tenho", "tem tarefa atrasada?".
- ${LIST_OPPORTUNITIES_TOOL_NAME}: lista o funil de oportunidades comerciais (pre-consulta ate agendamento), com etapa, temperatura, objetivo e proxima acao combinada. Use para perguntas como "quais as oportunidades que eu tenho hoje", "tem lead quente parado?", filtrando por stage/temperature quando fizer sentido.
Sempre que a pergunta puder ser respondida com dados reais do sistema, use essas ferramentas em vez de apenas descrever a tela manualmente. Nunca invente numeros ou calcule voce mesma — os valores vem sempre dessas ferramentas.
`.trim();
