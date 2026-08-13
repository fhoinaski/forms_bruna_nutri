import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readIntakeSessionToken, verifyIntakeSessionToken } from "@/lib/security/intake-session-token";
import {
  runIntakeMessage,
  IntakeNotFoundError,
  IntakeExpiredError,
  IntakeConcurrencyError,
  IntakeTurnLimitError,
} from "@/lib/ai/agents/patient/intake/intake-service";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS_PER_IP_PER_HOUR = 120;
const MAX_MESSAGE_LENGTH = 4000;

const INTAKE_TOPIC_IDS = [
  "welcome",
  "current_moment",
  "service_type",
  "identity",
  "health",
  "gestational",
  "postpartum",
  "pediatric",
  "bariatric",
  "routine",
  "nutrition",
  "expectations",
  "review",
] as const;

const MessageSchema = z.object({
  message: z.string().min(1, "Mensagem obrigatória").max(MAX_MESSAGE_LENGTH, "Mensagem muito longa."),
  sessionVersion: z.number().int().positive(),
  topic: z.enum(INTAKE_TOPIC_IDS),
  stepKey: z.string().min(1).max(80),
}).strict();

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, {
    scope: "intake-message",
    limit: MAX_TURNS_PER_IP_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas tentativas. Aguarde antes de continuar." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const token = readIntakeSessionToken(req);
  const sessionId = token ? await verifyIntakeSessionToken(token) : null;
  if (!sessionId) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  }
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const result = await runIntakeMessage({
      sessionId,
      message: parsed.data.message,
      sessionVersion: parsed.data.sessionVersion,
      topic: parsed.data.topic,
      stepKey: parsed.data.stepKey,
    });

    await writeAuditLog({
      action: result.fallback ? "intake_ai_fallback" : "intake_ai_turn",
      entityType: "patient_intake_session",
      entityId: sessionId,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: {
        interactionCount: result.state.interactionCount,
        progress: result.state.progress,
        fallbackCategory: result.fallbackCategory ?? null,
      },
    });

    return NextResponse.json({
      message: result.assistantMessage,
      status: result.state.status,
      progress: result.state.progress,
      completed: result.completed,
      fallback: result.fallback === true,
      interaction: result.interaction,
      transitionMessage: result.transitionMessage,
      steps: result.steps,
      clarification: result.clarification,
      answers: result.state.answers,
      reviewReady: result.reviewReady,
      sessionVersion: result.sessionVersion,
    });
  } catch (error) {
    if (error instanceof IntakeNotFoundError) {
      return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
    }
    if (error instanceof IntakeExpiredError) {
      return NextResponse.json({ message: "Sessão expirada. Inicie novamente." }, { status: 410 });
    }
    if (error instanceof IntakeTurnLimitError) {
      return NextResponse.json({ message: "Limite de interações atingido." }, { status: 429 });
    }
    if (error instanceof IntakeConcurrencyError) {
      return NextResponse.json({ message: "Sessão alterada em paralelo. Recarregue e tente novamente." }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível processar sua mensagem." }, { status: 500 });
  }
}