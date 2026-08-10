import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs, type ToolSet } from "ai";
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
import { DEFAULT_CHAT_SYSTEM_PROMPT, getAISettings } from "@/lib/repositories/ai-settings";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { getPreAnalysisBySubmissionId } from "@/lib/repositories/pre-analyses";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  context: z.object({
    clientId: z.string().min(1).max(120).optional(),
    submissionId: z.string().min(1).max(120).optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-system-chat",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000,
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

    const tools: ToolSet = {};

    if (client) {
      const record = await getNutritionRecord(client.id);
      systemPromptParts.push(PRONTUARIO_ASSISTANT_INSTRUCTIONS, buildNutritionRecordContext(client.name, record));
      tools[PROPOSE_NUTRITION_RECORD_TOOL_NAME] = {
        description: "Registra uma proposta de preenchimento/atualizacao de campos do prontuario nutricional do cliente atual, para revisao humana antes de salvar.",
        inputSchema: proposeNutritionRecordInputSchema,
        execute: async (input: Record<string, string | undefined>) => input,
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

    const hasTools = Object.keys(tools).length > 0;

    const result = await generateText({
      model,
      system: systemPromptParts.join("\n\n"),
      messages: parsed.data.messages,
      stopWhen: stepCountIs(3),
      maxOutputTokens: hasTools ? 4000 : 1200,
      tools: hasTools ? tools : undefined,
    });

    const proposalCall = result.toolCalls?.find((call) =>
      call.toolName === PROPOSE_NUTRITION_RECORD_TOOL_NAME
      || call.toolName === PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME
      || call.toolName === PROPOSE_PRE_ANALYSIS_TOOL_NAME
    );

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
      },
    });

    return NextResponse.json({
      reply: result.text || (proposedUpdate ? "Preparei uma proposta. Revise os campos abaixo antes de aplicar." : ""),
      proposedUpdate,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível responder agora.";
    return NextResponse.json({ message }, { status: message.includes("configurad") ? 409 : 502 });
  }
}
