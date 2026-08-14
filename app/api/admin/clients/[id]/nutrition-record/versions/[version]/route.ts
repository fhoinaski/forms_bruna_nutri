import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getNutritionRecordVersion } from "@/lib/repositories/nutrition-record-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lê UMA versão histórica (snapshot decifrado) — somente leitura. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id, version } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = Number(version);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return NextResponse.json({ message: "Versão inválida." }, { status: 400 });
  }

  const item = await getNutritionRecordVersion(id, parsed);
  if (!item) return NextResponse.json({ message: "Versão não encontrada." }, { status: 404 });

  return NextResponse.json(item);
}
