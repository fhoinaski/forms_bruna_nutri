import { NextRequest, NextResponse } from "next/server";

// Legado: redireciona para a nova rota de logout
export async function POST(req: NextRequest) {
  return fetch(new URL("/api/auth/logout", req.url), { method: "POST" });
}
