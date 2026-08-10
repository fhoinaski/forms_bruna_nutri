import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
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
 * Confirma QUALQUER proposta sensitive/clinical persistida pelo orquestrador
 * (lib/ai/core/proposal-store.ts). O frontend so manda o id — o corpo da
 * requisicao NUNCA e usado para os parametros da acao; tudo vem de
 * `params_json`, gravado no momento em que a proposta foi criada. Isso e o
 * que impede o frontend de trocar os dados depois da proposta pronta.
 *
 * Fluxo:
 *   claim atomico (pending -> executing, so uma requisicao ganha)
 *   -> parse + valida payload persistido com Zod (falha fechado: qualquer
 *      erro de parse ou schema finaliza a proposta como failed, nunca deixa
 *      presa em "executing")
 *   -> checa chave de idempotencia (ai_proposal_executions): se um attempt
 *      anterior ja gravou o side effect mas nao chegou a finalizar (crash),
 *      NAO executa de novo — so finaliza com o resultado ja obtido
 *   -> executa via handler tipado do kind (lib/ai/core/proposal-handlers.ts)
 *   -> grava o resultado na chave de idempotencia, depois finaliza
 *      (completed ou failed) — nunca fica preso em "executing" por um erro
 *      esperado (so por um crash literal do processo).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;

  const claimed = await claimAiActionProposal(id, admin.sub);
  if (!claimed) {
    return diagnoseClaimFailure(id, admin.sub);
  }

  let action: ProposedAction;
  try {
    const parsedAction = proposedActionSchema.safeParse(JSON.parse(claimed.params_json));
    if (!parsedAction.success) throw new Error("schema inválido");
    action = parsedAction.data;
  } catch {
    // Falha fechado: params_json corrompido (JSON invalido) ou fora do
    // schema esperado (ex.: linha antiga/adulterada direto no banco) nunca
    // e executado — e sempre finalizado como failed, nunca fica preso em
    // "executing" por causa de um JSON.parse que lancaria sem isso.
    await safeFinalize(claimed.id, "failed", "Payload da proposta corrompido ou fora do schema esperado.");
    return NextResponse.json({ message: "Proposta corrompida — peça novamente ao assistente." }, { status: 422 });
  }

  const previousExecution = await getProposalExecution(claimed.id);
  if (previousExecution) {
    await safeFinalize(claimed.id, "completed");
    const previousData = JSON.parse(previousExecution.result_json) as Record<string, unknown>;
    return NextResponse.json({ status: "completed", kind: action.kind, ...previousData });
  }

  let result: Awaited<ReturnType<typeof executeProposedAction>>;
  try {
    result = await executeProposedAction(action, { adminId: admin.sub });
    // A partir daqui o side effect real ja aconteceu (ex.: consulta criada,
    // cliente cadastrado). recordProposalExecution grava a chave de
    // idempotencia ANTES de qualquer bookkeeping adicional — mesmo que o
    // processo morra no proximo passo, uma tentativa futura (recuperacao
    // manual) encontra este registro e nao executa de novo.
    await recordProposalExecution(claimed.id, action.kind, result.data);
  } catch (cause) {
    const status = cause instanceof ProposalExecutionError ? cause.status : 502;
    // Mensagem curta e controlada: nunca stack trace, nunca payload clinico
    // completo. Os handlers so lancam ProposalExecutionError com texto fixo
    // ou erros de repository (mensagens de constraint/coluna, nao dados).
    const message = cause instanceof Error ? cause.message : "Não foi possível concluir a ação.";
    await safeFinalize(claimed.id, "failed", message.slice(0, 500));

    await writeAuditLog({
      action: "ai_proposal_failed",
      adminId: admin.sub,
      entityType: action.kind,
      outcome: "failure",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { proposalId: claimed.id, kind: action.kind, errorMessage: message },
    });

    return NextResponse.json({ message }, { status });
  }

  // A partir daqui o side effect ja aconteceu E ja esta gravado de forma
  // durave (idempotency key). Finalizar o status e gravar o audit log sao
  // so bookkeeping — uma falha aqui NUNCA deve virar um erro reportado ao
  // usuario (isso enganaria a nutricionista, dizendo que uma acao que
  // realmente aconteceu "falhou"). Best effort: loga e segue.
  await safeFinalize(claimed.id, "completed");
  await writeAuditLog({
    action: "ai_proposal_confirmed",
    adminId: admin.sub,
    entityType: action.kind,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { proposalId: claimed.id, kind: action.kind, ...result.data },
  }).catch((error) => {
    console.error("[ai-proposals] Falha ao gravar audit log apos confirmacao bem-sucedida:", claimed.id, error);
  });

  return NextResponse.json({ status: "completed", kind: action.kind, ...result.data });
}

/**
 * finalizeAiActionProposal so grava status/bookkeeping — nunca deve
 * transformar um side effect que ja aconteceu de verdade num erro
 * reportado ao usuario. Se falhar, a proposta pode ficar presa em
 * 'executing' (diagnosticavel via `executing_at`); a chave de idempotencia
 * (ai_proposal_executions) ja garante que uma recuperacao manual futura nao
 * executa a acao de novo.
 */
async function safeFinalize(id: string, status: "completed" | "failed", reason?: string | null): Promise<void> {
  try {
    await finalizeAiActionProposal(id, status, reason);
  } catch (error) {
    console.error(`[ai-proposals] Falha ao finalizar proposta ${id} como ${status}:`, error);
  }
}

/**
 * O claim atomico so diz "nao consegui" — nao diz por que. Essa segunda
 * leitura (ja escopada por admin_id, mesma protecao de ownership) e so para
 * dar uma mensagem de erro util; nao afeta a atomicidade do caminho de
 * sucesso acima.
 */
async function diagnoseClaimFailure(id: string, adminId: string): Promise<NextResponse> {
  const existing = await getAiActionProposal(id, adminId);
  if (!existing) {
    return NextResponse.json({ message: "Proposta não encontrada." }, { status: 404 });
  }
  if (existing.status === "completed") {
    return NextResponse.json({ message: "Esta proposta já foi confirmada anteriormente." }, { status: 409 });
  }
  if (existing.status === "executing") {
    return NextResponse.json({ message: "Esta proposta já está sendo confirmada em outra requisição." }, { status: 409 });
  }
  if (existing.status === "cancelled") {
    return NextResponse.json({ message: "Esta proposta foi descartada." }, { status: 409 });
  }
  if (existing.status === "failed") {
    return NextResponse.json({ message: "Esta proposta falhou anteriormente. Peça novamente ao assistente." }, { status: 409 });
  }
  if (existing.status === "expired" || isAiActionProposalExpired(existing)) {
    if (existing.status !== "expired") await markAiActionProposalExpired(existing.id);
    return NextResponse.json({ message: "Esta proposta expirou. Peça novamente ao assistente." }, { status: 410 });
  }
  return NextResponse.json({ message: "Não foi possível confirmar esta proposta." }, { status: 409 });
}
