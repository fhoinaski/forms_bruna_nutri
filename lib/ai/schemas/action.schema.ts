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
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type ProposedActionKind = ProposedAction["kind"];
