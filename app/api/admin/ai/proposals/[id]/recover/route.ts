import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  finalizeAiActionProposal,
  getAiActionProposalById,
  getProposalExecution,
  markProposalRequiresReview,
  reclaimStuckExecutingProposal,
  recordProposalExecution,
  resolveRequiresReview,
} from "@/lib/repositories/ai-action-proposals";
import { proposedActionSchema, type ProposedAction } from "@/lib/ai/schemas/action.schema";
import { executeProposedAction, ProposalExecutionError } from "@/lib/ai/core/proposal-handlers";
import { getRecoveryStrategy } from "@/lib/ai/policies/recovery-policy";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // So usado quando a proposta ja esta em 'requires_review': a nutricionista
  // verificou por fora (ex.: olhou a agenda) e informa o que apurou. NUNCA
  // dispara uma nova execucao — so fecha a proposta com o resultado real.
  resolution: z.enum(["not_applied", "already_applied"]).optional(),
}).strict();

/**
 * Verificacao/recuperacao manual de uma proposta presa (secao 3 do pedido
 * de hardening). Nunca reseta 'executing' -> 'pending' cegamente: decide
 * com base no que pode ser provado.
 *
 * 1) Se ja esta 'requires_review': so aceita o veredito que a nutricionista
 *    apurou manualmente (resolution) — nunca re-executa.
 * 2) Se esta 'executing' e ainda dentro do limiar de "presa": 409, pode
 *    estar em andamento de verdade.
 * 3) Se esta 'executing' e alem do limiar:
 *    a) ai_proposal_executions ja tem um registro -> o side effect esta
 *       PROVADO. So finaliza completed (nunca re-executa).
 *    b) sem registro, kind com estrategia "automatic" (idempotencia real do
 *       proprio handler) -> executa de novo via o mesmo caminho do confirm
 *       normal.
 *    c) sem registro, kind "manual" -> vira requires_review. Nunca herda a
 *       adivinhacao.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  }

  // Sem filtro de owner: e uma ferramenta operacional da equipe, protegida
  // so pela sessao de admin — nao um fluxo de usuario final. Necessario
  // porque propostas originadas pelo PATIENT_ASSISTANT guardam o clientId da
  // paciente na coluna admin_id, nunca o id de um admin real (ver comentario
  // em getAiActionProposalById).
  const existing = await getAiActionProposalById(id);
  if (!existing) return NextResponse.json({ message: "Ação não encontrada." }, { status: 404 });

  if (existing.status === "requires_review") {
    if (!parsedBody.data.resolution) {
      return NextResponse.json({ message: "Informe o que foi verificado." }, { status: 400 });
    }
    await resolveRequiresReview(id, parsedBody.data.resolution);
    await writeAuditLog({
      action: "ai_proposal_recovery_resolved",
      adminId: admin.sub,
      entityType: existing.kind,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: id, kind: existing.kind, resolution: parsedBody.data.resolution },
    });
    return NextResponse.json({ status: parsedBody.data.resolution === "already_applied" ? "completed" : "failed" });
  }

  if (existing.status !== "executing") {
    return NextResponse.json({ message: "Esta ação não precisa de verificação." }, { status: 409 });
  }

  const reclaimed = await reclaimStuckExecutingProposal(id);
  if (!reclaimed) {
    return NextResponse.json({ message: "Esta ação ainda pode estar em andamento — tente novamente em instantes." }, { status: 409 });
  }

  const previousExecution = await getProposalExecution(id);
  if (previousExecution) {
    // Side effect provado — so corrige o bookkeeping, nunca re-executa.
    await finalizeAiActionProposal(id, "completed");
    const previousData = JSON.parse(previousExecution.result_json) as Record<string, unknown>;
    await writeAuditLog({
      action: "ai_proposal_recovery_confirmed",
      adminId: admin.sub,
      entityType: existing.kind,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: id, kind: existing.kind, outcome: "execution_record_found" },
    });
    return NextResponse.json({ status: "completed", kind: existing.kind, ...previousData });
  }

  const strategy = getRecoveryStrategy(existing.kind);
  if (strategy === "manual") {
    await markProposalRequiresReview(id);
    await writeAuditLog({
      action: "ai_proposal_recovery_requires_review",
      adminId: admin.sub,
      entityType: existing.kind,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: id, kind: existing.kind },
    });
    return NextResponse.json({ status: "requires_review" });
  }

  // strategy === "automatic": o proprio handler garante que executa-lo de
  // novo produz um resultado seguro (constraint de identidade, versao
  // otimista ou dedup ligada ao pedido — ver recovery-policy.ts).
  let action: ProposedAction;
  try {
    const parsedAction = proposedActionSchema.safeParse(JSON.parse(existing.params_json));
    if (!parsedAction.success) throw new Error("schema inválido");
    action = parsedAction.data;
  } catch {
    await finalizeAiActionProposal(id, "failed", "Payload da proposta corrompido ou fora do schema esperado.");
    return NextResponse.json({ message: "Ação corrompida — peça novamente ao assistente." }, { status: 422 });
  }

  try {
    const result = await executeProposedAction(action, { adminId: admin.sub });
    await recordProposalExecution(id, action.kind, result.data);
    await finalizeAiActionProposal(id, "completed");
    await writeAuditLog({
      action: "ai_proposal_recovery_retried",
      adminId: admin.sub,
      entityType: action.kind,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: id, kind: action.kind, outcome: "retried_and_completed" },
    });
    return NextResponse.json({ status: "completed", kind: action.kind, ...result.data });
  } catch (cause) {
    const status = cause instanceof ProposalExecutionError ? cause.status : 502;
    const message = cause instanceof Error ? cause.message : "Não foi possível concluir a ação.";
    await finalizeAiActionProposal(id, "failed", message.slice(0, 500));
    await writeAuditLog({
      action: "ai_proposal_recovery_retried",
      adminId: admin.sub,
      entityType: action.kind,
      outcome: "failure",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: id, kind: action.kind, errorMessage: message },
    });
    return NextResponse.json({ message }, { status });
  }
}
