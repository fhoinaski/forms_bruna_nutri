import { z } from "zod";
import { getActiveMealPlan, type MealPlanItemPayload, type MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { getAppointments } from "@/lib/repositories/appointments";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { searchTacoFoods } from "@/lib/nutrition/taco";
import { normalize } from "@/lib/nutrition/macros";

/**
 * Tools de LEITURA do PATIENT_ASSISTANT — cada `executeXxx` recebe
 * `clientId` como PRIMEIRO parametro explicito, vindo SEMPRE do fechamento
 * (closure) montado por `resolvePatientTools()` em patient-orchestrator.ts a
 * partir da sessao do portal — nunca do input validado pelo Zod (o paciente/
 * modelo nunca pode escolher de quem sao os dados). Isso e deliberadamente
 * diferente do padrao admin (onde `clientId` costuma vir no input da tool,
 * porque o admin pode legitimamente consultar qualquer cliente seu).
 */

// ── getMyMealPlan ────────────────────────────────────────────────────────

export const GET_MY_MEAL_PLAN_TOOL_NAME = "getMyMealPlan";
export const getMyMealPlanInputSchema = z.object({}).strict();

export interface PatientMealItemSummary {
  food: string;
  quantity: string | null;
  unit: string | null;
}
export interface PatientMealSummary {
  name: string;
  suggestedTime: string | null;
  items: PatientMealItemSummary[];
}
export type GetMyMealPlanOutput =
  | { found: false }
  | { found: true; mealPlanTitle: string; meals: PatientMealSummary[] };

function toItemSummary(item: MealPlanItemPayload): PatientMealItemSummary {
  return { food: item.food, quantity: item.quantity ?? null, unit: item.unit ?? null };
}

export async function executeGetMyMealPlan(clientId: string): Promise<GetMyMealPlanOutput> {
  const plan = await getActiveMealPlan(clientId);
  if (!plan) return { found: false };
  return {
    found: true,
    mealPlanTitle: plan.title,
    meals: plan.meals.map((meal) => ({
      name: meal.name,
      suggestedTime: meal.suggested_time ?? null,
      items: meal.items.map(toItemSummary),
    })),
  };
}

// ── getMyMealDetails (busca seletiva — secao 29: nunca carregar o plano inteiro so pra responder "e o jantar?") ──

export const GET_MY_MEAL_DETAILS_TOOL_NAME = "getMyMealDetails";
export const getMyMealDetailsInputSchema = z.object({
  mealQuery: z.string().min(2).max(60),
}).strict();
export type GetMyMealDetailsInput = z.infer<typeof getMyMealDetailsInputSchema>;

export type GetMyMealDetailsOutput =
  | { found: false }
  | { found: true; mealName: string; suggestedTime: string | null; items: PatientMealItemSummary[] };

function findMealByQuery(meals: MealPlanMealPayload[], query: string): MealPlanMealPayload | undefined {
  const normalizedQuery = normalize(query);
  return meals.find((meal) => {
    const normalizedName = normalize(meal.name);
    return normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
  });
}

export async function executeGetMyMealDetails(clientId: string, input: GetMyMealDetailsInput): Promise<GetMyMealDetailsOutput> {
  const plan = await getActiveMealPlan(clientId);
  if (!plan) return { found: false };
  const meal = findMealByQuery(plan.meals, input.mealQuery);
  if (!meal) return { found: false };
  return { found: true, mealName: meal.name, suggestedTime: meal.suggested_time ?? null, items: meal.items.map(toItemSummary) };
}

// ── getMyAppointments ────────────────────────────────────────────────────

export const GET_MY_APPOINTMENTS_TOOL_NAME = "getMyAppointments";
export const getMyAppointmentsInputSchema = z.object({
  scope: z.enum(["next", "all"]).optional(),
}).strict();
export type GetMyAppointmentsInput = z.infer<typeof getMyAppointmentsInputSchema>;

export interface PatientAppointmentSummary {
  startsAtIso: string;
  type: string;
  location: string | null;
  status: string;
}
export interface GetMyAppointmentsOutput {
  appointments: PatientAppointmentSummary[];
}

export async function executeGetMyAppointments(clientId: string, input: GetMyAppointmentsInput): Promise<GetMyAppointmentsOutput> {
  const appointments = await getAppointments({ clientId });
  const now = Date.now();
  const upcoming = appointments
    .filter((appointment) => appointment.status !== "cancelado" && new Date(appointment.starts_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const scoped = input.scope === "all" ? upcoming : upcoming.slice(0, 1);
  // Deliberadamente NUNCA inclui notes/cancellation_reason/telefone/e-mail —
  // esses campos existem no tipo Appointment (uso interno/admin) mas nao
  // pertencem ao que o assistente do paciente devolve (secao 6/23).
  return {
    appointments: scoped.map((appointment) => ({
      startsAtIso: appointment.starts_at,
      type: appointment.appointment_type,
      location: appointment.location,
      status: appointment.status,
    })),
  };
}

// ── getMyTasks ───────────────────────────────────────────────────────────

export const GET_MY_TASKS_TOOL_NAME = "getMyTasks";
export const getMyTasksInputSchema = z.object({}).strict();

export interface GetMyTasksOutput {
  tasks: { title: string; dueDate: string | null }[];
}

export async function executeGetMyTasks(clientId: string): Promise<GetMyTasksOutput> {
  const tasks = await getClientTasks(clientId, { status: "pendente" });
  return { tasks: tasks.map((task) => ({ title: task.title, dueDate: task.due_date })) };
}

// ── searchAllowedFoodAlternatives ───────────────────────────────────────

export const SEARCH_ALLOWED_FOOD_ALTERNATIVES_TOOL_NAME = "searchAllowedFoodAlternatives";
export const searchAllowedFoodAlternativesInputSchema = z.object({
  currentFood: z.string().min(2).max(120),
  desiredFood: z.string().min(2).max(120).optional(),
}).strict();
export type SearchAllowedFoodAlternativesInput = z.infer<typeof searchAllowedFoodAlternativesInputSchema>;

export interface FoodAlternativeOption {
  tacoNumber: number;
  descricao: string;
}
export type SearchAllowedFoodAlternativesOutput =
  | { found: false; reason: "meal_plan_not_found" | "item_not_in_plan" }
  | { found: true; currentFood: string; mealName: string; alternatives: FoodAlternativeOption[] };

/**
 * Ancora a busca no PROPRIO plano do paciente (secao 10): so sugere
 * alternativas depois de localizar o alimento atual entre os itens reais do
 * plano ativo dele — nunca faz uma busca solta na TACO sem esse vinculo.
 * O output nunca contem palavras como "aprovado"/"pode trocar" — isso e
 * responsabilidade do system prompt, nao do dado retornado aqui.
 */
export async function executeSearchAllowedFoodAlternatives(
  clientId: string,
  input: SearchAllowedFoodAlternativesInput
): Promise<SearchAllowedFoodAlternativesOutput> {
  const plan = await getActiveMealPlan(clientId);
  if (!plan) return { found: false, reason: "meal_plan_not_found" };

  const normalizedCurrent = normalize(input.currentFood);
  let matchedMeal: MealPlanMealPayload | undefined;
  let matchedItem: MealPlanItemPayload | undefined;
  for (const meal of plan.meals) {
    const item = meal.items.find((candidate) => {
      const normalizedFood = normalize(candidate.food);
      return normalizedFood.includes(normalizedCurrent) || normalizedCurrent.includes(normalizedFood);
    });
    if (item) {
      matchedMeal = meal;
      matchedItem = item;
      break;
    }
  }
  if (!matchedMeal || !matchedItem) return { found: false, reason: "item_not_in_plan" };

  const query = input.desiredFood ?? matchedItem.food;
  const candidates = searchTacoFoods(query, 5);
  const normalizedCurrentFood = normalize(matchedItem.food);

  return {
    found: true,
    currentFood: matchedItem.food,
    mealName: matchedMeal.name,
    alternatives: candidates
      .filter((food) => normalize(food.descricao) !== normalizedCurrentFood)
      .slice(0, 5)
      .map((food) => ({ tacoNumber: typeof food.numero === "number" ? food.numero : Number(food.numero), descricao: food.descricao })),
  };
}

// ── navigatePatientPortal ────────────────────────────────────────────────

// O portal HOJE e uma pagina unica (app/portal/page.tsx, sem sub-rotas) —
// "navegar" aqui significa rolar ate a secao certa, nunca uma URL. Allow-list
// fechada, igual em espirito ao NAVIGATION_DESTINATIONS do admin.
export const PATIENT_PORTAL_SECTIONS = ["meal_plan", "appointments", "tasks"] as const;
export type PatientPortalSection = (typeof PATIENT_PORTAL_SECTIONS)[number];

export const NAVIGATE_PATIENT_PORTAL_TOOL_NAME = "navigatePatientPortal";
export const navigatePatientPortalInputSchema = z.object({
  section: z.enum(PATIENT_PORTAL_SECTIONS),
}).strict();
export type NavigatePatientPortalInput = z.infer<typeof navigatePatientPortalInputSchema>;

export async function executeNavigatePatientPortal(input: NavigatePatientPortalInput): Promise<{ section: PatientPortalSection }> {
  return { section: input.section };
}

// ── instruções compartilhadas ────────────────────────────────────────────

export const PATIENT_PORTAL_ASSISTANT_INSTRUCTIONS = `
Você é o assistente do portal da paciente/cliente — atende SOMENTE a pessoa autenticada nesta conversa, nunca fala sobre outras pessoas.
Ferramentas disponíveis e quando usar:
- ${GET_MY_MEAL_PLAN_TOOL_NAME}: para "me mostra meu plano", "o que tenho pra comer hoje" (visão geral).
- ${GET_MY_MEAL_DETAILS_TOOL_NAME}: para uma refeição específica ("qual meu café da manhã", "o que tem no almoço", "e o lanche da tarde"). Prefira esta quando a pergunta for sobre UMA refeição só — não chame ${GET_MY_MEAL_PLAN_TOOL_NAME} nesse caso.
- ${GET_MY_APPOINTMENTS_TOOL_NAME}: para "quando é minha consulta", "tenho consulta essa semana". Use scope "next" por padrão; "all" só se pedirem todas.
- ${GET_MY_TASKS_TOOL_NAME}: para "quais tarefas eu tenho", "o que falta eu fazer".
- ${SEARCH_ALLOWED_FOOD_ALTERNATIVES_TOOL_NAME}: para "posso trocar X por Y", "que opções tenho para esse alimento". Regras importantes:
  - NUNCA diga que uma troca está aprovada, liberada ou definida — você não decide isso.
  - Se a ferramenta devolver "found": false com "item_not_in_plan", diga que não encontrou esse alimento no plano atual dela, sem inventar que ele existe.
  - Se encontrar alternativas, apresente como opções para ela CONVERSAR COM A NUTRICIONISTA antes de qualquer mudança real — nunca como uma troca já válida.
- ${NAVIGATE_PATIENT_PORTAL_TOOL_NAME}: para "abre meu plano", "ver minhas tarefas", "ir para agenda" — só os destinos válidos (meal_plan, appointments, tasks).
Regras gerais:
- Números (quantidade, horário, data) sempre vêm prontos das ferramentas — nunca calcule ou invente.
- Se uma ferramenta não encontrar nada (plano/consulta/tarefa/refeição), diga isso claramente e de forma simples, sem inventar dado.
- Nunca mencione nome de outra paciente, nem sugira que existe outra pessoa cujos dados você poderia ver.
- Você NÃO altera o plano alimentar nem registra nada no prontuário — nunca prometa que uma mudança foi aplicada.
`.trim();
