import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { draftMealSchema, draftTargetSchema } from "@/lib/validators/draft-schemas";
import { calculateDraftNutrition } from "@/lib/nutrition/draft-nutrition";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RecalculateSchema = z.object({
  currentMeals: z.array(draftMealSchema).min(0).max(10),
}).merge(draftTargetSchema).strict();

/**
 * Recalcula nutrição+critic de um draft sem chamar IA — usado quando a
 * própria UI muda a estrutura localmente (ex.: escolher manualmente um
 * candidato AMBIGUOUS, ou remover um item "precisa de revisão"), sem
 * precisar de uma nova geração/refino por LLM pra ver o total atualizado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const parsed = RecalculateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const target = { energyKcal: parsed.data.targetEnergyKcal, proteinG: parsed.data.targetProteinG, carbohydrateG: parsed.data.targetCarbohydrateG, fatG: parsed.data.targetFatG };
  const [nutrition, critic] = await Promise.all([
    calculateDraftNutrition(parsed.data.currentMeals, target),
    Promise.resolve(critiqueDraft(parsed.data.currentMeals)),
  ]);
  return NextResponse.json({ nutrition, critic });
}
