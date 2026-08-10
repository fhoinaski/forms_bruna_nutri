import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { createConfiguredModel } from "@/lib/ai/model-factory";
import { buildSystemUsageKnowledgeBase } from "@/lib/ai/system-chat-knowledge";
import { DEFAULT_CHAT_SYSTEM_PROMPT, getAISettings } from "@/lib/repositories/ai-settings";
import { getAdminFromRequest } from "@/lib/auth/session";
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

  try {
    const model = createConfiguredModel(settings);
    const systemPrompt = [
      settings.chat_system_prompt?.trim() || DEFAULT_CHAT_SYSTEM_PROMPT,
      buildSystemUsageKnowledgeBase(),
    ].join("\n\n");

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: parsed.data.messages,
    });

    await writeAuditLog({
      action: "ai_system_chat_message",
      adminId: admin.sub,
      entityType: "ai_chat",
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { aiModel: settings.model, provider: settings.provider },
    });

    return NextResponse.json({ reply: result.text });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível responder agora.";
    return NextResponse.json({ message }, { status: message.includes("configurad") ? 409 : 502 });
  }
}
