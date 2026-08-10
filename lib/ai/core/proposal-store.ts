import {
  createAiActionProposal,
  getAiActionProposal,
  isAiActionProposalExpired,
  markAiActionProposalStatus,
  type AiActionProposal,
} from "@/lib/repositories/ai-action-proposals";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * Toda proposta sensitive/clinical e persistida server-side antes de sair
 * na resposta — o id devolvido e a UNICA coisa que o frontend manda de
 * volta para confirmar. Os parametros reais de execucao ficam gravados
 * aqui, nunca sao recebidos de novo do cliente no momento da confirmacao
 * (ver app/api/admin/ai/proposals/[id]/confirm/route.ts), o que impede o
 * frontend de trocar os dados depois de a proposta ter sido gerada.
 */
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

export interface PersistProposalContext {
  clientId?: string;
  submissionId?: string;
}

export async function persistProposedAction(
  adminId: string,
  toolName: string,
  action: ProposedAction,
  ctx: PersistProposalContext
): Promise<ProposedAction> {
  const record = await createAiActionProposal({
    adminId,
    toolName,
    kind: action.kind,
    risk: action.risk,
    clientId: ctx.clientId ?? null,
    submissionId: ctx.submissionId ?? null,
    params: action,
    ttlMs: PROPOSAL_TTL_MS,
  });

  return { ...action, proposalId: record.id, expiresAt: record.expires_at };
}

export { getAiActionProposal, markAiActionProposalStatus, isAiActionProposalExpired };
export type { AiActionProposal };
