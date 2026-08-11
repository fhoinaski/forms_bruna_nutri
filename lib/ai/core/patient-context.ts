import type { ClientPortalSession } from "@/lib/auth/client-portal-session";
import { getClientById, type Client } from "@/lib/repositories/clients";
import { AiConfigError } from "@/lib/ai/core/ai-errors";

/**
 * Contexto do PATIENT_ASSISTANT — deliberadamente um tipo PROPRIO, nao uma
 * variante do AssistantContext do admin (lib/ai/core/ai-context.ts). A
 * diferenca mais importante: aqui NAO HA "input.clientId" vindo do body da
 * requisicao — o unico jeito de este contexto existir e o `clientId` ja
 * verificado da sessao do portal (secao 4 do pedido: "o body da requisicao
 * nunca e fonte de verdade para o proprio paciente").
 */
export interface PatientAssistantContextInput {
  currentPage?: string;
  conversationId?: string;
}

export interface PatientAssistantContext {
  clientId: string;
  clientName: string;
  currentPage?: string;
  conversationId?: string;
}

/**
 * `session` precisa ja ter sido validada por getClientPortalSessionFromRequest
 * (JWT + is_active + session_version conferidos contra o banco) antes de
 * chegar aqui — esta funcao nao autentica nada, so resolve o registro real
 * do cliente a partir do `sub` ja confiavel da sessao.
 */
export async function resolvePatientAssistantContext(
  session: ClientPortalSession,
  input: PatientAssistantContextInput
): Promise<{ context: PatientAssistantContext; client: Client }> {
  const client = await getClientById(session.sub);
  if (!client) {
    // Sessao valida mas o cliente sumiu (excluido depois do login) — nunca
    // deveria acontecer em uso normal, mas falha fechado em vez de seguir
    // com um contexto incompleto.
    throw new AiConfigError("Não foi possível carregar seus dados agora.");
  }
  return {
    client,
    context: {
      clientId: client.id,
      clientName: client.name,
      currentPage: input.currentPage,
      conversationId: input.conversationId,
    },
  };
}
