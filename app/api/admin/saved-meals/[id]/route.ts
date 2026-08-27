import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteSavedMeal, getSavedMeal, incrementSavedMealUsage } from "@/lib/repositories/admin-saved-meals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R4 (seção 30) — detalhe de UMA refeição salva, pra preview antes de aplicar. Sempre escopado ao dono (admin_id no WHERE) — nunca acessível por id de outro profissional. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const saved = await getSavedMeal(admin.sub, id);
  if (!saved) return NextResponse.json({ message: "Refeição salva não encontrada." }, { status: 404 });
  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  await deleteSavedMeal(admin.sub, id);
  return NextResponse.json({ ok: true });
}

/** Chamado quando a refeição salva é efetivamente aplicada num draft (métrica de uso, seção 28). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const saved = await getSavedMeal(admin.sub, id);
  if (!saved) return NextResponse.json({ message: "Refeição salva não encontrada." }, { status: 404 });
  await incrementSavedMealUsage(admin.sub, id);
  return NextResponse.json({ ok: true });
}
