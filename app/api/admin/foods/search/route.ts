import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { searchTacoFoods } from "@/lib/nutrition/taco";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  return NextResponse.json({ items: searchTacoFoods(query, 15) });
}
