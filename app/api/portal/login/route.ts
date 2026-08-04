import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClientPortalToken, setClientPortalCookie } from "@/lib/auth/client-portal-session";
import { verifyClientPortalLogin } from "@/lib/repositories/client-portal";
import { consumeRateLimit, clearRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().min(6).max(30),
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
    return NextResponse.json({ message: "Informe e-mail e codigo de acesso." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Informe e-mail e codigo de acesso." }, { status: 400 });

  const login = await verifyClientPortalLogin(parsed.data.email, parsed.data.code);
  if (!login) {
    await writeAuditLog({
      action: "client_portal_login_failed",
      ipHash: limit.ipHash,
      outcome: "failure",
      entityType: "client_portal",
    });
    return NextResponse.json({ message: "Acesso nao encontrado. Confira o e-mail e o codigo enviado pela nutricionista." }, { status: 401 });
  }

  const token = await createClientPortalToken(login.client.id, login.sessionVersion);
  const response = NextResponse.json({ success: true });
  setClientPortalCookie(response, token);
  await clearRateLimit("client-portal-login", limit.ipHash);
  await writeAuditLog({
    action: "client_portal_login_success",
    ipHash: limit.ipHash,
    entityType: "client",
    entityId: login.client.id,
  });
  return response;
}
