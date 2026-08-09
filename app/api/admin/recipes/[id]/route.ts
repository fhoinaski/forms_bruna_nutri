import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { archiveRecipe, getRecipeById, RECIPE_MEAL_GROUPS, updateRecipe } from "@/lib/repositories/recipes";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingredientSchema = z.object({
  taco_number: z.number().int().positive().nullable().optional(),
  food_name: z.string().min(1).max(300),
  grams: z.number().positive().nullable().optional(),
  free_text: z.string().max(300).nullable().optional(),
}).strict();

const recipeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  meal_group: z.enum(RECIPE_MEAL_GROUPS),
  servings: z.number().int().positive().max(100),
  portion_grams: z.number().positive().nullable().optional(),
  preparation_steps: z.string().max(5000).nullable().optional(),
  ingredients: z.array(ingredientSchema).min(1).max(80),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  source_note: z.string().max(2000).nullable().optional(),
  nutrition_override: z.object({
    total_kcal: z.number().nonnegative().optional(),
    total_protein_g: z.number().nonnegative().optional(),
    total_carbs_g: z.number().nonnegative().optional(),
    total_fat_g: z.number().nonnegative().optional(),
    per_portion_kcal: z.number().nonnegative().optional(),
    per_portion_protein_g: z.number().nonnegative().optional(),
    per_portion_carbs_g: z.number().nonnegative().optional(),
    per_portion_fat_g: z.number().nonnegative().optional(),
  }).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const recipe = await getRecipeById(id);
  if (!recipe) return NextResponse.json({ message: "Receita nao encontrada." }, { status: 404 });
  return NextResponse.json(recipe);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getRecipeById(id);
  if (!current) return NextResponse.json({ message: "Receita nao encontrada." }, { status: 404 });

  const parsed = recipeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  await updateRecipe(id, parsed.data);
  await writeAuditLog({
    action: "recipe_updated",
    adminId: admin.sub,
    entityType: "recipe",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { changedTitle: parsed.data.title !== current.title, mealGroup: parsed.data.meal_group },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getRecipeById(id);
  if (!current) return NextResponse.json({ message: "Receita nao encontrada." }, { status: 404 });

  await archiveRecipe(id);
  await writeAuditLog({
    action: "recipe_archived",
    adminId: admin.sub,
    entityType: "recipe",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: current.title },
  });

  return NextResponse.json({ success: true });
}
