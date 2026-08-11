import { z } from "zod";
import { listPatientRequests, type PatientRequestStatus } from "@/lib/repositories/patient-requests";
import { getClientById } from "@/lib/repositories/clients";

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

export const PATIENT_REQUESTS_ADMIN_INSTRUCTIONS = `
Você tem a ferramenta ${GET_PATIENT_REQUESTS_TOOL_NAME} para perguntas como "quais pacientes me enviaram solicitações", "tem pedido novo hoje", "o que a Fulana pediu" (se já houver um cliente aberto no contexto atual, use o id dele que já está disponível acima — não precisa perguntar de novo nem buscar com findClient).
Regras importantes:
- Isto é SOMENTE LEITURA. Você pode listar, resumir e sugerir abrir o paciente ou a solicitação — nunca decida nem aplique uma mudança sozinha a partir de um pedido do paciente.
- Se a nutricionista pedir para "preparar essa alteração" com base num pedido (ex.: troca de alimento), isso é uma ação SEPARADA — use a ferramenta de alteração de plano alimentar (que exige uma nova confirmação clínica dela), nunca assuma que o pedido do paciente já autoriza a mudança.
- Nunca invente número de pedidos pendentes — sempre venha desta ferramenta.
`.trim();
