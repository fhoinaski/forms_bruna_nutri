import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { listExchangeListsForLibrary } from "@/lib/repositories/curated-exchange-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const items = await listExchangeListsForLibrary(admin.sub);
  return NextResponse.json({ items });
}
