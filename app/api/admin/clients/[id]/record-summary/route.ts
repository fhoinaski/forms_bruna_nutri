import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPatientRecordSummary } from "@/lib/repositories/patient-record-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const summary = await getPatientRecordSummary(id);
  if (!summary) {
    return NextResponse.json({ message: "Paciente nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
