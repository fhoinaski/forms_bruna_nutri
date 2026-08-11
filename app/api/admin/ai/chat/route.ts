import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAISettings } from "@/lib/repositories/ai-settings";
import { resolveAssistantContext } from "@/lib/ai/core/ai-context";
import { runAssistantTurn } from "@/lib/ai/core/ai-orchestrator";
import { toLegacyChatResponse } from "@/lib/ai/core/ai-response";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import {
  ALLOWED_ATTACHMENT_MEDIA_TYPES,
  MAX_ATTACHMENT_BASE64_LENGTH,
  validateChatAttachment,
} from "@/lib/ai/agents/system/chat-attachments";
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
    currentPage: z.string().min(1).max(200).optional(),
    appointmentId: z.string().min(1).max(120).optional(),
    protocolId: z.string().min(1).max(120).optional(),
    recipeId: z.string().min(1).max(120).optional(),
    consultationSessionId: z.string().min(1).max(120).optional(),
  }).optional(),
});

/**
 * Wrapper HTTP fino: autentica, valida input, resolve contexto, delega tudo
 * (system prompt, selecao de tools, tool-calling, memoria) ao orquestrador
 * central (lib/ai/core/ai-orchestrator.ts), e mapeia o envelope de resposta
 * para o mesmo shape JSON que o frontend (AiChatWidget) ja consome — nenhuma
 * mudanca de contrato foi necessaria no cliente.
 */
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

  let attachment: ReturnType<typeof validateChatAttachment> | undefined;
  try {
    attachment = parsed.data.attachment ? validateChatAttachment(parsed.data.attachment) : undefined;
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Anexo invalido." },
      { status: 400 }
    );
  }

  try {
    const context = await resolveAssistantContext(admin, {
      clientId: parsed.data.context?.clientId,
      submissionId: parsed.data.context?.submissionId,
      currentPage: parsed.data.context?.currentPage,
      appointmentId: parsed.data.context?.appointmentId,
      protocolId: parsed.data.context?.protocolId,
      recipeId: parsed.data.context?.recipeId,
      consultationSessionId: parsed.data.context?.consultationSessionId,
    });

    const envelope = await runAssistantTurn(context, {
      messages: parsed.data.messages,
      attachment,
    });

    await writeAuditLog({
      action: "ai_system_chat_message",
      adminId: admin.sub,
      entityType: "ai_chat",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: {
        aiModel: settings.model,
        provider: settings.provider,
        clientId: context.client?.id ?? null,
        submissionId: context.submission?.id ?? null,
        proposalKind: envelope.proposedAction?.kind ?? null,
        navigatedTo: envelope.navigation?.path ?? null,
        attachmentUsed: attachment
          ? { name: attachment.name, mediaType: attachment.mediaType, rawBytes: attachment.rawBytes }
          : null,
      },
    });

    return NextResponse.json(toLegacyChatResponse(envelope));
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: cause.message }, { status: 409 });
    }
    if (cause instanceof AiValidationError) {
      return NextResponse.json({ message: "A IA não retornou uma resposta no formato esperado. Tente novamente." }, { status: 502 });
    }
    if (cause instanceof AiProviderError) {
      return NextResponse.json({ message: cause.message }, { status: 502 });
    }
    const message = cause instanceof Error ? cause.message : "Não foi possível responder agora.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
