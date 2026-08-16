import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getDashboardActionItems } from "@/lib/dashboard/action-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const generatedAt = new Date();
  const items = await getDashboardActionItems(generatedAt);
  return NextResponse.json({
    generatedAt: generatedAt.toISOString(),
    items,
  });
}
