import { z } from "zod";
import { getAvailableSlots } from "@/lib/repositories/availability";

/**
 * Tool de leitura para "encontre um horario quinta a tarde". Toda a
 * disponibilidade vem de `getAvailableSlots` (calculo deterministico sobre
 * regras de agenda + bloqueios + consultas existentes) — a IA nunca inventa
 * ou estima um horario livre.
 */
export const GET_AVAILABLE_SLOTS_TOOL_NAME = "getAvailableSlots";

export const PERIODS_OF_DAY = ["manha", "tarde", "noite"] as const;
export type PeriodOfDay = (typeof PERIODS_OF_DAY)[number];

export const getAvailableSlotsInputSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
  periodOfDay: z.enum(PERIODS_OF_DAY).optional(),
}).strict();

export type GetAvailableSlotsInput = z.infer<typeof getAvailableSlotsInputSchema>;

const MAX_SLOTS_RETURNED = 20;

function periodBounds(period: PeriodOfDay): [number, number] {
  if (period === "manha") return [0, 12];
  if (period === "tarde") return [12, 18];
  return [18, 24];
}

function hourInSaoPaulo(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(iso))
  );
}

export interface AvailableSlotsResult {
  slots: string[];
  slotsDisplay: string[];
  totalFound: number;
  truncated: boolean;
}

function formatSlotDateTime(iso: string): string {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
  return `${date} às ${time}`;
}

export async function executeGetAvailableSlots(input: GetAvailableSlotsInput): Promise<AvailableSlotsResult> {
  const byDate = await getAvailableSlots(input.fromDate, input.toDate);
  let allSlots = byDate.flatMap((day) => day.slots);

  if (input.periodOfDay) {
    const [startHour, endHour] = periodBounds(input.periodOfDay);
    allSlots = allSlots.filter((iso) => {
      const hour = hourInSaoPaulo(iso);
      return hour >= startHour && hour < endHour;
    });
  }

  const limitedSlots = allSlots.slice(0, MAX_SLOTS_RETURNED);
  return {
    slots: limitedSlots,
    slotsDisplay: limitedSlots.map((iso) => formatSlotDateTime(iso)),
    totalFound: allSlots.length,
    truncated: allSlots.length > MAX_SLOTS_RETURNED,
  };
}

export const AVAILABILITY_LOOKUP_ASSISTANT_INSTRUCTIONS = `
Voce tem a ferramenta ${GET_AVAILABLE_SLOTS_TOOL_NAME} para "quais horarios tem livre quinta a tarde", "acha um horario para a proxima semana". Informe fromDate/toDate no formato AAAA-MM-DD (intervalo maximo de 30 dias) e periodOfDay (manha/tarde/noite) quando a pessoa mencionar um periodo do dia.
Regras importantes:
- Os horarios retornados sao os UNICOS validos — nunca invente, arredonde ou sugira um horario que a ferramenta nao tenha retornado.
- Ao listar os horarios em texto, copie exatamente os valores de \`slotsDisplay\` retornados pela ferramenta (mesma data/hora, mesmo fuso America/Sao_Paulo). Nao reconverta para outro fuso.
- Se vier truncado, informe que a lista foi limitada aos primeiros horarios e sugira estreitar o intervalo se precisar ver mais.
- Depois de mostrar os horarios, se a pessoa escolher um, use a ferramenta de proposta de consulta com esse horario exato — nao aproxime.
`.trim();
