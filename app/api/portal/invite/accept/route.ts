import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPatientPortalPassword } from "@/lib/auth/patient-portal-credentials";
import { consumePatientPortalToken, setPatientPortalPassword } from "@/lib/repositories/patient-portal-auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

const Schema = z.object({ token: z.string().min(20).max(200), password: z.string().max(200), confirmPassword: z.string().max(200) });
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, { scope: "client-portal-invite-accept", limit: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ message: "Tente novamente mais tarde." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) return NextResponse.json({ message: "Confira os dados informados." }, { status: 400 });
  let passwordHash: string;
  try { passwordHash = await hashPatientPortalPassword(parsed.data.password); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Senha inválida." }, { status: 400 }); }
  const invite = await consumePatientPortalToken(parsed.data.token, "invite");
  if (!invite) return NextResponse.json({ message: "Este link expirou ou não é mais válido." }, { status: 400 });
  await setPatientPortalPassword({ accessId: invite.access_id, passwordHash });
  await writeAuditLog({ action: "PATIENT_INVITE_ACCEPTED", entityType: "client", entityId: invite.client_id, ipHash: limit.ipHash });
  return NextResponse.json({ success: true });
}
