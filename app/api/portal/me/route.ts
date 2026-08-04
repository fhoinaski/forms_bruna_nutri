import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { getClientPortalSummary } from "@/lib/repositories/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const summary = await getClientPortalSummary(session.sub);
  if (!summary) {
    return NextResponse.json({ message: "Portal indisponivel." }, { status: 404 });
  }

  return NextResponse.json(summary);
}
