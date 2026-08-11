import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { getAISettings } from "@/lib/repositories/ai-settings";
import { resolvePatientAssistantContext } from "@/lib/ai/core/patient-context";
import { runPatientAssistantTurn } from "@/lib/ai/core/patient-orchestrator";
import { toPatientChatResponse } from "@/lib/ai/core/patient-response";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint SEPARADO do chat administrativo (/api/admin/ai/chat) de
 * proposito (secao 40 do pedido) — nao existe flag "mode=patient" aqui.
 * Autenticacao e so via sessao do portal (cookie httpOnly
 * bruna_nutri_client_portal); o body NUNCA carrega um clientId — o unico
 * identificador de quem esta perguntando e `session.sub`, resolvido dentro
 * de resolvePatientAssistantContext.
 */
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
  context: z.object({
    currentPage: z.string().min(1).max(100).optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  // Scope de rate limit proprio do portal (secao 27) — um paciente muito
  // ativo nunca consome o limite do chat administrativo, e vice-versa.
  const limit = await consumeRateLimit(req, {
    scope: "portal-ai-chat",
    limit: 40,
    windowMs: 15 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Não consegui entender essa mensagem." }, { status: 400 });
  }

  const settings = await getAISettings();
  if (!settings.api_key) {
    return NextResponse.json({ message: "O assistente não está disponível no momento." }, { status: 409 });
  }

  try {
    const { context } = await resolvePatientAssistantContext(session, { currentPage: parsed.data.context?.currentPage });

    const envelope = await runPatientAssistantTurn(context, { messages: parsed.data.messages });

    await writeAuditLog({
      action: "patient_ai_chat_message",
      adminId: context.clientId,
      entityType: "patient_ai_chat",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: {
        proposalKind: envelope.proposedAction?.kind ?? null,
        navigatedTo: envelope.navigation?.section ?? null,
      },
    });

    return NextResponse.json(toPatientChatResponse(envelope));
  } catch (cause) {
    // Mensagens sempre genericas ao paciente — nunca stack, SQL, ou detalhe
    // de provider (secao 38).
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: "O assistente não está disponível no momento." }, { status: 409 });
    }
    if (cause instanceof AiValidationError || cause instanceof AiProviderError) {
      return NextResponse.json({ message: "Não consegui responder agora. Tente novamente." }, { status: 502 });
    }
    return NextResponse.json({ message: "Não consegui responder agora. Tente novamente." }, { status: 502 });
  }
}
