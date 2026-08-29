import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClientPortalToken, setClientPortalCookie } from "@/lib/auth/client-portal-session";
import { createPatientPortalSession, getPatientPortalAccessByEmail, recordPatientPortalLogin } from "@/lib/repositories/patient-portal-auth";
import { verifyPatientPortalPassword } from "@/lib/auth/patient-portal-credentials";
import { consumeRateLimit, clearRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, {
    scope: "client-portal-login",
    limit: 10,
    windowMs: 15 * 60 * 1000,
    blockMs: 30 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Acesso temporariamente bloqueado. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Informe e-mail e senha." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Informe e-mail e senha." }, { status: 400 });

  const access = await getPatientPortalAccessByEmail(parsed.data.email);
  const hasExpiredTemporaryPassword = Boolean(
    access?.access_status === "TEMP_PASSWORD" &&
    access.password_expires_at &&
    Date.parse(access.password_expires_at) <= Date.now()
  );
  const isAllowed = Boolean(
    access &&
      !hasExpiredTemporaryPassword &&
      access.is_active === 1 &&
      ["ACTIVE", "TEMP_PASSWORD", "PASSWORD_CHANGE_REQUIRED"].includes(access.access_status) &&
      access.password_hash &&
      await verifyPatientPortalPassword(parsed.data.password, access.password_hash)
  );
  if (!isAllowed || !access) {
    await writeAuditLog({
      action: "client_portal_login_failed",
      ipHash: limit.ipHash,
      outcome: "failure",
      entityType: "client_portal",
    });
    return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const session = await createPatientPortalSession({ clientId: access.client_id, accessId: access.id, expiresInMs: 7 * 24 * 60 * 60 * 1000, ipHash: limit.ipHash });
  await recordPatientPortalLogin(access.id);
  const token = await createClientPortalToken(access.client_id, access.session_version, session.sessionId);
  const response = NextResponse.json({ success: true, mustChangePassword: access.password_must_change === 1 });
  setClientPortalCookie(response, token);
  await clearRateLimit("client-portal-login", limit.ipHash);
  await writeAuditLog({
    action: "client_portal_login_success",
    ipHash: limit.ipHash,
    entityType: "client",
    entityId: access.client_id,
  });
  return response;
}
