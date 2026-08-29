import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req, true);
  if (!session?.mustChangePassword) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  return NextResponse.json({ required: true });
}
