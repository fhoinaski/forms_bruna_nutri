import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deactivateFoodPortion, getFoodPortionById, listFoodPortions, updateFoodPortion } from "@/lib/repositories/food-portions";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  description: z.string().trim().min(1).max(120).optional(),
  gram_equivalent: z.number().positive().max(5000).optional(),
  source: z.string().trim().max(200).optional(),
  source_version: z.string().trim().max(80).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "Informe ao menos um campo para atualizar." });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getFoodPortionById(id);
  if (!existing) return NextResponse.json({ message: "Medida não encontrada." }, { status: 404 });

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  if (parsed.data.description) {
    const normalizedNewLabel = parsed.data.description.trim().toLowerCase();
    const existingForFood = await listFoodPortions(existing.food_source, existing.food_ref_id);
    if (existingForFood.some((portion) => portion.id !== id && portion.description.trim().toLowerCase() === normalizedNewLabel)) {
      return NextResponse.json({ message: "Já existe uma medida com essa descrição para este alimento." }, { status: 409 });
    }
  }

  const portion = await updateFoodPortion(id, parsed.data);
  await writeAuditLog({
    action: "food_portion_updated",
    adminId: admin.sub,
    entityType: "food_portion",
    entityId: id,
    metadata: { food_source: existing.food_source, food_ref_id: existing.food_ref_id, description: portion?.description ?? existing.description },
  });
  return NextResponse.json(portion);
}

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
