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
  /**
   * Hints adicionais de tela (agenda/protocolos/receitas) — secao 2 do
   * pedido de UX. So identificadores, NUNCA resolvidos eagerly aqui: ao
   * contrario de client/submission (que ja tinham tools dependendo do
   * registro completo), estes so viram uteis quando uma tool especifica
   * precisar deles, e essa tool sempre revalida existencia/posse no banco —
   * o hint em si nunca e tratado como autorizacao (secao 3).
   */
  appointmentId?: string;
  protocolId?: string;
  recipeId?: string;
  /**
   * Hint do Modo Consulta (FASE 1) — so presente quando a nutricionista
   * esta dentro do workspace de consulta. Mesmo padrao NAO-eager de
   * appointmentId/protocolId: so um identificador, nunca resolvido aqui.
   * O orquestrador usa a PRESENCA deste campo para decidir se injeta o
   * prompt/tools do Modo Consulta; cada tool/handler que efetivamente usa
   * o valor revalida a sessao contra o cliente aberto (nunca confia so no
   * hint vindo do frontend).
   */
  consultationSessionId?: string;
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
  appointmentId?: string;
  protocolId?: string;
  recipeId?: string;
  consultationSessionId?: string;
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
    appointmentId: input.appointmentId,
    protocolId: input.protocolId,
    recipeId: input.recipeId,
    consultationSessionId: input.consultationSessionId,
  };
}
