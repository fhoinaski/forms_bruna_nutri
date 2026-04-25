import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validators/auth";
import { getAdminByEmail } from "@/lib/repositories/admin-users";
import { createSessionToken, setAuthCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "E-mail ou senha inválidos.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    const { email, password } = parsed.data;

    const admin = await getAdminByEmail(email);
    if (!admin) {
      // Constant-time fake compare to avoid timing attacks
      await bcrypt.compare(password, "$2b$12$invalidhashpaddingtoconsistenttime");
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: GENERIC_ERROR },
        { status: 401 }
      );
    }

    const token = await createSessionToken(admin);
    const response = NextResponse.json({
      success: true,
      mustChangePassword: admin.must_change_password === 1,
    });
    setAuthCookie(response, token);

    return response;
  } catch (error) {
    console.error("[auth/login] error:", error);
    return NextResponse.json(
      { success: false, message: "Erro interno." },
      { status: 500 }
    );
  }
}
