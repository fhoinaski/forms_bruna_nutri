import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { listNutritionRecordVersions } from "@/lib/repositories/nutrition-record-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista o histórico de versões do prontuário (metadados, SEM snapshot).
 * Paginado/lazy por `version` (keyset): `before` = versão do último item da
 * página anterior. O snapshot completo só é carregado ao abrir uma versão.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? Number(beforeRaw) : undefined;

  const items = await listNutritionRecordVersions(
    id,
    limit,
    before !== undefined && Number.isFinite(before) ? before : undefined
  );

  const nextCursor = items.length === limit && items.length > 0 ? items[items.length - 1].version : null;
  return NextResponse.json({ items, nextCursor });
}
