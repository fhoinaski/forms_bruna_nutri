import { NextRequest, NextResponse } from "next/server";

// Legado: redireciona para a nova rota de admin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.redirect(
    new URL(`/api/admin/submissions/${id}`, req.url),
    { status: 301 }
  );
}
