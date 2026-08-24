import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPatientAnthropometryProgress } from "@/lib/repositories/patient-anthropometry-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const progress = await getPatientAnthropometryProgress(id);
  if (!progress) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  return NextResponse.json(progress, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
