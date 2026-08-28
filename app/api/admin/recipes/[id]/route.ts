import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { archiveRecipe, getRecipeById, updateRecipe } from "@/lib/repositories/recipes";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { recipeSchema } from "@/lib/validators/recipe-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
