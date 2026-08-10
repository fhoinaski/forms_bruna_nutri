import type { ProposedAction } from "@/lib/ai/schemas/action.schema";
import type { GetClientEvolutionSummaryOutput } from "@/lib/ai/agents/clinical/evolution-summary-agent";
import type { AvailableSlotsResult } from "@/lib/ai/agents/appointments/availability-lookup-agent";
import type { PatientsWithPendenciesResult } from "@/lib/ai/agents/appointments/schedule-lookup-agent";

export interface AssistantNavigationResult {
  path: string;
  clientName?: string;
}

/**
 * Opcao de desambiguacao (ex.: "encontrei duas Marias") — so o minimo para
 * a pessoa escolher (id + rotulo), nunca PII adicional (telefone, e-mail,
 * data de nascimento).
 */
export interface AssistantOption {
  id: string;
  label: string;
}

/**
 * Representacao operacional curta do turno, para observabilidade/auditoria
 * — nunca chain-of-thought do modelo. `intent`/`status` sao derivados
 * deterministicamente de quais tools foram usadas e do resultado do turno,
 * nunca pedidos ao proprio LLM.
 */
export interface WorkflowPlanSummary {
  intent: string;
  requiredCapabilities: string[];
  status: "completed" | "proposed" | "stopped_loop_limit" | "needs_disambiguation";
}

/**
 * Dado factual ja calculado deterministicamente por uma tool de leitura
 * (secao 9/11 do pedido de UX: "DADOS DO SISTEMA" separado de "ANALISE DO
 * COPILOTO"). O envelope so REPASSA o que a tool ja retornou — nunca
 * recalcula nada aqui. Usado pelo frontend para render rico (Comparison,
 * AvailableSlots etc.) em vez de so o texto livre do modelo.
 */
export interface ClientPendingTasksFacts {
  found: boolean;
  clientName: string;
  tasks: { title: string; dueDate: string | null }[];
}

export type AssistantFactsPayload =
  | { type: "client_evolution"; data: GetClientEvolutionSummaryOutput }
  | { type: "available_slots"; data: AvailableSlotsResult }
  | { type: "patients_with_pendencies"; data: PatientsWithPendenciesResult }
  | { type: "client_pending_tasks"; data: ClientPendingTasksFacts };

/**
 * Envelope de resposta interno do assistente (secao 13 do pedido de
 * arquitetura) — separa texto livre de comando executavel validado. A rota
 * HTTP de chat mapeia isso para o shape legado que o frontend ja consome
 * (`toLegacyChatResponse`), entao nenhuma mudanca e obrigatoria no
 * `AiChatWidget.tsx` existente.
 */
export interface AssistantResponseEnvelope {
  message: string;
  proposedAction?: ProposedAction;
  navigation?: AssistantNavigationResult;
  /** Opcoes para a pessoa escolher quando a entidade referenciada foi ambigua. */
  options?: AssistantOption[];
  warnings?: string[];
  data?: Record<string, unknown>;
  facts?: AssistantFactsPayload;
  plan?: WorkflowPlanSummary;
}

export interface LegacyChatHttpResponse {
  reply: string;
  proposedUpdate?: Record<string, unknown>;
  navigateAction?: AssistantNavigationResult;
  options?: AssistantOption[];
  warnings?: string[];
  facts?: AssistantFactsPayload;
}

export function toLegacyChatResponse(envelope: AssistantResponseEnvelope): LegacyChatHttpResponse {
  return {
    reply: envelope.message,
    proposedUpdate: envelope.proposedAction as unknown as Record<string, unknown> | undefined,
    navigateAction: envelope.navigation,
    options: envelope.options?.length ? envelope.options : undefined,
    warnings: envelope.warnings?.length ? envelope.warnings : undefined,
    facts: envelope.facts,
  };
}
