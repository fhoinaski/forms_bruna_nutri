import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { createConfiguredModel } from "@/lib/ai/model-factory";
import { buildSystemUsageKnowledgeBase } from "@/lib/ai/system-chat-knowledge";
import {
  PRONTUARIO_ASSISTANT_INSTRUCTIONS,
  PROPOSE_NUTRITION_RECORD_TOOL_NAME,
  buildNutritionRecordContext,
  proposeNutritionRecordInputSchema,
} from "@/lib/ai/prontuario-assistant";
import {
  PRE_ANALYSIS_ASSISTANT_INSTRUCTIONS,
  PROPOSE_PRE_ANALYSIS_TOOL_NAME,
  buildPreAnalysisContext,
  proposePreAnalysisInputSchema,
} from "@/lib/ai/pre-analysis-assistant";
import {
  CLIENT_PROTOCOL_ASSISTANT_INSTRUCTIONS,
  PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME,
  buildClientProtocolsContext,
  proposeClientProtocolNotesInputSchema,
} from "@/lib/ai/client-protocol-assistant";
import {
  FIND_CLIENT_TOOL_NAME,
  NAVIGATE_TOOL_NAME,
  NAVIGATION_ASSISTANT_INSTRUCTIONS,
  executeFindClient,
  findClientInputSchema,
  navigateInputSchema,
  resolveNavigationPath,
  type NavigateInput,
} from "@/lib/ai/navigation-assistant";
import {
  CLIENT_CREATION_ASSISTANT_INSTRUCTIONS,
  PROPOSE_NEW_CLIENT_TOOL_NAME,
  proposeNewClientInputSchema,
  type ProposeNewClientInput,
} from "@/lib/ai/client-creation-assistant";
import {
  PROPOSE_NEW_RECIPE_TOOL_NAME,
  RECIPE_CREATION_ASSISTANT_INSTRUCTIONS,
  executeProposeNewRecipe,
  proposeNewRecipeInputSchema,
  type ProposeNewRecipeOutput,
} from "@/lib/ai/recipe-creation-assistant";
import {
  PROPOSE_NEW_PROTOCOL_TOOL_NAME,
  PROTOCOL_CREATION_ASSISTANT_INSTRUCTIONS,
  proposeNewClientProtocolInputSchema,
  type ProposeNewClientProtocolInput,
} from "@/lib/ai/protocol-creation-assistant";
import {
  BLOG_CREATION_ASSISTANT_INSTRUCTIONS,
  PROPOSE_NEW_BLOG_POST_TOOL_NAME,
  proposeNewBlogPostInputSchema,
  type ProposeNewBlogPostInput,
} from "@/lib/ai/blog-creation-assistant";
import { DIET_REVIEW_ASSISTANT_INSTRUCTIONS, buildActiveMealPlanContext } from "@/lib/ai/diet-review-assistant";
import { ALLOWED_ATTACHMENT_MEDIA_TYPES, MAX_ATTACHMENT_BASE64_LENGTH } from "@/lib/ai/chat-attachments";
import {
  APPOINTMENT_ASSISTANT_INSTRUCTIONS,
  PROPOSE_NEW_APPOINTMENT_TOOL_NAME,
  buildUpcomingAppointmentsContext,
  proposeNewAppointmentInputSchema,
  type ProposeNewAppointmentInput,
} from "@/lib/ai/appointment-assistant";
import {
  PROPOSE_NEW_TASK_TOOL_NAME,
  TASK_ASSISTANT_INSTRUCTIONS,
  proposeNewClientTaskInputSchema,
  type ProposeNewClientTaskInput,
} from "@/lib/ai/task-assistant";
import { DEFAULT_CHAT_SYSTEM_PROMPT, getAISettings } from "@/lib/repositories/ai-settings";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAppointments } from "@/lib/repositories/appointments";
import { getClientById } from "@/lib/repositories/clients";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { getPreAnalysisBySubmissionId } from "@/lib/repositories/pre-analyses";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Historico e mantido inteiro na UI, mas o cliente so envia uma janela
// recente (ver AiChatWidget) — o limite aqui e so uma rede de seguranca
// generosa contra payloads anormais, nao um teto real de conversa.
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mediaType: z.enum(ALLOWED_ATTACHMENT_MEDIA_TYPES),
  data: z.string().min(1).max(MAX_ATTACHMENT_BASE64_LENGTH),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(60),
  attachment: attachmentSchema.optional(),
  context: z.object({
    clientId: z.string().min(1).max(120).optional(),
    submissionId: z.string().min(1).max(120).optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  // Limite generoso: existe so como rede de seguranca contra um loop com
  // bug disparando chamadas sem parar (o que geraria custo real na API do
  // provedor de IA), nao para restringir o uso normal do chat.
  const limit = await consumeRateLimit(req, {
    scope: "ai-system-chat",
    limit: 600,
    windowMs: 60 * 60 * 1000,
    blockMs: 5 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas mensagens em pouco tempo. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const settings = await getAISettings();
  if (!settings.api_key) {
    return NextResponse.json(
      { message: "Configure uma chave de IA em Configurações > Inteligência artificial para usar o assistente." },
      { status: 409 }
    );
  }

  const clientId = parsed.data.context?.clientId;
  const submissionId = parsed.data.context?.submissionId;
  const client = clientId ? await getClientById(clientId) : null;
  const submission = submissionId ? await getSubmissionById(submissionId) : null;

  try {
    const model = createConfiguredModel(settings);
    const systemPromptParts = [
      settings.chat_system_prompt?.trim() || DEFAULT_CHAT_SYSTEM_PROMPT,
      buildSystemUsageKnowledgeBase(),
    ];

    systemPromptParts.push(
      NAVIGATION_ASSISTANT_INSTRUCTIONS,
      CLIENT_CREATION_ASSISTANT_INSTRUCTIONS,
      RECIPE_CREATION_ASSISTANT_INSTRUCTIONS,
      BLOG_CREATION_ASSISTANT_INSTRUCTIONS
    );
    const tools: ToolSet = {
      [FIND_CLIENT_TOOL_NAME]: {
        description: "Busca clientes pelo nome para descobrir o id antes de navegar ate a ficha dele.",
        inputSchema: findClientInputSchema,
        execute: executeFindClient,
      },
      [NAVIGATE_TOOL_NAME]: {
        description: "Navega o sistema ate a tela pedida (ficha de um cliente, lista de clientes, agenda, biblioteca de protocolos/modelos/receitas, tarefas ou financeiro).",
        inputSchema: navigateInputSchema,
        execute: async (input: NavigateInput) => input,
      },
      [PROPOSE_NEW_CLIENT_TOOL_NAME]: {
        description: "Registra uma proposta de cadastro de um novo cliente/paciente com os dados informados, para revisao humana antes de criar de verdade.",
        inputSchema: proposeNewClientInputSchema,
        execute: async (input: ProposeNewClientInput) => input,
      },
      [PROPOSE_NEW_RECIPE_TOOL_NAME]: {
        description: "Busca ingredientes reais na TACO e monta uma proposta de receita nova (titulo, grupo, porcoes, ingredientes e modo de preparo) para revisao humana antes de salvar na biblioteca.",
        inputSchema: proposeNewRecipeInputSchema,
        execute: executeProposeNewRecipe,
      },
      [PROPOSE_NEW_BLOG_POST_TOOL_NAME]: {
        description: "Registra uma proposta de rascunho de post novo para o blog do site (titulo, resumo, conteudo em markdown, categoria e tags), para revisao humana antes de salvar.",
        inputSchema: proposeNewBlogPostInputSchema,
        execute: async (input: ProposeNewBlogPostInput) => input,
      },
    };

    if (client) {
      const record = await getNutritionRecord(client.id);
      systemPromptParts.push(PRONTUARIO_ASSISTANT_INSTRUCTIONS, buildNutritionRecordContext(client.name, record));

      const activeMealPlan = await getActiveMealPlan(client.id);
      systemPromptParts.push(DIET_REVIEW_ASSISTANT_INSTRUCTIONS, buildActiveMealPlanContext(activeMealPlan));

      tools[PROPOSE_NUTRITION_RECORD_TOOL_NAME] = {
        description: "Registra uma proposta de preenchimento/atualizacao de campos do prontuario nutricional do cliente atual, para revisao humana antes de salvar.",
        inputSchema: proposeNutritionRecordInputSchema,
        execute: async (input: Record<string, string | undefined>) => input,
      };

      systemPromptParts.push(PROTOCOL_CREATION_ASSISTANT_INSTRUCTIONS);
      tools[PROPOSE_NEW_PROTOCOL_TOOL_NAME] = {
        description: "Registra uma proposta de criacao de um protocolo personalizado simples (titulo, categoria, descricao, notas) para o cliente atual, para revisao humana antes de criar de verdade.",
        inputSchema: proposeNewClientProtocolInputSchema,
        execute: async (input: ProposeNewClientProtocolInput) => input,
      };

      const protocols = await getClientProtocols(client.id);
      if (protocols.length) {
        systemPromptParts.push(CLIENT_PROTOCOL_ASSISTANT_INSTRUCTIONS, buildClientProtocolsContext(protocols));
        tools[PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME] = {
          description: "Registra uma proposta de atualizacao das notas profissionais de um protocolo ja atribuido ao cliente atual, para revisao humana antes de salvar.",
          inputSchema: proposeClientProtocolNotesInputSchema,
          execute: async (input: { clientProtocolId: string; professionalNotes: string }) => input,
        };
      }

      const appointments = await getAppointments({ clientId: client.id });
      systemPromptParts.push(APPOINTMENT_ASSISTANT_INSTRUCTIONS, buildUpcomingAppointmentsContext(appointments));
      tools[PROPOSE_NEW_APPOINTMENT_TOOL_NAME] = {
        description: "Registra uma proposta de nova consulta na agenda para o cliente atual, para revisao humana antes de criar de verdade.",
        inputSchema: proposeNewAppointmentInputSchema,
        execute: async (input: ProposeNewAppointmentInput) => input,
      };

      systemPromptParts.push(TASK_ASSISTANT_INSTRUCTIONS);
      tools[PROPOSE_NEW_TASK_TOOL_NAME] = {
        description: "Registra uma proposta de tarefa de acompanhamento para o cliente atual, para revisao humana antes de criar de verdade.",
        inputSchema: proposeNewClientTaskInputSchema,
        execute: async (input: ProposeNewClientTaskInput) => input,
      };
    }

    if (submission) {
      const currentPreAnalysis = await getPreAnalysisBySubmissionId(submission.id);
      systemPromptParts.push(PRE_ANALYSIS_ASSISTANT_INSTRUCTIONS, buildPreAnalysisContext(submission, currentPreAnalysis));
      tools[PROPOSE_PRE_ANALYSIS_TOOL_NAME] = {
        description: "Registra uma proposta de pre-analise (resumo, pontos de atencao, objetivo, restricoes e notas) para o formulario de pre-consulta atual, para revisao humana antes de salvar.",
        inputSchema: proposePreAnalysisInputSchema,
        execute: async (input: Record<string, string | undefined>) => input,
      };
    }

    const attachment = parsed.data.attachment;
    if (attachment) {
      systemPromptParts.push(
        `A nutricionista anexou um arquivo a mensagem mais recente: "${attachment.name}". Leia o conteudo e use para ajudar a interpretar exames/diagnosticos, complementar o prontuario, a pre-analise ou a conduta, conforme o pedido. Deixe claro que sua leitura e um apoio tecnico e a decisao final e da profissional.`
      );
    }

    const messages: ModelMessage[] = parsed.data.messages.map((message, index, array) => {
      const isLastMessage = index === array.length - 1;
      if (!attachment || !isLastMessage || message.role !== "user") return message;
      return {
        role: "user",
        content: [
          { type: "text", text: message.content },
          { type: "file", data: attachment.data, mediaType: attachment.mediaType, filename: attachment.name },
        ],
      };
    });

    const result = await generateText({
      model,
      system: systemPromptParts.join("\n\n"),
      messages,
      stopWhen: stepCountIs(4),
      maxOutputTokens: 6000,
      tools,
    });

    const proposalCall = result.toolCalls?.find((call) =>
      call.toolName === PROPOSE_NUTRITION_RECORD_TOOL_NAME
      || call.toolName === PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME
      || call.toolName === PROPOSE_PRE_ANALYSIS_TOOL_NAME
      || call.toolName === PROPOSE_NEW_CLIENT_TOOL_NAME
      || call.toolName === PROPOSE_NEW_RECIPE_TOOL_NAME
      || call.toolName === PROPOSE_NEW_PROTOCOL_TOOL_NAME
      || call.toolName === PROPOSE_NEW_BLOG_POST_TOOL_NAME
      || call.toolName === PROPOSE_NEW_APPOINTMENT_TOOL_NAME
      || call.toolName === PROPOSE_NEW_TASK_TOOL_NAME
    );
    const navigateCall = result.toolCalls?.find((call) => call.toolName === NAVIGATE_TOOL_NAME);
    const navigateResult = navigateCall ? await resolveNavigationPath(navigateCall.input as NavigateInput) : null;

    let proposedUpdate: Record<string, unknown> | undefined;

    if (proposalCall?.toolName === PROPOSE_NUTRITION_RECORD_TOOL_NAME && client) {
      const fields = Object.fromEntries(
        Object.entries(proposalCall.input as Record<string, string | undefined>).filter(([, value]) => value?.trim())
      );
      if (Object.keys(fields).length) proposedUpdate = { kind: "nutrition_record", clientId: client.id, fields };
    }

    if (proposalCall?.toolName === PROPOSE_PRE_ANALYSIS_TOOL_NAME && submission) {
      const fields = Object.fromEntries(
        Object.entries(proposalCall.input as Record<string, string | undefined>).filter(([, value]) => value?.trim())
      );
      if (Object.keys(fields).length) proposedUpdate = { kind: "pre_analysis", submissionId: submission.id, fields };
    }

    if (proposalCall?.toolName === PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME && client) {
      const input = proposalCall.input as { clientProtocolId: string; professionalNotes: string };
      if (input.professionalNotes?.trim()) {
        proposedUpdate = {
          kind: "client_protocol",
          clientId: client.id,
          clientProtocolId: input.clientProtocolId,
          professionalNotes: input.professionalNotes,
        };
      }
    }

    if (proposalCall?.toolName === PROPOSE_NEW_CLIENT_TOOL_NAME) {
      const input = proposalCall.input as ProposeNewClientInput;
      const fields = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value?.trim())
      );
      if (fields.name) proposedUpdate = { kind: "new_client", fields };
    }

    if (proposalCall?.toolName === PROPOSE_NEW_RECIPE_TOOL_NAME) {
      const output = result.toolResults?.find((toolResult) => toolResult.toolName === PROPOSE_NEW_RECIPE_TOOL_NAME)
        ?.output as ProposeNewRecipeOutput | undefined;
      if (output && !("error" in output)) {
        proposedUpdate = {
          kind: "new_recipe",
          title: output.title,
          meal_group: output.meal_group,
          servings: output.servings,
          preparation_steps: output.preparation_steps,
          ingredients: output.ingredients,
        };
      }
    }

    if (proposalCall?.toolName === PROPOSE_NEW_PROTOCOL_TOOL_NAME && client) {
      const input = proposalCall.input as ProposeNewClientProtocolInput;
      const fields = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value?.trim())
      );
      if (fields.title) proposedUpdate = { kind: "new_protocol", clientId: client.id, fields };
    }

    if (proposalCall?.toolName === PROPOSE_NEW_BLOG_POST_TOOL_NAME) {
      const input = proposalCall.input as ProposeNewBlogPostInput;
      if (input.title && input.excerpt && input.content_markdown) {
        proposedUpdate = {
          kind: "new_blog_post",
          fields: {
            title: input.title,
            excerpt: input.excerpt,
            content_markdown: input.content_markdown,
            category: input.category ?? "",
            tags: (input.tags ?? []).join(", "),
            seo_title: input.seo_title ?? "",
            seo_description: input.seo_description ?? "",
          },
        };
      }
    }

    if (proposalCall?.toolName === PROPOSE_NEW_APPOINTMENT_TOOL_NAME && client) {
      const input = proposalCall.input as ProposeNewAppointmentInput;
      if (input.title && input.starts_at_display) {
        proposedUpdate = {
          kind: "new_appointment",
          clientId: client.id,
          fields: {
            title: input.title,
            appointment_type: input.appointment_type,
            starts_at_display: input.starts_at_display,
            location: input.location ?? "",
            notes: input.notes ?? "",
          },
        };
      }
    }

    if (proposalCall?.toolName === PROPOSE_NEW_TASK_TOOL_NAME && client) {
      const input = proposalCall.input as ProposeNewClientTaskInput;
      if (input.title) {
        proposedUpdate = {
          kind: "new_task",
          clientId: client.id,
          fields: {
            title: input.title,
            description: input.description ?? "",
            due_date_display: input.due_date_display ?? "",
          },
        };
      }
    }

    await writeAuditLog({
      action: "ai_system_chat_message",
      adminId: admin.sub,
      entityType: "ai_chat",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: {
        aiModel: settings.model,
        provider: settings.provider,
        clientId: client?.id ?? null,
        submissionId: submission?.id ?? null,
        proposalKind: (proposedUpdate?.kind as string | undefined) ?? null,
        navigatedTo: navigateResult?.path ?? null,
        attachmentUsed: attachment ? { name: attachment.name, mediaType: attachment.mediaType } : null,
      },
    });

    return NextResponse.json({
      reply: result.text || (proposedUpdate ? "Preparei uma proposta. Revise os campos abaixo antes de aplicar." : ""),
      proposedUpdate,
      navigateAction: navigateResult ? { path: navigateResult.path, clientName: navigateResult.clientName } : undefined,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível responder agora.";
    return NextResponse.json({ message }, { status: message.includes("configurad") ? 409 : 502 });
  }
}
