import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getMealPlanById } from "@/lib/repositories/meal-plans";
import { getMealPlanVersion } from "@/lib/repositories/meal-plan-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Carrega uma versao especifica (snapshot decifrado) — somente leitura. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string; version: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id, planId, version } = await params;
  const plan = await getMealPlanById(planId);
  if (!plan || plan.client_id !== id) return NextResponse.json({ message: "Plano nao encontrado." }, { status: 404 });

  const versionNumber = Number(version);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ message: "Versao invalida." }, { status: 400 });
  }

  const record = await getMealPlanVersion(planId, versionNumber);
  if (!record) return NextResponse.json({ message: "Versao nao encontrada." }, { status: 404 });
  return NextResponse.json(record);
}