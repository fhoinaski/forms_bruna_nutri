import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getMealPlanVersionById } from "@/lib/repositories/meal-plans";
import { validateMealPlanForPublication } from "@/lib/repositories/meal-plan-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const plan = await getMealPlanVersionById(planId);
  if (!plan || plan.client_id !== id) return NextResponse.json({ message: "Plano não encontrado." }, { status: 404 });

  const review = await validateMealPlanForPublication(plan);
  return NextResponse.json(review);
}
