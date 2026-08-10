import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  getAiActionProposal,
  isAiActionProposalExpired,
  markAiActionProposalStatus,
} from "@/lib/repositories/ai-action-proposals";
import { hasAppointmentConflict, slotEnd } from "@/lib/repositories/availability";
import { createAppointment } from "@/lib/repositories/appointments";
import { parseBrDateTimeToIso } from "@/lib/ai/schemas/br-datetime";
import { proposedActionSchema, type ProposedAction } from "@/lib/ai/schemas/action.schema";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirma uma proposta sensitive/clinical persistida pelo orquestrador
 * (lib/ai/core/proposal-store.ts). O frontend so manda o id — o corpo da
 * requisicao NUNCA e usado para os parametros da acao; tudo vem de
 * `params_json`, gravado no momento em que a proposta foi criada. Isso e o
 * que impede o frontend de trocar os dados depois da proposta pronta.
 *
 * Cobertura atual: execucao real e revalidacao de conflito de horario para
 * `new_appointment` (o workflow explicitamente pedido — agendamento). Para
 * os demais kinds, a proposta e apenas marcada como usada (nunca reaplicada
 * por aqui); a aplicacao continua pelo fluxo existente no AiChatWidget ate
 * que o mesmo padrao seja estendido a eles.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const proposal = await getAiActionProposal(id, admin.sub);
  if (!proposal) {
    return NextResponse.json({ message: "Proposta não encontrada." }, { status: 404 });
  }

  if (proposal.status === "completed") {
    return NextResponse.json({ message: "Esta proposta já foi confirmada anteriormente." }, { status: 409 });
  }
  if (proposal.status === "cancelled") {
    return NextResponse.json({ message: "Esta proposta foi descartada." }, { status: 409 });
  }
  if (proposal.status === "expired" || isAiActionProposalExpired(proposal)) {
    if (proposal.status !== "expired") await markAiActionProposalStatus(proposal.id, "expired");
    return NextResponse.json({ message: "Esta proposta expirou. Peça novamente ao assistente." }, { status: 410 });
  }

  const parsedAction = proposedActionSchema.safeParse(JSON.parse(proposal.params_json));
  if (!parsedAction.success) {
    return NextResponse.json({ message: "Proposta corrompida — peça novamente ao assistente." }, { status: 422 });
  }
  const action: ProposedAction = parsedAction.data;

  if (action.kind !== "new_appointment") {
    return NextResponse.json(
      { message: "Confirmação automática ainda não disponível para este tipo de proposta." },
      { status: 501 }
    );
  }

  const startsAtIso = parseBrDateTimeToIso(action.fields.starts_at_display);
  if (!startsAtIso) {
    return NextResponse.json({ message: "Data e hora da proposta são inválidas." }, { status: 422 });
  }
  const endsAtIso = slotEnd(startsAtIso);

  // Revalidacao obrigatoria no servidor: o horario pode ter sido ocupado
  // por outro agendamento entre o momento em que a proposta foi gerada e
  // agora (outra aba, outro processo, outra nutricionista).
  const conflict = await hasAppointmentConflict(startsAtIso, endsAtIso);
  if (conflict) {
    return NextResponse.json(
      { message: "Esse horário foi ocupado por outro agendamento enquanto a proposta esperava confirmação. Peça um novo horário." },
      { status: 409 }
    );
  }

  const appointmentId = await createAppointment({
    client_id: action.clientId,
    title: action.fields.title,
    appointment_type: action.fields.appointment_type || "consulta",
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    location: action.fields.location || null,
    notes: action.fields.notes || null,
    status: "agendado",
  });

  await markAiActionProposalStatus(proposal.id, "completed");

  await writeAuditLog({
    action: "ai_proposal_confirmed",
    adminId: admin.sub,
    entityType: "appointment",
    entityId: appointmentId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { proposalId: proposal.id, kind: action.kind, clientId: action.clientId },
  });

  return NextResponse.json({ status: "completed", kind: "new_appointment", appointmentId });
}
