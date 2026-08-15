import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getMealPlanById } from "@/lib/repositories/meal-plans";
import { listMealPlanVersions } from "@/lib/repositories/meal-plan-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista o historico de versoes de um plano (metadados, SEM snapshot) — paginado por version. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const plan = await getMealPlanById(planId);
  if (!plan || plan.client_id !== id) return NextResponse.json({ message: "Plano nao encontrado." }, { status: 404 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? Number(beforeRaw) : undefined;

  const items = await listMealPlanVersions(planId, limit, before !== undefined && Number.isFinite(before) ? before : undefined);
  const nextCursor = items.length === limit && items.length > 0 ? items[items.length - 1].version : null;
  return NextResponse.json({ items, nextCursor });
}