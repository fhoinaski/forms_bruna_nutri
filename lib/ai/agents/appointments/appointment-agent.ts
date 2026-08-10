import { z } from "zod";
import type { Appointment } from "@/lib/repositories/appointments";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";

export const PROPOSE_NEW_APPOINTMENT_TOOL_NAME = "proposeNewAppointment";

export const APPOINTMENT_TYPES = ["primeira_consulta", "consulta", "retorno", "avaliacao", "online", "outro"] as const;

export const proposeNewAppointmentInputSchema = z.object({
  title: z.string().min(2).max(160),
  appointment_type: z.enum(APPOINTMENT_TYPES).default("consulta"),
  starts_at_display: z.string().min(10).max(20).describe("Data e hora no formato DD/MM/AAAA HH:mm"),
  location: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
}).strict();

export type ProposeNewAppointmentInput = z.infer<typeof proposeNewAppointmentInputSchema>;

function formatAppointmentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function buildUpcomingAppointmentsContext(appointments: Appointment[]): string {
  const upcoming = appointments.filter((appointment) => new Date(appointment.starts_at).getTime() >= Date.now() && appointment.status !== "cancelado");
  if (!upcoming.length) return "O cliente nao tem consultas futuras agendadas.";
  const list = upcoming
    .slice(0, 5)
    .map((appointment) => `- ${formatAppointmentDate(appointment.starts_at)}: ${appointment.title} (${appointment.appointment_type}, status: ${appointment.status})`)
    .join("\n");
  return `Proximas consultas agendadas para este cliente:\n${list}`;
}

export const APPOINTMENT_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode marcar uma nova consulta na agenda para o cliente atual quando a nutricionista pedir (ex.: "marca uma consulta pro Fernando semana que vem as 14h", "agenda um retorno pra ela dia 20 as 10h").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_APPOINTMENT_TOOL_NAME} com titulo (ex.: "Consulta", "Retorno"), tipo (${APPOINTMENT_TYPES.join(", ")}), data e hora no formato DD/MM/AAAA HH:mm (calcule a data real a partir de referencias como "semana que vem", "amanha", "dia 20" usando a data de hoje como base) e, se mencionado, local/link e observacoes.
- Se a nutricionista nao disser um horario claro, pergunte antes de propor — nao invente hora.
- Isto NAO verifica conflitos de agenda automaticamente; avise que vale conferir a agenda antes de confirmar se o horario for incerto.
- ${PROPOSAL_DISCLAIMER}
`.trim();
