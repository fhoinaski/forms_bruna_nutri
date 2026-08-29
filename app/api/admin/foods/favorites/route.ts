import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { addFoodFavorite, removeFoodFavorite, listFoodFavorites } from "@/lib/repositories/admin-food-favorites";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["TACO", "CUSTOM", "MANUFACTURER", "USDA"] as const;
const ReferenceSchema = z.object({ source: z.enum(SOURCES), refId: z.string().min(1).max(120) }).strict();

/** R4 (seções 8-9) — alimentos favoritados pelo profissional autenticado. */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const rows = await listFoodFavorites(admin.sub);
  const items = await Promise.all(rows.map(async (row) => {
    const details = await getFoodByReference({ source: row.food_source, sourceId: row.food_ref_id });
    return {
      ref: { source: row.food_source, sourceId: row.food_ref_id },
      name: details?.name ?? null,
      sourceLabel: details?.sourceLabel ?? null,
      createdAt: row.created_at,
    };
  }));
  return NextResponse.json({ items: items.filter((item) => item.name !== null) });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = ReferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Requisição inválida." }, { status: 400 });

  await addFoodFavorite({ adminId: admin.sub, foodSource: parsed.data.source, foodRefId: parsed.data.refId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const source = request.nextUrl.searchParams.get("source");
  const refId = request.nextUrl.searchParams.get("refId");
  const parsed = ReferenceSchema.safeParse({ source, refId });
  if (!parsed.success) return NextResponse.json({ message: "Requisição inválida." }, { status: 400 });

  await removeFoodFavorite({ adminId: admin.sub, foodSource: parsed.data.source, foodRefId: parsed.data.refId });
  return NextResponse.json({ ok: true });
}
