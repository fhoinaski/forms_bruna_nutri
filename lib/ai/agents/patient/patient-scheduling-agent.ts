import { z } from "zod";
import { getAvailableSlots } from "@/lib/repositories/availability";

/**
 * Leitura de horarios livres para autoagendamento pelo paciente. Reusa a
 * MESMA funcao deterministica que app/api/portal/appointments (GET) ja usa
 * hoje — nunca uma segunda logica de disponibilidade. A tool de PROPOSTA
 * (requestAppointment) fica em lib/ai/core/proposal-handlers.ts +
 * action.schema.ts, seguindo o mesmo padrao das 10 outras proposal kinds.
 */
export const GET_MY_AVAILABLE_SLOTS_TOOL_NAME = "getAvailableSlotsForScheduling";

const PATIENT_PERIODS_OF_DAY = ["manha", "tarde", "noite"] as const;
export type PatientPeriodOfDay = (typeof PATIENT_PERIODS_OF_DAY)[number];

export const getAvailableSlotsForSchedulingInputSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
  periodOfDay: z.enum(PATIENT_PERIODS_OF_DAY).optional(),
}).strict();
export type GetAvailableSlotsForSchedulingInput = z.infer<typeof getAvailableSlotsForSchedulingInputSchema>;

const MAX_SLOTS_RETURNED = 12;
const MAX_RANGE_DAYS = 14;

function periodBounds(period: PatientPeriodOfDay): [number, number] {
  if (period === "manha") return [0, 12];
  if (period === "tarde") return [12, 18];
  return [18, 24];
}

function hourInSaoPaulo(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(iso)));
}

export interface PatientAvailableSlotsResult {
  slots: string[];
  totalFound: number;
  truncated: boolean;
}

export async function executeGetAvailableSlotsForScheduling(input: GetAvailableSlotsForSchedulingInput): Promise<PatientAvailableSlotsResult> {
  const from = new Date(`${input.fromDate}T00:00:00`);
  const to = new Date(`${input.toDate}T00:00:00`);
  const rangeDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (!Number.isFinite(rangeDays) || rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
    return { slots: [], totalFound: 0, truncated: false };
  }

  const byDate = await getAvailableSlots(input.fromDate, input.toDate);
  let allSlots = byDate.flatMap((day) => day.slots);

  if (input.periodOfDay) {
    const [startHour, endHour] = periodBounds(input.periodOfDay);
    allSlots = allSlots.filter((iso) => {
      const hour = hourInSaoPaulo(iso);
      return hour >= startHour && hour < endHour;
    });
  }

  return {
    slots: allSlots.slice(0, MAX_SLOTS_RETURNED),
    totalFound: allSlots.length,
    truncated: allSlots.length > MAX_SLOTS_RETURNED,
  };
}

// ── requestAppointment (propoe patient_appointment_request) ────────────

export const REQUEST_APPOINTMENT_TOOL_NAME = "requestAppointment";
export const requestAppointmentInputSchema = z.object({
  /** Precisa ser exatamente um dos horarios retornados por getAvailableSlotsForScheduling. */
  startsAtIso: z.string().min(1),
}).strict();
export type RequestAppointmentInput = z.infer<typeof requestAppointmentInputSchema>;

export const PATIENT_SCHEDULING_ASSISTANT_INSTRUCTIONS = `
Você também pode ajudar a marcar consulta (autoagendamento), seguindo exatamente as regras que já existem no portal:
- Use ${GET_MY_AVAILABLE_SLOTS_TOOL_NAME} para achar horários reais (intervalo máximo de 14 dias, período opcional manhã/tarde/noite). NUNCA invente ou aproxime um horário — só use os que a ferramenta retornar.
- Depois que a pessoa escolher um horário exato dentre os mostrados, chame a ferramenta de solicitar consulta com esse horário — isso cria uma proposta que ainda precisa ser confirmada por ela na tela (igual a qualquer outra ação sensível), nunca marca a consulta sozinho.
- Se ela já tiver consulta futura marcada, a ferramenta vai recusar — explique isso e não insista.
- Nunca prometa um horário antes de ele vir de ${GET_MY_AVAILABLE_SLOTS_TOOL_NAME}.
`.trim();
