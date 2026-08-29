import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getPatientPortalAccess, listPatientPortalSessions, revokePatientPortalSessionByRecordId, revokePatientPortalSessions } from "@/lib/repositories/patient-portal-auth";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

const Schema = z.object({ action: z.enum(["one", "all"]), sessionId: z.string().uuid().optional() }).superRefine((value, ctx) => { if (value.action === "one" && !value.sessionId) ctx.addIssue({ code: "custom", message: "sessionId obrigatório" }); });
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  if (!await getClientById(id)) return NextResponse.json({ message: "Paciente não encontrado." }, { status: 404 });
  return NextResponse.json({ sessions: await listPatientPortalSessions(id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await params; const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  const access = await getPatientPortalAccess(id); if (!access) return NextResponse.json({ success: true });
  const revoked = parsed.data.action === "all" ? (await revokePatientPortalSessions(access.id), true) : await revokePatientPortalSessionByRecordId(id, parsed.data.sessionId!);
  if (!revoked) return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  await writeAuditLog({ action: parsed.data.action === "all" ? "PATIENT_PORTAL_ALL_SESSIONS_REVOKED" : "PATIENT_PORTAL_SESSION_REVOKED", adminId: admin.sub, entityType: "client", entityId: id, ipHash: getRequestFingerprint(req).ipHash });
  return NextResponse.json({ success: true });
}
