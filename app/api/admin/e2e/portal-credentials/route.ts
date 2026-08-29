import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { hashPatientPortalPassword } from "@/lib/auth/patient-portal-credentials";
import {
  getOrCreatePatientPortalAccess,
  revokePatientPortalSessions,
  revokePatientPortalTokens,
  setPatientPortalPassword,
} from "@/lib/repositories/patient-portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  clientId: z.string().min(1),
  password: z.string().min(12).max(200),
  temporary: z.boolean().optional(),
}).strict();

/**
 * Test fixture only: provisions the same persisted R8.3 credential state the
 * real flows use. It never creates a session or a cookie; callers must log in
 * through /api/portal/login (or the real UI) afterwards.
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  if (!await getAdminFromRequest(req)) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  if (!await getClientById(parsed.data.clientId)) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const access = await getOrCreatePatientPortalAccess(parsed.data.clientId);
  await Promise.all([revokePatientPortalTokens(access.id), revokePatientPortalSessions(access.id)]);
  await setPatientPortalPassword({
    accessId: access.id,
    passwordHash: await hashPatientPortalPassword(parsed.data.password),
    mustChangePassword: parsed.data.temporary,
    passwordExpiresAt: parsed.data.temporary ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() : null,
  });
  return NextResponse.json({ success: true, status: parsed.data.temporary ? "TEMP_PASSWORD" : "ACTIVE" });
}
