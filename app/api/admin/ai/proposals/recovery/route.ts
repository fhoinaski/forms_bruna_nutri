import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { listProposalsNeedingRecovery } from "@/lib/repositories/ai-action-proposals";
import { getClientById } from "@/lib/repositories/clients";
import type { ProposedActionKind } from "@/lib/ai/schemas/action.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ProposedActionKind, string> = {
  new_appointment: "Criação de agendamento",
  new_task: "Criação de tarefa",
  new_client: "Cadastro de novo paciente",
  new_recipe: "Criação de receita",
  new_protocol: "Criação de protocolo",
  client_protocol: "Atualização de notas de protocolo",
  nutrition_record: "Atualização de prontuário",
  pre_analysis: "Atualização de pré-análise",
  new_blog_post: "Rascunho de post no blog",
  meal_plan_change: "Alteração de plano alimentar",
  patient_appointment_request: "Agendamento pedido pela paciente",
  patient_change_request: "Solicitação da paciente",
  consultation_tasks_batch: "Criação de tarefas (Modo Consulta)",
  consultation_summary: "Resumo de consulta",
  reschedule_appointment: "Reagendamento de consulta",
  cancel_appointment: "Cancelamento de consulta",
  resolve_patient_request: "Resolução de solicitação da paciente",
  mark_payment_received: "Marcação de pagamento como recebido",
  update_safe_substitutions_setting: "Alteração de configuração de substituições seguras",
  clinical_marker_upsert: "Registro de marcador clínico",
  resolve_clinical_marker: "Resolução de marcador clínico",
  consultation_note: "Observação de consulta",
  activate_meal_plan: "Ativação de plano alimentar",
};

/** Detalhe curto e legivel — nunca payload tecnico bruto (secao 3.8). */
function describeDetail(kind: string, paramsJson: string): string | null {
  try {
    const parsed = JSON.parse(paramsJson) as Record<string, unknown>;
    const fields = parsed.fields as Record<string, string> | undefined;
    if (kind === "new_appointment" && fields?.starts_at_display) return fields.starts_at_display;
    if (kind === "new_task" && fields?.title) return fields.title;
    if (kind === "new_client" && fields?.name) return fields.name;
    if (kind === "new_recipe" && typeof parsed.title === "string") return parsed.title;
    if (kind === "new_protocol" && fields?.title) return fields.title;
    if (kind === "patient_appointment_request" && typeof parsed.startsAtIso === "string") return parsed.startsAtIso;
    if (kind === "reschedule_appointment" && typeof parsed.newStartsAtDisplay === "string") return parsed.newStartsAtDisplay;
    if (kind === "mark_payment_received" && typeof parsed.paymentId === "string") return parsed.paymentId;
    return null;
  } catch {
    return null;
  }
}

/**
 * Lista enxuta (sem paginacao, sem filtro) do que precisa de verificacao
 * manual: propostas presas em 'executing' alem do limiar, e propostas ja
 * classificadas 'requires_review'. So dados operacionais — nunca
 * executing_at bruto, chave de idempotencia ou payload tecnico (secao 3.8).
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  // Sem filtro por owner: ferramenta operacional da equipe (protegida so
  // por getAdminFromRequest) — precisa enxergar tambem propostas presas
  // originadas pelo PATIENT_ASSISTANT, cujo admin_id guarda o clientId da
  // paciente, nunca o id de um admin real.
  const rows = await listProposalsNeedingRecovery();

  const clientCache = new Map<string, string | null>();
  async function resolveClientName(clientId: string | null): Promise<string | null> {
    if (!clientId) return null;
    if (clientCache.has(clientId)) return clientCache.get(clientId) ?? null;
    const client = await getClientById(clientId);
    clientCache.set(clientId, client?.name ?? null);
    return client?.name ?? null;
  }

  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      kind: row.kind,
      kindLabel: KIND_LABELS[row.kind as ProposedActionKind] ?? row.kind,
      status: row.status,
      clientName: await resolveClientName(row.client_id),
      detail: describeDetail(row.kind, row.params_json),
      createdAt: row.created_at,
    }))
  );

  return NextResponse.json({ items });
}
