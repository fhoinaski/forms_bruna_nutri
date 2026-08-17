import { z } from "zod";
import {
  CLINICAL_MARKER_TYPES,
  CLINICAL_MARKER_SEVERITIES,
  FOOD_RESTRICTION_CODES,
  CLINICAL_FLAG_CODES,
} from "@/lib/clinical/structured-markers";

/**
 * Substitui o `Record<string, unknown>` solto que a rota de chat usava para
 * `proposedUpdate`. Cada "kind" tem um shape tipado e validado, e toda
 * proposta carrega `risk`/`requiresConfirmation` calculados centralmente
 * (lib/ai/policies) — nunca o frontend decidindo sozinho se algo precisa de
 * confirmacao.
 */
const toolRiskSchema = z.enum(["read", "low", "sensitive", "clinical"]);

const actionEnvelopeFields = {
  risk: toolRiskSchema,
  requiresConfirmation: z.boolean(),
  /** Id da proposta persistida server-side (lib/ai/core/proposal-store.ts) — anexado apos a criacao, nao pelo builder. */
  proposalId: z.string().optional(),
  /** ISO datetime — a proposta nao pode mais ser confirmada apos esse instante. */
  expiresAt: z.string().optional(),
};

const textFieldsSchema = z.record(z.string(), z.string());

export const nutritionRecordActionSchema = z.object({
  kind: z.literal("nutrition_record"),
  clientId: z.string().min(1),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const preAnalysisActionSchema = z.object({
  kind: z.literal("pre_analysis"),
  submissionId: z.string().min(1),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const clientProtocolActionSchema = z.object({
  kind: z.literal("client_protocol"),
  clientId: z.string().min(1),
  clientProtocolId: z.string().min(1),
  professionalNotes: z.string().min(1),
  ...actionEnvelopeFields,
});

export const newClientActionSchema = z.object({
  kind: z.literal("new_client"),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const newRecipeActionSchema = z.object({
  kind: z.literal("new_recipe"),
  title: z.string().min(1),
  meal_group: z.string().min(1),
  servings: z.number().int().positive(),
  preparation_steps: z.string(),
  ingredients: z.array(z.object({
    food_name: z.string().min(1),
    grams: z.number().positive(),
    taco_number: z.number().nullable(),
  })),
  ...actionEnvelopeFields,
});

export const newProtocolActionSchema = z.object({
  kind: z.literal("new_protocol"),
  clientId: z.string().min(1),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const newBlogPostActionSchema = z.object({
  kind: z.literal("new_blog_post"),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const newAppointmentActionSchema = z.object({
  kind: z.literal("new_appointment"),
  clientId: z.string().min(1),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

export const newTaskActionSchema = z.object({
  kind: z.literal("new_task"),
  clientId: z.string().min(1),
  fields: textFieldsSchema,
  ...actionEnvelopeFields,
});

// ── meal_plan_change ────────────────────────────────────────────────────
//
// Alteracao estruturada do plano alimentar (nao mais texto solto dentro do
// prontuario). `meal_plan_items.food` no banco e texto livre (sem FK para a
// TACO — ver lib/repositories/meal-plans.ts), mas `food_source`/`food_ref_id`
// (colunas reais da tabela, ja usadas pelo editor manual) SAO persistidas a
// partir de `source`/`refId` abaixo — revalidadas em tempo de execucao
// (nunca confia no que a tool resolveu antes), nunca so o texto do nome
// (FASE 4, item 3 do pedido: "nunca persistir apenas nome").

/** Vocabulario fechado de unidade — alinhado ao que quantityInGrams() (lib/nutrition/macros.ts) reconhece. Nunca aceita string livre. */
export const mealPlanMeasureUnitSchema = z.enum(["g", "kg", "ml", "l", "colher", "xicara", "unidade", "fatia"]);
export type MealPlanMeasureUnit = z.infer<typeof mealPlanMeasureUnitSchema>;

/** 5000 e um teto defensivo (nao e limite clinico) so para rejeitar valores absurdos tipo 999999999. */
const mealPlanQuantitySchema = z.number().finite().positive().max(5000);

/** Mesmas 3 fontes do catalogo unificado (lib/nutrition/food-search.ts) — sempre resolvido via searchFoods antes de propor. */
export const mealPlanFoodSourceSchema = z.enum(["TACO", "CUSTOM", "MANUFACTURER"]);

export const mealPlanFoodReferenceSchema = z.object({
  foodName: z.string().min(1).max(200),
  /** Fonte + id resolvidos por searchFoods/getFoodDetails (FASE 4) — nunca inventados, sempre revalidados no confirm. */
  source: mealPlanFoodSourceSchema,
  refId: z.string().min(1).max(120),
});
export type MealPlanFoodReference = z.infer<typeof mealPlanFoodReferenceSchema>;

/** Id de uma medida caseira especifica (food_portions.id, resolvida via getFoodPortions) — FASE 4, item 5 do pedido: "se nao houver portion real, nao inventar". */
const householdMeasureIdSchema = z.string().min(1).max(120).nullable().optional();

export const mealPlanChangeOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("add_meal"),
    name: z.string().min(1).max(120),
    suggestedTime: z.string().max(20).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  }),
  z.object({ operation: z.literal("remove_meal"), mealId: z.string().min(1) }),
  z.object({ operation: z.literal("rename_meal"), mealId: z.string().min(1), name: z.string().min(1).max(120) }),
  z.object({ operation: z.literal("change_meal_time"), mealId: z.string().min(1), suggestedTime: z.string().max(20).nullable() }),
  /** Copia a refeicao (com todos os itens) para logo depois dela no plano — a copia so ganha id real ao persistir, entao nao pode ser alvo de reorder_meals/reorder_items na MESMA proposta. */
  z.object({
    operation: z.literal("duplicate_meal"),
    mealId: z.string().min(1),
    newName: z.string().min(1).max(120).nullable().optional(),
  }),
  /** Lista COMPLETA (permutacao) dos ids reais das refeicoes do plano, na ordem final desejada — nunca um indice solto. */
  z.object({
    operation: z.literal("reorder_meals"),
    mealIds: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    operation: z.literal("add_item"),
    mealId: z.string().min(1),
    food: mealPlanFoodReferenceSchema,
    quantity: mealPlanQuantitySchema,
    unit: mealPlanMeasureUnitSchema,
    notes: z.string().max(300).nullable().optional(),
    householdMeasureId: householdMeasureIdSchema,
  }),
  z.object({ operation: z.literal("remove_item"), mealId: z.string().min(1), itemId: z.string().min(1) }),
  z.object({
    operation: z.literal("replace_item"),
    mealId: z.string().min(1),
    itemId: z.string().min(1),
    food: mealPlanFoodReferenceSchema,
    quantity: mealPlanQuantitySchema,
    unit: mealPlanMeasureUnitSchema,
    notes: z.string().max(300).nullable().optional(),
    householdMeasureId: householdMeasureIdSchema,
  }),
  z.object({ operation: z.literal("change_quantity"), mealId: z.string().min(1), itemId: z.string().min(1), quantity: mealPlanQuantitySchema }),
  z.object({ operation: z.literal("change_measure"), mealId: z.string().min(1), itemId: z.string().min(1), unit: mealPlanMeasureUnitSchema }),
  /** Copia o item para logo depois dele na mesma refeicao — a copia so ganha id real ao persistir, entao nao pode ser alvo de reorder_items na MESMA proposta. */
  z.object({ operation: z.literal("duplicate_item"), mealId: z.string().min(1), itemId: z.string().min(1) }),
  /** Lista COMPLETA (permutacao) dos ids reais dos itens desta refeicao, na ordem final desejada — nunca um indice solto. */
  z.object({ operation: z.literal("reorder_items"), mealId: z.string().min(1), itemIds: z.array(z.string().min(1)).min(1).max(100) }),
]);
export type MealPlanChangeOperation = z.infer<typeof mealPlanChangeOperationSchema>;

const mealPlanMacroTotalsSchema = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() });

/** Uma linha da comparação meta x prescrito PÓS-alteração (FASE 2, seções 34-35 do pedido) — so os 4 macros que aceitam meta hoje. */
const mealPlanTargetComparisonRowSchema = z.object({
  nutrient: z.enum(["energyKcal", "proteinG", "carbohydrateG", "fatG"]),
  target: z.number(),
  prescribedAfter: z.number().nullable(),
  diff: z.number().nullable(),
  percentOfTarget: z.number().nullable(),
});

/**
 * Preview calculado deterministicamente pela tool no momento da proposta
 * (nunca pelo LLM) — so para revisao humana. O confirm NUNCA confia nisso
 * para decidir o que aplicar; ele recalcula tudo do zero a partir do estado
 * real do plano no momento da confirmacao.
 */
export const mealPlanChangePreviewSchema = z.object({
  mealPlanTitle: z.string(),
  changeSummaries: z.array(z.object({
    operation: z.string(),
    mealName: z.string(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })),
  totalImpact: mealPlanMacroTotalsSchema,
  // So presente quando o plano tem alguma meta definida — compara o total
  // PRESCRITO (nao so o delta) apos aplicar as mudancas contra a meta.
  totalVsTarget: z.array(mealPlanTargetComparisonRowSchema).optional(),
  // FASE 3 (precisao nutricional): true quando pelo menos uma quantidade
  // envolvida nesta mudanca foi resolvida por conversao generica/estimada
  // (sem medida caseira especifica cadastrada) — nunca a IA afirmando
  // precisao que o motor central nao confirmou.
  hasEstimatedValues: z.boolean().optional(),
});
export type MealPlanChangePreview = z.infer<typeof mealPlanChangePreviewSchema>;

export const mealPlanChangeActionSchema = z.object({
  kind: z.literal("meal_plan_change"),
  clientId: z.string().min(1),
  mealPlanId: z.string().min(1),
  /** Versao do plano no momento em que a proposta foi criada — checada no confirm (optimistic concurrency). */
  baseVersion: z.number().int().positive(),
  changes: z.array(mealPlanChangeOperationSchema).min(1).max(20),
  preview: mealPlanChangePreviewSchema,
  ...actionEnvelopeFields,
});

// ── patient_appointment_request ─────────────────────────────────────────
//
// Unica proposal kind que o PATIENT_ASSISTANT pode gerar (perfil garante
// isso — ver lib/ai/core/patient-orchestrator.ts). Risk e SEMPRE "sensitive"
// (autoagendamento — a propria paciente confirma o proprio pedido), nunca
// "clinical" — o paciente nao possui nenhuma capability clinica.

export const patientAppointmentRequestActionSchema = z.object({
  kind: z.literal("patient_appointment_request"),
  clientId: z.string().min(1),
  /** ISO datetime — precisa ter vindo de getAvailableSlotsForScheduling, nunca inventado. */
  startsAtIso: z.string().min(1),
  ...actionEnvelopeFields,
});

// ── patient_change_request ──────────────────────────────────────────────
//
// Solicitacao do PACIENTE para a nutricionista revisar — NUNCA uma
// alteracao clinica. O "side effect" da confirmacao e so criar uma linha em
// patient_requests (status pending_review); nenhuma tabela clinica/plano e
// tocada (ver lib/ai/core/proposal-handlers.ts). Risk e SEMPRE "sensitive",
// nunca "clinical" — o paciente nao possui nenhuma capability clinica.

export const patientRequestTypeSchema = z.enum([
  "food_substitution",
  "meal_plan_difficulty",
  "symptom_or_complaint",
  "appointment_request",
  "task_difficulty",
  "general_question",
  "other",
]);
export type PatientRequestType = z.infer<typeof patientRequestTypeSchema>;

const patientChangeRequestPreviewSchema = z.object({
  title: z.string(),
  details: z.string().nullable(),
});

export const patientChangeRequestActionSchema = z.object({
  kind: z.literal("patient_change_request"),
  clientId: z.string().min(1),
  requestType: patientRequestTypeSchema,
  /** Fala original da paciente — nunca substituída pelo resumo de IA. */
  patientText: z.string().min(1).max(1000),
  /** Resumo curto opcional gerado pela IA — nunca chain-of-thought, nunca decisão clínica. */
  aiSummary: z.string().max(300).nullable().optional(),
  mealPlanId: z.string().min(1).nullable().optional(),
  mealId: z.string().min(1).nullable().optional(),
  itemId: z.string().min(1).nullable().optional(),
  appointmentId: z.string().min(1).nullable().optional(),
  clientTaskId: z.string().min(1).nullable().optional(),
  /**
   * Alimento desejado no lugar do atual (so para requestType
   * "food_substitution") — texto livre, NUNCA uma quantidade. O handler de
   * confirmacao (proposal-handlers.ts) usa isto para RECALCULAR a
   * substituicao pela engine determinística no momento de gravar — nunca
   * confia num numero vindo daqui, porque nao existe campo de numero aqui
   * (Killer Feature 4, secao 2/16/20 do pedido: estruturalmente impossivel
   * o LLM injetar uma quantidade pronta).
   */
  desiredFood: z.string().max(120).nullable().optional(),
  preview: patientChangeRequestPreviewSchema,
  ...actionEnvelopeFields,
});

// ── consultation_tasks_batch (Modo Consulta — pacote de tarefas pos-consulta) ──
//
// Unico jeito hoje de propor VARIAS tarefas numa so confirmacao — new_task
// so cobre uma de cada vez. clientId sempre vem do contexto ambiente
// (builder), nunca do modelo, mesmo padrao de new_task/client_protocol.

export const consultationTaskItemActionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  dueInDays: z.number().int().min(0).max(365).nullable().optional(),
});

export const consultationTasksBatchActionSchema = z.object({
  kind: z.literal("consultation_tasks_batch"),
  clientId: z.string().min(1),
  consultationSessionId: z.string().min(1).nullable().optional(),
  tasks: z.array(consultationTaskItemActionSchema).min(1).max(10),
  ...actionEnvelopeFields,
});

// ── consultation_summary (Modo Consulta — resumo estruturado pos-consulta) ──
//
// Side effect estreito: so grava consultation_sessions.summary_json — nunca
// toca prontuario/plano/protocolo (mesma filosofia de patient_change_request).

export const consultationSummaryContentActionSchema = z.object({
  summary: z.string().min(1).max(1500),
  evolution: z.string().max(800).nullable().optional(),
  conduct: z.string().max(800).nullable().optional(),
  plan: z.string().max(800).nullable().optional(),
  goals: z.string().max(500).nullable().optional(),
  nextSteps: z.string().max(500).nullable().optional(),
});

export const consultationSummaryActionSchema = z.object({
  kind: z.literal("consultation_summary"),
  clientId: z.string().min(1),
  consultationSessionId: z.string().min(1),
  content: consultationSummaryContentActionSchema,
  ...actionEnvelopeFields,
});

// ── reschedule_appointment / cancel_appointment (FASE 3 — safe writes) ───
//
// `previousStartsAtIso`/`previousStatus` sao o snapshot capturado no
// momento da PROPOSTA — o handler de confirmacao (proposal-handlers.ts)
// re-busca o agendamento real e SO aplica se esse snapshot ainda bater com
// o estado atual (mesma logica de optimistic concurrency de
// `meal_plan_change.baseVersion`, sem coluna de versao formal em
// `appointments`). Se mudou, a confirmacao falha como stale (409), nunca
// aplica por cima silenciosamente.

export const rescheduleAppointmentActionSchema = z.object({
  kind: z.literal("reschedule_appointment"),
  appointmentId: z.string().min(1),
  clientId: z.string().min(1),
  previousStartsAtIso: z.string().min(1),
  newStartsAtDisplay: z.string().min(10).max(20),
  ...actionEnvelopeFields,
});

export const cancelAppointmentActionSchema = z.object({
  kind: z.literal("cancel_appointment"),
  appointmentId: z.string().min(1),
  clientId: z.string().min(1).nullable(),
  previousStatus: z.string().min(1),
  cancellationReason: z.string().max(300).nullable().optional(),
  ...actionEnvelopeFields,
});

// ── resolve_patient_request (FASE 3 — safe writes) ────────────────────────
//
// Reaproveita os status ja existentes de patient_requests (nunca inventa um
// status novo) — `previousStatus` e sempre "pending_review" na pratica (so
// solicitacoes pendentes podem ser propostas para resolucao), mas fica
// explicito no payload para a mesma checagem de staleness no confirm.

export const resolvePatientRequestActionSchema = z.object({
  kind: z.literal("resolve_patient_request"),
  requestId: z.string().min(1),
  clientId: z.string().min(1),
  previousStatus: z.string().min(1),
  newStatus: z.enum(["reviewed", "resolved", "dismissed"]),
  adminNotes: z.string().max(500).nullable().optional(),
  ...actionEnvelopeFields,
});

// ── mark_payment_received (FASE 3 — safe writes) ──────────────────────────
//
// Financeiro e 100% registro manual (sem gateway) — esta kind NUNCA cria
// cobranca, NUNCA altera valor (nao ha campo de valor aqui), NUNCA exclui
// um pagamento. So marca um pagamento JA EXISTENTE como recebido.

export const markPaymentReceivedActionSchema = z.object({
  kind: z.literal("mark_payment_received"),
  paymentId: z.string().min(1),
  clientId: z.string().min(1).nullable(),
  previousStatus: z.string().min(1),
  paidAtDisplay: z.string().max(10).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
  ...actionEnvelopeFields,
});

// ── update_safe_substitutions_setting (FASE 5 — safe config write) ───────
//
// Unico write de configuracao desta fase: liga/desliga a feature flag
// operacional de substituicoes seguras no portal do paciente. Nunca toca
// provider/model/api_key/system prompts (fora de escopo — mais estrutural/
// sensivel). `previousEnabled` e o snapshot no momento da proposta, checado
// de novo no confirm (mesmo padrao de staleness das outras kinds).

export const updateSafeSubstitutionsSettingActionSchema = z.object({
  kind: z.literal("update_safe_substitutions_setting"),
  previousEnabled: z.boolean(),
  newEnabled: z.boolean(),
  ...actionEnvelopeFields,
});

// ── clinical_marker_upsert / resolve_clinical_marker (FASE 6 — writes clínicos) ──
//
// Vocabulario FECHADO (lib/clinical/structured-markers.ts) — o modelo so
// pode escolher `markerType`/`code` dentre os valores reais ja usados pela
// tela de restricoes estruturadas, nunca texto livre. Isso torna a
// ambiguidade MILK/LACTOSE ou WHEAT/GLUTEN estruturalmente impossivel de
// "resolver sozinho": o schema obriga uma escolha explicita, e as instrucoes
// de prompt (clinical-markers-agent.ts) mandam perguntar quando o relato nao
// deixar claro qual dos dois. `clientId` NUNCA vem do modelo — sempre do
// contexto ambiente (ProposalBuilderContext.clientId), mesmo padrao de
// nutrition_record/client_protocol/new_protocol.

const clinicalMarkerTypeSchema = z.enum(CLINICAL_MARKER_TYPES);
const clinicalMarkerCodeSchema = z.enum([...FOOD_RESTRICTION_CODES, ...CLINICAL_FLAG_CODES]);
const clinicalMarkerSeveritySchema = z.enum(CLINICAL_MARKER_SEVERITIES);

export const clinicalMarkerUpsertActionSchema = z.object({
  kind: z.literal("clinical_marker_upsert"),
  clientId: z.string().min(1),
  markerType: clinicalMarkerTypeSchema,
  code: clinicalMarkerCodeSchema,
  severity: clinicalMarkerSeveritySchema,
  status: z.enum(["ACTIVE", "SUSPECTED"]),
  evidenceText: z.string().max(500).nullable().optional(),
  ...actionEnvelopeFields,
});

export const resolveClinicalMarkerActionSchema = z.object({
  kind: z.literal("resolve_clinical_marker"),
  clientId: z.string().min(1),
  markerType: clinicalMarkerTypeSchema,
  code: clinicalMarkerCodeSchema,
  ...actionEnvelopeFields,
});

// ── consultation_note (FASE 6 — observação livre da consulta) ────────────
//
// Distinto de `consultation_summary` (resumo ESTRUTURADO pos-consulta): isto
// e uma observacao de TEXTO LIVRE anexada durante a consulta
// (`consultation_sessions.notes`). O handler sempre ANEXA ao texto atual no
// momento da confirmacao (nunca sobrescreve) — por isso nao ha necessidade
// de um snapshot de "previousNotes" para checar staleness: nao ha como essa
// operacao perder conteudo concorrente, so no maximo intercalar a ordem.

export const consultationNoteActionSchema = z.object({
  kind: z.literal("consultation_note"),
  clientId: z.string().min(1),
  consultationSessionId: z.string().min(1),
  observationText: z.string().min(1).max(2000),
  ...actionEnvelopeFields,
});

// ── activate_meal_plan (FASE 6 — ativação/publicação clínica do plano) ───
//
// Distinto de `meal_plan_change` (edicao de conteudo): aqui SO o campo
// `status` muda (draft -> active), reusando updateMealPlan/optimistic
// concurrency/versionamento identicos aos content edits — nunca um caminho
// paralelo. `baseVersion` e revalidado no confirm exatamente como em
// meal_plan_change.baseVersion.

export const activateMealPlanActionSchema = z.object({
  kind: z.literal("activate_meal_plan"),
  clientId: z.string().min(1),
  mealPlanId: z.string().min(1),
  baseVersion: z.number().int().positive(),
  mealPlanTitle: z.string(),
  ...actionEnvelopeFields,
});

export const proposedActionSchema = z.discriminatedUnion("kind", [
  nutritionRecordActionSchema,
  preAnalysisActionSchema,
  clientProtocolActionSchema,
  newClientActionSchema,
  newRecipeActionSchema,
  newProtocolActionSchema,
  newBlogPostActionSchema,
  newAppointmentActionSchema,
  newTaskActionSchema,
  mealPlanChangeActionSchema,
  patientAppointmentRequestActionSchema,
  patientChangeRequestActionSchema,
  consultationTasksBatchActionSchema,
  consultationSummaryActionSchema,
  rescheduleAppointmentActionSchema,
  cancelAppointmentActionSchema,
  resolvePatientRequestActionSchema,
  markPaymentReceivedActionSchema,
  updateSafeSubstitutionsSettingActionSchema,
  clinicalMarkerUpsertActionSchema,
  resolveClinicalMarkerActionSchema,
  consultationNoteActionSchema,
  activateMealPlanActionSchema,
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type ProposedActionKind = ProposedAction["kind"];
