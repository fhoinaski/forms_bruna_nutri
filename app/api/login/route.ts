import { NextRequest, NextResponse } from "next/server";

// Legado: redireciona para a nova rota de login
export async function POST(req: NextRequest) {
  const body = await req.text();
  return fetch(new URL("/api/auth/login", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
