import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getFoodByReference, getFoodPortions, toLegacyFoodSearchResponseItem } from "@/lib/nutrition/food-catalog";

export const dynamic = "force-dynamic";

const ReferenceSchema = z.object({
  source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]),
  refId: z.string().min(1).max(120),
}).strict();

/** Batch hydration for Composer Live Nutrition; one request for a whole draft. */
export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = z.object({ references: z.array(ReferenceSchema).max(60) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Referências inválidas." }, { status: 400 });
  const unique = Array.from(new Map(parsed.data.references.map((reference) => [`${reference.source}:${reference.refId}`, reference])).values());
  const items = await Promise.all(unique.map(async (reference) => {
    const ref = { source: reference.source, sourceId: reference.refId } as const;
    const [food, portions] = await Promise.all([getFoodByReference(ref), getFoodPortions(ref)]);
    return {
      key: `${reference.source}:${reference.refId}`,
      food: food ? toLegacyFoodSearchResponseItem(food) : null,
      portions: portions.map((portion) => ({ id: portion.id, description: portion.label, gram_equivalent: portion.gramWeight, source: portion.source, confidence: portion.confidence })),
    };
  }));
  return NextResponse.json({ items });
}
