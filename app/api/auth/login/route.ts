import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validators/auth";
import { getAdminByEmail } from "@/lib/repositories/admin-users";
import { createSessionToken, primeSessionVersionCache, setAuthCookie } from "@/lib/auth/session";
import { consumeRateLimit, clearRateLimit } from "@/lib/security/rate-limit";
import { decryptValue, hashRecoveryCode } from "@/lib/security/crypto";
import { verifyMfaCode } from "@/lib/security/mfa";
import { consumeRecoveryCode } from "@/lib/repositories/admin-users";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "E-mail ou senha inválidos.";

export async function POST(req: NextRequest) {
  try {
    const limit = await consumeRateLimit(req, { scope: "admin-login", limit: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, message: "Acesso temporariamente bloqueado. Aguarde e tente novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    }
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    const { email, password, code } = parsed.data;

    const admin = await getAdminByEmail(email);
    if (!admin) {
      // Constant-time fake compare to avoid timing attacks
      await bcrypt.compare(password, "$2b$12$invalidhashpaddingtoconsistenttime");
      await writeAuditLog({ action: "login_failed", ipHash: limit.ipHash, outcome: "failure", metadata: { reason: "invalid_credentials" } });
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      await writeAuditLog({ action: "login_failed", adminId: admin.id, ipHash: limit.ipHash, outcome: "failure", metadata: { reason: "invalid_credentials" } });
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    if (admin.mfa_enabled === 1) {
      if (!code) return NextResponse.json({ success: false, requiresTwoFactor: true, message: "Informe o código do aplicativo autenticador." });
      const secret = admin.mfa_secret_encrypted ? decryptValue(admin.mfa_secret_encrypted) : "";
      const recoveryHashes = admin.recovery_codes_json ? JSON.parse(admin.recovery_codes_json) as string[] : [];
      const recoveryHash = hashRecoveryCode(code);
      const isRecovery = recoveryHashes.includes(recoveryHash);
      const isTotp = secret ? verifyMfaCode(secret, admin.email, code) : false;
      if (!isTotp && !isRecovery) {
        await writeAuditLog({ action: "mfa_failed", adminId: admin.id, ipHash: limit.ipHash, outcome: "failure" });
        return NextResponse.json({ success: false, requiresTwoFactor: true, message: "Código inválido ou expirado." }, { status: 401 });
      }
      if (isRecovery) await consumeRecoveryCode(admin.id, recoveryHashes, recoveryHash);
    }

    primeSessionVersionCache(admin.id, admin.session_version);
    const token = await createSessionToken(admin);
    const response = NextResponse.json({
      success: true,
      mustChangePassword: admin.must_change_password === 1,
    });
    setAuthCookie(response, token);
    await clearRateLimit("admin-login", limit.ipHash);
    await writeAuditLog({ action: "login_success", adminId: admin.id, ipHash: limit.ipHash, metadata: { mfa: admin.mfa_enabled === 1 } });

    return response;
  } catch (error) {
    console.error("[auth/login] error:", error);
    return NextResponse.json(
      { success: false, message: "Erro interno." },
      { status: 500 }
    );
  }
}
