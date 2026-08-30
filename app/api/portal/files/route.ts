import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { listPatientPortalFiles } from "@/lib/repositories/patient-deliverables";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const items = await listPatientPortalFiles(session.sub);
  return NextResponse.json({ items: items.map(({ object_key: _objectKey, ...file }) => file) });
}
