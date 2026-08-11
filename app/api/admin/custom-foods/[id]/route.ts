import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteCustomFood, getCustomFoodById, updateCustomFood } from "@/lib/repositories/custom-foods";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const customFoodSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(120).nullable().optional(),
  source: z.enum(["CUSTOM", "MANUFACTURER"]),
  portion_base_grams: z.number().positive().max(5000).optional(),
  energy_kcal: z.number().nonnegative().max(10000),
  protein_g: z.number().nonnegative().max(1000),
  carbohydrate_g: z.number().nonnegative().max(1000),
  fat_g: z.number().nonnegative().max(1000),
  fiber_g: z.number().nonnegative().max(1000).nullable().optional(),
  sodium_mg: z.number().nonnegative().max(100000).nullable().optional(),
  calcium_mg: z.number().nonnegative().max(100000).nullable().optional(),
  iron_mg: z.number().nonnegative().max(1000).nullable().optional(),
  potassium_mg: z.number().nonnegative().max(100000).nullable().optional(),
  vitamin_c_mg: z.number().nonnegative().max(100000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const food = await getCustomFoodById(id);
  if (!food) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });
  return NextResponse.json(food);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getCustomFoodById(id);
  if (!current) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  const parsed = customFoodSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const updated = await updateCustomFood(id, parsed.data);
  await writeAuditLog({
    action: "custom_food_updated",
    adminId: admin.sub,
    entityType: "custom_food",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getCustomFoodById(id);
  if (!current) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  await deleteCustomFood(id);
  await writeAuditLog({
    action: "custom_food_deleted",
    adminId: admin.sub,
    entityType: "custom_food",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { name: current.name },
  });

  return NextResponse.json({ success: true });
}
