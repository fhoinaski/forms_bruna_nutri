import { z } from "zod";
import { getAppointmentById } from "@/lib/repositories/appointments";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";

/**
 * FASE 3 (safe writes operacionais) — propostas de escrita em agenda:
 * reagendar e cancelar. Segue o MESMO fluxo generico ja existente
 * (propor -> proposal-store persiste -> confirm route revalida e executa
 * via lib/ai/core/proposal-handlers.ts) — nenhum fluxo novo criado.
 *
 * `execute` aqui so BUSCA e VALIDA o estado atual (existe? nao esta
 * cancelada?) para montar uma proposta com um snapshot preciso — a escrita
 * real e sempre feita pelo handler de confirmacao, que revalida tudo de
 * novo no momento de aplicar (o snapshot pode ter ficado desatualizado
 * enquanto a proposta esperava confirmacao).
 */

// ── propose_reschedule_appointment ────────────────────────────────────────

export const PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME = "proposeRescheduleAppointment";

export const proposeRescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1).max(120),
  newStartsAtDisplay: z.string().min(10).max(20).describe("Nova data e hora no formato DD/MM/AAAA HH:mm"),
}).strict();
export type ProposeRescheduleAppointmentInput = z.infer<typeof proposeRescheduleAppointmentInputSchema>;

export type ProposeRescheduleAppointmentOutput =
  | { error: string }
  | {
      appointmentId: string;
      clientId: string | null;
      clientName: string | null;
      title: string;
      previousStartsAtIso: string;
      newStartsAtDisplay: string;
    };

export async function executeProposeRescheduleAppointment(
  input: ProposeRescheduleAppointmentInput
): Promise<ProposeRescheduleAppointmentOutput> {
  const appointment = await getAppointmentById(input.appointmentId);
  if (!appointment) return { error: "Consulta não encontrada. Peça para reler a agenda antes de tentar de novo." };
  if (appointment.status === "cancelado") {
    return { error: "Essa consulta já está cancelada — não é possível reagendar." };
  }
  if (!appointment.client_id) {
    return { error: "Essa consulta não está vinculada a um paciente — reagende manualmente pela agenda." };
  }
  return {
    appointmentId: appointment.id,
    clientId: appointment.client_id,
    clientName: appointment.client_name,
    title: appointment.title,
    previousStartsAtIso: appointment.starts_at,
    newStartsAtDisplay: input.newStartsAtDisplay,
  };
}

// ── propose_cancel_appointment ────────────────────────────────────────────

export const PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME = "proposeCancelAppointment";

export const proposeCancelAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1).max(120),
  cancellationReason: z.string().max(300).optional(),
}).strict();
export type ProposeCancelAppointmentInput = z.infer<typeof proposeCancelAppointmentInputSchema>;

export type ProposeCancelAppointmentOutput =
  | { error: string }
  | {
      appointmentId: string;
      clientId: string | null;
      clientName: string | null;
      title: string;
      startsAtIso: string;
      previousStatus: string;
      cancellationReason: string | null;
    };

export async function executeProposeCancelAppointment(
  input: ProposeCancelAppointmentInput
): Promise<ProposeCancelAppointmentOutput> {
  const appointment = await getAppointmentById(input.appointmentId);
  if (!appointment) return { error: "Consulta não encontrada. Peça para reler a agenda antes de tentar de novo." };
  if (appointment.status === "cancelado") {
    return { error: "Essa consulta já está cancelada." };
  }
  return {
    appointmentId: appointment.id,
    clientId: appointment.client_id,
    clientName: appointment.client_name,
    title: appointment.title,
    startsAtIso: appointment.starts_at,
    previousStatus: appointment.status,
    cancellationReason: input.cancellationReason?.trim() || null,
  };
}

export const APPOINTMENT_WRITE_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode reagendar ou cancelar uma consulta real na agenda — sempre como PROPOSTA, nunca aplicada sozinha.
Como fazer isso:
- Primeiro identifique a consulta certa: use ${"getNextAppointment"}/${"getTodayAppointments"}/${"getUpcomingAppointments"} (ou ${"getAppointmentDetails"} se ja tiver o id) para achar o appointmentId real — nunca invente um id.
- Se houver mais de uma consulta que pode ser a pretendida (ex.: "cancela minha consulta com o João" e ha duas consultas com pacientes chamados João), pergunte qual antes de propor — nunca escolha sozinha.
- Para reagendar, use ${PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME} com o novo horario no formato DD/MM/AAAA HH:mm (calcule a data real a partir de referencias como "amanha"/"sexta" usando a data de hoje como base).
- Para cancelar, use ${PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME}, incluindo o motivo se a pessoa mencionar um.
- Depois de chamar a ferramenta, resuma exatamente o que vai mudar (de/para no caso de reagendamento) e diga que precisa de confirmacao explicita antes de aplicar — nunca diga que ja reagendou/cancelou antes da confirmacao.
- Se a ferramenta devolver "error" (consulta nao encontrada, ja cancelada, sem paciente vinculado), explique o problema em texto simples, sem insistir.
- ${PROPOSAL_DISCLAIMER}
`.trim();
