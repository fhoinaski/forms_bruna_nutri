import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteProfessionalFoodPreference } from "@/lib/repositories/professional-food-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reversível — a nutricionista pode desfazer uma preferência salva a qualquer momento. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  await deleteProfessionalFoodPreference(admin.sub, id);
  return NextResponse.json({ ok: true });
}
