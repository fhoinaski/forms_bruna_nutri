import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissions, getDashboardMetrics } from "@/lib/repositories/submissions";
import { DashboardFiltersSchema } from "@/lib/validators/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = DashboardFiltersSchema.safeParse({
    page: searchParams.get("page") ?? 1,
    pageSize: searchParams.get("pageSize") ?? 20,
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros inválidos." }, { status: 400 });
  }

  const filters = parsed.data;

  const [result, metrics] = await Promise.all([
    getSubmissions(filters),
    getDashboardMetrics(),
  ]);

  return NextResponse.json({ ...result, metrics });
}
