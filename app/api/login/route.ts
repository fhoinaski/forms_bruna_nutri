import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    
    // In production, ADMIN_PASSWORD should be set in .env
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    
    if (password === adminPassword) {
      const response = NextResponse.json({ success: true });
      // Set an HttpOnly cookie
      response.cookies.set({
        name: "admin_token",
        value: "authenticated",
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });
      return response;
    } else {
      return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
