import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPatientClinicalTimeline, normalizePatientTimelineFilter } from "@/lib/repositories/patient-record-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const result = await getPatientClinicalTimeline(id, {
    limit: numberParam(searchParams.get("limit"), 20),
    offset: numberParam(searchParams.get("offset"), 0),
    filter: normalizePatientTimelineFilter(searchParams.get("filter")),
  });
  if (!result) {
    return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
