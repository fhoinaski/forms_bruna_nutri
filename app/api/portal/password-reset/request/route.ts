import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPatientPortalAccessByEmail, issuePatientPortalToken } from "@/lib/repositories/patient-portal-auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/client";
import { patientPortalPasswordResetEmail } from "@/lib/email/templates";
import { writeAuditLog } from "@/lib/security/audit";

const Schema = z.object({ email: z.string().trim().email().max(200) });
const generic = { success: true, message: "Se existir uma conta, enviaremos instruções." };
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, { scope: "client-portal-reset-request", limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json(generic);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(generic);
  const access = await getPatientPortalAccessByEmail(parsed.data.email);
  if (!access || access.is_active !== 1 || !access.password_hash) return NextResponse.json(generic);
  const { token } = await issuePatientPortalToken({ clientId: access.client_id, purpose: "password_reset", expiresInMs: 60 * 60 * 1000 });
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br").replace(/\/$/, "");
  try {
    await sendEmail({ to: access.client_email, subject: "Redefinição de senha - Bruna Flores Nutri", text: `Redefina sua senha: ${base}/portal/redefinir-senha?token=${token}`, html: patientPortalPasswordResetEmail({ clientName: access.client_name, resetUrl: `${base}/portal/redefinir-senha?token=${token}` }) });
    await writeAuditLog({ action: "PATIENT_PASSWORD_RESET_REQUESTED", entityType: "client", entityId: access.client_id, ipHash: limit.ipHash });
  } catch { /* Public response intentionally stays generic; token is never logged. */ }
  return NextResponse.json(generic);
}
