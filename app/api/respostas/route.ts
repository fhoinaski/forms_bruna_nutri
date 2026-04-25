import { NextRequest, NextResponse } from "next/server";

// Legado: redireciona para as novas rotas
export async function POST(req: NextRequest) {
  const body = await req.text();
  return fetch(new URL("/api/form-submissions", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function GET(req: NextRequest) {
  return NextResponse.redirect(
    new URL("/api/admin/submissions", req.url),
    { status: 301 }
  );
}
