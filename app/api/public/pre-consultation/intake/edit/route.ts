import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readIntakeSessionToken, verifyIntakeSessionToken } from "@/lib/security/intake-session-token";
import {
  editIntakeField,
  IntakeNotFoundError,
  IntakeConcurrencyError,
} from "@/lib/ai/agents/patient/intake/intake-service";
import { getNextInteraction, getTopicStepProgress } from "@/lib/ai/agents/patient/intake/intake-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const EditSchema = z.object({
  topic: z.enum(INTAKE_TOPIC_IDS),
  stepKey: z.string().min(1).max(80),
  sessionVersion: z.number().int().positive(),
}).strict();

export async function POST(req: NextRequest) {
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
  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const next = await editIntakeField(sessionId, parsed.data.sessionVersion, parsed.data.topic, parsed.data.stepKey);
    const interaction = getNextInteraction(next);
    return NextResponse.json({
      status: next.status,
      progress: next.progress,
      interaction: interaction.interaction,
      transitionMessage: interaction.transitionMessage ?? null,
      steps: getTopicStepProgress(next),
      sessionVersion: parsed.data.sessionVersion + 1,
    });
  } catch (error) {
    if (error instanceof IntakeNotFoundError) {
      return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
    }
    if (error instanceof IntakeConcurrencyError) {
      return NextResponse.json({ message: "Sessão alterada em paralelo. Recarregue e tente novamente." }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível editar o campo." }, { status: 500 });
  }
}