import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getAppointments, type Appointment } from "@/lib/repositories/appointments";
import type { Client } from "@/lib/repositories/clients";
import { generate } from "@/lib/ai/gateway/ai-gateway";
import { sanitizeClinicalContext } from "@/lib/ai/privacy/sanitize-context";
import { AiConfigError, AiProviderError } from "@/lib/ai/core/ai-errors";

/**
 * Briefing pre-consulta (secao 9 do pedido de arquitetura). Separa
 * claramente:
 *  - `systemData`: 100% deterministico, calculado a partir de repositories
 *    reais — a IA NUNCA calcula peso, IMC, variacao ou datas.
 *  - `aiSuggestions`: opcional, uma chamada curta de IA que so transforma os
 *    fatos ja calculados em pontos objetivos para revisar na consulta —
 *    nunca inventa numero novo, nunca substitui `systemData`.
 * Se a IA nao estiver configurada ou falhar, o briefing ainda e util: so
 * fica sem a lista de sugestoes.
 */

export interface PreConsultationSystemData {
  lastAppointment: { date: string; title: string } | null;
  previousWeightKg: number | null;
  currentWeightKg: number | null;
  weightVariationKg: number | null;
  bmi: number | null;
  pendingTasks: { title: string; dueDate: string | null }[];
  activeMealPlanTitle: string | null;
}

export interface PreConsultationBriefing {
  clientId: string;
  clientName: string;
  systemData: PreConsultationSystemData;
  aiSuggestions: string[];
  generatedAt: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function buildSystemData(client: Client, appointmentId: string): Promise<PreConsultationSystemData> {
  const [evolutions, pendingTasks, activeMealPlan, appointments] = await Promise.all([
    getClientEvolutions(client.id),
    getClientTasks(client.id, { status: "pendente" }),
    getActiveMealPlan(client.id),
    getAppointments({ clientId: client.id }),
  ]);

  const targetAppointment = appointments.find((appointment) => appointment.id === appointmentId) ?? null;
  const targetDate = targetAppointment ? new Date(targetAppointment.starts_at).getTime() : Date.now();

  const priorAppointments = appointments
    .filter((appointment: Appointment) => appointment.id !== appointmentId && new Date(appointment.starts_at).getTime() < targetDate)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  const lastAppointment = priorAppointments[0]
    ? { date: priorAppointments[0].starts_at, title: priorAppointments[0].title }
    : null;

  const weighed = evolutions
    .filter((evolution) => evolution.weight !== null && evolution.measured_at)
    .sort((a, b) => new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime());

  const currentWeightKg = weighed[0]?.weight ?? null;
  const previousWeightKg = weighed[1]?.weight ?? null;
  const weightVariationKg =
    currentWeightKg !== null && previousWeightKg !== null ? round1(currentWeightKg - previousWeightKg) : null;
  const bmi = weighed[0]?.bmi ?? null;

  return {
    lastAppointment,
    previousWeightKg,
    currentWeightKg,
    weightVariationKg,
    bmi,
    pendingTasks: pendingTasks.map((task) => ({ title: task.title, dueDate: task.due_date })),
    activeMealPlanTitle: activeMealPlan?.title ?? null,
  };
}

function formatSystemDataForPrompt(data: PreConsultationSystemData): string {
  const lines = [
    data.lastAppointment
      ? `Ultima consulta: ${new Date(data.lastAppointment.date).toLocaleDateString("pt-BR")} (${data.lastAppointment.title}).`
      : "Ultima consulta: nenhuma consulta anterior registrada.",
    data.previousWeightKg !== null && data.currentWeightKg !== null
      ? `Peso: ${data.previousWeightKg} kg -> ${data.currentWeightKg} kg (variacao: ${data.weightVariationKg} kg).`
      : data.currentWeightKg !== null
        ? `Peso atual: ${data.currentWeightKg} kg (sem peso anterior para comparar).`
        : "Sem registro de peso.",
    data.bmi !== null ? `IMC mais recente: ${data.bmi}.` : "Sem IMC calculado.",
    data.activeMealPlanTitle ? `Plano alimentar ativo: ${data.activeMealPlanTitle}.` : "Sem plano alimentar ativo.",
    data.pendingTasks.length
      ? `Tarefas pendentes: ${data.pendingTasks.map((task) => task.title).join("; ")}.`
      : "Sem tarefas pendentes.",
  ];
  return lines.join("\n");
}

const BRIEFING_SYSTEM_PROMPT = `Voce ajuda a nutricionista a se preparar para uma consulta, olhando apenas os FATOS DO SISTEMA fornecidos abaixo.
REGRAS ABSOLUTAS:
- Nunca invente ou recalcule um numero (peso, IMC, variacao, data) — use somente os que ja vierem prontos nos fatos.
- Gere de 3 a 5 pontos curtos e objetivos para a nutricionista revisar na consulta, cada um comecando com "- ".
- Baseie os pontos nos fatos fornecidos (ex.: variacao de peso, tarefas pendentes, tempo desde a ultima consulta) — nao invente sintoma, queixa ou dado clinico que nao esteja nos fatos.
- Se os fatos forem muito escassos, diga isso num unico ponto em vez de inventar contexto.
- O rotulo "Paciente: ..." no prompt e so um identificador interno de sistema, nunca um nome a repetir. NUNCA escreva esse identificador nos pontos gerados — a nutricionista ja sabe quem e a paciente. Refira-se a ela so como "a paciente"/"o paciente", ou omita o sujeito.
- Responda APENAS com a lista de pontos, sem introducao nem conclusao.`;

function parseSuggestionBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 5);
}

export async function generatePreConsultationBriefing(
  client: Client,
  appointmentId: string,
  adminId?: string | null
): Promise<PreConsultationBriefing> {
  const systemData = await buildSystemData(client, appointmentId);

  let aiSuggestions: string[] = [];
  try {
    const { pseudonym, contextBlock } = sanitizeClinicalContext(client.name, [
      { label: "FATOS_DO_SISTEMA", content: formatSystemDataForPrompt(systemData) },
    ]);
    const result = await generate({
      agent: "pre-consultation-briefing",
      adminId,
      system: BRIEFING_SYSTEM_PROMPT,
      prompt: `Paciente: ${pseudonym}.\n\n${contextBlock}\n\nGere os pontos para revisar na consulta.`,
      maxOutputTokens: 500,
    });
    aiSuggestions = parseSuggestionBullets(result.text);
  } catch (error) {
    // Sem IA configurada ou provedor fora do ar: o briefing continua util
    // so com os dados do sistema, sem a lista de sugestoes.
    if (!(error instanceof AiConfigError) && !(error instanceof AiProviderError)) {
      console.error("[pre-consultation-briefing] Falha inesperada ao gerar sugestoes:", error);
    }
  }

  return {
    clientId: client.id,
    clientName: client.name,
    systemData,
    aiSuggestions,
    generatedAt: new Date().toISOString(),
  };
}
