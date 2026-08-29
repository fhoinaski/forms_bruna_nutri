import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClientPortalToken, getClientPortalSessionFromRequest, setClientPortalCookie } from "@/lib/auth/client-portal-session";
import { hashPatientPortalPassword, verifyPatientPortalPassword } from "@/lib/auth/patient-portal-credentials";
import { createPatientPortalSession, getPatientPortalAccess, revokePatientPortalSessions, setPatientPortalPassword } from "@/lib/repositories/patient-portal-auth";
import { writeAuditLog } from "@/lib/security/audit";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const Schema = z.object({ currentPassword: z.string().max(200).optional(), password: z.string().max(200), confirmPassword: z.string().max(200) });
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, { scope: "client-portal-password-change", limit: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ message: "Tente novamente mais tarde." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const session = await getClientPortalSessionFromRequest(req, true);
  if (!session) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) return NextResponse.json({ message: "Confira os dados informados." }, { status: 400 });
  let passwordHash: string;
  try { passwordHash = await hashPatientPortalPassword(parsed.data.password); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Senha inválida." }, { status: 400 }); }
  const access = await getPatientPortalAccess(session.sub);
  if (!access) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  if (!session.mustChangePassword) {
    if (!parsed.data.currentPassword || !access.password_hash || !await verifyPatientPortalPassword(parsed.data.currentPassword, access.password_hash)) {
      return NextResponse.json({ message: "Senha atual incorreta." }, { status: 400 });
    }
  }
  await setPatientPortalPassword({ accessId: access.id, passwordHash });
  // Revoke the temporary session and issue a fresh, server-side tracked session.
  await revokePatientPortalSessions(access.id);
  const freshSession = await createPatientPortalSession({ clientId: session.sub, accessId: access.id, expiresInMs: 7 * 24 * 60 * 60 * 1000 });
  const token = await createClientPortalToken(session.sub, access.session_version, freshSession.sessionId);
  await writeAuditLog({ action: "PATIENT_PASSWORD_CHANGED", entityType: "client", entityId: session.sub });
  const response = NextResponse.json({ success: true });
  setClientPortalCookie(response, token);
  return response;
}
