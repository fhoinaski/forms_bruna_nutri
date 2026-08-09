import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createRecipe, getRecipes, RECIPE_MEAL_GROUPS } from "@/lib/repositories/recipes";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingredientSchema = z.object({
  taco_number: z.number().int().positive(),
  food_name: z.string().min(1).max(300),
  grams: z.number().positive(),
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
  is_active: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const mealGroup = req.nextUrl.searchParams.get("meal_group") ?? undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";

  const recipes = await getRecipes({
    includeInactive,
    mealGroup: RECIPE_MEAL_GROUPS.find((item) => item === mealGroup),
    tag,
    q,
  });
  return NextResponse.json({ items: recipes });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = recipeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const id = await createRecipe({ ...parsed.data, created_by: admin.sub });
  await writeAuditLog({
    action: "recipe_created",
    adminId: admin.sub,
    entityType: "recipe",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: parsed.data.title, mealGroup: parsed.data.meal_group },
  });

  return NextResponse.json({ id }, { status: 201 });
}
