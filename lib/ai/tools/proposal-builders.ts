import type { ProposedAction } from "@/lib/ai/schemas/action.schema";
import { getToolRisk } from "@/lib/ai/tools/registry";
import { evaluateAutonomy } from "@/lib/ai/policies/autonomy-policy";
import { PROPOSE_NUTRITION_RECORD_TOOL_NAME } from "@/lib/ai/agents/clinical/prontuario-agent";
import { PROPOSE_PRE_ANALYSIS_TOOL_NAME } from "@/lib/ai/pre-analysis-assistant";
import { PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME } from "@/lib/ai/client-protocol-assistant";
import {
  PROPOSE_NEW_CLIENT_TOOL_NAME,
  type ProposeNewClientInput,
  type ProposeNewClientOutput,
} from "@/lib/ai/agents/clients/client-creation-agent";
import { PROPOSE_NEW_RECIPE_TOOL_NAME, type ProposeNewRecipeOutput } from "@/lib/ai/agents/nutrition/recipe-creation-agent";
import { PROPOSE_NEW_PROTOCOL_TOOL_NAME, type ProposeNewClientProtocolInput } from "@/lib/ai/agents/clinical/protocol-creation-agent";
import { PROPOSE_NEW_BLOG_POST_TOOL_NAME, type ProposeNewBlogPostInput } from "@/lib/ai/agents/content/blog-creation-agent";
import { PROPOSE_NEW_APPOINTMENT_TOOL_NAME, type ProposeNewAppointmentInput } from "@/lib/ai/agents/appointments/appointment-agent";
import { PROPOSE_NEW_TASK_TOOL_NAME, type ProposeNewClientTaskInput } from "@/lib/ai/agents/appointments/task-agent";

/**
 * Substitui a cadeia de 9 `if`s quase identicos que existia em
 * app/api/admin/ai/chat/route.ts para transformar o resultado de uma tool
 * de "proposta" no `ProposedAction` que vai para o frontend. Cada builder
 * decide o shape especifico do kind; risco e necessidade de confirmacao sao
 * sempre calculados aqui, centralmente (lib/ai/policies), nunca pelo builder.
 */
export interface ProposalBuilderContext {
  clientId?: string;
  submissionId?: string;
}

type ProposedActionWithoutEnvelope = Omit<ProposedAction, "risk" | "requiresConfirmation">;

type ProposalBuilder = (
  input: Record<string, unknown>,
  ctx: ProposalBuilderContext,
  toolOutput: unknown
) => ProposedActionWithoutEnvelope | null;

function filterFilledTextFields(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === "string" && value.trim())
  ) as Record<string, string>;
}

const BUILDERS: Record<string, ProposalBuilder> = {
  [PROPOSE_NUTRITION_RECORD_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const fields = filterFilledTextFields(input);
    if (!Object.keys(fields).length) return null;
    return { kind: "nutrition_record", clientId: ctx.clientId, fields };
  },

  [PROPOSE_PRE_ANALYSIS_TOOL_NAME]: (input, ctx) => {
    if (!ctx.submissionId) return null;
    const fields = filterFilledTextFields(input);
    if (!Object.keys(fields).length) return null;
    return { kind: "pre_analysis", submissionId: ctx.submissionId, fields };
  },

  [PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as { clientProtocolId: string; professionalNotes: string };
    if (!typed.professionalNotes?.trim()) return null;
    return {
      kind: "client_protocol",
      clientId: ctx.clientId,
      clientProtocolId: typed.clientProtocolId,
      professionalNotes: typed.professionalNotes,
    };
  },

  [PROPOSE_NEW_CLIENT_TOOL_NAME]: (input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeNewClientOutput | undefined;
    const typed = output?.proposal ?? input as ProposeNewClientInput;
    const fields = filterFilledTextFields(typed as unknown as Record<string, unknown>);
    if (!fields.name) return null;
    return { kind: "new_client", fields };
  },

  [PROPOSE_NEW_RECIPE_TOOL_NAME]: (_input, _ctx, toolOutput) => {
    const output = toolOutput as ProposeNewRecipeOutput | undefined;
    if (!output || "error" in output) return null;
    return {
      kind: "new_recipe",
      title: output.title,
      meal_group: output.meal_group,
      servings: output.servings,
      preparation_steps: output.preparation_steps,
      ingredients: output.ingredients,
    };
  },

  [PROPOSE_NEW_PROTOCOL_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeNewClientProtocolInput;
    const fields = filterFilledTextFields(typed as unknown as Record<string, unknown>);
    if (!fields.title) return null;
    return { kind: "new_protocol", clientId: ctx.clientId, fields };
  },

  [PROPOSE_NEW_BLOG_POST_TOOL_NAME]: (input) => {
    const typed = input as ProposeNewBlogPostInput;
    if (!typed.title || !typed.excerpt || !typed.content_markdown) return null;
    return {
      kind: "new_blog_post",
      fields: {
        title: typed.title,
        excerpt: typed.excerpt,
        content_markdown: typed.content_markdown,
        category: typed.category ?? "",
        tags: (typed.tags ?? []).join(", "),
        seo_title: typed.seo_title ?? "",
        seo_description: typed.seo_description ?? "",
      },
    };
  },

  [PROPOSE_NEW_APPOINTMENT_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeNewAppointmentInput;
    if (!typed.title || !typed.starts_at_display) return null;
    return {
      kind: "new_appointment",
      clientId: ctx.clientId,
      fields: {
        title: typed.title,
        appointment_type: typed.appointment_type,
        starts_at_display: typed.starts_at_display,
        location: typed.location ?? "",
        notes: typed.notes ?? "",
      },
    };
  },

  [PROPOSE_NEW_TASK_TOOL_NAME]: (input, ctx) => {
    if (!ctx.clientId) return null;
    const typed = input as ProposeNewClientTaskInput;
    if (!typed.title) return null;
    return {
      kind: "new_task",
      clientId: ctx.clientId,
      fields: {
        title: typed.title,
        description: typed.description ?? "",
        due_date_display: typed.due_date_display ?? "",
      },
    };
  },
};

/**
 * Constroi o ProposedAction final (com risco e necessidade de confirmacao
 * ja resolvidos pela politica central) a partir do resultado de uma tool
 * call, ou `null` se a tool nao gerar uma proposta valida (dado insuficiente,
 * tool nao reconhecida como "proposta", etc.).
 */
export function buildProposedAction(
  toolName: string,
  input: unknown,
  ctx: ProposalBuilderContext,
  toolOutput?: unknown
): ProposedAction | null {
  const builder = BUILDERS[toolName];
  if (!builder) return null;
  const partial = builder((input ?? {}) as Record<string, unknown>, ctx, toolOutput);
  if (!partial) return null;
  const risk = getToolRisk(toolName);
  if (!risk) return null;
  const autonomy = evaluateAutonomy(risk);
  return { ...partial, risk: autonomy.risk, requiresConfirmation: autonomy.requiresConfirmation } as ProposedAction;
}

export const PROPOSAL_TOOL_NAMES = Object.keys(BUILDERS);
