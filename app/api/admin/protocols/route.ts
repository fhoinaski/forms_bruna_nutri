import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getProtocols } from "@/lib/repositories/protocols";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const search = url.searchParams.get("search") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const activeParam = url.searchParams.get("isActive");
  const isActive = activeParam === null ? undefined : activeParam !== "false";

  const result = await getProtocols({ page, search, category, isActive });
  return NextResponse.json(result);
}
