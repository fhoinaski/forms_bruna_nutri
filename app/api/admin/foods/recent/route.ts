import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { recordFoodUsage, listRecentFoodUsage } from "@/lib/repositories/admin-food-usage";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["TACO", "CUSTOM", "MANUFACTURER", "USDA"] as const;

/** R4 (seções 6-7) — alimentos recentemente usados pelo profissional autenticado, mais recente primeiro. */
export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const rows = await listRecentFoodUsage(admin.sub, 20);
  const items = await Promise.all(rows.map(async (row) => {
    const details = await getFoodByReference({ source: row.food_source, sourceId: row.food_ref_id });
    return {
      ref: { source: row.food_source, sourceId: row.food_ref_id },
      name: details?.name ?? null,
      sourceLabel: details?.sourceLabel ?? null,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count,
    };
  }));
  return NextResponse.json({ items: items.filter((item) => item.name !== null) });
}

const RecordSchema = z.object({ source: z.enum(SOURCES), refId: z.string().min(1).max(120) }).strict();

/** Registrado quando um alimento é EFETIVAMENTE selecionado (nunca a cada tecla digitada). */
export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = RecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Requisição inválida." }, { status: 400 });

  await recordFoodUsage({ adminId: admin.sub, foodSource: parsed.data.source, foodRefId: parsed.data.refId });
  return NextResponse.json({ ok: true });
}
