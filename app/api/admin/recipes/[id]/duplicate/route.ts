import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createRecipe, getRecipeById } from "@/lib/repositories/recipes";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R6 (seção 45) — duplica uma receita da biblioteca com identidade nova
 * (novo id, novo created_at) e título marcado como cópia — nunca reaproveita
 * o id original (evita que editar a cópia afete silenciosamente a receita
 * fonte ou qualquer plano publicado que já a referencie).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const source = await getRecipeById(id);
  if (!source) return NextResponse.json({ message: "Receita não encontrada." }, { status: 404 });

  const newId = await createRecipe({
    title: `${source.title} (cópia)`,
    description: source.description,
    meal_group: source.meal_group,
    servings: source.servings,
    portion_grams: source.portion_grams,
    yield_mode: source.yield_mode,
    yield_grams: source.yield_grams,
    preparation_steps: source.preparation_steps,
    ingredients: source.ingredients,
    tags: source.tags,
    source_note: source.source_note,
    is_active: true,
    created_by: admin.sub,
  });

  await writeAuditLog({
    action: "recipe_created",
    adminId: admin.sub,
    entityType: "recipe",
    entityId: newId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: source.title, duplicatedFrom: id },
  });

  return NextResponse.json({ id: newId }, { status: 201 });
}
