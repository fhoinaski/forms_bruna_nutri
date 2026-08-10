import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

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
  plan?: WorkflowPlanSummary;
}

export interface LegacyChatHttpResponse {
  reply: string;
  proposedUpdate?: Record<string, unknown>;
  navigateAction?: AssistantNavigationResult;
  options?: AssistantOption[];
  warnings?: string[];
}

export function toLegacyChatResponse(envelope: AssistantResponseEnvelope): LegacyChatHttpResponse {
  return {
    reply: envelope.message,
    proposedUpdate: envelope.proposedAction as unknown as Record<string, unknown> | undefined,
    navigateAction: envelope.navigation,
    options: envelope.options?.length ? envelope.options : undefined,
    warnings: envelope.warnings?.length ? envelope.warnings : undefined,
  };
}
