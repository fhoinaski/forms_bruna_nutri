import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createFoodPortion, listFoodPortions } from "@/lib/repositories/food-portions";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sourceSchema = z.enum(["TACO", "CUSTOM", "MANUFACTURER"]);

const CreateSchema = z.object({
  food_source: sourceSchema,
  food_ref_id: z.string().min(1).max(120),
  description: z.string().trim().min(1).max(120),
  gram_equivalent: z.number().positive().max(5000),
  source: z.string().trim().max(200).optional(),
  source_version: z.string().trim().max(80).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
}).strict();

/** Lista as medidas caseiras cadastradas para UM alimento especifico (seção 8 do pedido: editor carrega as medidas ao selecionar o alimento). */
export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const source = sourceSchema.safeParse(req.nextUrl.searchParams.get("source"));
  const refId = req.nextUrl.searchParams.get("refId")?.trim();
  if (!source.success || !refId) {
    return NextResponse.json({ message: "Informe source (TACO|CUSTOM|MANUFACTURER) e refId." }, { status: 400 });
  }

  const items = await listFoodPortions(source.data, refId);
  return NextResponse.json({ items });
}

/** Medida personalizada cadastrada pela nutricionista (seção 7 do pedido) — reutilizável para o mesmo alimento em qualquer plano futuro. */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // Valida que o alimento realmente existe antes de aceitar uma medida para ele — nunca cadastra uma medida orfa.
  const foodExists = Boolean(await getFoodByReference({ source: parsed.data.food_source, sourceId: parsed.data.food_ref_id }));
  if (!foodExists) {
    return NextResponse.json({ message: "Alimento não encontrado para o food_source/food_ref_id informado." }, { status: 404 });
  }

  const existingForFood = await listFoodPortions(parsed.data.food_source, parsed.data.food_ref_id);
  const normalizedNewLabel = parsed.data.description.trim().toLowerCase();
  if (existingForFood.some((portion) => portion.description.trim().toLowerCase() === normalizedNewLabel)) {
    return NextResponse.json({ message: "Já existe uma medida com essa descrição para este alimento." }, { status: 409 });
  }

  const portion = await createFoodPortion({ ...parsed.data, confidence: parsed.data.confidence ?? "medium" });
  await writeAuditLog({
    action: "food_portion_created",
    adminId: admin.sub,
    entityType: "food_portion",
    entityId: portion.id,
    metadata: { food_source: portion.food_source, food_ref_id: portion.food_ref_id, description: portion.description },
  });
  return NextResponse.json(portion, { status: 201 });
}
