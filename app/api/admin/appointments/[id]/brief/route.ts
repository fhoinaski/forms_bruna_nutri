import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAppointmentBriefState, prepareAppointmentAiBrief } from "@/lib/clinical/appointment-briefing";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const state = await getAppointmentBriefState(id);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const result = await prepareAppointmentAiBrief(id, { adminId: admin.sub, force });
  await writeAuditLog({
    action: force ? "appointment_ai_brief_manual_refresh" : "appointment_ai_brief_manual_prepare",
    adminId: admin.sub,
    entityType: "appointment_ai_brief",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { outcome: result.outcome, reason: result.reason ?? null },
  });
  const state = await getAppointmentBriefState(id);
  return NextResponse.json({ result: { outcome: result.outcome, reason: result.reason ?? null }, state });
}
