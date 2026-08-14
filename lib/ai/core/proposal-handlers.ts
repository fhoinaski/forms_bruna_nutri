import type { ProposedAction, ProposedActionKind } from "@/lib/ai/schemas/action.schema";
import { extractIsoDateTime, parseBrDateTimeToIso, parseBrDateToIsoDate } from "@/lib/ai/schemas/br-datetime";
import { getClientById, getClients } from "@/lib/repositories/clients";
import { createClient } from "@/lib/repositories/clients";
import { createAppointment, getAppointments } from "@/lib/repositories/appointments";
import { getAvailableSlots, hasAppointmentConflict, slotEnd, countFutureClientAppointments } from "@/lib/repositories/availability";
import { createClientTask, getClientTasks } from "@/lib/repositories/client-tasks";
import { createRecipe, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/repositories/recipes";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { getClientProtocolById, updateClientProtocol } from "@/lib/repositories/client-protocols";
import { updateNutritionRecord, type NutritionRecordInput } from "@/lib/repositories/nutrition-records";
import { NUTRITION_TEXT_FIELDS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { upsertPreAnalysis } from "@/lib/repositories/pre-analyses";
import { createBlogPost } from "@/lib/repositories/blog-posts";
import { blogContentDomainSchema, blogReferenceSchema, type BlogReference } from "@/lib/ai/research/editorial-sources";
import { getActiveMealPlan, getMealPlanById, updateMealPlan } from "@/lib/repositories/meal-plans";
import { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { normalize } from "@/lib/nutrition/macros";
import { createPatientRequest, findSimilarPendingPatientRequest } from "@/lib/repositories/patient-requests";
import { ClientDuplicateError } from "@/lib/clinical/client-identity";
import { createProtocolAndApplyToClient } from "@/lib/repositories/client-protocols";
import { createClientTasksBatch } from "@/lib/repositories/client-tasks";
import { getConsultationSessionById, saveConsultationSummary } from "@/lib/repositories/consultation-sessions";

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

  // Checagem antecipada (so UX — nao e a garantia real): da um erro rapido
  // no caso comum de duplicidade obvia sem precisar tentar o INSERT. A
  // garantia de fato contra corrida entre duas propostas diferentes
  // confirmadas ao mesmo tempo e o indice UNIQUE parcial em
  // clients.email_normalized/phone_normalized (migration 0032) — createClient
  // relança essa violação como ClientDuplicateError, tratado abaixo.
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

  try {
    const clientId = await createClient({
      name: name.trim(),
      email,
      phone,
      birth_date: action.fields.birth_date?.trim() || null,
    });
    return { data: { clientId } };
  } catch (error) {
    if (error instanceof ClientDuplicateError) {
      throw new ProposalExecutionError(error.message, 409);
    }
    throw error;
  }
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

  // createProtocolAndApplyToClient cria o protocolo E o vincula ao paciente
  // numa unica escrita atomica (d1Batch) — nunca deixa um protocolo orfao
  // (criado mas sem client_protocols) se a segunda parte falhar.
  const { protocolId, clientProtocolId } = await createProtocolAndApplyToClient({
    title,
    description: action.fields.description || null,
    category: action.fields.category || null,
    createdBy: ctx.adminId,
    kind: "personalized",
    clientId: action.clientId,
    apply: { professionalNotes: action.fields.professional_notes || null },
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

const executeNutritionRecord: ProposalHandler<"nutrition_record"> = async (action, ctx) => {
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

  // A IA NUNCA é autora clínica: source=ai_proposal e o autor é a
  // nutricionista que CONFIRMOU a proposta (ctx.adminId), vindo do servidor.
  await updateNutritionRecord(action.clientId, updates, {
    source: "ai_proposal",
    changedByAdminId: ctx.adminId,
  });

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

  // Revalida no momento da execucao — nunca confia cegamente no que a tool
  // devolveu antes da revisao humana (mesmo padrao de todo outro handler
  // aqui): dominio invalido vira null, referencias mal-formadas viram [].
  const domainParsed = blogContentDomainSchema.safeParse(action.fields.content_domain);
  const contentDomain = domainParsed.success ? domainParsed.data : null;

  let references: BlogReference[] = [];
  try {
    const raw = JSON.parse(action.fields.references_json || "[]");
    if (Array.isArray(raw)) {
      references = raw
        .map((item) => blogReferenceSchema.safeParse(item))
        .filter((result): result is { success: true; data: BlogReference } => result.success)
        .map((result) => result.data);
    }
  } catch {
    references = [];
  }

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
    content_domain: contentDomain,
    references,
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
  // titulo/status/notas/metas/slots/substituicoes/suplementos inalterados.
  // As metas (target_*) precisam ser passadas explicitamente aqui — sem
  // isso, updateMealPlan as trataria como "nao definidas" e apagaria uma
  // meta que a nutricionista ja tinha configurado manualmente.
  const updated = await updateMealPlan(plan.id, action.clientId, {
    title: plan.title,
    status: plan.status,
    notes: plan.notes,
    target_energy_kcal: plan.target_energy_kcal,
    target_protein_g: plan.target_protein_g,
    target_carbohydrate_g: plan.target_carbohydrate_g,
    target_fat_g: plan.target_fat_g,
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

// ── patient_change_request (pedido de revisao, NUNCA uma alteracao clinica) ──

const executePatientChangeRequest: ProposalHandler<"patient_change_request"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  // Revalida ownership de CADA referencia opcional de novo — nunca confia
  // no que foi validado quando a proposta foi criada (secao 15 do pedido:
  // "toda entidade precisa ser revalidada contra o paciente autenticado").
  if (action.mealPlanId) {
    const plan = await getActiveMealPlan(action.clientId);
    if (!plan || plan.id !== action.mealPlanId) {
      throw new ProposalExecutionError("O plano alimentar referenciado não pertence a este paciente.", 403);
    }
    if (action.mealId) {
      const meal = plan.meals.find((candidate) => candidate.id === action.mealId);
      if (!meal) throw new ProposalExecutionError("A refeição referenciada não pertence a esse plano.", 422);
      if (action.itemId && !meal.items.some((candidate) => candidate.id === action.itemId)) {
        throw new ProposalExecutionError("O item referenciado não pertence a essa refeição.", 422);
      }
    }
  }
  if (action.appointmentId) {
    const appointments = await getAppointments({ clientId: action.clientId });
    if (!appointments.some((appointment) => appointment.id === action.appointmentId)) {
      throw new ProposalExecutionError("A consulta referenciada não pertence a este paciente.", 403);
    }
  }
  if (action.clientTaskId) {
    const tasks = await getClientTasks(action.clientId, {});
    if (!tasks.some((task) => task.id === action.clientTaskId)) {
      throw new ProposalExecutionError("A tarefa referenciada não pertence a este paciente.", 403);
    }
  }

  // Deduplicacao deterministica (secao 20): mesmo paciente + tipo +
  // referencias + texto normalizado, ainda pendente de revisao.
  const normalizedText = normalize(action.patientText).slice(0, 200);
  const similar = await findSimilarPendingPatientRequest({
    clientId: action.clientId,
    requestType: action.requestType,
    mealId: action.mealId ?? null,
    itemId: action.itemId ?? null,
    appointmentId: action.appointmentId ?? null,
    clientTaskId: action.clientTaskId ?? null,
    normalizedText,
  });
  if (similar) {
    throw new ProposalExecutionError("Você já tem uma solicitação parecida aguardando revisão.", 409);
  }

  // O UNICO side effect desta confirmacao e criar a linha do pedido — nunca
  // updateMealPlan, updateNutritionRecord ou qualquer outra escrita clinica.
  const requestId = await createPatientRequest({
    clientId: action.clientId,
    requestType: action.requestType,
    patientText: action.patientText,
    aiSummary: action.aiSummary ?? null,
    mealPlanId: action.mealPlanId ?? null,
    mealId: action.mealId ?? null,
    itemId: action.itemId ?? null,
    appointmentId: action.appointmentId ?? null,
    clientTaskId: action.clientTaskId ?? null,
  });

  return { data: { requestId } };
};

// ── consultation_tasks_batch (Modo Consulta — pacote de tarefas) ────────

const executeConsultationTasksBatch: ProposalHandler<"consultation_tasks_batch"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  // Revalida a sessao de consulta (se informada) contra o cliente real —
  // nunca confia so no que a proposta guardou no momento da criacao.
  if (action.consultationSessionId) {
    const session = await getConsultationSessionById(action.consultationSessionId);
    if (!session || session.client_id !== action.clientId) {
      throw new ProposalExecutionError("Esta sessão de consulta não pertence a este paciente.", 403);
    }
  }

  const now = Date.now();
  const taskIds = await createClientTasksBatch(
    action.clientId,
    action.tasks.map((task) => ({
      title: task.title,
      description: task.description ?? null,
      due_date: task.dueInDays != null ? new Date(now + task.dueInDays * 86_400_000).toISOString().slice(0, 10) : null,
    }))
  );

  return { data: { taskIds, taskCount: taskIds.length } };
};

// ── consultation_summary (Modo Consulta — resumo estruturado) ───────────

const executeConsultationSummary: ProposalHandler<"consultation_summary"> = async (action) => {
  const client = await getClientById(action.clientId);
  if (!client) throw new ProposalExecutionError("Paciente não encontrado.", 404);

  const session = await getConsultationSessionById(action.consultationSessionId);
  if (!session || session.client_id !== action.clientId) {
    throw new ProposalExecutionError("Esta sessão de consulta não pertence a este paciente.", 403);
  }

  // O UNICO side effect desta confirmacao e gravar o resumo na propria
  // sessao de consulta — nunca prontuario/plano/protocolo diretamente
  // (mesma filosofia de patient_change_request: side effect estreito).
  const saved = await saveConsultationSummary(action.consultationSessionId, action.content);
  if (!saved) {
    throw new ProposalExecutionError("Esta consulta já foi finalizada ou cancelada — não é possível salvar o resumo.", 409);
  }

  return { data: { consultationSessionId: action.consultationSessionId } };
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
  patient_change_request: executePatientChangeRequest,
  consultation_tasks_batch: executeConsultationTasksBatch,
  consultation_summary: executeConsultationSummary,
};

export async function executeProposedAction(
  action: ProposedAction,
  ctx: ProposalExecutionContext
): Promise<ProposalExecutionResult> {
  const handler = PROPOSAL_HANDLERS[action.kind] as ProposalHandler<typeof action.kind>;
  return handler(action, ctx);
}
