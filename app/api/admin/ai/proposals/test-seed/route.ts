import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getToolRisk } from "@/lib/ai/tools/registry";
import { requiresConfirmation } from "@/lib/ai/policies/action-policy";
import { persistProposedAction } from "@/lib/ai/core/proposal-store";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  toolName: z.string().min(1),
  action: z.record(z.string(), z.unknown()),
  clientId: z.string().optional(),
  submissionId: z.string().optional(),
  /**
   * Propostas do PATIENT_ASSISTANT sao persistidas com o proprio clientId
   * como "adminId" (reaproveitamento pragmatico da coluna — ver
   * lib/ai/core/patient-orchestrator.ts:221), nunca o id de um admin real.
   * Sem este flag, a proposta nunca seria reivindicavel via
   * /api/portal/ai/proposals/[id]/confirm (que so aceita admin_id = clientId
   * da sessao do portal). Exige clientId quando true.
   */
  asPatient: z.boolean().optional(),
}).strict();

/**
 * Endpoint exclusivo para seed de propostas em testes E2E (404 fora de
 * E2E_TEST_MODE=1, so setado por e2e/helpers/webserver-entrypoint.mjs).
 *
 * O ambiente de E2E nunca tem um provedor de IA real configurado (ver
 * comentario em webserver-entrypoint.mjs), entao nao ha como um teste
 * Playwright disparar uma tool call real via /api/admin/ai/chat. Este
 * endpoint persiste uma proposta usando a MESMA persistProposedAction que o
 * orquestrador real usa depois de uma tool call — nao inventa um segundo
 * caminho de persistencia nem pula a classificacao de risco (getToolRisk /
 * requiresConfirmation continuam sendo a unica fonte de verdade). O que ele
 * permite testar de ponta a ponta, pelas rotas HTTP reais, e exatamente o
 * gate que importa: proposta pendente -> banco inalterado -> confirmacao
 * explicita -> so entao o handler grava.
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  }

  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const risk = getToolRisk(parsed.data.toolName);
  if (!risk) return NextResponse.json({ message: "Tool desconhecida." }, { status: 400 });

  const action = {
    ...parsed.data.action,
    risk,
    requiresConfirmation: requiresConfirmation(risk),
  } as ProposedAction;

  if (parsed.data.asPatient && !parsed.data.clientId) {
    return NextResponse.json({ message: "clientId é obrigatório quando asPatient=true." }, { status: 400 });
  }
  const persistingId = parsed.data.asPatient ? parsed.data.clientId! : admin.sub;

  const persisted = await persistProposedAction(persistingId, parsed.data.toolName, action, {
    clientId: parsed.data.clientId,
    submissionId: parsed.data.submissionId,
  });

  return NextResponse.json({
    proposalId: persisted.proposalId,
    expiresAt: persisted.expiresAt,
    risk,
    requiresConfirmation: action.requiresConfirmation,
  });
}
