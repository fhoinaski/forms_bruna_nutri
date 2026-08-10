import type { SessionPayload } from "@/lib/auth/session";
import type { AssistantCapabilityProfile } from "@/lib/ai/policies/permissions";
import { getClientById, type Client } from "@/lib/repositories/clients";
import { getSubmissionById, type SubmissionWithAnswers } from "@/lib/repositories/submissions";

/**
 * O que o frontend manda para identificar "onde a nutricionista esta" —
 * apenas identificadores, nunca dados clinicos. O backend resolve o que
 * for necessario a partir daqui (secao 4/8 do pedido de arquitetura).
 */
export interface AssistantContextInput {
  clientId?: string;
  submissionId?: string;
  currentPage?: string;
  conversationId?: string;
}

/**
 * Contexto tipado e resolvido do assistente para a requisicao atual. Os
 * agentes/tools ainda decidem, cada um, quais dados adicionais (prontuario,
 * plano, protocolos, agenda) precisam buscar — este contexto so confirma
 * "qual recurso esta aberto", nao carrega o prontuario inteiro.
 */
export interface AssistantContext {
  adminUser: SessionPayload;
  profile: AssistantCapabilityProfile;
  currentPage?: string;
  conversationId?: string;
  client: Client | null;
  submission: SubmissionWithAnswers | null;
}

export async function resolveAssistantContext(
  adminUser: SessionPayload,
  input: AssistantContextInput,
  profile: AssistantCapabilityProfile = "ADMIN_ASSISTANT"
): Promise<AssistantContext> {
  const [client, submission] = await Promise.all([
    input.clientId ? getClientById(input.clientId) : Promise.resolve(null),
    input.submissionId ? getSubmissionById(input.submissionId) : Promise.resolve(null),
  ]);

  return {
    adminUser,
    profile,
    currentPage: input.currentPage,
    conversationId: input.conversationId,
    client,
    submission,
  };
}
