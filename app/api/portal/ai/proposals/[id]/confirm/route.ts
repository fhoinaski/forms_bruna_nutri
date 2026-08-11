import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import {
  claimAiActionProposal,
  finalizeAiActionProposal,
  getAiActionProposal,
  getProposalExecution,
  isAiActionProposalExpired,
  markAiActionProposalExpired,
  recordProposalExecution,
} from "@/lib/repositories/ai-action-proposals";
import { proposedActionSchema, type ProposedAction } from "@/lib/ai/schemas/action.schema";
import { executeProposedAction, ProposalExecutionError } from "@/lib/ai/core/proposal-handlers";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirmacao de propostas do PATIENT_ASSISTANT — endpoint SEPARADO do
 * admin (/api/admin/ai/proposals/[id]/confirm), autenticado pela sessao do
 * portal. Reusa a MESMA infraestrutura de propostas (ai_action_proposals,
 * claim atomico, idempotencia via ai_proposal_executions,
 * executeProposedAction) — nao duplica logica de confirmacao, so troca a
 * fonte de autenticacao e adiciona uma trava extra: so aceita
 * "patient_appointment_request", NUNCA nenhuma outra kind (mesmo que o
 * `admin_id`/owner da proposta por algum motivo colidisse com este
 * clientId, o que nao deveria ser possivel em uso normal — defesa em
 * profundidade contra o portal do paciente confirmar/ler qualquer proposta
 * administrativa ou clinica).
 */
const ALLOWED_KIND = "patient_appointment_request" as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;

  const claimed = await claimAiActionProposal(id, session.sub);
  if (!claimed) {
    return diagnoseClaimFailure(id, session.sub);
  }

  if (claimed.kind !== ALLOWED_KIND) {
    // Nunca deveria acontecer (o portal so persiste esta kind), mas falha
    // fechado: finaliza como failed sem executar nada, sem revelar detalhe.
    await safeFinalize(claimed.id, "failed", "Tipo de proposta não permitido neste canal.");
    return NextResponse.json({ message: "Não foi possível confirmar esta proposta." }, { status: 403 });
  }

  let action: ProposedAction;
  try {
    const parsedAction = proposedActionSchema.safeParse(JSON.parse(claimed.params_json));
    if (!parsedAction.success || parsedAction.data.kind !== ALLOWED_KIND) throw new Error("schema inválido");
    action = parsedAction.data;
  } catch {
    await safeFinalize(claimed.id, "failed", "Payload da proposta corrompido ou fora do schema esperado.");
    return NextResponse.json({ message: "Não foi possível confirmar essa solicitação." }, { status: 422 });
  }

  // Ownership final: o clientId gravado na proposta precisa ser exatamente
  // quem esta confirmando — nunca confia so no claim por admin_id.
  if (action.clientId !== session.sub) {
    await safeFinalize(claimed.id, "failed", "Proprietário da proposta não confere.");
    return NextResponse.json({ message: "Não foi possível confirmar essa solicitação." }, { status: 403 });
  }

  const previousExecution = await getProposalExecution(claimed.id);
  if (previousExecution) {
    await safeFinalize(claimed.id, "completed");
    const previousData = JSON.parse(previousExecution.result_json) as Record<string, unknown>;
    return NextResponse.json({ status: "completed", kind: action.kind, ...previousData });
  }

  let result: Awaited<ReturnType<typeof executeProposedAction>>;
  try {
    result = await executeProposedAction(action, { adminId: session.sub });
    await recordProposalExecution(claimed.id, action.kind, result.data);
  } catch (cause) {
    const status = cause instanceof ProposalExecutionError ? cause.status : 502;
    const message = cause instanceof Error ? cause.message : "Não foi possível concluir a ação.";
    await safeFinalize(claimed.id, "failed", message.slice(0, 500));
    await writeAuditLog({
      action: "patient_ai_proposal_failed",
      adminId: session.sub,
      entityType: action.kind,
      outcome: "failure",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: claimed.id, kind: action.kind, errorMessage: message },
    });
    return NextResponse.json({ message }, { status });
  }

  await safeFinalize(claimed.id, "completed");
  await writeAuditLog({
    action: "patient_ai_proposal_confirmed",
    adminId: session.sub,
    entityType: action.kind,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { proposalId: claimed.id, kind: action.kind, ...result.data },
  }).catch((error) => {
    console.error("[portal-ai-proposals] Falha ao gravar audit log apos confirmacao bem-sucedida:", claimed.id, error);
  });

  return NextResponse.json({ status: "completed", kind: action.kind, ...result.data });
}

async function safeFinalize(id: string, status: "completed" | "failed", reason?: string | null): Promise<void> {
  try {
    await finalizeAiActionProposal(id, status, reason);
  } catch (error) {
    console.error(`[portal-ai-proposals] Falha ao finalizar proposta ${id} como ${status}:`, error);
  }
}

async function diagnoseClaimFailure(id: string, clientId: string): Promise<NextResponse> {
  const existing = await getAiActionProposal(id, clientId);
  if (!existing || existing.kind !== ALLOWED_KIND) {
    return NextResponse.json({ message: "Proposta não encontrada." }, { status: 404 });
  }
  if (existing.status === "completed") {
    return NextResponse.json({ message: "Essa solicitação já foi confirmada anteriormente." }, { status: 409 });
  }
  if (existing.status === "executing") {
    return NextResponse.json({ message: "Essa solicitação já está sendo confirmada." }, { status: 409 });
  }
  if (existing.status === "cancelled") {
    return NextResponse.json({ message: "Essa solicitação foi cancelada." }, { status: 409 });
  }
  if (existing.status === "failed") {
    return NextResponse.json({ message: "Essa solicitação falhou anteriormente. Peça novamente ao assistente." }, { status: 409 });
  }
  if (existing.status === "expired" || isAiActionProposalExpired(existing)) {
    if (existing.status !== "expired") await markAiActionProposalExpired(existing.id);
    return NextResponse.json({ message: "Essa solicitação expirou. Peça novamente ao assistente." }, { status: 410 });
  }
  return NextResponse.json({ message: "Não foi possível confirmar essa solicitação." }, { status: 409 });
}
