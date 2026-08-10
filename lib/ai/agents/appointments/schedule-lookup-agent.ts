import { z } from "zod";
import { getAppointments } from "@/lib/repositories/appointments";
import { getClientTasks } from "@/lib/repositories/client-tasks";

/**
 * Tool de leitura para workflows multi-etapas do tipo "pacientes de amanha
 * com pendencias" — junta agenda + tarefas pendentes num unico resultado
 * deterministico, evitando que o LLM precise encadear "achar consultas do
 * dia" + "achar tarefas de cada cliente" tool a tool (menos steps, menos
 * chance de estourar o limite de loop).
 */
export const GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME = "getPatientsWithPendenciesForDate";

export const getPatientsWithPendenciesInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
}).strict();

export type GetPatientsWithPendenciesInput = z.infer<typeof getPatientsWithPendenciesInputSchema>;

const SAO_PAULO_OFFSET = "-03:00";
const MAX_PATIENTS_RETURNED = 20;
const MAX_TASKS_PER_PATIENT = 5;

function dayRangeIso(dateKey: string): { from: string; to: string } {
  return {
    from: new Date(`${dateKey}T00:00:00${SAO_PAULO_OFFSET}`).toISOString(),
    to: new Date(`${dateKey}T23:59:59${SAO_PAULO_OFFSET}`).toISOString(),
  };
}

export interface PatientWithPendencies {
  clientId: string;
  clientName: string;
  appointmentTime: string;
  appointmentTitle: string;
  pendingTasks: string[];
}

export interface PatientsWithPendenciesResult {
  date: string;
  patients: PatientWithPendencies[];
  totalFound: number;
  truncated: boolean;
}

export async function executeGetPatientsWithPendenciesForDate(
  input: GetPatientsWithPendenciesInput
): Promise<PatientsWithPendenciesResult> {
  const { from, to } = dayRangeIso(input.date);
  const appointments = await getAppointments({ from, to });
  const withClient = appointments.filter((appointment) => appointment.client_id && appointment.status !== "cancelado");
  const limited = withClient.slice(0, MAX_PATIENTS_RETURNED);

  const patients = await Promise.all(
    limited.map(async (appointment): Promise<PatientWithPendencies> => {
      const clientId = appointment.client_id as string;
      const tasks = await getClientTasks(clientId, { status: "pendente" });
      return {
        clientId,
        clientName: appointment.client_name ?? "Paciente sem nome",
        appointmentTime: appointment.starts_at,
        appointmentTitle: appointment.title,
        pendingTasks: tasks.slice(0, MAX_TASKS_PER_PATIENT).map((task) => task.title),
      };
    })
  );

  return {
    date: input.date,
    patients,
    totalFound: withClient.length,
    truncated: withClient.length > MAX_PATIENTS_RETURNED,
  };
}

export const SCHEDULE_LOOKUP_ASSISTANT_INSTRUCTIONS = `
Voce tem a ferramenta ${GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME} para perguntas como "quem tem consulta amanha e o que esta pendente", "pacientes de hoje com pendencias em aberto".
Como fazer isso:
- Informe a data no formato AAAA-MM-DD, calculada a partir de referencias como "hoje"/"amanha" usando a data atual como base.
- O resultado ja vem com agenda e tarefas pendentes cruzadas — nunca invente uma pendencia que a ferramenta nao retornou, e nunca calcule a lista de pacientes voce mesma.
- Se o resultado vier marcado como truncado (mais pacientes do que os retornados), avise que a lista foi limitada e sugira refinar por um intervalo menor se precisar ver todos.
`.trim();
