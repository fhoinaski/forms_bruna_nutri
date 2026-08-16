import { z } from "zod";
import { getClientById } from "@/lib/repositories/clients";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { getAppointments } from "@/lib/repositories/appointments";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { CLINICAL_MARKER_CODE_LABELS, type ClinicalMarkerCode } from "@/lib/clinical/structured-markers";

/**
 * Tools de leitura de paciente encadeaveis por id (FASE 1 do roadmap de
 * operador interno) — ao contrario do contexto hoje auto-injetado no prompt
 * (prontuario/plano/protocolos), que so aparece quando o `clientId` ja veio
 * pre-resolvido da tela aberta, estas tools aceitam o clientId como
 * parametro explicito. Isso permite o encadeamento "ache o cliente pelo
 * nome (${"findClient"}) -> leia o dado dele" no MESMO turno, mesmo sem
 * nenhum cliente pre-selecionado na tela (secao 23 do pedido de tool
 * chaining). O backend sempre revalida a existencia do cliente a partir do
 * clientId recebido — nunca confia em um id so porque o modelo o citou.
 */

const clientIdInputSchema = z.object({ clientId: z.string().min(1).max(120) }).strict();

// ── get_patient_summary (READ) ────────────────────────────────────────────

export const GET_PATIENT_SUMMARY_TOOL_NAME = "getPatientSummary";
export const getPatientSummaryInputSchema = clientIdInputSchema;
export type GetPatientSummaryInput = z.infer<typeof getPatientSummaryInputSchema>;

export async function executeGetPatientSummary(input: GetPatientSummaryInput) {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false as const };

  const nowIso = new Date().toISOString();
  const [activePlan, protocols, tasks, appointments] = await Promise.all([
    getActiveMealPlan(client.id),
    getClientProtocols(client.id),
    getClientTasks(client.id),
    getAppointments({ clientId: client.id }),
  ]);

  const future = appointments.filter((a) => a.starts_at >= nowIso);
  const past = appointments.filter((a) => a.starts_at < nowIso);
  const nextAppointment = future[0] ?? null;
  const lastAppointment = past[past.length - 1] ?? null;
  const pendingTasksCount = tasks.filter((t) => t.status !== "concluida" && t.status !== "cancelada").length;

  return {
    found: true as const,
    client: { id: client.id, name: client.name, email: client.email, phone: client.phone, status: client.status },
    activePlan: activePlan ? { mealPlanId: activePlan.id, title: activePlan.title, version: activePlan.version } : null,
    protocolsCount: protocols.length,
    pendingTasksCount,
    nextAppointment: nextAppointment
      ? { id: nextAppointment.id, startsAt: nextAppointment.starts_at, type: nextAppointment.appointment_type, status: nextAppointment.status }
      : null,
    lastAppointment: lastAppointment
      ? { id: lastAppointment.id, startsAt: lastAppointment.starts_at, type: lastAppointment.appointment_type, status: lastAppointment.status }
      : null,
  };
}

// ── get_patient_active_plan (READ) ────────────────────────────────────────

export const GET_PATIENT_ACTIVE_PLAN_TOOL_NAME = "getPatientActivePlan";
export const getPatientActivePlanInputSchema = clientIdInputSchema;
export type GetPatientActivePlanInput = z.infer<typeof getPatientActivePlanInputSchema>;

export async function executeGetPatientActivePlan(input: GetPatientActivePlanInput) {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false as const };

  const plan = await getActiveMealPlan(client.id);
  if (!plan) return { found: true as const, hasActivePlan: false as const };

  return {
    found: true as const,
    hasActivePlan: true as const,
    mealPlanId: plan.id,
    version: plan.version,
    title: plan.title,
    target: {
      energyKcal: plan.target_energy_kcal ?? null,
      proteinG: plan.target_protein_g ?? null,
      carbohydrateG: plan.target_carbohydrate_g ?? null,
      fatG: plan.target_fat_g ?? null,
    },
    meals: plan.meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      suggestedTime: meal.suggested_time ?? null,
      items: meal.items.map((item) => ({ id: item.id, food: item.food, quantity: item.quantity, unit: item.unit })),
    })),
  };
}

// ── get_patient_clinical_markers (READ) ───────────────────────────────────

export const GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME = "getPatientClinicalMarkers";
export const getPatientClinicalMarkersInputSchema = clientIdInputSchema;
export type GetPatientClinicalMarkersInput = z.infer<typeof getPatientClinicalMarkersInputSchema>;

/**
 * Devolve so os campos estruturados (tipo/rotulo/severidade/status) — nunca
 * `evidence_text` (texto livre que pode ter sido escrito a partir de fala do
 * paciente), para nao introduzir uma superficie de prompt injection nova
 * numa tool de leitura sempre ativa. Quem precisar do texto de evidencia
 * completo continua vendo na ficha do paciente (fora do assistente).
 */
export async function executeGetPatientClinicalMarkers(input: GetPatientClinicalMarkersInput) {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false as const };

  const markers = await listPatientClinicalMarkers(client.id);
  return {
    found: true as const,
    markers: markers.map((marker) => ({
      type: marker.type,
      label: marker.label ?? CLINICAL_MARKER_CODE_LABELS[marker.normalized_code as ClinicalMarkerCode] ?? marker.normalized_code,
      severity: marker.severity,
      status: marker.status,
    })),
  };
}

export const PATIENT_LOOKUP_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar dados de UM paciente especifico pelo id, mesmo que nenhum cliente esteja pre-selecionado na tela atual — util quando a pessoa pergunta sobre um paciente so pelo nome, no mesmo turno.
Como fazer isso:
- Se voce ainda nao sabe o id do paciente, use findClient primeiro. Se vier mais de um resultado parecido, pergunte qual antes de continuar — nunca escolha sozinha.
- Para um resumo rapido (plano ativo, quantos protocolos, tarefas pendentes, proxima/ultima consulta), use ${GET_PATIENT_SUMMARY_TOOL_NAME}.
- Para o plano alimentar ativo completo (refeicoes e itens, com os ids reais), use ${GET_PATIENT_ACTIVE_PLAN_TOOL_NAME} — se precisar dos totais nutricionais (calorias/proteina/carboidrato/gordura) desse plano, encadeie com getMealPlanNutrition usando o mealPlanId devolvido, nunca some os itens de cabeca.
- Para alergias, intolerancias, restricoes alimentares ou sinalizacoes clinicas (gestacao, bariatrica, etc) cadastradas, use ${GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME} — devolve so o que esta oficialmente cadastrado, nunca infira uma alergia a partir de uma conversa solta.
- Estas ferramentas so leem — nunca alteram nada, entao nao exigem confirmacao.
`.trim();
