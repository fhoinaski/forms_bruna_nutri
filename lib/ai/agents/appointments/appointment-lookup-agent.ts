import { z } from "zod";
import { getAppointments, getAppointmentById, type Appointment } from "@/lib/repositories/appointments";
import { getClientById } from "@/lib/repositories/clients";
import { getSaoPauloDateKey, getSaoPauloDayBoundaries } from "@/lib/utils/timezone";
import { truncateForToolOutput } from "@/lib/ai/privacy/sanitize-context";

/**
 * Tools de leitura de agenda (FASE 1B do roadmap de operador interno —
 * docs/AI-OPERATOR-AUDIT-ROADMAP.md), sempre disponiveis mesmo sem cliente
 * em contexto. Nunca inventa horario/consulta — sempre le
 * lib/repositories/appointments.ts, o mesmo repositorio que a agenda real
 * usa.
 */

function isCancelled(appointment: Appointment): boolean {
  return appointment.status === "cancelado";
}

function toSummary(appointment: Appointment) {
  return {
    id: appointment.id,
    clientId: appointment.client_id,
    clientName: appointment.client_name,
    title: appointment.title,
    appointmentType: appointment.appointment_type,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    status: appointment.status,
    location: appointment.location,
  };
}

// ── get_today_appointments (READ) ─────────────────────────────────────────

export const GET_TODAY_APPOINTMENTS_TOOL_NAME = "getTodayAppointments";
export const getTodayAppointmentsInputSchema = z.object({
  /** Data especifica (AAAA-MM-DD) — quando ausente, usa "hoje" no fuso America/Sao_Paulo. Use para "amanha"/outro dia especifico, calculando a data a partir da referencia do sistema. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD").optional(),
}).strict();
export type GetTodayAppointmentsInput = z.infer<typeof getTodayAppointmentsInputSchema>;

export async function executeGetTodayAppointments(input: GetTodayAppointmentsInput) {
  const dateKey = input.date ?? getSaoPauloDateKey();
  const { start, end } = getSaoPauloDayBoundaries(new Date(`${dateKey}T12:00:00-03:00`));
  const appointments = (await getAppointments({ from: start, to: end })).filter((a) => !isCancelled(a));
  return { date: dateKey, appointments: appointments.map(toSummary) };
}

// ── get_next_appointment (READ) ───────────────────────────────────────────

export const GET_NEXT_APPOINTMENT_TOOL_NAME = "getNextAppointment";
export const getNextAppointmentInputSchema = z.object({
  /** Quando informado, a proxima consulta DESTE paciente especifico — sem informar, a proxima consulta geral da agenda. */
  clientId: z.string().min(1).max(120).optional(),
}).strict();
export type GetNextAppointmentInput = z.infer<typeof getNextAppointmentInputSchema>;

export async function executeGetNextAppointment(input: GetNextAppointmentInput) {
  if (input.clientId) {
    const client = await getClientById(input.clientId);
    if (!client) return { found: false as const };
  }
  const nowIso = new Date().toISOString();
  const upcoming = (await getAppointments({ clientId: input.clientId, from: nowIso })).filter((a) => !isCancelled(a));
  const next = upcoming[0];
  if (!next) return { found: false as const };
  return { found: true as const, appointment: toSummary(next) };
}

// ── get_appointment_details (READ) ────────────────────────────────────────

export const GET_APPOINTMENT_DETAILS_TOOL_NAME = "getAppointmentDetails";
export const getAppointmentDetailsInputSchema = z.object({
  appointmentId: z.string().min(1).max(120),
}).strict();
export type GetAppointmentDetailsInput = z.infer<typeof getAppointmentDetailsInputSchema>;

export async function executeGetAppointmentDetails(input: GetAppointmentDetailsInput) {
  const appointment = await getAppointmentById(input.appointmentId);
  if (!appointment) return { found: false as const };
  return {
    found: true as const,
    appointment: {
      ...toSummary(appointment),
      // FASE 2A: notes e texto livre (pode ter sido escrito com base no que a
      // paciente relatou) — trunca no limite padrao antes de virar resultado
      // de tool, nunca silenciosamente.
      notes: appointment.notes ? truncateForToolOutput(appointment.notes).text : null,
      portalVisible: Boolean(appointment.portal_visible),
      clientConfirmedAt: appointment.client_confirmed_at,
      cancellationReason: appointment.cancellation_reason,
    },
  };
}

// ── get_upcoming_appointments (READ) ──────────────────────────────────────

export const GET_UPCOMING_APPOINTMENTS_TOOL_NAME = "getUpcomingAppointments";
export const getUpcomingAppointmentsInputSchema = z.object({
  /** Quantos dias a partir de agora (1-30). Padrao: 7. */
  days: z.number().int().positive().max(30).optional(),
  clientId: z.string().min(1).max(120).optional(),
}).strict();
export type GetUpcomingAppointmentsInput = z.infer<typeof getUpcomingAppointmentsInputSchema>;

const MAX_UPCOMING_RETURNED = 50;

export async function executeGetUpcomingAppointments(input: GetUpcomingAppointmentsInput) {
  const days = input.days ?? 7;
  const nowIso = new Date().toISOString();
  const toIso = new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
  const appointments = (await getAppointments({ clientId: input.clientId, from: nowIso, to: toIso }))
    .filter((a) => !isCancelled(a))
    .slice(0, MAX_UPCOMING_RETURNED);
  return { days, appointments: appointments.map(toSummary) };
}

export const APPOINTMENT_LOOKUP_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar a agenda real sem precisar que a nutricionista abra a tela de agenda — nunca invente consulta ou horario, sempre use estas ferramentas.
Como fazer isso:
- Para "quais consultas tenho hoje" ou "quem eu atendo [dia especifico]", use ${GET_TODAY_APPOINTMENTS_TOOL_NAME} — sem informar "date", ele usa hoje; para "amanha" ou outro dia, calcule a data (AAAA-MM-DD) a partir da data de referencia do sistema e informe.
- Para "qual minha proxima consulta" (geral) ou "qual a proxima consulta da Maria" (de um paciente especifico), use ${GET_NEXT_APPOINTMENT_TOOL_NAME} — informe clientId so quando for sobre um paciente especifico (resolva o id com findClient primeiro se so tiver o nome).
- Para detalhes completos de UMA consulta especifica (local, observacoes, confirmacao) quando ja tiver o id, use ${GET_APPOINTMENT_DETAILS_TOOL_NAME}.
- Para "quais consultas nos proximos dias/semana", use ${GET_UPCOMING_APPOINTMENTS_TOOL_NAME} com o numero de dias (padrao 7) — filtre por clientId quando a pergunta for sobre um paciente especifico ("ela tem consulta essa semana?").
- Consultas canceladas nunca aparecem nestes resultados.
`.trim();
