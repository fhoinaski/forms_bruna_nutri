import type { AssistantPageContext } from "@/lib/ai/context/assistant-page-context";
import { getSaoPauloDateKey } from "@/lib/utils/timezone";

/**
 * Sugestoes contextuais por tela (secao 6/7 do pedido de UX) — no maximo
 * 3-5 por tela, e SO quando existir capability real por tras (nunca um
 * botao que so manda o LLM inventar uma resposta):
 *
 * - "deterministic": chama /api/admin/ai/quick-facts direto, sem LLM —
 *   reduz custo/latencia para perguntas cuja resposta e so um numero do
 *   sistema (secao 33).
 * - "chat": intencao conhecida, mas a resposta se beneficia de alguma
 *   interpretacao (ex.: resumir oportunidades) — envia uma mensagem de
 *   texto FIXA e precisa (nao ambigua) pelo fluxo normal de chat, que ja
 *   tem a tool correspondente sempre ativa para o contexto atual.
 */
export type QuickAction =
  | { id: string; label: string; kind: "deterministic"; action: "client_evolution" | "client_pending_tasks"; needsClientId: true }
  | { id: string; label: string; kind: "deterministic"; action: "day_overview"; dateOffsetDays: number }
  | { id: string; label: string; kind: "chat"; message: string };

function todayIsoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return getSaoPauloDateKey(date);
}

export function resolveQuickActionDate(action: Extract<QuickAction, { kind: "deterministic"; action: "day_overview" }>): string {
  return todayIsoDate(action.dateOffsetDays);
}

export function getQuickActionsForContext(context: AssistantPageContext): QuickAction[] {
  switch (context.currentPage) {
    case "client_record":
      return [
        { id: "evolucao", label: "Resumir evolução", kind: "deterministic", action: "client_evolution", needsClientId: true },
        { id: "pendencias", label: "Ver pendências", kind: "deterministic", action: "client_pending_tasks", needsClientId: true },
        { id: "proxima_consulta", label: "Próxima consulta", kind: "chat", message: "Qual a próxima consulta agendada desse paciente?" },
        { id: "revisar_plano", label: "Revisar plano alimentar", kind: "chat", message: "Revise o plano alimentar atual desse paciente e aponte o que vale a pena ajustar." },
        { id: "sugerir_substituicoes", label: "Sugerir substituições", kind: "chat", message: "Sugira substituições de alimentos nesse plano alimentar e prepare uma proposta estruturada se eu topar uma delas." },
      ];
    case "agenda":
      return [
        { id: "resumo_hoje", label: "Resumir meu dia", kind: "deterministic", action: "day_overview", dateOffsetDays: 0 },
        { id: "resumo_amanha", label: "Pendências de amanhã", kind: "deterministic", action: "day_overview", dateOffsetDays: 1 },
        { id: "buscar_horario", label: "Encontrar horário", kind: "chat", message: "Quais horários eu tenho disponíveis nos próximos 7 dias?" },
      ];
    case "opportunities":
      return [
        { id: "resumo_oportunidades", label: "Resumir oportunidades", kind: "chat", message: "Resuma as oportunidades comerciais em aberto: quantas, em que etapa e temperatura." },
        { id: "leads_quentes", label: "Leads prioritários", kind: "chat", message: "Liste os leads com temperatura quente que ainda não converteram, com a próxima ação combinada." },
        { id: "proximos_contatos", label: "Próximos contatos", kind: "chat", message: "Quais oportunidades têm próxima ação combinada mais próxima?" },
      ];
    case "financeiro":
      return [
        { id: "resumo_financeiro", label: "Resumir pendências", kind: "chat", message: "Resuma a situação financeira: valores a receber e pendências." },
        { id: "inadimplencia", label: "Inadimplências", kind: "chat", message: "Há inadimplência registrada no financeiro? Resuma." },
      ];
    case "dashboard":
      return [
        { id: "resumo_consultorio", label: "Resumo do consultório hoje", kind: "chat", message: "Me dê um resumo geral do consultório hoje: consultas, tarefas atrasadas e oportunidades." },
      ];
    case "submission_detail":
      return [
        { id: "pre_analise", label: "Montar pré-análise", kind: "chat", message: "Monte um resumo de pré-análise com base nas respostas deste formulário." },
      ];
    default:
      return [];
  }
}
