import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getTemplateStructure } from "@/lib/repositories/protocol-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FASE 8 (item 3) — modelo estruturado do template (refeições -> slots de
 * grupo/subgrupo/nutritionalRole -> alimentos-sugestão). Rota nova, paralela
 * a GET /api/admin/protocol-templates/[id] (que continua devolvendo o
 * formato antigo pra UI de CRUD existente) — nunca substitui a existente.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const structure = await getTemplateStructure(id);
  if (!structure) return NextResponse.json({ message: "Modelo nao encontrado." }, { status: 404 });

  return NextResponse.json(structure);
}
