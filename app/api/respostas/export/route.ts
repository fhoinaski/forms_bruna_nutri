import { NextRequest, NextResponse } from "next/server";

// Legado: redireciona para a nova rota de exportação
export async function GET(req: NextRequest) {
  return NextResponse.redirect(
    new URL("/api/admin/export/csv", req.url),
    { status: 301 }
  );
}
