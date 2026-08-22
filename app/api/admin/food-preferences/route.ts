import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { saveProfessionalFoodPreference } from "@/lib/repositories/professional-food-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SavePreferenceSchema = z.object({
  query: z.string().min(1).max(200),
  foodSource: z.enum(["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"]),
  foodRefId: z.string().min(1).max(120),
  foodNameSnapshot: z.string().min(1).max(200),
}).strict();

/**
 * Preferência profissional de resolução (Food Terminology & Catalog
 * Coverage V1, seção 8) — SÓ criada por confirmação explícita da
 * nutricionista (botão "Selecionar e lembrar" no wizard, nunca automático).
 * Isolada por admin_id (sessão atual) — nunca um alias global. Revalidada
 * contra o catálogo real a cada uso (lib/nutrition/food-resolver.ts), nunca
 * um valor congelado.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = SavePreferenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const preference = await saveProfessionalFoodPreference({
    adminId: admin.sub,
    query: parsed.data.query,
    foodSource: parsed.data.foodSource,
    foodRefId: parsed.data.foodRefId,
    foodNameSnapshot: parsed.data.foodNameSnapshot,
  });

  return NextResponse.json(preference, { status: 201 });
}
