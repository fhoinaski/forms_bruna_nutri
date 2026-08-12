import { NextRequest, NextResponse } from "next/server";
import { readIntakeSessionToken, verifyIntakeSessionToken } from "@/lib/security/intake-session-token";
import { getIntakeSession } from "@/lib/repositories/patient-intake-sessions";
import { buildReview } from "@/lib/ai/agents/patient/intake/intake-service";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = readIntakeSessionToken(req);
  const sessionId = token ? await verifyIntakeSessionToken(token) : null;
  if (!sessionId) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  const found = await getIntakeSession(sessionId);
  if (!found) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  const { state } = found;
  const review = buildReview(state);

  await writeAuditLog({
    action: "intake_ai_review_started",
    entityType: "patient_intake_session",
    entityId: sessionId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { progress: state.progress },
  });

  return NextResponse.json(review);
}