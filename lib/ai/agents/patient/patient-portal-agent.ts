import { z } from "zod";
import { getActiveMealPlan, type MealPlanItemPayload, type MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { getAppointments } from "@/lib/repositories/appointments";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { searchTacoFoods, findBestTacoFood, getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { normalize, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { getCustomFoodById, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import { getFoodPortionById, toHouseholdMeasureOption } from "@/lib/repositories/food-portions";
import { resolveFoodSubstitution, type FoodSubstitutionResult } from "@/lib/nutrition/food-substitution";
import { REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME } from "@/lib/ai/agents/patient/patient-request-agent";

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
  itemId: string;
  food: string;
  quantity: string | null;
  unit: string | null;
}
export interface PatientMealSummary {
  mealId: string;
  name: string;
  suggestedTime: string | null;
  items: PatientMealItemSummary[];
}
export type GetMyMealPlanOutput =
  | { found: false }
  | { found: true; mealPlanId: string; mealPlanTitle: string; meals: PatientMealSummary[] };

// ids sao necessarios para requestProfessionalReview poder referenciar
// precisamente qual refeicao/item a paciente quer discutir (secao 5/14 do
// pedido de solicitacoes) — nao sao dado sensivel, so identificadores opacos.
function toItemSummary(item: MealPlanItemPayload): PatientMealItemSummary {
  return { itemId: item.id ?? "", food: item.food, quantity: item.quantity ?? null, unit: item.unit ?? null };
}

export async function executeGetMyMealPlan(clientId: string): Promise<GetMyMealPlanOutput> {
  const plan = await getActiveMealPlan(clientId);
  if (!plan) return { found: false };
  return {
    found: true,
    mealPlanId: plan.id,
    mealPlanTitle: plan.title,
    meals: plan.meals.map((meal) => ({
      mealId: meal.id ?? "",
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
  | { found: true; mealPlanId: string; mealId: string; mealName: string; suggestedTime: string | null; items: PatientMealItemSummary[] };

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
  return {
    found: true,
    mealPlanId: plan.id,
    mealId: meal.id ?? "",
    mealName: meal.name,
    suggestedTime: meal.suggested_time ?? null,
    items: meal.items.map(toItemSummary),
  };
}

// ── getMyAppointments ────────────────────────────────────────────────────

export const GET_MY_APPOINTMENTS_TOOL_NAME = "getMyAppointments";
export const getMyAppointmentsInputSchema = z.object({
  scope: z.enum(["next", "all"]).optional(),
}).strict();
export type GetMyAppointmentsInput = z.infer<typeof getMyAppointmentsInputSchema>;

export interface PatientAppointmentSummary {
  appointmentId: string;
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
      appointmentId: appointment.id,
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
  tasks: { taskId: string; title: string; dueDate: string | null }[];
}

export async function executeGetMyTasks(clientId: string): Promise<GetMyTasksOutput> {
  const tasks = await getClientTasks(clientId, { status: "pendente" });
  return { tasks: tasks.map((task) => ({ taskId: task.id, title: task.title, dueDate: task.due_date })) };
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
  | { found: false; reason: "ambiguous_item"; matches: { mealId: string; mealName: string; itemId: string; food: string }[] }
  | {
      found: true;
      mealPlanId: string;
      mealPlanVersion: number;
      mealId: string;
      itemId: string;
      currentFood: string;
      mealName: string;
      alternatives: FoodAlternativeOption[];
      /**
       * So preenchido quando `desiredFood` foi informado — resultado
       * ESTRUTURADO da engine determinística (lib/nutrition/food-substitution.ts).
       * Nunca texto livre: a quantidade em `substitution` (quando
       * status="safe") e a UNICA fonte de verdade para qualquer numero
       * apresentado ao paciente ou registrado numa solicitacao (secao 2/20
       * do pedido — o LLM nunca produz esse numero).
       */
      substitution?: FoodSubstitutionResult;
    };

/**
 * Resolve a referencia nutricional estruturada de um item do plano —
 * vinculo por id primeiro (TACO/personalizado), texto livre so como
 * fallback (mesma prioridade ja usada em lib/nutrition/macros.ts#resolveFoodReference,
 * aqui repetida porque este caminho precisa buscar CUSTOM/MANUFACTURER no
 * banco, algo que a versao sincrona de macros.ts nao faz).
 */
async function resolveMacroReferenceForItem(item: MealPlanItemPayload): Promise<MacroReferenceFood | null> {
  if (item.food_source === "TACO" && item.food_ref_id) {
    const byNumber = getTacoFoodByNumber(item.food_ref_id);
    if (byNumber) return byNumber;
  }
  if ((item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") && item.food_ref_id) {
    const custom = await getCustomFoodById(item.food_ref_id);
    if (custom) return toMacroReferenceFood(custom);
  }
  return findBestTacoFood(item.food);
}

/**
 * So promove um resultado de busca a "candidato unico e confiavel" quando
 * ha exatamente um resultado, OU quando o melhor resultado bate
 * EXATAMENTE (apos normalizacao) com o texto pedido — caso contrario,
 * mantem varios candidatos para a engine reportar "ambiguous" (secao 8/9
 * do pedido: nunca escolher sozinho entre opcoes parecidas).
 */
function narrowTargetCandidates(query: string, results: MacroReferenceFood[]): MacroReferenceFood[] {
  const normalizedQuery = normalize(query);
  const exact = results.find((food) => normalize(food.descricao) === normalizedQuery);
  if (exact) return [exact];
  return results.slice(0, 3);
}

/**
 * Calcula a substituicao determinística para um item real do plano —
 * unica porta de entrada para "quanto do alimento X equivale a Y do
 * alimento atual". Reaproveitada tanto pela tool de chat (preview) quanto
 * pelo handler de confirmacao da proposta (lib/ai/core/proposal-handlers.ts),
 * que RECALCULA aqui de novo no momento de confirmar — nunca confia num
 * numero computado antes (secao 16/20: sem reuso de calculo contra versao
 * antiga, sem numero vindo de fora da engine).
 */
export async function computeFoodSubstitution(
  item: MealPlanItemPayload,
  desiredFood: string
): Promise<FoodSubstitutionResult> {
  const sourceFood = await resolveMacroReferenceForItem(item);
  if (!sourceFood) {
    return { status: "not_supported", reason: "Não encontrei o alimento atual na base de dados para calcular uma troca segura." };
  }

  let householdMeasure = null;
  if (item.household_measure_id) {
    const portion = await getFoodPortionById(item.household_measure_id);
    if (portion) householdMeasure = toHouseholdMeasureOption(portion);
  }

  const searchResults = searchTacoFoods(desiredFood, 5);
  const targetCandidates = narrowTargetCandidates(desiredFood, searchResults);

  return resolveFoodSubstitution({
    sourceFood,
    sourceQuantity: item.quantity,
    sourceUnit: item.unit,
    sourceHouseholdMeasure: householdMeasure,
    targetCandidates,
  });
}

/**
 * Ancora a busca no PROPRIO plano do paciente (secao 10): so sugere
 * alternativas depois de localizar o alimento atual entre os itens reais do
 * plano ativo dele — nunca faz uma busca solta na TACO sem esse vinculo.
 * O output nunca contem palavras como "aprovado"/"pode trocar" — isso e
 * responsabilidade do system prompt, nao do dado retornado aqui.
 *
 * Se o texto do alimento baterem em itens de MAIS de uma refeicao (ex.:
 * "arroz" no almoco e no jantar), nunca escolhe a primeira ocorrencia
 * silenciosamente — devolve `ambiguous_item` para o chamador perguntar qual
 * refeicao (secao 9 do pedido).
 */
export async function executeSearchAllowedFoodAlternatives(
  clientId: string,
  input: SearchAllowedFoodAlternativesInput
): Promise<SearchAllowedFoodAlternativesOutput> {
  const plan = await getActiveMealPlan(clientId);
  if (!plan) return { found: false, reason: "meal_plan_not_found" };

  const normalizedCurrent = normalize(input.currentFood);
  const matches: { meal: MealPlanMealPayload; item: MealPlanItemPayload }[] = [];
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const normalizedFood = normalize(item.food);
      if (normalizedFood.includes(normalizedCurrent) || normalizedCurrent.includes(normalizedFood)) {
        matches.push({ meal, item });
      }
    }
  }
  if (matches.length === 0) return { found: false, reason: "item_not_in_plan" };
  if (matches.length > 1) {
    return {
      found: false,
      reason: "ambiguous_item",
      matches: matches.map(({ meal, item }) => ({ mealId: meal.id ?? "", mealName: meal.name, itemId: item.id ?? "", food: item.food })),
    };
  }
  const { meal: matchedMeal, item: matchedItem } = matches[0];

  const query = input.desiredFood ?? matchedItem.food;
  const candidates = searchTacoFoods(query, 5);
  const normalizedCurrentFood = normalize(matchedItem.food);

  const substitution = input.desiredFood ? await computeFoodSubstitution(matchedItem, input.desiredFood) : undefined;

  return {
    found: true,
    mealPlanId: plan.id,
    mealPlanVersion: plan.version,
    mealId: matchedMeal.id ?? "",
    itemId: matchedItem.id ?? "",
    currentFood: matchedItem.food,
    mealName: matchedMeal.name,
    alternatives: candidates
      .filter((food) => normalize(food.descricao) !== normalizedCurrentFood)
      .slice(0, 5)
      .map((food) => ({ tacoNumber: typeof food.numero === "number" ? food.numero : Number(food.numero), descricao: food.descricao })),
    substitution,
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
  - Se devolver "found": false com "ambiguous_item", o alimento aparece em mais de uma refeição — NUNCA escolha uma sozinho. Pergunte qual refeição ela quer dizer, usando os nomes em "matches" (ex.: "você quer dizer o arroz do almoço ou do jantar?").
  - Se o pedido não disser qual alimento ela quer no lugar (ex.: só "posso trocar o arroz?"), NÃO adivinhe — pergunte qual alimento ela gostaria de usar antes de chamar esta ferramenta com desiredFood preenchido.
  - Quando desiredFood for informado, a ferramenta pode devolver um campo "substitution" com um resultado estruturado:
    - status "safe": a quantidade em targetQuantity veio PRONTA da engine de cálculo — repita esse número exatamente como veio (nunca arredonde diferente, nunca recalcule, nunca invente outro valor), e deixe claro que é uma equivalência dentro do plano atual, ainda sujeita à revisão da nutricionista.
    - status "ambiguous": existe mais de um alimento parecido com o que ela pediu — apresente as opções em "candidates" e pergunte qual delas, nunca escolha por ela.
    - status "requires_review" ou "not_supported": não é possível calcular essa troca com segurança agora — diga isso com gentileza e ofereça registrar a dúvida para a nutricionista (via ${REQUEST_PROFESSIONAL_REVIEW_TOOL_NAME}).
  - Se encontrar alternativas (com ou sem substitution calculado), apresente como opções para ela CONVERSAR COM A NUTRICIONISTA antes de qualquer mudança real — nunca como uma troca já válida. Se ela topar uma opção, use os campos mealPlanId/mealId/itemId retornados por esta ferramenta para montar a solicitação (nunca invente esses ids).
- ${NAVIGATE_PATIENT_PORTAL_TOOL_NAME}: para "abre meu plano", "ver minhas tarefas", "ir para agenda" — só os destinos válidos (meal_plan, appointments, tasks).
Regras gerais:
- Números (quantidade, horário, data) sempre vêm prontos das ferramentas — nunca calcule ou invente.
- Se uma ferramenta não encontrar nada (plano/consulta/tarefa/refeição), diga isso claramente e de forma simples, sem inventar dado.
- Nunca mencione nome de outra paciente, nem sugira que existe outra pessoa cujos dados você poderia ver.
- Você NÃO altera o plano alimentar nem registra nada no prontuário — nunca prometa que uma mudança foi aplicada.
- Os ids retornados pelas ferramentas (mealPlanId/mealId/itemId/appointmentId/taskId) são so identificadores internos — use-os exatamente como vieram quando for montar uma solicitação para a nutricionista, nunca invente um id.
`.trim();
