import { z } from "zod";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getAppointments } from "@/lib/repositories/appointments";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { listPatientRequests, type PatientRequestStatus } from "@/lib/repositories/patient-requests";
import { patientRequestTypeSchema, type PatientRequestType } from "@/lib/ai/schemas/action.schema";

/**
 * Solicitacao do PACIENTE para a nutricionista revisar (secao 2 do pedido:
 * "Paciente pediu que a profissional revise isso" — NUNCA uma alteracao
 * clinica). `executeRequestProfessionalReview` recebe `clientId` do mesmo
 * fechamento vinculado a sessao usado pelas demais tools do paciente —
 * nunca do input do modelo — e revalida ownership de CADA referencia
 * opcional (mealPlanId/mealId/itemId/appointmentId/clientTaskId) ANTES de
 * montar a proposta: uma referencia que nao pertence ao paciente autenticado
 * faz a tool devolver "error", nunca uma proposta com o item errado.
 */

export const REQUEST_TYPE_LABELS: Record<PatientRequestType, string> = {
  food_substitution: "Substituição alimentar",
  meal_plan_difficulty: "Dificuldade com o plano",
  symptom_or_complaint: "Relato de sintoma ou queixa",
  appointment_request: "Pedido sobre consulta",
  task_difficulty: "Dificuldade com tarefa",
  general_question: "Dúvida geral",
  other: "Outro assunto",
};

// ── requestProfessionalReview ────────────────────────────────────────────

export const REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME = "requestProfessionalReview";
export const requestProfessionalReviewInputSchema = z.object({
  requestType: patientRequestTypeSchema,
  /** Fala original da paciente, preservada tal como veio — nunca reescrita pela IA. */
  patientText: z.string().min(1).max(1000),
  /** Resumo curto opcional gerado pela IA — nunca substitui patientText. */
  aiSummary: z.string().max(300).optional(),
  /** Alimento que a paciente gostaria de usar no lugar do atual (so para food_substitution) — texto livre, nunca resolvido/validado contra TACO aqui (isto e so um PEDIDO, nao uma execução). */
  desiredFood: z.string().max(120).optional(),
  mealPlanId: z.string().min(1).optional(),
  mealId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  appointmentId: z.string().min(1).optional(),
  clientTaskId: z.string().min(1).optional(),
}).strict();
export type RequestProfessionalReviewInput = z.infer<typeof requestProfessionalReviewInputSchema>;

export type RequestProfessionalReviewOutput =
  | { error: string }
  | {
      clientId: string;
      requestType: PatientRequestType;
      patientText: string;
      aiSummary: string | null;
      mealPlanId: string | null;
      mealId: string | null;
      itemId: string | null;
      appointmentId: string | null;
      clientTaskId: string | null;
      preview: { title: string; details: string | null };
    };

export async function executeRequestProfessionalReview(
  clientId: string,
  input: RequestProfessionalReviewInput
): Promise<RequestProfessionalReviewOutput> {
  let mealPlanId: string | null = null;
  let mealId: string | null = null;
  let itemId: string | null = null;
  let mealDetail: string | null = null;

  if (input.mealPlanId || input.mealId || input.itemId) {
    const plan = await getActiveMealPlan(clientId);
    if (!plan) return { error: "Não encontrei um plano alimentar ativo para vincular essa solicitação." };
    if (input.mealPlanId && input.mealPlanId !== plan.id) return { error: "Esse plano alimentar não pertence a você." };
    mealPlanId = plan.id;

    if (input.mealId) {
      const meal = plan.meals.find((candidate) => candidate.id === input.mealId);
      if (!meal) return { error: "Essa refeição não pertence ao seu plano atual." };
      mealId = meal.id ?? null;

      if (input.itemId) {
        const item = meal.items.find((candidate) => candidate.id === input.itemId);
        if (!item) return { error: "Esse item não pertence a essa refeição." };
        itemId = item.id ?? null;
        const current = `${item.food}${item.quantity ? ` (${item.quantity}${item.unit ?? ""})` : ""}`;
        mealDetail = input.desiredFood ? `${meal.name}: ${current} → ${input.desiredFood}` : `${meal.name}: ${current}`;
      } else {
        mealDetail = meal.name;
      }
    }
  }

  let appointmentId: string | null = null;
  if (input.appointmentId) {
    const appointments = await getAppointments({ clientId });
    const match = appointments.find((appointment) => appointment.id === input.appointmentId);
    if (!match) return { error: "Essa consulta não pertence a você." };
    appointmentId = match.id;
  }

  let clientTaskId: string | null = null;
  if (input.clientTaskId) {
    const tasks = await getClientTasks(clientId, {});
    const match = tasks.find((task) => task.id === input.clientTaskId);
    if (!match) return { error: "Essa tarefa não pertence a você." };
    clientTaskId = match.id;
  }

  return {
    clientId,
    requestType: input.requestType,
    patientText: input.patientText,
    aiSummary: input.aiSummary ?? null,
    mealPlanId,
    mealId,
    itemId,
    appointmentId,
    clientTaskId,
    preview: { title: REQUEST_TYPE_LABELS[input.requestType], details: mealDetail },
  };
}

// ── getMyRequests ─────────────────────────────────────────────────────────

export const GET_MY_REQUESTS_TOOL_NAME = "getMyRequests";
export const getMyRequestsInputSchema = z.object({}).strict();

export interface PatientRequestSummary {
  requestType: PatientRequestType;
  patientText: string;
  status: PatientRequestStatus;
  createdAt: string;
}
export interface GetMyRequestsOutput {
  requests: PatientRequestSummary[];
}

/** Nunca inclui admin_notes — isso é interno da nutricionista (secao 26 do pedido: "não expor notas internas"). */
export async function executeGetMyRequests(clientId: string): Promise<GetMyRequestsOutput> {
  const rows = await listPatientRequests({ clientId, limit: 20 });
  return {
    requests: rows.map((row) => ({
      requestType: row.request_type,
      patientText: row.patient_text,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}

export const PATIENT_REQUEST_ASSISTANT_INSTRUCTIONS = `
Você também pode registrar um PEDIDO DE REVISÃO para a nutricionista analisar — isto NUNCA altera o plano, o prontuário ou qualquer dado clínico. É só um pedido que fica esperando a nutricionista olhar.
Quando usar ${REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME}:
- "quero trocar banana por maçã" → requestType "food_substitution", referencie mealId/itemId (achados antes via ${"getMyMealPlan"}/${"getMyMealDetails"}/${"searchAllowedFoodAlternatives"}) e desiredFood.
- "esse lanche tá difícil de seguir" → requestType "meal_plan_difficulty", referencie mealId se souber qual.
- "estou com muita fome à noite", "acho que estou com anemia" → requestType "symptom_or_complaint". Registre o relato tal como a pessoa falou — você NÃO interpreta isso como diagnóstico nem decide conduta.
- "quero antecipar meu retorno", "posso remarcar minha consulta" → requestType "appointment_request", referencie appointmentId se houver uma consulta específica.
- "não estou conseguindo fazer essa tarefa" → requestType "task_difficulty", referencie clientTaskId.
- Pedido que não se encaixa nos anteriores → "general_question" ou "other".
Regras importantes:
- patientText deve ser a fala da pessoa, resumida com fidelidade — nunca invente detalhe que ela não disse.
- Se houver ambiguidade sobre qual refeição/item/consulta/tarefa ela quer dizer (ex.: duas refeições parecidas), pergunte antes de chamar a ferramenta — nunca escolha sozinho.
- Depois de montar a proposta, ela SEMPRE precisa ser confirmada explicitamente pela pessoa antes de qualquer coisa ser gravada — nunca diga que o pedido já foi enviado antes da confirmação.
- Isto é diferente de "aplicar" uma mudança: mesmo depois de confirmado, nada no plano ou prontuário muda — só a nutricionista, depois de revisar, decide o que fazer.
- ${GET_MY_REQUESTS_TOOL_NAME}: para "quais pedidos eu já fiz", "minhas solicitações estão resolvidas?".
`.trim();
