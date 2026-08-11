import type { ProposedAction, ProposedActionKind } from "@/lib/ai/schemas/action.schema";
import { extractIsoDateTime, parseBrDateTimeToIso, parseBrDateToIsoDate } from "@/lib/ai/schemas/br-datetime";
import { getClientById, getClients } from "@/lib/repositories/clients";
import { createClient } from "@/lib/repositories/clients";
import { createAppointment } from "@/lib/repositories/appointments";
import { getAvailableSlots, hasAppointmentConflict, slotEnd, countFutureClientAppointments } from "@/lib/repositories/availability";
import { createClientTask } from "@/lib/repositories/client-tasks";
import { createRecipe, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/repositories/recipes";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { createProtocol } from "@/lib/repositories/protocols";
import { applyProtocolToClient, getClientProtocolById, updateClientProtocol } from "@/lib/repositories/client-protocols";
import { updateNutritionRecord, type NutritionRecordInput } from "@/lib/repositories/nutrition-records";
import { NUTRITION_TEXT_FIELDS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { upsertPreAnalysis } from "@/lib/repositories/pre-analyses";
import { createBlogPost } from "@/lib/repositories/blog-posts";
import { getMealPlanById, updateMealPlan } from "@/lib/repositories/meal-plans";
import { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";

/**
 * Execucao real de cada proposal kind, chamada SOMENTE depois que o
 * confirm route reivindicou a proposta atomicamente (claimAiActionProposal:
 * pending -> executing). Cada handler recebe o `ProposedAction` ja validado
 * pelo Zod (schemas/action.schema.ts) e persistido pelo servidor no momento
 * da proposta — nunca dado vindo de novo do frontend.
 *
 * Cada handler tambem revalida no momento da execucao o que pode ter mudado
 * entre a proposta e a confirmacao (duplicidade de cliente, ingrediente
 * TACO, ownership do protocolo, conflito de horario) — nunca confia so no
 * que foi calculado quando a proposta foi gerada.
 */

export class ProposalExecutionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ProposalExecutionError";
  }
}

export interface ProposalExecutionContext {
  adminId: string;
}

export interface ProposalExecutionResult {
  data: Record<string, unknown>;
}

type ProposalHandler<K extends ProposedActionKind> = (
  action: Extract<ProposedAction, { kind: K }>,
  ctx: ProposalExecutionContext
) => Promise<ProposalExecutionResult>;

// ── new_appointment ─────────────────────────────────────────────────────

const executeNewAppointment: ProposalHandler<"new_appointment"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const startsAtIso =
    parseBrDateTimeToIso(action.fields.starts_at_display)
    ?? extractIsoDateTime(action.fields.starts_at_display);
  if (!startsAtIso) throw new ProposalExecutionError("Data e hora da proposta são inválidas.", 422);
  const endsAtIso = slotEnd(startsAtIso);

  // Revalidacao obrigatoria: o horario pode ter sido ocupado por outro
  // agendamento entre o momento em que a proposta foi gerada e agora.
  const conflict = await hasAppointmentConflict(startsAtIso, endsAtIso);
  if (conflict) {
    throw new ProposalExecutionError(
      "Esse horário foi ocupado por outro agendamento enquanto a proposta esperava confirmação. Peça um novo horário.",
      409
    );
  }

  const appointmentId = await createAppointment({
    client_id: action.clientId,
    title: action.fields.title,
    appointment_type: action.fields.appointment_type || "consulta",
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    location: action.fields.location || null,
    notes: action.fields.notes || null,
    status: "agendado",
  });

  return { data: { appointmentId } };
};

// ── new_task ─────────────────────────────────────────────────────────────

const executeNewTask: ProposalHandler<"new_task"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const title = action.fields.title;
  if (!title?.trim()) throw new ProposalExecutionError("Título da tarefa é obrigatório.", 422);

  const dueDateDisplay = action.fields.due_date_display;
  const dueDate = dueDateDisplay ? parseBrDateToIsoDate(dueDateDisplay) : null;
  if (dueDateDisplay && !dueDate) throw new ProposalExecutionError("Prazo inválido. Use o formato DD/MM/AAAA.", 422);

  const taskId = await createClientTask({
    client_id: action.clientId,
    title,
    description: action.fields.description || null,
    due_date: dueDate,
    status: "pendente",
  });

  return { data: { taskId } };
};

// ── new_client ───────────────────────────────────────────────────────────

const executeNewClient: ProposalHandler<"new_client"> = async (action) => {
  const name = action.fields.name;
  if (!name?.trim()) throw new ProposalExecutionError("O nome é obrigatório para cadastrar o cliente.", 422);

  const email = action.fields.email?.trim() || null;
  const phone = action.fields.phone?.trim() || null;

  // Revalida duplicidade agora — a busca feita no momento da proposta pode
  // estar desatualizada (outro cadastro pode ter sido criado nesse meio-tempo).
  if (email) {
    const existing = await getClients({ search: email, pageSize: 5 });
    if (existing.items.some((client) => client.email?.toLowerCase() === email.toLowerCase())) {
      throw new ProposalExecutionError("Já existe um cliente cadastrado com esse e-mail.", 409);
    }
  }
  if (phone) {
    const existing = await getClients({ search: phone, pageSize: 5 });
    if (existing.items.some((client) => client.phone === phone)) {
      throw new ProposalExecutionError("Já existe um cliente cadastrado com esse telefone.", 409);
    }
  }

  const clientId = await createClient({
    name: name.trim(),
    email,
    phone,
    birth_date: action.fields.birth_date?.trim() || null,
  });

  return { data: { clientId } };
};

// ── new_recipe ───────────────────────────────────────────────────────────

const executeNewRecipe: ProposalHandler<"new_recipe"> = async (action) => {
  if (!action.title?.trim()) throw new ProposalExecutionError("Título da receita é obrigatório.", 422);
  if (!RECIPE_MEAL_GROUPS.includes(action.meal_group as RecipeMealGroup)) {
    throw new ProposalExecutionError("Grupo de refeição inválido.", 422);
  }
  if (!action.ingredients.length) throw new ProposalExecutionError("A receita precisa de ao menos um ingrediente.", 422);

  // Valores nutricionais calculaveis nunca vem confiaveis do LLM: cada
  // ingrediente com taco_number e revalidado contra a base real, e
  // createRecipe recalcula os macros deterministicamente a partir dos
  // ingredientes (nao recebemos nutrition_override daqui).
  for (const ingredient of action.ingredients) {
    if (ingredient.taco_number !== null && !getTacoFoodByNumber(ingredient.taco_number)) {
      throw new ProposalExecutionError(
        `O ingrediente "${ingredient.food_name}" não corresponde a um alimento válido na base TACO.`,
        422
      );
    }
  }

  const recipeId = await createRecipe({
    title: action.title,
    meal_group: action.meal_group as RecipeMealGroup,
    servings: Math.max(1, Math.round(Number(action.servings) || 1)),
    preparation_steps: action.preparation_steps || null,
    ingredients: action.ingredients.map((ingredient) => ({
      taco_number: ingredient.taco_number,
      food_name: ingredient.food_name,
      grams: ingredient.grams,
      free_text: ingredient.taco_number ? null : ingredient.food_name,
    })),
    source_note: "Receita criada com apoio de IA a partir de um pedido no chat. Revisar antes de prescrever.",
  });

  return { data: { recipeId } };
};

// ── new_protocol (protocolo personalizado simples) ─────────────────────

const executeNewProtocol: ProposalHandler<"new_protocol"> = async (action, ctx) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const title = action.fields.title;
  if (!title?.trim()) throw new ProposalExecutionError("Título do protocolo é obrigatório.", 422);

  const protocolId = await createProtocol({
    title,
    description: action.fields.description || null,
    category: action.fields.category || null,
    created_by: ctx.adminId,
    kind: "personalized",
    client_id: action.clientId,
    phases: [],
  });

  const clientProtocolId = await applyProtocolToClient(action.clientId, protocolId, {
    professionalNotes: action.fields.professional_notes || null,
  });

  return { data: { protocolId, clientProtocolId } };
};

// ── client_protocol (atualizar notas de protocolo existente) ───────────

const executeClientProtocolNotes: ProposalHandler<"client_protocol"> = async (action) => {
  const protocol = await getClientProtocolById(action.clientProtocolId);
  if (!protocol) throw new ProposalExecutionError("Protocolo não encontrado.", 404);
  // Ownership/escopo: o protocolo precisa realmente pertencer ao cliente
  // que a proposta afirma — nunca confiar so no clientId do payload.
  if (protocol.client_id !== action.clientId) {
    throw new ProposalExecutionError("Este protocolo não pertence a este paciente.", 403);
  }
  if (!action.professionalNotes?.trim()) throw new ProposalExecutionError("Notas profissionais vazias.", 422);

  await updateClientProtocol({ id: action.clientProtocolId, professionalNotes: action.professionalNotes });

  return { data: { clientProtocolId: action.clientProtocolId } };
};

// ── nutrition_record (prontuario — allow-list de campos) ───────────────

const NUTRITION_ALLOWED_KEYS = new Set<string>(NUTRITION_TEXT_FIELDS.map((field) => field.key));

const executeNutritionRecord: ProposalHandler<"nutrition_record"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  // Nunca transforma texto livre em atualizacao arbitraria de coluna: so
  // aceita chaves que ja sao campos reais e conhecidos do prontuario.
  const updates: Partial<NutritionRecordInput> = {};
  for (const [key, value] of Object.entries(action.fields)) {
    if (NUTRITION_ALLOWED_KEYS.has(key)) {
      updates[key as NutritionRecordTextFieldKey] = value;
    }
  }
  if (!Object.keys(updates).length) {
    throw new ProposalExecutionError("Nenhum campo válido para atualizar no prontuário.", 422);
  }

  await updateNutritionRecord(action.clientId, updates);

  return { data: { clientId: action.clientId } };
};

// ── pre_analysis (allow-list de campos) ─────────────────────────────────

const PRE_ANALYSIS_ALLOWED_KEYS = new Set(["summary", "attention_points", "main_goal", "restrictions", "professional_notes"]);

const executePreAnalysis: ProposalHandler<"pre_analysis"> = async (action, ctx) => {
  const submission = await getSubmissionById(action.submissionId);
  if (!submission) throw new ProposalExecutionError("Formulário de pré-consulta não encontrado.", 404);

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(action.fields)) {
    if (PRE_ANALYSIS_ALLOWED_KEYS.has(key)) updates[key] = value;
  }
  if (!Object.keys(updates).length) {
    throw new ProposalExecutionError("Nenhum campo válido para atualizar na pré-análise.", 422);
  }

  await upsertPreAnalysis({ submission_id: action.submissionId, admin_id: ctx.adminId, ...updates });

  return { data: { submissionId: action.submissionId } };
};

// ── new_blog_post ────────────────────────────────────────────────────────

const executeNewBlogPost: ProposalHandler<"new_blog_post"> = async (action) => {
  const title = action.fields.title;
  const excerpt = action.fields.excerpt;
  const contentMarkdown = action.fields.content_markdown;
  if (!title?.trim() || !excerpt?.trim() || !contentMarkdown?.trim()) {
    throw new ProposalExecutionError("Título, resumo e conteúdo são obrigatórios para salvar o rascunho.", 422);
  }

  const tags = (action.fields.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);

  const blogPostId = await createBlogPost({
    title,
    excerpt,
    content_markdown: contentMarkdown,
    category: action.fields.category || null,
    tags,
    seo_title: action.fields.seo_title || title,
    seo_description: action.fields.seo_description || excerpt,
    status: "draft",
    ai_generated: true,
  });

  return { data: { blogPostId } };
};

// ── meal_plan_change (alteracao estruturada do plano alimentar) ────────

const executeMealPlanChange: ProposalHandler<"meal_plan_change"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const plan = await getMealPlanById(action.mealPlanId);
  if (!plan) throw new ProposalExecutionError("Plano alimentar não encontrado.", 404);

  // Ownership: o plano precisa realmente pertencer a este paciente — nunca
  // confiar so no clientId do payload.
  if (plan.client_id !== action.clientId) {
    throw new ProposalExecutionError("Este plano alimentar não pertence a este paciente.", 403);
  }

  // Concorrencia otimista: se alguem (manualmente ou outra proposta) alterou
  // o plano depois que esta proposta foi criada, nunca aplicar por cima
  // silenciosamente — o baseVersion tem que bater com a versao atual.
  if (plan.version !== action.baseVersion) {
    throw new ProposalExecutionError(
      "O plano foi alterado depois que esta proposta foi criada. Revise novamente antes de aplicar.",
      409
    );
  }

  // Revalida TACO no momento da execucao — nunca confia no que foi
  // calculado quando a proposta foi gerada (mesmo padrao de executeNewRecipe).
  for (const change of action.changes) {
    if ("food" in change && change.food.tacoNumber !== null && !getTacoFoodByNumber(change.food.tacoNumber)) {
      throw new ProposalExecutionError(
        `O alimento "${change.food.foodName}" não corresponde a um alimento válido na base TACO.`,
        422
      );
    }
  }

  let newMeals;
  try {
    newMeals = applyMealPlanChangesWithPreview(plan.meals, action.changes, plan.title).meals;
  } catch (error) {
    const message = error instanceof MealPlanChangeValidationError ? error.message : "Não foi possível aplicar esta alteração.";
    throw new ProposalExecutionError(message, 422);
  }

  // Reusa updateMealPlan tal como o editor manual usa — mesmo delete-all-
  // insert-all atomico (d1Batch) e mesmo incremento de versao, preservando
  // titulo/status/notas/slots/substituicoes/suplementos inalterados.
  const updated = await updateMealPlan(plan.id, action.clientId, {
    title: plan.title,
    status: plan.status,
    notes: plan.notes,
    meals: newMeals,
    weekly_slots: plan.weekly_slots,
    substitutions: plan.substitutions,
    supplements: plan.supplements,
  });
  if (!updated) throw new ProposalExecutionError("Não foi possível salvar a alteração no plano alimentar.", 500);

  return { data: { mealPlanId: updated.id, newVersion: updated.version } };
};

// ── patient_appointment_request (autoagendamento pedido pelo proprio paciente) ──

const executePatientAppointmentRequest: ProposalHandler<"patient_appointment_request"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const starts = new Date(action.startsAtIso);
  if (Number.isNaN(starts.getTime()) || starts.getTime() <= Date.now()) {
    throw new ProposalExecutionError("Escolha um horário futuro.", 422);
  }
  const endsAtIso = slotEnd(action.startsAtIso);

  // Mesma regra antiabuso da rota de autoagendamento manual
  // (app/api/portal/appointments POST): so uma consulta futura ativa por vez.
  const futureCount = await countFutureClientAppointments(action.clientId);
  if (futureCount >= 1) {
    throw new ProposalExecutionError("Você já possui uma consulta futura agendada.", 409);
  }

  // Revalidacao obrigatoria (mesmo padrao do admin): o horario pode ter sido
  // ocupado entre o momento da proposta e a confirmacao.
  const rangeDate = action.startsAtIso.slice(0, 10);
  const availability = await getAvailableSlots(rangeDate, rangeDate);
  const available = availability.some((day) => day.slots.includes(action.startsAtIso));
  if (!available || (await hasAppointmentConflict(action.startsAtIso, endsAtIso))) {
    throw new ProposalExecutionError("Esse horário não está mais disponível. Escolha outro horário.", 409);
  }

  const appointmentId = await createAppointment({
    client_id: action.clientId,
    title: "Consulta nutricional",
    appointment_type: "consulta",
    starts_at: action.startsAtIso,
    ends_at: endsAtIso,
    status: "agendado",
    portal_visible: 1,
    notes: "Consulta marcada pela paciente no portal (via assistente).",
  });

  return { data: { appointmentId, startsAtIso: action.startsAtIso } };
};

// ── dispatch tipado (sem switch untyped, sem `any`) ─────────────────────

const PROPOSAL_HANDLERS: { [K in ProposedActionKind]: ProposalHandler<K> } = {
  new_appointment: executeNewAppointment,
  new_task: executeNewTask,
  new_client: executeNewClient,
  new_recipe: executeNewRecipe,
  new_protocol: executeNewProtocol,
  client_protocol: executeClientProtocolNotes,
  nutrition_record: executeNutritionRecord,
  pre_analysis: executePreAnalysis,
  new_blog_post: executeNewBlogPost,
  meal_plan_change: executeMealPlanChange,
  patient_appointment_request: executePatientAppointmentRequest,
};

export async function executeProposedAction(
  action: ProposedAction,
  ctx: ProposalExecutionContext
): Promise<ProposalExecutionResult> {
  const handler = PROPOSAL_HANDLERS[action.kind] as ProposalHandler<typeof action.kind>;
  return handler(action, ctx);
}
