import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientTasks } from "@/lib/repositories/client-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const clientProtocolId = url.searchParams.get("clientProtocolId") ?? undefined;

  const tasks = await getClientTasks(id, { status, clientProtocolId });
  return NextResponse.json(tasks);
}
