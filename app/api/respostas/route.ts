import { NextRequest, NextResponse } from "next/server";
export { POST } from "@/app/api/form-submissions/route";

// Legado: redireciona para as novas rotas
export async function GET(req: NextRequest) {
  return NextResponse.redirect(
    new URL("/api/admin/submissions", req.url),
    { status: 301 }
  );
}
