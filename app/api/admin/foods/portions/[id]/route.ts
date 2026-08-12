import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deactivateFoodPortion, getFoodPortionById } from "@/lib/repositories/food-portions";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Desativa uma medida caseira — nunca DELETE, para não quebrar itens de plano que já a referenciam via household_measure_id. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getFoodPortionById(id);
  if (!existing) return NextResponse.json({ message: "Medida não encontrada." }, { status: 404 });

  await deactivateFoodPortion(id);
  await writeAuditLog({
    action: "food_portion_deactivated",
    adminId: admin.sub,
    entityType: "food_portion",
    entityId: id,
    metadata: { food_source: existing.food_source, food_ref_id: existing.food_ref_id },
  });
  return NextResponse.json({ ok: true });
}
