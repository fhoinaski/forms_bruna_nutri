import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

export interface AssistantNavigationResult {
  path: string;
  clientName?: string;
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
  warnings?: string[];
  data?: Record<string, unknown>;
}

export interface LegacyChatHttpResponse {
  reply: string;
  proposedUpdate?: Record<string, unknown>;
  navigateAction?: AssistantNavigationResult;
  warnings?: string[];
}

export function toLegacyChatResponse(envelope: AssistantResponseEnvelope): LegacyChatHttpResponse {
  return {
    reply: envelope.message,
    proposedUpdate: envelope.proposedAction as unknown as Record<string, unknown> | undefined,
    navigateAction: envelope.navigation,
    warnings: envelope.warnings?.length ? envelope.warnings : undefined,
  };
}
