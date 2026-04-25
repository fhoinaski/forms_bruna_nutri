import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { changePasswordSchema } from "@/lib/validators/auth";
import { getAdminFromRequest, createSessionToken, setAuthCookie } from "@/lib/auth/session";
import { getAdminById, updateAdminPassword, setMustChangePassword } from "@/lib/repositories/admin-users";
import { d1Execute } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, message: "Não autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const admin = await getAdminById(session.sub);
    if (!admin) {
      return NextResponse.json({ success: false, message: "Usuário não encontrado." }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: "Senha atual incorreta." },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    // Update password and clear must_change_password atomically
    await updateAdminPassword(admin.id, newHash);
    await setMustChangePassword(admin.id, false);

    // Audit log
    await d1Execute(
      `INSERT INTO admin_audit_logs (id, action, metadata_json, created_at)
       VALUES (?1, 'password_changed', ?2, ?3)`,
      [
        crypto.randomUUID(),
        JSON.stringify({ adminId: admin.id, email: admin.email }),
        new Date().toISOString(),
      ]
    );

    // Issue new token with mustChangePassword = false
    const updatedAdmin = { ...admin, must_change_password: 0 };
    const token = await createSessionToken(updatedAdmin);
    const response = NextResponse.json({ success: true });
    setAuthCookie(response, token);

    return response;
  } catch (error) {
    console.error("[auth/change-password] error:", error);
    return NextResponse.json(
      { success: false, message: "Erro interno." },
      { status: 500 }
    );
  }
}
