import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { updateLeadOpportunity } from "@/lib/repositories/lead-opportunities";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  stage: z.enum(["novo", "acolhimento", "aguardando_resposta", "agendado", "convertido", "perdido"]).optional(),
  temperature: z.enum(["frio", "morno", "quente"]).optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
  contacted: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const { id } = await params;
  const item = await updateLeadOpportunity(id, { ...parsed.data, adminId: admin.sub });
  if (!item) return NextResponse.json({ message: "Oportunidade nao encontrada." }, { status: 404 });

  await writeAuditLog({
    action: "lead_opportunity_updated",
    adminId: admin.sub,
    entityType: "lead_opportunity",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { changedFields: Object.keys(parsed.data), stage: item.stage },
  });
  return NextResponse.json({ item });
}
