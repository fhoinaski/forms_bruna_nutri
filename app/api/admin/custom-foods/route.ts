import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createCustomFood, listCustomFoods } from "@/lib/repositories/custom-foods";
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

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const items = await listCustomFoods(q);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = customFoodSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const food = await createCustomFood(parsed.data);
  await writeAuditLog({
    action: "custom_food_created",
    adminId: admin.sub,
    entityType: "custom_food",
    entityId: food.id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { name: food.name, source: food.source },
  });

  return NextResponse.json(food, { status: 201 });
}
