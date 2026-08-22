import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS } from "@/lib/protocol-templates/constants";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { createMealPlanFromTemplates, getClientMealPlans, NoTemplateForTargetGroupError } from "@/lib/repositories/meal-plans";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateFromTemplateSchema = z.object({
  targetGroup: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS),
  title: z.string().max(200).optional().nullable(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  return NextResponse.json(await getClientMealPlans(id));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const parsed = CreateFromTemplateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  let plan;
  try {
    plan = await createMealPlanFromTemplates({
      clientId: id,
      targetGroup: parsed.data.targetGroup,
      title: parsed.data.title,
    });
  } catch (error) {
    if (error instanceof NoTemplateForTargetGroupError) {
      return NextResponse.json({ message: "Ainda não existe um modelo cadastrado para este grupo. Crie o plano manualmente ou cadastre um modelo em Modelos profissionais." }, { status: 422 });
    }
    throw error;
  }
  await addTimelineEvent({
    client_id: id,
    type: "meal_plan_created",
    title: "Plano alimentar criado",
    description: `Plano individual criado a partir do grupo ${parsed.data.targetGroup}.`,
    metadata: { planId: plan.id, targetGroup: parsed.data.targetGroup },
  });
  await writeAuditLog({
    action: "meal_plan_created",
    adminId: admin.sub,
    entityType: "meal_plan",
    entityId: plan.id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, targetGroup: parsed.data.targetGroup },
  });

  return NextResponse.json(plan, { status: 201 });
}
