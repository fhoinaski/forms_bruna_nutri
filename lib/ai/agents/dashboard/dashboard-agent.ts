import { z } from "zod";
import { getDashboardActionItems, type DashboardActionItem } from "@/lib/dashboard/action-items";
import { truncateForToolOutput } from "@/lib/ai/privacy/sanitize-context";

/**
 * Tools de leitura do feed de pendencias do dashboard (FASE 1B) — wrapper
 * fino sobre `lib/dashboard/action-items.ts#getDashboardActionItems`, o
 * MESMO motor deterministico de priorizacao ja usado pela tela do
 * dashboard. Nunca recalcula prioridade/score aqui — so filtra o resultado
 * ja pronto por tipo/secao.
 */

/**
 * FASE 2A: `description` e deterministica/curta para a maioria dos tipos de
 * item, mas para PATIENT_REQUEST_PENDING carrega `ai_summary` (texto de
 * origem paciente) — trunca sempre, defensivamente, mesmo quando o valor
 * normalmente ja e curto.
 */
function toSummary(item: DashboardActionItem) {
  return {
    id: item.id,
    type: item.type,
    priority: item.priority,
    section: item.section,
    title: item.title,
    subject: item.subject,
    description: truncateForToolOutput(item.description).text,
    href: item.href,
    dueAt: item.dueAt,
  };
}

const emptyInputSchema = z.object({}).strict();

// ── get_dashboard_action_items (READ) ─────────────────────────────────────

export const GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME = "getDashboardActionItems";
export const getDashboardActionItemsInputSchema = emptyInputSchema;

export async function executeGetDashboardActionItems() {
  const items = await getDashboardActionItems();
  return { items: items.map(toSummary), totalFound: items.length };
}

// ── get_urgent_items (READ) ───────────────────────────────────────────────

export const GET_URGENT_ITEMS_TOOL_NAME = "getUrgentItems";
export const getUrgentItemsInputSchema = emptyInputSchema;

export async function executeGetUrgentItems() {
  const items = (await getDashboardActionItems()).filter((item) => item.priority === "URGENT" || item.priority === "HIGH");
  return { items: items.map(toSummary), totalFound: items.length };
}

// ── get_recent_activity (READ) ────────────────────────────────────────────

export const GET_RECENT_ACTIVITY_TOOL_NAME = "getRecentActivity";
export const getRecentActivityInputSchema = emptyInputSchema;

export async function executeGetRecentActivity() {
  const items = (await getDashboardActionItems()).filter((item) => item.section === "RECENT");
  return { items: items.map(toSummary), totalFound: items.length };
}

export const DASHBOARD_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar o feed real de pendencias do dashboard (o mesmo que a nutricionista ve na tela inicial) — nunca invente uma pendencia, sempre use estas ferramentas.
Como fazer isso:
- Para "o que precisa da minha atencao agora" ou uma visao geral de tudo pendente (consultas proximas/em andamento, solicitacoes de paciente, propostas da IA aguardando revisao, pagamentos vencidos, mensagens de atendimento pendentes), use ${GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME}.
- Para "tenho alguma pendencia urgente" (so o que e URGENT/HIGH), use ${GET_URGENT_ITEMS_TOOL_NAME}.
- Para "o que aconteceu recentemente" (substituicoes alimentares seguras respondidas automaticamente etc), use ${GET_RECENT_ACTIVITY_TOOL_NAME}.
- Cada item ja vem com prioridade e assunto (paciente) calculados pelo mesmo motor do dashboard — nunca reordene ou reclassifique a prioridade voce mesma, so resuma o que veio.
- Para propostas da IA aguardando revisao ("tenho propostas da IA esperando revisao?"), os itens do tipo AI_PROPOSAL_PENDING/AI_PROPOSAL_REVIEW ja vem aqui — nunca aprove/execute uma proposta a partir desta leitura, isso continua exigindo o fluxo de confirmacao normal.
`.trim();
