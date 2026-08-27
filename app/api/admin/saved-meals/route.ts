import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { listSavedMeals, saveMealForReuse } from "@/lib/repositories/admin-saved-meals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_optional: z.boolean().optional(),
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
  food_ref_id: z.string().max(120).nullable().optional(),
  canonical_food_id: z.string().max(160).nullable().optional(),
  household_measure_id: z.string().max(120).nullable().optional(),
});

const optionSchema = z.object({ label: z.string().min(1).max(200), description: z.string().max(1000).nullable().optional(), items: z.array(itemSchema).min(1).max(80) });
const choiceGroupSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  min_selections: z.number().int().min(0).max(80),
  max_selections: z.number().int().min(1).max(80),
  items: z.array(itemSchema).min(1).max(80),
});

const mealSchema = z.object({
  name: z.string().min(1).max(200),
  meal_context: z.string().max(40).nullable().optional(),
  suggested_time: z.string().max(30).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  meal_structure: z.enum(["SIMPLE", "OPTIONS", "COMBINATION"]).nullable().optional(),
  patient_instruction: z.string().max(1000).nullable().optional(),
  items: z.array(itemSchema).max(80),
  options: z.array(optionSchema).max(20).optional(),
  choice_groups: z.array(choiceGroupSchema).max(20).optional(),
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  meal: mealSchema,
}).strict();

/** R4 (seção 10) — refeições salvas/reutilizáveis do profissional autenticado. */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const items = await listSavedMeals(admin.sub);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  const saved = await saveMealForReuse({ adminId: admin.sub, name: parsed.data.name, meal: parsed.data.meal });
  return NextResponse.json(saved, { status: 201 });
}
