import { z } from "zod";

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
// TACO — ver lib/repositories/meal-plans.ts), entao `tacoNumber` aqui e
// revalidado em tempo de execucao (nunca persistido como FK) — o mesmo
// padrao ja usado em `newRecipeActionSchema.ingredients[].taco_number`.

/** Vocabulario fechado de unidade — alinhado ao que quantityInGrams() (lib/nutrition/macros.ts) reconhece. Nunca aceita string livre. */
export const mealPlanMeasureUnitSchema = z.enum(["g", "kg", "ml", "l", "colher", "xicara", "unidade", "fatia"]);
export type MealPlanMeasureUnit = z.infer<typeof mealPlanMeasureUnitSchema>;

/** 5000 e um teto defensivo (nao e limite clinico) so para rejeitar valores absurdos tipo 999999999. */
const mealPlanQuantitySchema = z.number().finite().positive().max(5000);

export const mealPlanFoodReferenceSchema = z.object({
  foodName: z.string().min(1).max(200),
  /** numero TACO resolvido pela tool via busca real — null so quando genuinamente nao ha correspondencia (ex.: suplemento de marca). */
  tacoNumber: z.number().int().nullable(),
});
export type MealPlanFoodReference = z.infer<typeof mealPlanFoodReferenceSchema>;

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
  z.object({
    operation: z.literal("add_item"),
    mealId: z.string().min(1),
    food: mealPlanFoodReferenceSchema,
    quantity: mealPlanQuantitySchema,
    unit: mealPlanMeasureUnitSchema,
    notes: z.string().max(300).nullable().optional(),
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
  }),
  z.object({ operation: z.literal("change_quantity"), mealId: z.string().min(1), itemId: z.string().min(1), quantity: mealPlanQuantitySchema }),
  z.object({ operation: z.literal("change_measure"), mealId: z.string().min(1), itemId: z.string().min(1), unit: mealPlanMeasureUnitSchema }),
]);
export type MealPlanChangeOperation = z.infer<typeof mealPlanChangeOperationSchema>;

const mealPlanMacroTotalsSchema = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() });

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
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type ProposedActionKind = ProposedAction["kind"];
