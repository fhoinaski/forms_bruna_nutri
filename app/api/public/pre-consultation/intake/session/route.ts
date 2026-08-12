import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  getIntakeAvailability,
  startIntake,
} from "@/lib/ai/agents/patient/intake/intake-service";
import {
  createIntakeSessionToken,
  setIntakeSessionCookie,
  readIntakeSessionToken,
  verifyIntakeSessionToken,
} from "@/lib/security/intake-session-token";
import { getIntakeSession } from "@/lib/repositories/patient-intake-sessions";
import { selectNextField, computeProgress, computeMissingRequired } from "@/lib/ai/agents/patient/intake/intake-rules";
import { toFieldView } from "@/lib/clinical/pre-consultation-fields";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SESSIONS_PER_IP_PER_HOUR = 20;

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, {
    scope: "intake-session",
    limit: MAX_SESSIONS_PER_IP_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas tentativas. Aguarde antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const availability = await getIntakeAvailability();
  if (!availability.available) {
    return NextResponse.json(
      { message: "A pré-consulta guiada por IA não está disponível no momento." },
      { status: 503 }
    );
  }

  const { sessionId, state } = await startIntake();
  const token = await createIntakeSessionToken(sessionId);

  await writeAuditLog({
    action: "intake_ai_session_started",
    entityType: "patient_intake_session",
    entityId: sessionId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: {},
  });

  const response = NextResponse.json({
    sessionId,
    state: {
      status: state.status,
      progress: state.progress,
    },
    sessionVersion: 1,
    nextField: selectNextField(state) ? toFieldView(selectNextField(state)!, state.answers) : null,
  });

  setIntakeSessionCookie(response, token);
  return response;
}

export async function GET(req: NextRequest) {
  const token = readIntakeSessionToken(req);
  if (!token) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }
  const sessionId = await verifyIntakeSessionToken(token);
  if (!sessionId) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  const found = await getIntakeSession(sessionId);
  if (!found) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  const { state, row } = found;
  const nextField = selectNextField(state) ?? null;

  return NextResponse.json({
    sessionId: state.id,
    status: state.status,
    progress: computeProgress(state),
    sessionVersion: row.version,
    missingRequiredFields: computeMissingRequired(state),
    nextField: nextField ? toFieldView(nextField, state.answers) : null,
    answers: state.answers,
    completed: state.status === "completed",
    completedSubmissionId: row.completed_submission_id ?? null,
  });
}