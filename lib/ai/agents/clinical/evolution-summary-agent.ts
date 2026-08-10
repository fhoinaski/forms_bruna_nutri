import { z } from "zod";
import { getClientById } from "@/lib/repositories/clients";
import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { getAppointments } from "@/lib/repositories/appointments";

/**
 * Tool de leitura para "como esse paciente evoluiu desde a ultima consulta".
 * clientId vem do proprio tool-call do LLM (tipicamente obtido antes via
 * findClient) — nao do AssistantContext ambiente — porque o fluxo tipico
 * ("abra a Maria e me diga como ela evoluiu") descobre o cliente DURANTE o
 * mesmo turno. O id e sempre validado contra o banco aqui (nunca confiamos
 * apenas no que o frontend/LLM afirma); e uma tool "read": o admin ja pode
 * legitimamente consultar evolucao de qualquer paciente seu, do mesmo jeito
 * que findClient/getSystemOverview ja permitem.
 */
export const GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME = "getClientEvolutionSummary";

export const getClientEvolutionSummaryInputSchema = z.object({
  clientId: z.string().min(1).max(120),
}).strict();

export type GetClientEvolutionSummaryInput = z.infer<typeof getClientEvolutionSummaryInputSchema>;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface ClientEvolutionSummary {
  found: true;
  clientName: string;
  lastAppointment: { date: string; title: string } | null;
  previousWeightKg: number | null;
  currentWeightKg: number | null;
  weightVariationKg: number | null;
  bmi: number | null;
  measurementsOnRecord: number;
}

export type GetClientEvolutionSummaryOutput = ClientEvolutionSummary | { found: false };

export async function executeGetClientEvolutionSummary(
  input: GetClientEvolutionSummaryInput
): Promise<GetClientEvolutionSummaryOutput> {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false };

  const [evolutions, appointments] = await Promise.all([
    getClientEvolutions(client.id),
    getAppointments({ clientId: client.id }),
  ]);

  const pastAppointments = appointments
    .filter((appointment) => appointment.status === "realizado" && new Date(appointment.starts_at).getTime() < Date.now())
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  const lastAppointment = pastAppointments[0]
    ? { date: pastAppointments[0].starts_at, title: pastAppointments[0].title }
    : null;

  const weighed = evolutions
    .filter((evolution) => evolution.weight !== null && evolution.measured_at)
    .sort((a, b) => new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime());

  const currentWeightKg = weighed[0]?.weight ?? null;
  const previousWeightKg = weighed[1]?.weight ?? null;
  const weightVariationKg =
    currentWeightKg !== null && previousWeightKg !== null ? round1(currentWeightKg - previousWeightKg) : null;

  return {
    found: true,
    clientName: client.name,
    lastAppointment,
    previousWeightKg,
    currentWeightKg,
    weightVariationKg,
    bmi: weighed[0]?.bmi ?? null,
    measurementsOnRecord: evolutions.length,
  };
}

export const EVOLUTION_SUMMARY_ASSISTANT_INSTRUCTIONS = `
Voce tem a ferramenta ${GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME} para responder "como esse paciente evoluiu", "o que mudou desde a ultima consulta". Use o id do cliente (encontrado antes via busca de cliente, se necessario).
Regras importantes:
- Todos os numeros (peso anterior/atual, variacao, IMC) vem prontos da ferramenta — nunca calcule ou arredonde voce mesma, nunca invente um valor que a ferramenta nao retornou.
- Se "found" vier false, informe que nao encontrou esse cliente — nao invente dados.
- Se nao houver peso anterior para comparar, diga isso claramente em vez de inventar uma variacao.
`.trim();
