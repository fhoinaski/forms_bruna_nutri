import { z } from "zod";
import { listPatientRequests, getPatientRequestById, type PatientRequestStatus } from "@/lib/repositories/patient-requests";
import { getClientById } from "@/lib/repositories/clients";
import { getDashboardActionItems } from "@/lib/dashboard/action-items";

/**
 * Tool ADMIN de LEITURA para o inbox de solicitações do paciente (secao 16
 * do pedido). Só lista/resume — nunca decide nem aplica nada. Converter um
 * pedido numa alteração real (ex.: `meal_plan_change`) é sempre uma ação
 * SEPARADA, iniciada explicitamente pela nutricionista, com sua própria
 * confirmação clínica (secao 17/18: "admin não deve resolver automaticamente").
 */
export const GET_PATIENT_REQUESTS_TOOL_NAME = "getPatientRequests";

export const getPatientRequestsInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  status: z.enum(["pending_review", "reviewed", "resolved", "dismissed"]).optional(),
  onlyToday: z.boolean().optional(),
}).strict();
export type GetPatientRequestsInput = z.infer<typeof getPatientRequestsInputSchema>;

export interface AdminPatientRequestSummary {
  id: string;
  clientId: string;
  clientName: string | null;
  requestType: string;
  patientText: string;
  aiSummary: string | null;
  status: PatientRequestStatus;
  createdAt: string;
}

export interface GetPatientRequestsOutput {
  requests: AdminPatientRequestSummary[];
  totalFound: number;
}

const MAX_RESULTS = 30;

export async function executeGetPatientRequests(input: GetPatientRequestsInput): Promise<GetPatientRequestsOutput> {
  const rows = await listPatientRequests({
    clientId: input.clientId,
    status: input.status,
    onlyToday: input.onlyToday,
    limit: MAX_RESULTS,
  });

  const names = new Map<string, string | null>();
  const summaries: AdminPatientRequestSummary[] = [];
  for (const row of rows) {
    if (!names.has(row.client_id)) {
      const client = await getClientById(row.client_id);
      names.set(row.client_id, client?.name ?? null);
    }
    summaries.push({
      id: row.id,
      clientId: row.client_id,
      clientName: names.get(row.client_id) ?? null,
      requestType: row.request_type,
      patientText: row.patient_text,
      aiSummary: row.ai_summary,
      status: row.status,
      createdAt: row.created_at,
    });
  }
  return { requests: summaries, totalFound: summaries.length };
}

// ── get_patient_request_details (READ) ────────────────────────────────────
// FASE 1B: detalhe de UM pedido especifico pelo id — util depois de listar
// com ${GET_PATIENT_REQUESTS_TOOL_NAME} ou de um item do dashboard.

export const GET_PATIENT_REQUEST_DETAILS_TOOL_NAME = "getPatientRequestDetails";
export const getPatientRequestDetailsInputSchema = z.object({
  requestId: z.string().min(1).max(120),
}).strict();
export type GetPatientRequestDetailsInput = z.infer<typeof getPatientRequestDetailsInputSchema>;

export async function executeGetPatientRequestDetails(input: GetPatientRequestDetailsInput) {
  const request = await getPatientRequestById(input.requestId);
  if (!request) return { found: false as const };
  const client = await getClientById(request.client_id);
  return {
    found: true as const,
    request: {
      id: request.id,
      clientId: request.client_id,
      clientName: client?.name ?? null,
      requestType: request.request_type,
      patientText: request.patient_text,
      aiSummary: request.ai_summary,
      status: request.status,
      adminNotes: request.admin_notes,
      createdAt: request.created_at,
      reviewedAt: request.reviewed_at,
    },
  };
}

// ── get_pending_ai_proposals (READ) ───────────────────────────────────────
// FASE 1B: reaproveita o MESMO feed deterministico do dashboard
// (lib/dashboard/action-items.ts) — nunca uma segunda query/score.

export const GET_PENDING_AI_PROPOSALS_TOOL_NAME = "getPendingAiProposals";
export const getPendingAiProposalsInputSchema = z.object({}).strict();

export async function executeGetPendingAiProposals() {
  const items = (await getDashboardActionItems()).filter(
    (item) => item.type === "AI_PROPOSAL_PENDING" || item.type === "AI_PROPOSAL_REVIEW"
  );
  return {
    proposals: items.map((item) => ({
      id: item.sourceId,
      status: item.type === "AI_PROPOSAL_REVIEW" ? "requires_review_or_executing" : "pending",
      subject: item.subject,
      description: item.description,
      href: item.href,
      createdAt: item.dueAt,
    })),
    totalFound: items.length,
  };
}

export const PATIENT_REQUESTS_ADMIN_INSTRUCTIONS = `
Você tem a ferramenta ${GET_PATIENT_REQUESTS_TOOL_NAME} para perguntas como "quais pacientes me enviaram solicitações", "tem pedido novo hoje", "o que a Fulana pediu" (se já houver um cliente aberto no contexto atual, use o id dele que já está disponível acima — não precisa perguntar de novo nem buscar com findClient).
Regras importantes:
- Isto é SOMENTE LEITURA. Você pode listar, resumir e sugerir abrir o paciente ou a solicitação — nunca decida nem aplique uma mudança sozinha a partir de um pedido do paciente.
- Para "quais solicitações estão pendentes" (sem mencionar paciente específico), chame ${GET_PATIENT_REQUESTS_TOOL_NAME} com status "pending_review".
- Para o detalhe completo de UMA solicitação específica que já tem o id (ex.: veio de uma listagem anterior ou de um item do dashboard), use ${GET_PATIENT_REQUEST_DETAILS_TOOL_NAME}.
- Para "tenho propostas da IA esperando revisão" (agendamentos/tarefas/planos que a própria IA já propôs e aguardam confirmação humana), use ${GET_PENDING_AI_PROPOSALS_TOOL_NAME} — isto é só leitura, nunca aprova nem executa a proposta.
- Se a nutricionista pedir para "preparar essa alteração" com base num pedido (ex.: troca de alimento), isso é uma ação SEPARADA — use a ferramenta de alteração de plano alimentar (que exige uma nova confirmação clínica dela), nunca assuma que o pedido do paciente já autoriza a mudança.
- Nunca invente número de pedidos pendentes — sempre venha destas ferramentas.
`.trim();
