import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { getClientById } from "@/lib/repositories/clients";
import {
  getPatientPortalAccess,
  getOrCreatePatientPortalAccess,
  issuePatientPortalToken,
  revokePatientPortalAccess,
  setPatientPortalPassword,
} from "@/lib/repositories/patient-portal-auth";
import { sendEmail } from "@/lib/email/client";
import { patientPortalInviteEmail } from "@/lib/email/templates";
import { generateTemporaryPatientPortalPassword, hashPatientPortalPassword } from "@/lib/auth/patient-portal-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  active: z.boolean(),
}).strict();
const PostSchema = z.object({ action: z.enum(["invite", "temporary_password"]).optional() }).strict();

function portalLoginUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";
  return `${baseUrl.replace(/\/$/, "")}/portal`;
}

function portalInviteUrl(token: string) {
  return `${portalLoginUrl()}/aceitar-convite?token=${encodeURIComponent(token)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const access = await getPatientPortalAccess(id);
  return NextResponse.json({
    exists: Boolean(access),
    is_active: access?.is_active === 1,
    status: access?.access_status ?? "NO_ACCESS",
    last_used_at: access?.last_used_at ?? null,
    last_login_at: access?.last_login_at ?? null,
    updated_at: access?.updated_at ?? null,
    login_url: portalLoginUrl(),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });
  if (!client.email) {
    return NextResponse.json({ message: "Cadastre um e-mail no cliente antes de liberar o portal." }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  if (parsed.data.action === "temporary_password") {
    const temporaryPassword = generateTemporaryPatientPortalPassword();
    const access = await getOrCreatePatientPortalAccess(id);
    await setPatientPortalPassword({ accessId: access.id, passwordHash: await hashPatientPortalPassword(temporaryPassword), mustChangePassword: true, passwordExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() });
    await writeAuditLog({ action: "PATIENT_TEMP_PASSWORD_CREATED", adminId: admin.sub, entityType: "client", entityId: id, ipHash: getRequestFingerprint(req).ipHash });
    return NextResponse.json({ temporary_password: temporaryPassword, expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() });
  }
  const result = await issuePatientPortalToken({ clientId: id, purpose: "invite", expiresInMs: 48 * 60 * 60 * 1000 });
  let emailSent = false;
  let emailError: string | null = null;

  try {
    await sendEmail({
      to: client.email,
      subject: "Acesso ao portal - Bruna Flores Nutri",
      text: `Crie sua senha para acessar o portal da Bruna Flores Nutri: ${portalInviteUrl(result.token)}`,
      html: patientPortalInviteEmail({
        clientName: client.name,
        acceptUrl: portalInviteUrl(result.token),
      }),
    });
    emailSent = true;
    await writeAuditLog({
      action: "email_sent",
      adminId: admin.sub,
      entityType: "client_portal_access",
      entityId: result.record.access_id,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { channel: "email", reason: "portal_access" },
    });
  } catch (error) {
    emailError = error instanceof Error ? error.message : "Falha ao enviar e-mail.";
  }

  await writeAuditLog({
    action: "PATIENT_INVITE_SENT",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ success: true, login_url: portalLoginUrl(), email_sent: emailSent, email_error: emailError });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  if (parsed.data.active) return NextResponse.json({ message: "Envie um novo convite para reativar o acesso." }, { status: 400 });
  await revokePatientPortalAccess(id);
  await writeAuditLog({
    action: "PATIENT_ACCESS_REVOKED",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ success: true });
}
