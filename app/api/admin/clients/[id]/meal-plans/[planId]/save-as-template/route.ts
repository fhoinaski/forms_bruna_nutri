import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS } from "@/lib/protocol-templates/constants";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { saveMealPlanAsDietTemplate } from "@/lib/repositories/meal-plans";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveAsTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  targetGroup: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = SaveAsTemplateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const templateId = await saveMealPlanAsDietTemplate({
    clientId: id,
    planId,
    title: parsed.data.title,
    targetGroup: parsed.data.targetGroup,
  });
  if (!templateId) return NextResponse.json({ message: "Plano nao encontrado." }, { status: 404 });

  await addTimelineEvent({
    client_id: id,
    type: "meal_plan_promoted_to_template",
    title: "Plano salvo como modelo",
    description: `O plano foi copiado para a biblioteca como novo modelo: ${parsed.data.title}.`,
    metadata: { planId, templateId, targetGroup: parsed.data.targetGroup },
  });
  await writeAuditLog({
    action: "meal_plan_promoted_to_template",
    adminId: admin.sub,
    entityType: "protocol_template",
    entityId: templateId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, planId, targetGroup: parsed.data.targetGroup },
  });

  return NextResponse.json({ id: templateId }, { status: 201 });
}
