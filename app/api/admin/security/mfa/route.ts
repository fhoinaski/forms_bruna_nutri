import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { consumeRecoveryCode, disableAdminMfa, enableAdminMfa, getAdminById, setPendingMfaSecret } from "@/lib/repositories/admin-users";
import { createMfaSecret, createTotp, verifyMfaCode } from "@/lib/security/mfa";
import { decryptValue, encryptValue, generateRecoveryCodes, hashRecoveryCode } from "@/lib/security/crypto";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("verify"), code: z.string().trim().min(6).max(8) }),
]);
const disableSchema = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) });

async function adminFor(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) return null;
  return getAdminById(session.sub);
}

export async function GET(req: NextRequest) {
  const admin = await adminFor(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const remainingCodes = admin.recovery_codes_json ? (JSON.parse(admin.recovery_codes_json) as string[]).length : 0;
  return NextResponse.json({ enabled: admin.mfa_enabled === 1, remainingCodes });
}

export async function POST(req: NextRequest) {
  const admin = await adminFor(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });

  if (parsed.data.action === "setup") {
    if (admin.mfa_enabled === 1) return NextResponse.json({ message: "A autenticação em dois fatores já está ativa." }, { status: 409 });
    const secret = createMfaSecret();
    await setPendingMfaSecret(admin.id, encryptValue(secret));
    const uri = createTotp(secret, admin.email).toString();
    const qrCode = await QRCode.toDataURL(uri, { width: 260, margin: 2, color: { dark: "#3A3028", light: "#FFFDFC" } });
    await writeAuditLog({ action: "mfa_setup_started", adminId: admin.id, ipHash: getRequestFingerprint(req).ipHash });
    return NextResponse.json({ qrCode, manualKey: secret });
  }

  if (!admin.mfa_pending_secret_encrypted) return NextResponse.json({ message: "Inicie a configuração novamente." }, { status: 400 });
  const secret = decryptValue(admin.mfa_pending_secret_encrypted);
  if (!verifyMfaCode(secret, admin.email, parsed.data.code)) return NextResponse.json({ message: "Código inválido ou expirado." }, { status: 400 });
  const recoveryCodes = generateRecoveryCodes();
  await enableAdminMfa(admin.id, encryptValue(secret), recoveryCodes.map(hashRecoveryCode));
  await writeAuditLog({ action: "mfa_enabled", adminId: admin.id, ipHash: getRequestFingerprint(req).ipHash });
  return NextResponse.json({ success: true, recoveryCodes });
}

export async function DELETE(req: NextRequest) {
  const admin = await adminFor(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = disableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await bcrypt.compare(parsed.data.password, admin.password_hash))) return NextResponse.json({ message: "Senha ou código inválido." }, { status: 400 });
  const secret = admin.mfa_secret_encrypted ? decryptValue(admin.mfa_secret_encrypted) : "";
  const recoveryHashes = admin.recovery_codes_json ? JSON.parse(admin.recovery_codes_json) as string[] : [];
  const recoveryHash = hashRecoveryCode(parsed.data.code);
  const isRecovery = recoveryHashes.includes(recoveryHash);
  if ((!secret || !verifyMfaCode(secret, admin.email, parsed.data.code)) && !isRecovery) return NextResponse.json({ message: "Senha ou código inválido." }, { status: 400 });
  if (isRecovery) await consumeRecoveryCode(admin.id, recoveryHashes, recoveryHash);
  await disableAdminMfa(admin.id);
  await writeAuditLog({ action: "mfa_disabled", adminId: admin.id, ipHash: getRequestFingerprint(req).ipHash });
  return NextResponse.json({ success: true });
}
