import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readIntakeSessionToken, verifyIntakeSessionToken } from "@/lib/security/intake-session-token";
import {
  completeIntake,
  IntakeNotFoundError,
  IntakeExpiredError,
  IntakeConcurrencyError,
  IntakeTurnLimitError,
} from "@/lib/ai/agents/patient/intake/intake-service";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import { getIntakeSession } from "@/lib/repositories/patient-intake-sessions";
import { computeMissingRequired } from "@/lib/ai/agents/patient/intake/intake-rules";
import { logger } from "@/lib/observability/logger";
import { recordServerSideConversion } from "@/lib/analytics/server-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CompleteSchema = z.object({
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
  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // Falta de campo obrigatório ⇒ sem revisão, não pode finalizar.
  const found = await getIntakeSession(sessionId);
  if (found && found.row.status !== "completed") {
    const missing = computeMissingRequired(found.state);
    if (missing.length > 0) {
      return NextResponse.json(
        { message: "Ainda há informações obrigatórias para revisar.", missingRequiredFields: missing },
        { status: 409 }
      );
    }
  }

  try {
    const { submissionId } = await completeIntake(sessionId, parsed.data.sessionVersion);

    await writeAuditLog({
      action: "intake_ai_completed",
      entityType: "patient_intake_session",
      entityId: sessionId,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { submissionId },
    });

    await recordServerSideConversion(req, "PRECONSULTATION_COMPLETED", "/formulario", {
      submission_source: "ai_guided",
    });

    return NextResponse.json({ success: true, submissionId });
  } catch (error) {
    if (error instanceof IntakeNotFoundError) {
      return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
    }
    if (error instanceof IntakeExpiredError) {
      return NextResponse.json({ message: "Sessão expirada." }, { status: 410 });
    }
    if (error instanceof IntakeTurnLimitError) {
      return NextResponse.json({ message: "Limite de interações atingido." }, { status: 429 });
    }
    if (error instanceof IntakeConcurrencyError) {
      return NextResponse.json({ message: "Sessão alterada em paralelo. Tente novamente." }, { status: 409 });
    }
    logger.error("intake_complete_failed", { error });
    return NextResponse.json({ message: "Não foi possível enviar sua pré-consulta." }, { status: 500 });
  }
}